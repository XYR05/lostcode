const http = require('http');
const assert = require('assert');
const {
  app,
  getRiddleBank,
  saveRiddleBank,
  getTournamentAssignments,
  saveTournamentAssignments,
  getRoundState,
  saveRoundState,
  getCredentials
} = require('../server.js');

async function runTests() {
  console.log('Testing Admin Riddle Bank CRUD & State Management API...');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  const initialRiddleBank = JSON.parse(JSON.stringify(getRiddleBank()));
  const initialAssignments = JSON.parse(JSON.stringify(getTournamentAssignments()));
  const initialRoundState = JSON.parse(JSON.stringify(getRoundState()));

  try {
    // 1. Unauthenticated request to GET /api/admin/riddle-bank
    const unauthGet = await fetch(`${baseUrl}/api/admin/riddle-bank`);
    assert.strictEqual(unauthGet.status, 403, 'Unauthenticated request must return 403');

    const creds = getCredentials();
    const bucPass = creds.teams.BUCCANEERS || creds.teams.buccaneers;

    // 2. Participant login must also be denied admin access
    const teamLogin = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamName: 'BUCCANEERS', password: bucPass })
    });
    const teamCookie = teamLogin.headers.get('set-cookie');
    const teamAccess = await fetch(`${baseUrl}/api/admin/riddle-bank`, {
      headers: { 'Cookie': teamCookie }
    });
    assert.strictEqual(teamAccess.status, 403, 'Participant crew must be denied admin access');

    // 3. Admin login
    const adminLogin = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamName: 'admin@lostcode', password: creds.admin.password })
    });
    assert.strictEqual(adminLogin.status, 200, 'Admin login must succeed');
    const adminCookie = adminLogin.headers.get('set-cookie');

    // 4. Create new draft riddle
    const createRes = await fetch(`${baseUrl}/api/admin/riddle-bank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({
        title: 'The Ghost Ship of Ocracoke',
        text: 'What sails against the gale without a crew?',
        targetRound: 1,
        status: 'draft',
        answerMatchingRule: { caseSensitive: false, trim: true },
        points: 150
      })
    });
    assert.strictEqual(createRes.status, 201, 'Creating riddle should return 201');
    const createdData = await createRes.json();
    assert.ok(createdData.riddle.id, 'Created riddle must have an ID');
    assert.strictEqual(createdData.riddle.status, 'draft', 'Should have draft status');
    const newId = createdData.riddle.id;

    // 5. Read riddle bank
    const getRes = await fetch(`${baseUrl}/api/admin/riddle-bank`, {
      headers: { 'Cookie': adminCookie }
    });
    assert.strictEqual(getRes.status, 200);
    const listData = await getRes.json();
    assert.ok(listData.riddles[newId], 'Created riddle must appear in riddle bank');

    // 6. Update riddle to published with expectedAnswer
    const updateRes = await fetch(`${baseUrl}/api/admin/riddle-bank/${newId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({
        title: 'The Ghost Ship of Ocracoke (Published)',
        expectedAnswer: 'A phantom breeze',
        status: 'published'
      })
    });
    assert.strictEqual(updateRes.status, 200);
    const updatedData = await updateRes.json();
    assert.strictEqual(updatedData.riddle.title, 'The Ghost Ship of Ocracoke (Published)');
    assert.strictEqual(updatedData.riddle.expectedAnswer, 'A phantom breeze');
    assert.strictEqual(updatedData.riddle.status, 'published');

    // 7. Test deletion guard when assigned to Live round
    const assignments = getTournamentAssignments();
    assignments.rounds['1'].slots[0].riddleId = newId;
    saveTournamentAssignments(assignments);
    const roundState = getRoundState();
    roundState['1'].status = 'Live';
    saveRoundState(roundState);

    const deleteLiveRes = await fetch(`${baseUrl}/api/admin/riddle-bank/${newId}`, {
      method: 'DELETE',
      headers: { 'Cookie': adminCookie }
    });
    assert.strictEqual(deleteLiveRes.status, 400, 'Should prohibit deleting riddle assigned to a Live round');

    // Now set round to Draft and verify successful delete
    roundState['1'].status = 'Draft';
    saveRoundState(roundState);
    const deleteDraftRes = await fetch(`${baseUrl}/api/admin/riddle-bank/${newId}`, {
      method: 'DELETE',
      headers: { 'Cookie': adminCookie }
    });
    assert.strictEqual(deleteDraftRes.status, 200, 'Should allow delete when round is Draft');

    console.log('✅ Admin Riddle Bank CRUD & State Management API verified successfully!');
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
