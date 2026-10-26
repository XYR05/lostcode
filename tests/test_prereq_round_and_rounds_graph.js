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
  saveRoundState,
  getConfig,
  saveConfig
} = require('../server.js');

async function loginCrew(baseUrl, name, pw = 'ahoy123') {
  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamName: name, password: pw })
  });
  if (res.status !== 200) {
    const txt = await res.text();
    throw new Error(`Login failed for ${name} (${res.status}): ${txt}`);
  }
  return res.headers.get('set-cookie');
}

async function run() {
  console.log('--- Testing Prerequisite Island Lock & Rounds Completed Graph ---');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  const teamsPath = path.join(__dirname, '../teams.json');
  const initialTeams = JSON.parse(fs.readFileSync(teamsPath, 'utf8'));
  const initialRiddleBank = JSON.parse(JSON.stringify(getRiddleBank()));
  const initialAssignments = JSON.parse(JSON.stringify(getTournamentAssignments()));
  const initialRoundState = JSON.parse(JSON.stringify(getRoundState()));
  const initialConfig = JSON.parse(JSON.stringify(getConfig()));

  try {
    // 1. Admin login & fresh seed
    const adminCookie = await loginCrew(baseUrl, 'admin@lostcode', 'foundcode');
    assert.ok(adminCookie, 'Admin login cookie obtained');

    const seedRes = await fetch(`${baseUrl}/api/admin/tournament/seed-teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie }
    });
    assert.strictEqual(seedRes.status, 200);

    // 2. Start Tournament & Activate Round 1 and Round 2
    await fetch(`${baseUrl}/api/admin/rounds/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ round: 1 })
    });
    await fetch(`${baseUrl}/api/admin/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie }
    });
    await fetch(`${baseUrl}/api/admin/rounds/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ round: 2 })
    });
    console.log('[PASS] Round 1 and Round 2 are both Live.');

    // 3. Login as BUCCANEERS (currentRound = 1, has not solved Round 1 yet)
    const bCookie = await loginCrew(baseUrl, 'BUCCANEERS', 'ahoy123');
    const bTeamRes = await fetch(`${baseUrl}/api/myteam`, { headers: { 'Cookie': bCookie } });
    const bTeam = (await bTeamRes.json()).team;
    assert.strictEqual(bTeam.currentRound, 1, 'Buccaneers must be in Round 1');

    // 4. BUCCANEERS attempts to access Round 2 challenge while on Round 1
    const r2ChalRes = await fetch(`${baseUrl}/api/team/challenge?round=2`, {
      headers: { 'Cookie': bCookie }
    });
    const r2ChalData = await r2ChalRes.json();
    assert.strictEqual(r2ChalData.success, false, 'Accessing Round 2 before solving Round 1 must fail');
    assert.strictEqual(r2ChalData.isLockedPrereq, true, 'isLockedPrereq flag must be true');
    assert.strictEqual(
      r2ChalData.message,
      'Complete the round 1 for unlocking the round 2',
      'Must display exact requirement: Complete the round 1 for unlocking the round 2'
    );
    assert.strictEqual(r2ChalData.riddle, null, 'Must not leak riddle');
    console.log('[PASS] Round 2 challenge access blocked: "Complete the round 1 for unlocking the round 2"');

    // 5. BUCCANEERS attempts to submit directly to Round 2
    const r2SubmitRes = await fetch(`${baseUrl}/api/team/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': bCookie },
      body: JSON.stringify({ answer: 'SOME_ANSWER', round: 2 })
    });
    assert.strictEqual(r2SubmitRes.status, 400);
    const r2SubmitData = await r2SubmitRes.json();
    assert.strictEqual(
      r2SubmitData.error,
      'Complete the round 1 for unlocking the round 2',
      'Submission to Round 2 blocked with prerequisite message'
    );
    console.log('[PASS] Round 2 submission blocked with exact prerequisite message.');

    // 6. Now BUCCANEERS solves Round 1
    const r1ChalRes = await fetch(`${baseUrl}/api/team/challenge?round=1`, { headers: { 'Cookie': bCookie } });
    const r1ChalData = await r1ChalRes.json();
    assert.strictEqual(r1ChalData.success, true);
    const riddleBank = JSON.parse(fs.readFileSync(path.join(__dirname, '../private/riddle_bank.json'), 'utf8'));
    const r1Ans = riddleBank[r1ChalData.riddle.id].expectedAnswer;

    const r1SubmitRes = await fetch(`${baseUrl}/api/team/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': bCookie },
      body: JSON.stringify({ answer: r1Ans, round: 1 })
    });
    const r1SubmitData = await r1SubmitRes.json();
    assert.strictEqual(r1SubmitData.success, true, 'Round 1 solved successfully');
    console.log('[PASS] Buccaneers solved Round 1.');

    // 7. Verify BUCCANEERS now has access to Round 2!
    const r2AfterSolveRes = await fetch(`${baseUrl}/api/team/challenge?round=2`, { headers: { 'Cookie': bCookie } });
    const r2AfterSolveData = await r2AfterSolveRes.json();
    assert.strictEqual(r2AfterSolveData.success, true, 'Round 2 now unlocked for Buccaneers');
    assert.ok(r2AfterSolveData.riddle, 'Round 2 riddle delivered to Buccaneers');
    console.log('[PASS] Buccaneers now has access to Round 2 challenge!');

    // 8. BUCCANEERS attempts to access Round 3: should say "Complete the round 2 for unlocking the round 3"
    const r3ChalRes = await fetch(`${baseUrl}/api/team/challenge?round=3`, { headers: { 'Cookie': bCookie } });
    const r3ChalData = await r3ChalRes.json();
    assert.strictEqual(r3ChalData.success, false);
    assert.strictEqual(
      r3ChalData.message,
      'Complete the round 2 for unlocking the round 3',
      'Must display: Complete the round 2 for unlocking the round 3'
    );
    console.log('[PASS] Round 3 access blocked: "Complete the round 2 for unlocking the round 3"');

    // 9. Verify dashboard.html code matches:
    // - No "(Round X)" in dataset label on score graph
    // - Current standings header says "ROUNDS COMPLETED"
    const dashHtml = fs.readFileSync(path.join(__dirname, '../private/dashboard.html'), 'utf8');
    assert.ok(dashHtml.includes('<span>ROUNDS COMPLETED</span>'), 'Standings header must show ROUNDS COMPLETED');
    assert.ok(dashHtml.includes('${roundsCompleted} / 4 COMPLETED'), 'Standings row must show rounds completed');
    assert.ok(dashHtml.includes('label: t.teamName,'), 'Score graph dataset label must use t.teamName without round');
    assert.ok(!dashHtml.includes('label: `${t.teamName} (Round'), 'Score graph must not have (Round X) in label');
    console.log('[PASS] Dashboard HTML verified: Rounds Completed on graph and clean crew names on standings.');

    console.log('\n>>> ALL PREREQUISITE ROUND UNLOCK & ROUNDS COMPLETED GRAPH TESTS PASSED 100%! <<<');
  } finally {
    saveRiddleBank(initialRiddleBank);
    saveTournamentAssignments(initialAssignments);
    saveRoundState(initialRoundState);
    saveConfig(initialConfig);
    fs.writeFileSync(teamsPath, JSON.stringify(initialTeams, null, 2), 'utf8');
    teams.length = 0;
    initialTeams.forEach(t => teams.push(t));
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(err => {
  console.error('[FAIL]', err);
  process.exit(1);
});
