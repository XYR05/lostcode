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
  console.log('--- Testing Round 1 Timer Starts ONLY on Start Tournament & Other Rounds on Activate ---');

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
    // 1. Login as Admin
    const adminCookie = await loginCrew(baseUrl, 'admin@lostcode', 'foundcode');
    assert.ok(adminCookie, 'Admin login cookie obtained');
    console.log('[PASS] Admin authenticated.');

    // 2. Wipe / Seed 10 Tournament Crews fresh (Tournament is not started yet)
    const seedRes = await fetch(`${baseUrl}/api/admin/tournament/seed-teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie }
    });
    assert.strictEqual(seedRes.status, 200, 'Seeding 10 crews succeeded');

    const configBeforeRes = await fetch(`${baseUrl}/api/config`);
    const configBefore = await configBeforeRes.json();
    assert.strictEqual(configBefore.ctfStartTime, null, 'ctfStartTime must be null before Start Tournament');
    console.log('[PASS] Initial state confirmed: Tournament is NOT started (ctfStartTime is null).');

    // 3. Admin activates Round 1 island BEFORE clicking "Start Tournament"
    const actR1Res = await fetch(`${baseUrl}/api/admin/rounds/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ round: 1 })
    });
    assert.strictEqual(actR1Res.status, 200, 'Round 1 activation succeeded');

    // Verify: ctfStartTime must STILL be null!
    const configAfterActRes = await fetch(`${baseUrl}/api/config`);
    const configAfterAct = await configAfterActRes.json();
    assert.strictEqual(configAfterAct.ctfStartTime, null, 'Activating Round 1 must NOT automatically start the tournament timer!');

    // Verify: All teams in Round 1 must be in READY state (timer not ticking!)
    const statusAfterActRes = await fetch(`${baseUrl}/api/tournament/status`, {
      headers: { 'Cookie': adminCookie }
    });
    const statusAfterAct = await statusAfterActRes.json();
    statusAfterAct.teams.forEach(t => {
      assert.strictEqual(t.timer.isLive, false, `Team ${t.teamName} timer must NOT be live before Start Tournament!`);
      assert.strictEqual(t.timer.isReady, true, `Team ${t.teamName} timer must be in Ready state`);
      assert.strictEqual(t.timer.startedAt, null, `Team ${t.teamName} startedAt must be null`);
      assert.strictEqual(t.timer.remainingSeconds, (t.timer.durationMinutes || 30) * 60, `Team ${t.teamName} must have full time`);
    });
    console.log('[PASS] Round 1 activated: All crew timers remain in READY state (NOT ticking, 0 time lost).');

    // 4. Admin clicks "Start Tournament" (/api/admin/start)
    const startTourneyRes = await fetch(`${baseUrl}/api/admin/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie }
    });
    assert.strictEqual(startTourneyRes.status, 200, 'Start Tournament succeeded');

    const configAfterStartRes = await fetch(`${baseUrl}/api/config`);
    const configAfterStart = await configAfterStartRes.json();
    assert.ok(configAfterStart.ctfStartTime, 'ctfStartTime must be set after Start Tournament');

    // Verify: Round 1 individual timers are NOW LIVE and ticking!
    const statusAfterStartRes = await fetch(`${baseUrl}/api/tournament/status`, {
      headers: { 'Cookie': adminCookie }
    });
    const statusAfterStart = await statusAfterStartRes.json();
    statusAfterStart.teams.forEach(t => {
      assert.strictEqual(t.timer.isLive, true, `Team ${t.teamName} timer must now be LIVE after Start Tournament!`);
      assert.strictEqual(t.timer.isReady, false, `Team ${t.teamName} timer must not be in ready state`);
      assert.ok(t.timer.startedAt && t.timer.startedAt >= Date.now() - 5000, `Team ${t.teamName} startedAt set fresh`);
      assert.ok(t.timer.remainingSeconds > 1750, `Team ${t.teamName} has fresh countdown ticking`);
    });
    console.log('[PASS] Start Tournament clicked: Round 1 timers are NOW LIVE and counting down fresh for all crews!');

    // 5. Test other rounds: Round 2 timer must ONLY start after admin activates Round 2
    const r2StateBefore = statusAfterStart.roundState['2'];
    assert.notStrictEqual(r2StateBefore.status, 'Live', 'Round 2 must NOT be live yet');

    // Buccaneers solves Round 1 while Round 2 is NOT yet activated
    const bCookie = await loginCrew(baseUrl, 'BUCCANEERS', 'ahoy123');
    const bStatusRes = await fetch(`${baseUrl}/api/team/challenge?round=1`, {
      headers: { 'Cookie': bCookie }
    });
    const bStatus = await bStatusRes.json();
    const riddleBank = JSON.parse(fs.readFileSync(path.join(__dirname, '../private/riddle_bank.json'), 'utf8'));
    const r1Ans = riddleBank[bStatus.riddle.id].expectedAnswer;

    const submitR1Res = await fetch(`${baseUrl}/api/team/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': bCookie },
      body: JSON.stringify({ answer: r1Ans })
    });
    assert.strictEqual(submitR1Res.status, 200, 'Buccaneers solved Round 1');

    // Buccaneers has moved to Round 2, but Round 2 is NOT active yet:
    // Round 2 timer must be in READY state (NOT ticking!)
    const bTeamRes = await fetch(`${baseUrl}/api/myteam`, {
      headers: { 'Cookie': bCookie }
    });
    const bTeamData = await bTeamRes.json();
    const bTeam = bTeamData.team;
    assert.strictEqual(bTeam.currentRound, 2, 'Buccaneers advanced to Round 2');
    assert.strictEqual(bTeam.timer.isLive, false, 'Round 2 timer must NOT be live before Round 2 is activated!');
    assert.strictEqual(bTeam.timer.isReady, true, 'Round 2 timer must be in READY state');
    console.log('[PASS] Buccaneers in Round 2: Round 2 timer is staged as READY (NOT ticking before activation).');

    // 6. Admin now activates Round 2 (/api/admin/rounds/activate with round 2)
    const actR2Res = await fetch(`${baseUrl}/api/admin/rounds/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ round: 2 })
    });
    assert.strictEqual(actR2Res.status, 200, 'Round 2 activation succeeded');

    // Verify: Buccaneers Round 2 timer is NOW LIVE and ticking!
    const bTeamAfterR2ActRes = await fetch(`${baseUrl}/api/myteam`, {
      headers: { 'Cookie': bCookie }
    });
    const bTeamAfterR2ActData = await bTeamAfterR2ActRes.json();
    const bTeamAfterR2Act = bTeamAfterR2ActData.team;
    assert.strictEqual(bTeamAfterR2Act.timer.isLive, true, 'Buccaneers Round 2 timer must now be LIVE after Round 2 activation!');
    assert.strictEqual(bTeamAfterR2Act.timer.isReady, false, 'Round 2 timer is no longer in ready state');
    assert.ok(bTeamAfterR2Act.timer.remainingSeconds > 1450, `Round 2 timer has fresh duration (~1500s), got: ${bTeamAfterR2Act.timer.remainingSeconds}s`);
    console.log('[PASS] Round 2 activated: Buccaneers Round 2 timer is NOW LIVE and counting down fresh!');

    console.log('\n>>> ALL REQUIREMENTS FOR ROUND 1 ON TOURNAMENT START & OTHER ROUNDS ON ACTIVATE VERIFIED 100%! <<<');
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
