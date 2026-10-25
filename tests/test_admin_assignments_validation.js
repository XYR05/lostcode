const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  app,
  getRiddleBank,
  saveRiddleBank,
  getTournamentAssignments,
  saveTournamentAssignments,
  getRoundState,
  saveRoundState
} = require('../server.js');

async function runTests() {
  console.log('Testing Admin Tournament Assignment Matrix, Pre-Launch Validation & Override Engine...');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  const initialRiddleBank = JSON.parse(JSON.stringify(getRiddleBank()));
  const initialAssignments = JSON.parse(JSON.stringify(getTournamentAssignments()));
  const initialRoundState = JSON.parse(JSON.stringify(getRoundState()));
  const auditPath = path.join(__dirname, '../private/audit_log.json');
  const initialAudit = fs.existsSync(auditPath) ? JSON.parse(fs.readFileSync(auditPath, 'utf8')) : [];

  try {
    // 1. Admin login
    const adminLogin = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamName: 'admin@lostcode', password: 'foundcode' })
    });
    const adminCookie = adminLogin.headers.get('set-cookie');

    // 2. Validate unconfigured Round 2 -> Should report failures because riddles are not assigned
    const valRes1 = await fetch(`${baseUrl}/api/admin/rounds/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ round: 2 })
    });
    assert.strictEqual(valRes1.status, 200);
    const valData1 = await valRes1.json();
    assert.strictEqual(valData1.valid, false, 'Unconfigured Round 2 assignments must fail validation');
    assert.ok(valData1.errors.length > 0, 'Must return actionable error messages');

    // 3. Attempting to activate invalid Round 2 -> Must return 400 with errors
    const actFailRes = await fetch(`${baseUrl}/api/admin/rounds/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ round: 2 })
    });
    assert.strictEqual(actFailRes.status, 400, 'Activating invalid round must be rejected');

    // 4. Seed 10 distinct published riddles in Riddle Bank and assign them to the 10 teams in Round 1
    const riddleBank = getRiddleBank();
    const assignments = getTournamentAssignments();
    for (let i = 1; i <= 10; i++) {
      const rid = `r1_test_riddle_${i}`;
      riddleBank[rid] = {
        id: rid,
        title: `Riddle ${i}`,
        text: `Riddle text for team ${i}`,
        expectedAnswer: `FLAG_${i}`,
        targetRound: 1,
        status: 'published',
        points: 100,
        hints: []
      };
      assignments.rounds['1'].slots[i - 1].riddleId = rid;
    }
    saveRiddleBank(riddleBank);
    saveTournamentAssignments(assignments);

    // Validate Round 1 again -> Should now PASS!
    const valRes2 = await fetch(`${baseUrl}/api/admin/rounds/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ round: 1 })
    });
    const valData2 = await valRes2.json();
    assert.strictEqual(valData2.valid, true, 'Fully configured Round 1 must pass validation');
    assert.strictEqual(valData2.errors.length, 0);

    // 5. Activate Round 1
    const actRes = await fetch(`${baseUrl}/api/admin/rounds/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ round: 1 })
    });
    assert.strictEqual(actRes.status, 200, 'Activation should succeed');
    const roundState = getRoundState();
    assert.strictEqual(roundState['1'].status, 'Live', 'Round 1 status must be Live');

    // 6. Attempting standard POST /api/admin/assignments when Round 1 is Live -> Rejected (Frozen)
    const mutateLiveRes = await fetch(`${baseUrl}/api/admin/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ round: 1, assignments: assignments.rounds['1'] })
    });
    assert.strictEqual(mutateLiveRes.status, 400, 'Direct mutation of Live assignments must be rejected');

    // 7. Administrative Override with mandatory reason
    const overrideRes = await fetch(`${baseUrl}/api/admin/assignments/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({
        round: 1,
        slotId: 'R1_S1',
        newRiddleId: 'r1_test_riddle_10',
        reason: 'Correction of team assignment per expedition protocol'
      })
    });
    assert.strictEqual(overrideRes.status, 200, 'Admin override with valid reason must succeed');

    // Verify audit log has the event
    const auditLog = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
    const overrideEntry = auditLog.find(e => e.action === 'ASSIGNMENT_OVERRIDE');
    assert.ok(overrideEntry, 'Override must be recorded in audit log');
    assert.strictEqual(overrideEntry.reason, 'Correction of team assignment per expedition protocol');

    console.log('✅ Admin Tournament Assignment Matrix, Pre-Launch Validation & Override Engine verified successfully!');
  } finally {
    saveRiddleBank(initialRiddleBank);
    saveTournamentAssignments(initialAssignments);
    saveRoundState(initialRoundState);
    fs.writeFileSync(auditPath, JSON.stringify(initialAudit, null, 2), 'utf8');
    server.close();
  }
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
