const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  app,
  getCredentials,
  saveCredentials,
  generateRandomPassword,
  generateTournamentCredentials
} = require('../server.js');

async function runTests() {
  console.log('Testing Randomized Credentials Generation, Vault & Reset Endpoints...');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const baseUrl = `http://localhost:${server.address().port}`;

  // Backup original credentials and teams
  const credsPath = path.join(__dirname, '../private/credentials.json');
  const teamsPath = path.join(__dirname, '../teams.json');
  const usersPath = path.join(__dirname, '../users.json');

  const origCreds = fs.existsSync(credsPath) ? fs.readFileSync(credsPath, 'utf8') : null;
  const origTeams = fs.existsSync(teamsPath) ? fs.readFileSync(teamsPath, 'utf8') : null;
  const origUsers = fs.existsSync(usersPath) ? fs.readFileSync(usersPath, 'utf8') : null;

  try {
    // 1. Verify password generator format and entropy
    console.log('[1/8] Verifying password generator constraints...');
    const testAdminPw = generateRandomPassword(8, 'adm_');
    assert.strictEqual(testAdminPw.startsWith('adm_'), true, 'Admin password must start with adm_');
    assert.strictEqual(testAdminPw.length, 12, 'Admin password length must be 12 (4 prefix + 8 random)');
    assert.strictEqual(/^[a-zA-Z0-9_]+$/.test(testAdminPw), true, 'Password must be alphanumeric');
    // Ensure no ambiguous chars (0, O, 1, l, I)
    assert.strictEqual(/[0O1lI]/.test(testAdminPw.slice(4)), false, 'Password random part must not contain ambiguous chars');

    const testTeamPw = generateRandomPassword(6, 'buccaneers_');
    assert.strictEqual(testTeamPw.startsWith('buccaneers_'), true);
    assert.strictEqual(testTeamPw.length, 11 + 6);
    assert.strictEqual(/[0O1lI]/.test(testTeamPw.slice(11)), false);

    // 2. Unauthenticated access to /api/admin/credentials rejected with 403
    console.log('[2/8] Testing unauthenticated access rejection...');
    const unauthRes = await fetch(`${baseUrl}/api/admin/credentials`);
    assert.strictEqual(unauthRes.status, 403, 'Unauthenticated access to credentials must return 403');

    // 3. Authenticate with initial random credentials
    console.log('[3/8] Testing initial credential authentication...');
    const creds1 = getCredentials();
    assert.ok(creds1.admin && creds1.admin.password, 'Admin credential must exist');
    assert.ok(creds1.teams && creds1.teams.BUCCANEERS, 'Team credential must exist');

    // Participant login
    const bucLoginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamName: 'BUCCANEERS', password: creds1.teams.BUCCANEERS })
    });
    assert.strictEqual(bucLoginRes.status, 200, 'Participant login with random password must succeed');
    const bucCookie = bucLoginRes.headers.get('set-cookie');

    // Default legacy password ahoy123 must be rejected
    const legacyFailRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamName: 'BUCCANEERS', password: 'ahoy123' })
    });
    assert.strictEqual(legacyFailRes.status, 400, 'Legacy hardcoded ahoy123 must be rejected');

    // Participant denied credentials access
    console.log('[4/8] Testing participant denial from credentials vault...');
    const partDeniedRes = await fetch(`${baseUrl}/api/admin/credentials`, {
      headers: { 'Cookie': bucCookie }
    });
    assert.strictEqual(partDeniedRes.status, 403, 'Participant must be denied credentials access');

    // Admin login
    const adminLoginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamName: 'admin@lostcode', password: creds1.admin.password })
    });
    assert.strictEqual(adminLoginRes.status, 200, 'Admin login with random password must succeed');
    const adminCookie = adminLoginRes.headers.get('set-cookie');

    // 4. Admin GET /api/admin/credentials returns full vault
    console.log('[5/8] Testing admin credentials vault listing...');
    const vaultRes = await fetch(`${baseUrl}/api/admin/credentials`, {
      headers: { 'Cookie': adminCookie }
    });
    assert.strictEqual(vaultRes.status, 200);
    const vaultData = await vaultRes.json();
    assert.strictEqual(vaultData.success, true);
    assert.strictEqual(vaultData.admin.username, 'admin@lostcode');
    assert.strictEqual(vaultData.admin.password, creds1.admin.password);
    assert.strictEqual(Array.isArray(vaultData.teams), true);
    assert.strictEqual(vaultData.teams.length, 10, 'All 10 teams must be present in vault');

    // 5. Admin reset password for single team (CUTTHROATS)
    console.log('[6/8] Testing single team password reset...');
    const oldCutPw = creds1.teams.CUTTHROATS;
    const resetSingleRes = await fetch(`${baseUrl}/api/admin/credentials/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ teamName: 'CUTTHROATS' })
    });
    assert.strictEqual(resetSingleRes.status, 200);
    const resetSingleData = await resetSingleRes.json();
    assert.strictEqual(resetSingleData.success, true);
    assert.strictEqual(resetSingleData.teamName, 'CUTTHROATS');
    const newCutPw = resetSingleData.newPassword;
    assert.notStrictEqual(newCutPw, oldCutPw, 'New password must differ from old');
    assert.strictEqual(newCutPw.startsWith('cutthroats_'), true);

    // Old password must fail
    const oldPwFail = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamName: 'CUTTHROATS', password: oldCutPw })
    });
    assert.strictEqual(oldPwFail.status, 400, 'Old password must fail after reset');

    // New password must succeed
    const newPwSuccess = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamName: 'CUTTHROATS', password: newCutPw })
    });
    assert.strictEqual(newPwSuccess.status, 200, 'New password must succeed after reset');

    // 6. Admin reset password for admin account
    console.log('[7/8] Testing admin password reset...');
    const oldAdminPw = creds1.admin.password;
    const resetAdminRes = await fetch(`${baseUrl}/api/admin/credentials/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ teamName: 'admin' })
    });
    assert.strictEqual(resetAdminRes.status, 200);
    const resetAdminData = await resetAdminRes.json();
    const newAdminPw = resetAdminData.newPassword;
    assert.notStrictEqual(newAdminPw, oldAdminPw, 'New admin password must differ from old');
    assert.strictEqual(newAdminPw.startsWith('adm_'), true);

    // Test new admin login
    const newAdminLoginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamName: 'admin@lostcode', password: newAdminPw })
    });
    assert.strictEqual(newAdminLoginRes.status, 200, 'New admin login must succeed');
    const newAdminCookie = newAdminLoginRes.headers.get('set-cookie');

    // 7. Admin regenerate all passwords
    console.log('[8/8] Testing regenerate all tournament passwords...');
    const regenAllRes = await fetch(`${baseUrl}/api/admin/credentials/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': newAdminCookie },
      body: JSON.stringify({ all: true })
    });
    assert.strictEqual(regenAllRes.status, 200);
    const regenAllData = await regenAllRes.json();
    assert.strictEqual(regenAllData.success, true);
    assert.strictEqual(typeof regenAllData.credentials.admin.password, 'string');
    assert.strictEqual(Object.keys(regenAllData.credentials.teams).length, 10);

    // Re-verify that newly regenerated passwords match what is saved in credentials.json
    const diskCreds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    assert.strictEqual(diskCreds.admin.password, regenAllData.credentials.admin.password);
    assert.strictEqual(diskCreds.teams.CORSAIRS, regenAllData.credentials.teams.CORSAIRS);

    // Final login test with fresh regenerated creds
    const freshCorsairLogin = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamName: 'CORSAIRS', password: diskCreds.teams.CORSAIRS })
    });
    assert.strictEqual(freshCorsairLogin.status, 200, 'Regenerated CORSAIRS login must succeed');

    console.log('\n✅ All Randomized Credentials tests passed 100%!');
  } finally {
    // Restore original state
    if (origCreds) fs.writeFileSync(credsPath, origCreds);
    if (origTeams) fs.writeFileSync(teamsPath, origTeams);
    if (origUsers) fs.writeFileSync(usersPath, origUsers);
    server.close();
  }
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
