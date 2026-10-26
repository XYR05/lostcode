const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  app,
  teams,
  getRiddleBank,
  saveRiddleBank,
  getTournamentAssignments,
  saveTournamentAssignments,
  getRoundState,
  saveRoundState
} = require('../server.js');

async function testScoreGraphUpdates() {
  console.log('Testing Score Graph Real-Time Score Updates & History Tracking...');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  const initialRiddleBank = JSON.parse(JSON.stringify(getRiddleBank()));
  const initialAssignments = JSON.parse(JSON.stringify(getTournamentAssignments()));
  const initialRoundState = JSON.parse(JSON.stringify(getRoundState()));
  const teamsPath = path.join(__dirname, '../teams.json');
  const initialTeams = JSON.parse(fs.readFileSync(teamsPath, 'utf8'));

  try {
    // 1. Login as BUCCANEERS
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamName: 'BUCCANEERS', password: 'ahoy123' })
    });
    assert.strictEqual(loginRes.status, 200, 'BUCCANEERS login must succeed');
    const cookie = loginRes.headers.get('set-cookie');

    // 2. Setup Round 1 active with a dedicated test riddle for BUCCANEERS
    const riddleBank = getRiddleBank();
    const testRiddleId = 'riddle_test_scoregraph_compass';
    riddleBank[testRiddleId] = {
      id: testRiddleId,
      title: 'Graph Test Compass',
      text: 'Follow the needle.',
      expectedAnswer: 'magnetic_north',
      targetRound: 1,
      status: 'published',
      points: 100
    };
    saveRiddleBank(riddleBank);

    const assignments = getTournamentAssignments();
    assignments.rounds['1'].slots[0].riddleId = testRiddleId;
    assignments.rounds['1'].slots[0].claimed = false;
    assignments.rounds['1'].slots[0].claimedBy = null;
    saveTournamentAssignments(assignments);

    const roundState = getRoundState();
    roundState['1'].status = 'Live';
    roundState['1'].qualifiers = [];
    saveRoundState(roundState);

    // Reset Buccaneers score to 0 for a clean test
    const bucMem = teams.find(t => t.id === 'crew_1_buccaneers');
    bucMem.score = 0;
    bucMem.currentRound = 1;
    bucMem.roundSolves = {};
    bucMem.solvedChallenges = [];
    bucMem.scoreHistory = [{ timestamp: Date.now() - 5000, time: '12:00:00 AM', score: 0 }];
    fs.writeFileSync(teamsPath, JSON.stringify(teams, null, 2), 'utf8');

    // 3. Submit correct answer via /api/team/submit
    const submitRes = await fetch(`${baseUrl}/api/team/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
      body: JSON.stringify({ answer: 'magnetic_north', round: 1 })
    });
    assert.strictEqual(submitRes.status, 200, 'Submission must succeed');
    const submitData = await submitRes.json();
    assert.strictEqual(submitData.success, true, 'Submission must be marked success');
    assert.strictEqual(submitData.qualified, true, 'Team must qualify');

    // 4. Verify /api/teams returns updated score and valid numeric timestamp in scoreHistory
    const teamsRes = await fetch(`${baseUrl}/api/teams`);
    assert.strictEqual(teamsRes.status, 200);
    const teamsList = await teamsRes.json();

    const bucUpdated = teamsList.find(t => t.id === 'crew_1_buccaneers');
    assert.ok(bucUpdated, 'Buccaneers must be in teams list');
    assert.strictEqual(bucUpdated.score, 100, 'Score must be updated to 100 PTS');
    assert.ok(Array.isArray(bucUpdated.scoreHistory), 'scoreHistory must be an array');
    assert.ok(bucUpdated.scoreHistory.length >= 2, 'scoreHistory must record the solve');

    const lastPt = bucUpdated.scoreHistory[bucUpdated.scoreHistory.length - 1];
    assert.strictEqual(typeof lastPt.timestamp, 'number', 'lastPt.timestamp must be a valid number');
    assert.ok(!isNaN(lastPt.timestamp), 'timestamp must not be NaN');
    assert.ok(lastPt.timestamp > 0, 'timestamp must be positive');
    assert.strictEqual(lastPt.score, 100, 'lastPt.score must reflect the new score of 100');
    assert.strictEqual(typeof lastPt.time, 'string', 'lastPt.time must be formatted time string');

    // 5. Verify the Score Graph rendering pipeline with the updated data
    const topTeams = teamsList.slice(0, 10);
    const now = Date.now();
    const normalizedHistories = new Map();
    const allTimestamps = new Set();

    topTeams.forEach(t => {
      const rawHistory = Array.isArray(t.scoreHistory) ? t.scoreHistory : [];
      const norm = [];

      rawHistory.forEach(pt => {
        let ts = null;
        if (typeof pt.timestamp === 'number' && !isNaN(pt.timestamp)) {
          ts = pt.timestamp;
        } else if (pt.time) {
          const parsed = Date.parse(pt.time);
          if (!isNaN(parsed)) ts = parsed;
        }
        if (ts === null) ts = now;
        const score = typeof pt.score === 'number' ? pt.score : 0;
        norm.push({ timestamp: ts, score });
        allTimestamps.add(ts);
      });

      if (norm.length === 0) {
        const startTs = now - 60000;
        norm.push({ timestamp: startTs, score: 0 });
        allTimestamps.add(startTs);
      }

      norm.sort((a, b) => a.timestamp - b.timestamp);

      if (norm[0].score > 0) {
        const baseTs = norm[0].timestamp - 10000;
        norm.unshift({ timestamp: baseTs, score: 0 });
        allTimestamps.add(baseTs);
      }

      const currentScore = typeof t.score === 'number' ? t.score : 0;
      const latestHistScore = norm[norm.length - 1].score;
      if (latestHistScore !== currentScore) {
        norm.push({ timestamp: now, score: currentScore });
        allTimestamps.add(now);
      }

      normalizedHistories.set(t.id, norm);
    });

    allTimestamps.add(now);

    const allSortedTimes = Array.from(allTimestamps)
      .filter(ts => typeof ts === 'number' && !isNaN(ts))
      .sort((a, b) => a - b);

    assert.ok(allSortedTimes.length >= 2, 'Graph must have at least 2 time points');
    allSortedTimes.forEach(t => {
      assert.strictEqual(typeof t, 'number', 'Time points must be numbers');
      assert.ok(!isNaN(t), 'Time points must not be NaN');
    });

    // Check Buccaneers' data points
    const bucNorm = normalizedHistories.get('crew_1_buccaneers');
    const bucDataPoints = allSortedTimes.map(time => {
      let score = 0;
      for (let i = 0; i < bucNorm.length; i++) {
        if (bucNorm[i].timestamp <= time) score = bucNorm[i].score;
        else break;
      }
      return score;
    });

    const finalBucScore = bucDataPoints[bucDataPoints.length - 1];
    assert.strictEqual(finalBucScore, 100, 'Score graph final point must equal 100 (matching standings)');
    assert.strictEqual(bucDataPoints[0], 0, 'Score graph initial point must be 0');

    console.log('✅ Score Graph Real-Time Score Updates & History Tracking verified successfully!');
  } finally {
    saveRiddleBank(initialRiddleBank);
    saveTournamentAssignments(initialAssignments);
    saveRoundState(initialRoundState);
    fs.writeFileSync(teamsPath, JSON.stringify(initialTeams, null, 2), 'utf8');
    server.close();
  }
}

testScoreGraphUpdates().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
