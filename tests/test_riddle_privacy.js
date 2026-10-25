const http = require('http');
const assert = require('assert');
const { app, getRiddleBank, saveRiddleBank, getTournamentAssignments, saveTournamentAssignments, getRoundState, saveRoundState } = require('../server.js');

async function runTests() {
  console.log('Testing Strict Riddle Privacy & Private Participant Endpoints...');

  // Start app on ephemeral port
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  // Backup initial states BEFORE any mutations
  const initialRiddleBank = JSON.parse(JSON.stringify(getRiddleBank()));
  const initialAssignments = JSON.parse(JSON.stringify(getTournamentAssignments()));
  const initialRoundState = JSON.parse(JSON.stringify(getRoundState()));

  // Seed two test published riddles

  const riddleBank = getRiddleBank();
  riddleBank['test_r1_buccaneers'] = {
    id: 'test_r1_buccaneers',
    title: 'Buccaneer Riddle',
    text: 'What sails by day and sleeps by night?',
    expectedAnswer: 'SECRET_BUCCANEER_FLAG',
    targetRound: 1,
    status: 'published',
    answerMatchingRule: { caseSensitive: false, trim: true },
    points: 100,
    hints: []
  };
  riddleBank['test_r1_cutthroats'] = {
    id: 'test_r1_cutthroats',
    title: 'Cutthroat Riddle',
    text: 'What has an eye but cannot see?',
    expectedAnswer: 'SECRET_CUTTHROAT_FLAG',
    targetRound: 1,
    status: 'published',
    answerMatchingRule: { caseSensitive: false, trim: true },
    points: 100,
    hints: []
  };
  saveRiddleBank(riddleBank);

  // Bind to slots in Round 1
  const assignments = getTournamentAssignments();
  assignments.rounds['1'].slots[0].riddleId = 'test_r1_buccaneers'; // crew_1_buccaneers
  assignments.rounds['1'].slots[1].riddleId = 'test_r1_cutthroats';  // crew_2_cutthroats
  saveTournamentAssignments(assignments);

  // Set Round 1 to Live
  const roundState = getRoundState();
  roundState['1'].status = 'Live';
  saveRoundState(roundState);

  try {
    // 1. Unauthenticated request must be rejected

    const unauthRes = await fetch(`${baseUrl}/api/team/challenge`);
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must return 401');

    // 2. Login as BUCCANEERS
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamName: 'BUCCANEERS', password: 'ahoy123' })
    });
    assert.strictEqual(loginRes.status, 200, 'BUCCANEERS login must succeed');
    const cookie = loginRes.headers.get('set-cookie');
    assert.ok(cookie, 'Must set session cookie');

    // 3. Authenticated request for team challenge
    const challengeRes = await fetch(`${baseUrl}/api/team/challenge`, {
      headers: { 'Cookie': cookie }
    });
    assert.strictEqual(challengeRes.status, 200, 'Authenticated request should return 200');
    const challengeData = await challengeRes.json();
    assert.strictEqual(challengeData.success, true, 'Should succeed');
    assert.strictEqual(challengeData.round, 1, 'Should be Round 1');
    assert.strictEqual(challengeData.slotId, 'R1_S1', 'Slot should be R1_S1');
    assert.strictEqual(challengeData.riddle.id, 'test_r1_buccaneers', 'Should receive Buccaneer riddle');
    assert.strictEqual(challengeData.riddle.text, 'What sails by day and sleeps by night?');

    // 4. Strict privacy checks: NO expectedAnswer or leaked secrets
    assert.strictEqual(challengeData.riddle.expectedAnswer, undefined, 'expectedAnswer must not be sent');
    const serialized = JSON.stringify(challengeData);
    assert.ok(!serialized.includes('SECRET_BUCCANEER_FLAG'), 'Flag must never leak');
    assert.ok(!serialized.includes('SECRET_CUTTHROAT_FLAG'), 'Other team flag must never leak');
    assert.ok(!serialized.includes('test_r1_cutthroats'), 'Other team riddle must not leak');

    // 5. Query tampering check (?teamId=crew_2_cutthroats)
    const tamperedRes = await fetch(`${baseUrl}/api/team/challenge?teamId=crew_2_cutthroats`, {
      headers: { 'Cookie': cookie }
    });
    const tamperedData = await tamperedRes.json();
    assert.strictEqual(tamperedData.riddle.id, 'test_r1_buccaneers', 'Must ignore query params and only return session team challenge');

    // 6. Locked round check
    roundState['1'].status = 'Locked';
    saveRoundState(roundState);

    const lockedRes = await fetch(`${baseUrl}/api/team/challenge`, {
      headers: { 'Cookie': cookie }
    });
    const lockedData = await lockedRes.json();
    assert.strictEqual(lockedData.roundStatus, 'Locked', 'Should report Locked status');
    assert.strictEqual(lockedData.riddle, null, 'Riddle must be null when locked');

    console.log('✅ Strict Riddle Privacy & Private Participant Endpoints verified successfully!');
  } finally {
    saveRiddleBank(initialRiddleBank);
    saveTournamentAssignments(initialAssignments);
    saveRoundState(initialRoundState);
    server.close();
  }
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
