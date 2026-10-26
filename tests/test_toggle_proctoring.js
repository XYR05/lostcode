const assert = require('assert');
const http = require('http');
const { app, getCredentials } = require('../server.js');

async function testToggleProctoring() {
  console.log('Testing Admin Fullscreen Proctor Toggle & Violation Bypass...');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const baseUrl = `http://localhost:${server.address().port}`;

  try {
    const creds = getCredentials();

    // 1. Admin login
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin@lostcode', password: creds.admin.password })
    });
    assert.strictEqual(loginRes.status, 200);
    const adminCookie = loginRes.headers.get('set-cookie');

    // 2. Initial config check
    const cfgRes = await fetch(`${baseUrl}/api/config`);
    const cfg = await cfgRes.json();
    assert.strictEqual(typeof cfg.fullscreenEnforced, 'boolean', 'fullscreenEnforced must be boolean');

    // 3. Toggle proctoring OFF
    const offRes = await fetch(`${baseUrl}/api/admin/toggle-proctoring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ enabled: false })
    });
    assert.strictEqual(offRes.status, 200);
    const offData = await offRes.json();
    assert.strictEqual(offData.fullscreenEnforced, false);

    // 4. Verify /api/config reflects false
    const cfgOffRes = await fetch(`${baseUrl}/api/config`);
    const cfgOff = await cfgOffRes.json();
    assert.strictEqual(cfgOff.fullscreenEnforced, false);

    // 5. Test regular team departure violation while proctoring is OFF -> must be ignored
    const bucPass = creds.teams.BUCCANEERS || creds.teams.buccaneers;
    const teamLogin = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'BUCCANEERS', password: bucPass })
    });
    const teamCookie = teamLogin.headers.get('set-cookie');

    const violRes = await fetch(`${baseUrl}/api/proctor/violation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': teamCookie },
      body: JSON.stringify({ reason: 'Exited fullscreen during testing' })
    });
    const violData = await violRes.json();
    assert.strictEqual(violData.ignored, true, 'Violation must be ignored when proctoring is OFF');

    // 6. Toggle proctoring back ON
    const onRes = await fetch(`${baseUrl}/api/admin/toggle-proctoring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ enabled: true })
    });
    const onData = await onRes.json();
    assert.strictEqual(onData.fullscreenEnforced, true);

    console.log('✅ Admin Fullscreen Proctor Toggle & Violation Bypass verified successfully!');
  } finally {
    server.close();
  }
}

testToggleProctoring().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
