const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const privateDir = path.join(__dirname, '../private');
const credentialsPath = path.join(privateDir, 'credentials.json');
const teamsPath = path.join(__dirname, '../teams.json');
const usersPath = path.join(__dirname, '../users.json');

const crewNames = [
  "BUCCANEERS",
  "CUTTHROATS",
  "CORSAIRS",
  "KRAKENS",
  "SCALLYWAGS",
  "PRIVATEERS",
  "BLACKFLAGS",
  "PLUNDERERS",
  "DREADSAILS",
  "SEARAVENS"
];

function generateRandomPassword(length = 8, prefix = '') {
  const charset = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(length);
  let res = prefix;
  for (let i = 0; i < length; i++) {
    res += charset[bytes[i] % charset.length];
  }
  return res;
}

function run() {
  console.log('===============================================================');
  console.log('⚓ LOST CODE EXPEDITION — GENERATING RANDOMIZED CREDENTIALS ⚓');
  console.log('===============================================================\n');

  const adminPassword = generateRandomPassword(8, 'adm_');
  const teamPasswords = {};

  crewNames.forEach(name => {
    teamPasswords[name] = generateRandomPassword(6, `${name.toLowerCase()}_`);
  });

  const credentialsData = {
    generatedAt: new Date().toISOString(),
    admin: {
      username: 'admin@lostcode',
      password: adminPassword
    },
    teams: teamPasswords
  };

  // 1. Write private/credentials.json
  fs.writeFileSync(credentialsPath, JSON.stringify(credentialsData, null, 2), 'utf8');
  console.log(`✓ Saved plaintext credentials to ${credentialsPath}`);

  // 2. Update teams.json
  if (fs.existsSync(teamsPath)) {
    const teams = JSON.parse(fs.readFileSync(teamsPath, 'utf8'));
    teams.forEach(t => {
      if (t.id === 'team_admin_1' || (t.teamName || '').toLowerCase().includes('admin')) {
        t.password = bcrypt.hashSync(adminPassword, 10);
      } else {
        const plain = teamPasswords[t.teamName.toUpperCase()];
        if (plain) {
          t.password = bcrypt.hashSync(plain, 10);
        }
      }
    });
    fs.writeFileSync(teamsPath, JSON.stringify(teams, null, 2), 'utf8');
    console.log(`✓ Updated bcrypt hashes in ${teamsPath}`);
  }

  // 3. Update users.json
  if (fs.existsSync(usersPath)) {
    const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    users.forEach(u => {
      if (u.id === 'user_admin_1' || (u.username || '').toLowerCase().includes('admin')) {
        u.password = bcrypt.hashSync(adminPassword, 10);
      } else {
        const plain = teamPasswords[(u.username || '').toUpperCase()];
        if (plain) {
          u.password = bcrypt.hashSync(plain, 10);
        }
      }
    });
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), 'utf8');
    console.log(`✓ Updated bcrypt hashes in ${usersPath}`);
  }

  // Print Credential Matrix
  console.log('\n---------------------------------------------------------------');
  console.log('ROLE / CREW NAME           | USERNAME / IDENTIFIER | PASSWORD');
  console.log('---------------------------------------------------------------');
  console.log(`Admiralty Administrator    | admin@lostcode        | ${adminPassword}`);
  console.log('---------------------------------------------------------------');
  crewNames.forEach((name, idx) => {
    const padName = (name + ' '.repeat(26)).slice(0, 26);
    const padId = (name + ' '.repeat(21)).slice(0, 21);
    console.log(`${padName} | ${padId} | ${teamPasswords[name]}`);
  });
  console.log('---------------------------------------------------------------\n');
  console.log('🏴‍☠️ All random credentials generated and secured successfully!');
}

run();
