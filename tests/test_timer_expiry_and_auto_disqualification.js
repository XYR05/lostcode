const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  app,
  teams,
  getTeams,
  getRiddleBank,
  saveRiddleBank,
  getTournamentAssignments,
  saveTournamentAssignments,
  getRoundState,
  saveRoundState,
  getConfig,
  saveConfig,
  startTournamentHeartbeatService,
  stopTournamentHeartbeatService
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
  console.log('--- Testing Timer Expiry & Server-Side Auto-Disqualification ---');

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
    assert.strictEqual(seedRes.status, 200, 'Seed 10 teams succeeded');

    // 2. Activate Round 1 & Start Tournament
    await fetch(`${baseUrl}/api/admin/rounds/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ round: 1 })
    });
    await fetch(`${baseUrl}/api/admin/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie }
    });
    console.log('[PASS] Round 1 active and tournament started.');

    // 3. Test Heartbeat Auto-Disqualification: Artificially expire BUCCANEERS timer
    const liveTeams = getTeams();
    const buccaneers = liveTeams.find(t => t.teamName.toUpperCase() === 'BUCCANEERS');
    assert.ok(buccaneers, 'BUCCANEERS found in teams');
    const r1Duration = buccaneers.roundTimers['1'].durationMinutes || 40;
    buccaneers.roundTimers['1'].startedAt = Date.now() - ((r1Duration + 10) * 60 * 1000);
    fs.writeFileSync(teamsPath, JSON.stringify(liveTeams, null, 2), 'utf8');

    // Start background heartbeat
    startTournamentHeartbeatService();
    // Wait 1.3 seconds for heartbeat tick
    await new Promise(resolve => setTimeout(resolve, 1300));

    // Verify BUCCANEERS is now auto-disqualified
    assert.strictEqual(buccaneers.disqualified, true, 'BUCCANEERS must be marked disqualified');
    assert.ok(buccaneers.disqualifiedReason.includes('timer expired (00:00)!'), `Expected timer expiry reason, got: ${buccaneers.disqualifiedReason}`);
    assert.ok(buccaneers.disqualifiedAt && buccaneers.disqualifiedAt > 0, 'Disqualification timestamp recorded');
    console.log(`[PASS] Server heartbeat automatically disqualified BUCCANEERS on timer expiry: "${buccaneers.disqualifiedReason}".`);

    // 4. Verify access and submission blocked with 403 Forbidden
    const bCookie = await loginCrew(baseUrl, 'BUCCANEERS', 'ahoy123');
    const chalRes = await fetch(`${baseUrl}/api/team/challenge?round=1`, {
      headers: { 'Cookie': bCookie }
    });
    assert.strictEqual(chalRes.status, 403, 'Challenge access must return 403 Forbidden for disqualified crew');
    const chalData = await chalRes.json();
    assert.ok(chalData.error.includes('timer expired') || chalData.error === 'Team is disqualified');
    assert.ok(chalData.reason.includes('timer expired'), `Expected timer expiry reason in 403 body, got: ${chalData.reason}`);

    const subRes = await fetch(`${baseUrl}/api/team/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': bCookie },
      body: JSON.stringify({ answer: 'ANY_ANSWER', round: 1 })
    });
    assert.strictEqual(subRes.status, 403, 'Flag submission must return 403 Forbidden for disqualified crew');
    const subData = await subRes.json();
    assert.ok(subData.error.includes('timer expired') || subData.error === 'Team is disqualified');
    assert.ok(subData.reason.includes('timer expired'));
    console.log('[PASS] Challenge access and flag submission strictly blocked (403 Forbidden) for expired crew.');

    // 5. Test Admin Time Deduction causing <= 0 auto-disqualifies team
    const corsairs = liveTeams.find(t => t.teamName.toUpperCase() === 'CORSAIRS');
    assert.ok(corsairs, 'CORSAIRS found');
    assert.strictEqual(corsairs.disqualified, false, 'CORSAIRS initially active');

    const deductMin = (corsairs.roundTimers['1'].durationMinutes || 40) + 10;
    const deductRes = await fetch(`${baseUrl}/api/admin/teams/reverse-time`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ teamName: 'CORSAIRS', minutes: deductMin })
    });
    assert.strictEqual(deductRes.status, 200, 'Admin reverse-time succeeded');
    const deductData = await deductRes.json();
    assert.strictEqual(deductData.disqualified, true, 'Response flags team as disqualified');
    assert.strictEqual(corsairs.disqualified, true, 'CORSAIRS team object marked disqualified');
    assert.ok(corsairs.disqualifiedReason.includes('00:00') || corsairs.disqualifiedReason.includes('expired'), `Expected time penalty reason, got: ${corsairs.disqualifiedReason}`);

    // Verify CORSAIRS submission rejected
    const cCookie = await loginCrew(baseUrl, 'CORSAIRS', 'ahoy123');
    const cSubRes = await fetch(`${baseUrl}/api/team/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cCookie },
      body: JSON.stringify({ answer: 'TEST' })
    });
    assert.strictEqual(cSubRes.status, 403, 'CORSAIRS submission rejected with 403 Forbidden');
    console.log(`[PASS] Admin time deduction past 0 automatically disqualified CORSAIRS: "${corsairs.disqualifiedReason}".`);

    // 6. Test Hint Unlock Penalty causing <= 0 auto-disqualifies team
    const krakens = liveTeams.find(t => t.teamName.toUpperCase() === 'KRAKENS');
    assert.ok(krakens, 'KRAKENS found');
    // Ensure KRAKENS's assigned riddle has a hint with penalty
    const kCookie = await loginCrew(baseUrl, 'KRAKENS', 'ahoy123');
    const kChalRes = await fetch(`${baseUrl}/api/team/challenge?round=1`, {
      headers: { 'Cookie': kCookie }
    });
    const kChalData = await kChalRes.json();
    const riddleBank = getRiddleBank();
    const kRiddle = riddleBank[kChalData.riddle.id];
    kRiddle.hints = [{ text: 'Helpful hint', penaltySeconds: 60 }];
    saveRiddleBank(riddleBank);

    // Wind KRAKENS timer down so they only have 60 seconds remaining (hint penalty is 5 minutes)
    const kDur = krakens.roundTimers['1'].durationMinutes || 40;
    krakens.roundTimers['1'].startedAt = Date.now() - (kDur * 60 - 60) * 1000;
    fs.writeFileSync(teamsPath, JSON.stringify(liveTeams, null, 2), 'utf8');

    // Request hint for assigned riddle
    const hintRes = await fetch(`${baseUrl}/api/challenge/hint/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': kCookie },
      body: JSON.stringify({ riddleId: kChalData.riddle.id })
    });
    // With 60s penalty on 10s remaining, remaining time drops to 0 and disqualifies crew
    assert.strictEqual(krakens.disqualified, true, 'KRAKENS disqualified after hint penalty');
    assert.ok(krakens.disqualifiedReason.includes('00:00') || krakens.disqualifiedReason.includes('penalty') || krakens.disqualifiedReason.includes('expired'), `Expected hint penalty reason, got: ${krakens.disqualifiedReason}`);
    console.log(`[PASS] Hint penalty exceeding remaining time automatically disqualified KRAKENS: "${krakens.disqualifiedReason}".`);

    // 7. Test Admin Reinitiate / Reinstate
    const reinstateRes = await fetch(`${baseUrl}/api/admin/teams/reinitiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ teamName: 'BUCCANEERS' })
    });
    assert.strictEqual(reinstateRes.status, 200, 'Admin reinitiate succeeded');
    const reinstateData = await reinstateRes.json();
    assert.strictEqual(reinstateData.success, true);
    assert.strictEqual(buccaneers.disqualified, false, 'BUCCANEERS is no longer disqualified');
    assert.strictEqual(buccaneers.disqualifiedReason, null, 'Disqualification reason cleared');

    // Give BUCCANEERS 20 fresh minutes
    const fwdRes = await fetch(`${baseUrl}/api/admin/teams/forward-time`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ teamName: 'BUCCANEERS', minutes: 20 })
    });
    assert.strictEqual(fwdRes.status, 200, 'Forward time succeeded');

    // BUCCANEERS can now access challenge
    const bChalAfterRes = await fetch(`${baseUrl}/api/team/challenge?round=1`, {
      headers: { 'Cookie': bCookie }
    });
    assert.strictEqual(bChalAfterRes.status, 200, 'BUCCANEERS challenge access restored');
    const bChalAfterData = await bChalAfterRes.json();
    assert.strictEqual(bChalAfterData.success, true);

    // BUCCANEERS can submit and solve
    const ans = riddleBank[bChalAfterData.riddle.id].expectedAnswer;
    const bSubAfterRes = await fetch(`${baseUrl}/api/team/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': bCookie },
      body: JSON.stringify({ answer: ans })
    });
    assert.strictEqual(bSubAfterRes.status, 200, 'BUCCANEERS submit succeeded');
    const bSubAfterData = await bSubAfterRes.json();
    assert.strictEqual(bSubAfterData.success, true, 'BUCCANEERS solved challenge successfully');
    console.log('[PASS] Admin successfully reinstated crew, forwarded time, and allowed clean solve.');

    console.log('\n>>> ALL TIMER EXPIRY & AUTO-DISQUALIFICATION TESTS PASSED 100%! <<<');
  } finally {
    stopTournamentHeartbeatService();
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
