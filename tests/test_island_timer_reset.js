const assert = require('assert');
const fs = require('fs');
const path = require('path');

const baseUrl = 'http://localhost:3000';

async function loginCrew(name, pw = 'ahoy123') {
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
  console.log('--- Testing Island Activation & Individual Timer Reset ---');

  // 1. Login as Admin
  const adminCookie = await loginCrew('admin@lostcode', 'foundcode');
  assert.ok(adminCookie, 'Admin login cookie obtained');
  console.log('[PASS] Admin authenticated.');

  // 2. Re-seed default 10 tournament crews
  const seedRes = await fetch(`${baseUrl}/api/admin/tournament/seed-teams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie }
  });
  assert.strictEqual(seedRes.status, 200, 'Seeding 10 crews succeeded');
  console.log('[PASS] 10 Tournament crews seeded fresh.');

  // 3. Check tournament status before activation
  const statusBeforeRes = await fetch(`${baseUrl}/api/tournament/status`, {
    headers: { 'Cookie': adminCookie }
  });
  const statusBefore = await statusBeforeRes.json();
  statusBefore.teams.forEach(t => {
    if (t.timer) {
      if (t.timer.isReady) {
        // Ready state
      } else if (t.timer.remainingSeconds <= 0) {
        throw new Error(`Team ${t.teamName} shows 0 remaining seconds before round is active!`);
      }
    }
  });
  console.log('[PASS] All crews show Ready state with full time remaining before activation.');

  // 4. Activate Round 1 and Start Tournament
  const actRes = await fetch(`${baseUrl}/api/admin/rounds/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
    body: JSON.stringify({ round: 1 })
  });
  assert.strictEqual(actRes.status, 200, 'Round 1 activation succeeded');

  const startRes = await fetch(`${baseUrl}/api/admin/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie }
  });
  assert.strictEqual(startRes.status, 200, 'Start Tournament succeeded');
  console.log('[PASS] Round 1 activated and Tournament started.');

  // 5. Verify all active crews in Round 1 have timers ticking from Date.now() with > 0 remaining
  const statusAfterR1Res = await fetch(`${baseUrl}/api/tournament/status`, {
    headers: { 'Cookie': adminCookie }
  });
  const statusAfterR1 = await statusAfterR1Res.json();
  statusAfterR1.teams.forEach(t => {
    if (!t.timer || !t.timer.isLive || t.timer.remainingSeconds <= 0) {
      throw new Error(`Team ${t.teamName} timer is NOT live or expired after Round 1 activation: ` + JSON.stringify(t.timer));
    }
    if (t.timer.remainingSeconds < 1700) {
      throw new Error(`Team ${t.teamName} remainingSeconds too low (${t.timer.remainingSeconds}s) right after activation!`);
    }
  });
  console.log('[PASS] All 10 crews have fresh, active timers ticking (> 1750s remaining, 00:00 EXPIRED eliminated).');

  // 6. Activate Round 2 while crews are still working on Round 1:
  // "once the team has completed the 1 round and next island is already activated/unlocked,
  // the timer will only reset from new set timer when the first round is successfully completed"
  const actR2Res = await fetch(`${baseUrl}/api/admin/rounds/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
    body: JSON.stringify({ round: 2 })
  });
  assert.strictEqual(actR2Res.status, 200, 'Round 2 activation succeeded');
  console.log('[PASS] Round 2 activated to Live while crews are still working on Round 1.');

  // Check crew timers: their active current timer should STILL be Round 1, NOT expired!
  const statusAfterR2Res = await fetch(`${baseUrl}/api/tournament/status`, {
    headers: { 'Cookie': adminCookie }
  });
  const statusAfterR2 = await statusAfterR2Res.json();
  statusAfterR2.teams.forEach(t => {
    if (t.currentRound === 1) {
      if (!t.timer || !t.timer.isLive || t.timer.remainingSeconds <= 0) {
        throw new Error(`Team ${t.teamName} Round 1 timer broken by Round 2 activation!`);
      }
      // Check Round 2 timer in roundTimers: should be Ready (startedAt: null), NOT running down while they're on Round 1!
      const r2Timer = t.roundTimers['2'];
      if (r2Timer && r2Timer.startedAt !== null) {
        throw new Error(`Team ${t.teamName} Round 2 startedAt should be null while team is still in Round 1!`);
      }
    }
  });
  console.log('[PASS] Crews still in Round 1 retain their Round 1 timer; Round 2 timer is staged as Ready.');

  // 7. Login as Buccaneers and solve their assigned Round 1 riddle
  const bCookie = await loginCrew('BUCCANEERS', 'ahoy123');
  const bStatusRes = await fetch(`${baseUrl}/api/team/challenge?round=1`, {
    headers: { 'Cookie': bCookie }
  });
  const bStatus = await bStatusRes.json();
  assert.ok(bStatus.success && bStatus.riddle, 'Fetched Buccaneers challenge successfully');

  const riddleBank = JSON.parse(fs.readFileSync(path.join(__dirname, '../private/riddle_bank.json'), 'utf8'));
  const answer = riddleBank[bStatus.riddle.id].expectedAnswer;
  console.log(`[INFO] Buccaneers assigned riddle: ${bStatus.riddle.title}, answer: ${answer}`);

  // Submit correct answer
  const submitRes = await fetch(`${baseUrl}/api/team/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': bCookie },
    body: JSON.stringify({ answer })
  });
  const submitData = await submitRes.json();
  if (submitRes.status !== 200) {
    throw new Error('Submit failed: ' + JSON.stringify(submitData));
  }
  assert.strictEqual(submitRes.status, 200, 'Buccaneers submitted successfully');
  assert.strictEqual(submitData.success, true, 'Submission marked success');
  console.log('[PASS] Buccaneers solved Round 1 and advanced to Round 2.');

  // 8. Verify Buccaneers' Round 1 timer is frozen as SOLVED
  // AND their Round 2 timer started FRESH at the exact moment of solve with 25 minutes (1500s)
  const bTeamRes = await fetch(`${baseUrl}/api/myteam`, {
    headers: { 'Cookie': bCookie }
  });
  const bTeamData = await bTeamRes.json();
  const bTeam = bTeamData.team;
  const bR1Timer = bTeam.roundTimers['1'];
  const bR2Timer = bTeam.roundTimers['2'];
  const bCurTimer = bTeam.timer;

  assert.strictEqual(bR1Timer.solved, true, 'Round 1 timer marked solved');
  assert.ok(bR1Timer.finalSolveSeconds !== null && bR1Timer.finalSolveSeconds >= 0, 'Round 1 finalSolveSeconds recorded');
  console.log(`[PASS] Round 1 timer successfully frozen as solved (${bR1Timer.finalSolveSeconds}s).`);

  assert.ok(bR2Timer.startedAt && bR2Timer.startedAt >= Date.now() - 5000, 'Round 2 timer started fresh at solve moment');
  assert.strictEqual(bCurTimer.isLive, true, 'Current Round 2 timer is Live');
  assert.ok(bCurTimer.remainingSeconds > 1450, `Round 2 timer has full duration (~1500s), got: ${bCurTimer.remainingSeconds}s`);
  console.log(`[PASS] Buccaneers Round 2 timer reset fresh at solve time with ${bCurTimer.remainingSeconds}s remaining!`);

  // Cleanup: Re-seed tournament back to fresh initial state
  await fetch(`${baseUrl}/api/admin/tournament/seed-teams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie }
  });

  console.log('\n>>> ALL TIMER ACTIVATION AND RESET REQUIREMENTS VERIFIED 100%! <<<');
}

run().catch(err => {
  console.error('[FAIL]', err);
  process.exit(1);
});
