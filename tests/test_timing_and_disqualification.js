const assert = require('assert');
const http = require('http');
const { app } = require('../server.js');

async function runTests() {
  console.log('--- Starting Timing & Disqualification Test Suite ---');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const baseUrl = `http://localhost:${server.address().port}`;

  try {
    // 1. Admin login
    const adminLogin = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin@lostcode', password: 'foundcode' })
    });
    assert.strictEqual(adminLogin.status, 200, 'Admin login failed');
    const adminCookie = adminLogin.headers.get('set-cookie');

    // Ensure proctoring is enabled
    await fetch(`${baseUrl}/api/admin/toggle-proctoring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ enabled: true })
    });

    // Reset tournament state for testing
    await fetch(`${baseUrl}/api/admin/wipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie }
    });

    // 2. Team login
    const teamLogin = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'BLACKFLAGS', password: 'ahoy123' })
    });
    assert.strictEqual(teamLogin.status, 200, 'Team login failed');
    const teamCookie = teamLogin.headers.get('set-cookie');

    // Get team initial data
    const myTeamRes = await fetch(`${baseUrl}/api/myteam`, {
      headers: { 'Cookie': teamCookie }
    });
    const myTeamData = await myTeamRes.json();
    assert.ok(myTeamData.team, 'Team object must be present');
    const teamId = myTeamData.team.id;
    console.log(`[PASS] Logged in as ${myTeamData.team.teamName} (ID: ${teamId})`);

    // 3. First proctor violation -> Warning
    const viol1Res = await fetch(`${baseUrl}/api/proctor/violation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': teamCookie },
      body: JSON.stringify({ reason: 'Tab switched' })
    });
    const viol1Data = await viol1Res.json();
    assert.strictEqual(viol1Data.warning, true, 'First departure should trigger warning');
    assert.strictEqual(viol1Data.violations, 1, 'Violations count should be 1');
    console.log('[PASS] First violation registered 1 warning.');

    // 4. Second proctor violation -> Disqualification
    const viol2Res = await fetch(`${baseUrl}/api/proctor/violation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': teamCookie },
      body: JSON.stringify({ reason: 'Window minimized' })
    });
    const viol2Data = await viol2Res.json();
    assert.strictEqual(viol2Data.disqualified, true, 'Second departure must disqualify crew');
    assert.strictEqual(viol2Data.violations, 2, 'Violations count should be 2');
    console.log('[PASS] Second violation triggered disqualification.');

    // Verify /api/myteam shows disqualified: true
    const myTeamDisqRes = await fetch(`${baseUrl}/api/myteam`, {
      headers: { 'Cookie': teamCookie }
    });
    const myTeamDisq = await myTeamDisqRes.json();
    assert.strictEqual(myTeamDisq.team.disqualified, true, 'Team profile must reflect disqualified: true');

    // 5. Verify disqualified team is blocked from challenge & submit endpoints
    const chalBlocked = await fetch(`${baseUrl}/api/team/challenge`, {
      headers: { 'Cookie': teamCookie }
    });
    assert.strictEqual(chalBlocked.status, 403, 'Disqualified crew must receive 403 on challenge view');

    const submitBlocked = await fetch(`${baseUrl}/api/team/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': teamCookie },
      body: JSON.stringify({ answer: 'SOME_ANSWER' })
    });
    assert.strictEqual(submitBlocked.status, 403, 'Disqualified crew must receive 403 on submission');
    console.log('[PASS] Disqualified team blocked with 403 on challenge view and submission.');

    // 6. Admin reinstates crew
    const reinstateRes = await fetch(`${baseUrl}/api/admin/teams/reinstate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ teamId })
    });
    const reinstateData = await reinstateRes.json();
    assert.strictEqual(reinstateData.success, true, 'Reinstatement must succeed');

    const myTeamReinstatedRes = await fetch(`${baseUrl}/api/myteam`, {
      headers: { 'Cookie': teamCookie }
    });
    const myTeamReinstated = await myTeamReinstatedRes.json();
    assert.strictEqual(myTeamReinstated.team.disqualified, false, 'Team profile must reflect disqualified: false');
    assert.strictEqual(myTeamReinstated.team.violations, 0, 'Violations must reset to 0');
    console.log('[PASS] Admin successfully reinstated crew with 0 violations.');

    // 7. Admin updates round duration
    const durRes = await fetch(`${baseUrl}/api/admin/rounds/duration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ round: 1, durationMinutes: 40 })
    });
    const durData = await durRes.json();
    assert.strictEqual(durData.success, true, 'Duration update must succeed');
    assert.strictEqual(durData.roundDurations['1'], 40, 'Round 1 duration must be 40 mins');

    const cfgRes = await fetch(`${baseUrl}/api/config`);
    const cfg = await cfgRes.json();
    assert.strictEqual(cfg.roundDurations['1'], 40, 'Config must persist 40 mins');
    console.log('[PASS] Admin updated Round 1 duration to 40 minutes.');

    // 8. Activate Round 1
    const actRes = await fetch(`${baseUrl}/api/admin/rounds/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ round: 1 })
    });
    const actData = await actRes.json();
    assert.strictEqual(actData.success, true, 'Round 1 activation failed');

    // 9. Hint unlock deducts time penalty minutes and keeps score untouched
    const chalRes = await fetch(`${baseUrl}/api/team/challenge`, {
      headers: { 'Cookie': teamCookie }
    });
    const chalData = await chalRes.json();
    assert.strictEqual(chalData.success, true, 'Failed to fetch team challenge');
    const assignedRiddle = chalData.riddle;
    assert.ok(assignedRiddle, 'Assigned riddle must be returned');

    const initialScore = myTeamReinstated.team.score || 0;

    const hintUnlockRes = await fetch(`${baseUrl}/api/challenge/hint/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': teamCookie },
      body: JSON.stringify({ riddleId: assignedRiddle.id })
    });
    const hintUnlockData = await hintUnlockRes.json();
    assert.strictEqual(hintUnlockData.success, true, 'Hint unlock failed');
    assert.strictEqual(hintUnlockData.timeDeductedMinutes, 5, 'First hint must deduct 5 minutes');

    const afterHintRes = await fetch(`${baseUrl}/api/myteam`, {
      headers: { 'Cookie': teamCookie }
    });
    const afterHintData = await afterHintRes.json();
    assert.strictEqual(afterHintData.team.score, initialScore, 'Score must remain untouched by hint unlock');
    assert.strictEqual(afterHintData.team.timer.penaltyMinutes, 5, 'Timer must show 5 minute hint penalty');
    console.log('[PASS] Hint unlock deducted 5 minutes from clock without modifying score.');

    // 10. Correct submission & solve persistence
    // Fetch riddle answer from admin riddle bank
    const bankRes = await fetch(`${baseUrl}/api/admin/riddle-bank`, {
      headers: { 'Cookie': adminCookie }
    });
    const bankData = await bankRes.json();
    const riddleRecord = bankData.riddles[assignedRiddle.id];
    assert.ok(riddleRecord, 'Riddle record found in bank');
    const expectedAnswer = riddleRecord.expectedAnswer;

    const submitRes = await fetch(`${baseUrl}/api/team/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': teamCookie },
      body: JSON.stringify({ answer: expectedAnswer })
    });
    const submitData = await submitRes.json();
    assert.strictEqual(submitData.success, true, 'Submission should succeed');
    console.log('[PASS] Correct riddle answer submitted successfully.');

    // Verify /api/team/challenge returns isSolved: true, isQualified: true, solvedAnswer
    const chalSolvedRes = await fetch(`${baseUrl}/api/team/challenge?round=1`, {
      headers: { 'Cookie': teamCookie }
    });
    const chalSolvedData = await chalSolvedRes.json();
    assert.strictEqual(chalSolvedData.isSolved, true, 'Challenge must return isSolved: true');
    assert.strictEqual(chalSolvedData.solvedAnswer, expectedAnswer, 'Challenge must return solvedAnswer');
    console.log('[PASS] Challenge endpoint confirms completed status and solved answer persistence.');

    // Duplicate submission blocked
    const dupRes = await fetch(`${baseUrl}/api/team/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': teamCookie },
      body: JSON.stringify({ answer: expectedAnswer })
    });
    assert.strictEqual(dupRes.status, 400, 'Duplicate submission must be rejected with 400');
    console.log('[PASS] Duplicate submission correctly blocked.');

    console.log('\n>>> ALL 10 TIMING & DISQUALIFICATION TESTS PASSED SUCCESSFULLY! <<<');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
