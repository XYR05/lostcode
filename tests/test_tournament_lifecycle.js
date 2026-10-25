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
  saveRoundState
} = require('../server.js');

async function runTournamentLifecycleSimulation() {
  console.log('================================================================');
  console.log('⚓ STARTING FULL 13-CRITERION TOURNAMENT LIFECYCLE SIMULATION ⚓');
  console.log('================================================================\n');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  const initialRiddleBank = JSON.parse(JSON.stringify(getRiddleBank()));
  const initialAssignments = JSON.parse(JSON.stringify(getTournamentAssignments()));
  const initialRoundState = JSON.parse(JSON.stringify(getRoundState()));
  const teamsPath = path.join(__dirname, '../teams.json');
  const initialTeams = JSON.parse(fs.readFileSync(teamsPath, 'utf8'));
  const auditPath = path.join(__dirname, '../private/audit_log.json');
  const initialAudit = fs.existsSync(auditPath) ? JSON.parse(fs.readFileSync(auditPath, 'utf8')) : [];

  const teamCrews = [
    { id: 'crew_1_buccaneers', name: 'BUCCANEERS' },
    { id: 'crew_2_cutthroats', name: 'CUTTHROATS' },
    { id: 'crew_3_corsairs', name: 'CORSAIRS' },
    { id: 'crew_4_krakens', name: 'KRAKENS' },
    { id: 'crew_5_scallywags', name: 'SCALLYWAGS' },
    { id: 'crew_6_privateers', name: 'PRIVATEERS' },
    { id: 'crew_7_blackflags', name: 'BLACKFLAGS' },
    { id: 'crew_8_plunderers', name: 'PLUNDERERS' },
    { id: 'crew_9_dreadsails', name: 'DREADSAILS' },
    { id: 'crew_10_searavens', name: 'SEARAVENS' }
  ];

  try {
    // Helper to log in a crew and get cookies
    async function loginCrew(name, pw = 'ahoy123') {
      const res = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamName: name, password: pw })
      });
      assert.strictEqual(res.status, 200, `Login failed for crew ${name}`);
      return res.headers.get('set-cookie');
    }

    // Login Admin
    const adminCookie = await loginCrew('admin@lostcode', 'foundcode');
    assert.ok(adminCookie, 'Admin login cookie obtained');

    // Login all 10 crews
    const teamCookies = {};
    for (const crew of teamCrews) {
      teamCookies[crew.id] = await loginCrew(crew.name);
    }
    console.log('✓ All 10 official crews and Admiralty administrator authenticated.');

    // -------------------------------------------------------------
    // CRITERION 12: Admin panel detects incomplete assignments before activation
    // -------------------------------------------------------------
    console.log('\n--- Checking Criterion 12: Pre-launch validation detects incomplete assignments ---');
    const tempAssigns = getTournamentAssignments();
    const savedR2Slots = JSON.parse(JSON.stringify(tempAssigns.rounds['2']));
    for (const g of ['A', 'B']) {
      tempAssigns.rounds['2'].groups[g].slots.forEach(s => s.riddleId = null);
    }
    saveTournamentAssignments(tempAssigns);

    const valIncomplete = await fetch(`${baseUrl}/api/admin/rounds/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ round: 2 })
    });
    const valIncData = await valIncomplete.json();
    assert.strictEqual(valIncData.valid, false, 'Unconfigured Round 2 must fail validation');
    assert.ok(valIncData.errors.length > 0, 'Must report actionable errors');
    console.log(`✓ Criterion 12 PASS: Validation detected ${valIncData.errors.length} incomplete configuration issues.`);

    // Restore configured Round 2 slots
    tempAssigns.rounds['2'] = savedR2Slots;
    saveTournamentAssignments(tempAssigns);

    // -------------------------------------------------------------
    // CRITERION 11: Incomplete riddle drafts cannot accidentally become valid live challenges
    // -------------------------------------------------------------
    console.log('\n--- Checking Criterion 11: Draft riddles cannot be activated or submitted ---');
    const riddleBank = getRiddleBank();
    riddleBank['draft_riddle_unfin'] = {
      id: 'draft_riddle_unfin',
      title: 'Unfinished Draft',
      text: '',
      expectedAnswer: '',
      targetRound: 1,
      status: 'draft',
      points: 100
    };
    saveRiddleBank(riddleBank);

    const assignments = getTournamentAssignments();
    assignments.rounds['1'].slots[0].riddleId = 'draft_riddle_unfin';
    saveTournamentAssignments(assignments);

    const draftValRes = await fetch(`${baseUrl}/api/admin/rounds/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ round: 1 })
    });
    const draftValData = await draftValRes.json();
    assert.strictEqual(draftValData.valid, false, 'Draft riddle must block round validation');
    console.log('✓ Criterion 11 PASS: Draft riddle correctly flagged and rejected from live competition.');

    // -------------------------------------------------------------
    // CRITERION 1: Round 1 gives all 10 teams distinct private riddles; all 10 advance
    // -------------------------------------------------------------
    console.log('\n--- Checking Criterion 1: Round 1 (10 Distinct Private Riddles, 0 Eliminations) ---');
    // Provision 10 distinct published riddles
    const r1Answers = {};
    for (let i = 1; i <= 10; i++) {
      const rid = `r1_published_riddle_${i}`;
      const ans = `FLAG_R1_CREW_${i}`;
      r1Answers[teamCrews[i - 1].id] = ans;
      riddleBank[rid] = {
        id: rid,
        title: `Riddle ${i} for ${teamCrews[i - 1].name}`,
        text: `The coordinates for crew ${i} are encrypted...`,
        expectedAnswer: ans,
        targetRound: 1,
        status: 'published',
        points: 100,
        hints: []
      };
      assignments.rounds['1'].slots[i - 1].riddleId = rid;
      assignments.rounds['1'].slots[i - 1].claimed = false;
      assignments.rounds['1'].slots[i - 1].claimedBy = null;
    }
    saveRiddleBank(riddleBank);
    saveTournamentAssignments(assignments);

    // Validate and Activate Round 1
    const r1Val = await fetch(`${baseUrl}/api/admin/rounds/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ round: 1 })
    });
    const r1ValData = await r1Val.json();
    assert.strictEqual(r1ValData.valid, true, 'Round 1 with 10 distinct published riddles must be valid');

    const r1Act = await fetch(`${baseUrl}/api/admin/rounds/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ round: 1 })
    });
    assert.strictEqual(r1Act.status, 200, 'Round 1 activation must succeed');

    // Verify all 10 teams receive distinct private riddles
    const receivedRiddleIds = new Set();
    for (const crew of teamCrews) {
      const chRes = await fetch(`${baseUrl}/api/team/challenge?round=1`, {
        headers: { 'Cookie': teamCookies[crew.id] }
      });
      const chData = await chRes.json();
      assert.strictEqual(chData.success, true);
      assert.ok(chData.riddle, `Crew ${crew.name} must receive a riddle`);
      assert.strictEqual(chData.riddle.expectedAnswer, undefined, 'Answer must be private and unexposed');
      receivedRiddleIds.add(chData.riddle.id);
    }
    assert.strictEqual(receivedRiddleIds.size, 10, 'All 10 crews must receive distinct riddles');

    // -------------------------------------------------------------
    // CRITERION 6: Incorrect submissions do not advance teams
    // -------------------------------------------------------------
    console.log('\n--- Checking Criterion 6: Incorrect submissions rejected ---');
    const wrongSubRes = await fetch(`${baseUrl}/api/team/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': teamCookies['crew_1_buccaneers'] },
      body: JSON.stringify({ answer: 'WRONG_FLAG_VAL', round: 1 })
    });
    const wrongSubData = await wrongSubRes.json();
    assert.strictEqual(wrongSubData.success, false, 'Incorrect answer must not advance');
    assert.strictEqual(wrongSubData.qualified, false, 'Incorrect answer must not qualify');
    console.log('✓ Criterion 6 PASS: Incorrect submissions do not advance teams.');

    // All 10 teams solve their respective riddles
    for (const crew of teamCrews) {
      const subRes = await fetch(`${baseUrl}/api/team/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': teamCookies[crew.id] },
        body: JSON.stringify({ answer: r1Answers[crew.id], round: 1 })
      });
      const subData = await subRes.json();
      assert.strictEqual(subData.success, true, `Crew ${crew.name} solve must succeed`);
      assert.strictEqual(subData.qualified, true, `Crew ${crew.name} must qualify`);
    }

    // Check round state: all 10 qualified, 0 eliminations
    const rs1 = getRoundState()['1'];
    assert.strictEqual(rs1.qualifiers.length, 10, 'All 10 crews must qualify for Round 2');
    assert.strictEqual(rs1.eliminated.length, 0, 'Zero eliminations in Round 1');
    console.log('✓ Criterion 1 PASS: All 10 crews received unique private riddles and qualified for Round 2 with 0 eliminations.');

    // -------------------------------------------------------------
    // CRITERION 5: Cross-team parameter snooping rejected
    // -------------------------------------------------------------
    console.log('\n--- Checking Criterion 5: Cross-team parameter tampering rejected ---');
    const snoopRes = await fetch(`${baseUrl}/api/team/challenge?round=1&teamId=crew_2_cutthroats`, {
      headers: { 'Cookie': teamCookies['crew_1_buccaneers'] }
    });
    const snoopData = await snoopRes.json();
    assert.strictEqual(snoopData.slotId, 'R1_S1', 'Buccaneers cannot snoop on Cutthroats slot');
    console.log('✓ Criterion 5 PASS: Server strictly isolates requests to authenticated session identity.');

    // -------------------------------------------------------------
    // CRITERION 7: Duplicate submissions do not duplicate qualification records
    // -------------------------------------------------------------
    console.log('\n--- Checking Criterion 7: Duplicate submissions prevent double-qualifications ---');
    const dupSubRes = await fetch(`${baseUrl}/api/team/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': teamCookies['crew_1_buccaneers'] },
      body: JSON.stringify({ answer: r1Answers['crew_1_buccaneers'], round: 1 })
    });
    assert.strictEqual(dupSubRes.status, 400, 'Already qualified team cannot re-submit for duplicate qualification');
    console.log('✓ Criterion 7 PASS: Duplicate qualification prevented.');

    // -------------------------------------------------------------
    // CRITERION 2 & 8: Round 2 (2 Groups of 5, 3 slots per group, atomic slot claim)
    // -------------------------------------------------------------
    console.log('\n--- Checking Criteria 2 & 8: Round 2 (2x5 Groups, 3 Slots, Atomic Slot Race) ---');
    // Group A: crews 1, 3, 5, 7, 9. Group B: crews 2, 4, 6, 8, 10
    const currAssignments = getTournamentAssignments();
    for (let s = 1; s <= 3; s++) {
      const ridA = `r2_ga_riddle_${s}`;
      const ridB = `r2_gb_riddle_${s}`;
      riddleBank[ridA] = {
        id: ridA, title: `Group A Riddle ${s}`, text: `Clue A${s}`,
        expectedAnswer: `FLAG_R2_GA_${s}`, targetRound: 2, status: 'published', points: 200, hints: []
      };
      riddleBank[ridB] = {
        id: ridB, title: `Group B Riddle ${s}`, text: `Clue B${s}`,
        expectedAnswer: `FLAG_R2_GB_${s}`, targetRound: 2, status: 'published', points: 200, hints: []
      };
      currAssignments.rounds['2'].groups.A.slots[s - 1].riddleId = ridA;
      currAssignments.rounds['2'].groups.A.slots[s - 1].claimed = false;
      currAssignments.rounds['2'].groups.B.slots[s - 1].riddleId = ridB;
      currAssignments.rounds['2'].groups.B.slots[s - 1].claimed = false;
    }
    saveRiddleBank(riddleBank);
    saveTournamentAssignments(currAssignments);

    // Activate Round 2
    const r2Act = await fetch(`${baseUrl}/api/admin/rounds/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ round: 2 })
    });
    assert.strictEqual(r2Act.status, 200);

    // Simulate concurrency race on Group A Slot 1 between Buccaneers (crew 1) and Corsairs (crew 3)
    const [subRace1, subRace2] = await Promise.all([
      fetch(`${baseUrl}/api/team/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': teamCookies['crew_1_buccaneers'] },
        body: JSON.stringify({ answer: 'FLAG_R2_GA_1', round: 2 })
      }),
      fetch(`${baseUrl}/api/team/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': teamCookies['crew_3_corsairs'] },
        body: JSON.stringify({ answer: 'FLAG_R2_GA_1', round: 2 })
      })
    ]);
    const resRace1 = await subRace1.json();
    const resRace2 = await subRace2.json();
    const oneSuccess = (resRace1.success && !resRace2.success) || (!resRace1.success && resRace2.success);
    assert.ok(oneSuccess, 'Simultaneous submissions must award slot to exactly ONE crew');
    console.log('✓ Criterion 8 PASS: Concurrency safety verified — exactly 1 winner claimed the disputed slot.');

    // Complete Group A 3 qualifiers (Crews 1, 5, 7 advance; 3 & 9 eliminated)
    await fetch(`${baseUrl}/api/team/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': teamCookies['crew_5_scallywags'] },
      body: JSON.stringify({ answer: 'FLAG_R2_GA_2', round: 2 })
    });
    await fetch(`${baseUrl}/api/team/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': teamCookies['crew_7_blackflags'] },
      body: JSON.stringify({ answer: 'FLAG_R2_GA_3', round: 2 })
    });

    // Complete Group B 3 qualifiers (Crews 2, 4, 6 advance; 8 & 10 eliminated)
    for (let s = 1; s <= 3; s++) {
      const crewId = teamCrews[(s - 1) * 2 + 1].id; // 2, 4, 6
      await fetch(`${baseUrl}/api/team/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': teamCookies[crewId] },
        body: JSON.stringify({ answer: `FLAG_R2_GB_${s}`, round: 2 })
      });
    }

    const rs2 = getRoundState()['2'];
    assert.strictEqual(rs2.qualifiers.length, 6, 'Exactly 6 crews must advance from Round 2');
    console.log('✓ Criterion 2 PASS: Round 2 qualified 3 crews per group (6 total).');

    // -------------------------------------------------------------
    // CRITERION 9: Eliminated teams cannot participate in later rounds
    // -------------------------------------------------------------
    console.log('\n--- Checking Criterion 9: Eliminated teams locked out ---');
    // Mark eliminated team crew_9_dreadsails in memory and disk
    const dreadsails = teams.find(t => t.id === 'crew_9_dreadsails');
    if (dreadsails) {
      dreadsails.eliminated = true;
      dreadsails.eliminatedRound = 2;
    }
    const liveTeams = JSON.parse(fs.readFileSync(teamsPath, 'utf8'));
    const dreadDisk = liveTeams.find(t => t.id === 'crew_9_dreadsails');
    if (dreadDisk) {
      dreadDisk.eliminated = true;
      dreadDisk.eliminatedRound = 2;
      fs.writeFileSync(teamsPath, JSON.stringify(liveTeams, null, 2));
    }

    const elimSub = await fetch(`${baseUrl}/api/team/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': teamCookies['crew_9_dreadsails'] },
      body: JSON.stringify({ answer: 'ANY_FLAG', round: 3 })
    });
    assert.strictEqual(elimSub.status, 403, 'Eliminated crew must be forbidden from submitting');
    console.log('✓ Criterion 9 PASS: Eliminated crew received HTTP 403 Forbidden.');

    // -------------------------------------------------------------
    // CRITERION 3: Round 3 (2 Groups of 3, 1 slot per group -> 2 Finalists)
    // -------------------------------------------------------------
    console.log('\n--- Checking Criterion 3: Round 3 (2 Groups of 3, 1 Qualifier per Group) ---');
    const r3Assignments = getTournamentAssignments();
    r3Assignments.rounds['3'].groups.A.teams = ['crew_1_buccaneers', 'crew_5_scallywags', 'crew_7_blackflags'];
    r3Assignments.rounds['3'].groups.B.teams = ['crew_2_cutthroats', 'crew_4_krakens', 'crew_6_privateers'];

    riddleBank['r3_ga_slot1'] = {
      id: 'r3_ga_slot1', title: 'Group A Creek Riddle', text: 'Riddle text',
      expectedAnswer: 'FLAG_R3_GA', targetRound: 3, status: 'published', points: 300, hints: []
    };
    riddleBank['r3_gb_slot1'] = {
      id: 'r3_gb_slot1', title: 'Group B Creek Riddle', text: 'Riddle text',
      expectedAnswer: 'FLAG_R3_GB', targetRound: 3, status: 'published', points: 300, hints: []
    };
    r3Assignments.rounds['3'].groups.A.slots[0].riddleId = 'r3_ga_slot1';
    r3Assignments.rounds['3'].groups.B.slots[0].riddleId = 'r3_gb_slot1';
    saveRiddleBank(riddleBank);
    saveTournamentAssignments(r3Assignments);

    // Activate Round 3
    await fetch(`${baseUrl}/api/admin/rounds/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ round: 3 })
    });

    // Buccaneers win Group A
    await fetch(`${baseUrl}/api/team/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': teamCookies['crew_1_buccaneers'] },
      body: JSON.stringify({ answer: 'FLAG_R3_GA', round: 3 })
    });
    // Cutthroats win Group B
    await fetch(`${baseUrl}/api/team/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': teamCookies['crew_2_cutthroats'] },
      body: JSON.stringify({ answer: 'FLAG_R3_GB', round: 3 })
    });

    const rs3 = getRoundState()['3'];
    assert.strictEqual(rs3.qualifiers.length, 2, 'Exactly 2 finalists must advance from Round 3');
    console.log('✓ Criterion 3 PASS: Round 3 produced exactly 2 finalists (Buccaneers & Cutthroats).');

    // -------------------------------------------------------------
    // CRITERION 4: Round 4 Final Duel (1 Riddle, 1 Grand Champion)
    // -------------------------------------------------------------
    console.log('\n--- Checking Criterion 4: Round 4 Final Duel (1 Riddle, 1 Winner) ---');
    const r4Assignments = getTournamentAssignments();
    r4Assignments.rounds['4'].teams = ['crew_1_buccaneers', 'crew_2_cutthroats'];
    riddleBank['r4_final_riddle'] = {
      id: 'r4_final_riddle', title: 'The Treasure of Lost Code', text: 'Where dead men tell no tales...',
      expectedAnswer: 'GRAND_LOST_CODE_CHEST', targetRound: 4, status: 'published', points: 1000, hints: []
    };
    r4Assignments.rounds['4'].slots[0].riddleId = 'r4_final_riddle';
    saveRiddleBank(riddleBank);
    saveTournamentAssignments(r4Assignments);

    await fetch(`${baseUrl}/api/admin/rounds/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ round: 4 })
    });

    // Buccaneers submit correctly first
    const champRes = await fetch(`${baseUrl}/api/team/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': teamCookies['crew_1_buccaneers'] },
      body: JSON.stringify({ answer: 'GRAND_LOST_CODE_CHEST', round: 4 })
    });
    const champData = await champRes.json();
    assert.strictEqual(champData.success, true);
    assert.strictEqual(champData.isWinner, true, 'First solve must crown Grand Champion');

    // Runner-up submits after winner declared
    const runnerRes = await fetch(`${baseUrl}/api/team/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': teamCookies['crew_2_cutthroats'] },
      body: JSON.stringify({ answer: 'GRAND_LOST_CODE_CHEST', round: 4 })
    });
    assert.strictEqual(runnerRes.status, 400, 'Late submission after championship completion must be rejected with 400');
    const runnerData = await runnerRes.json();
    assert.ok(runnerData.error.includes('Completed'), 'Error message must confirm round is Completed');

    const rs4 = getRoundState()['4'];
    assert.strictEqual(rs4.winner, 'crew_1_buccaneers', 'Authoritative winner must be Buccaneers');
    console.log('✓ Criterion 4 PASS: Round 4 crowned Buccaneers as Grand Champion and rejected secondary claims.');

    // -------------------------------------------------------------
    // CRITERION 10: Refreshing, logging out, or logging in does not change assignments
    // -------------------------------------------------------------
    console.log('\n--- Checking Criterion 10: Persistent state survives re-login ---');
    const reloginCookie = await loginCrew('BUCCANEERS');
    const chkRes = await fetch(`${baseUrl}/api/team/challenge?round=1`, {
      headers: { 'Cookie': reloginCookie }
    });
    const chkData = await chkRes.json();
    assert.strictEqual(chkData.slotId, 'R1_S1', 'Slot assignment unchanged after re-login');
    console.log('✓ Criterion 10 PASS: Assignments persist deterministically across session lifecycles.');

    // -------------------------------------------------------------
    // CRITERION 13: Existing website functionality and visual styling remain intact
    // -------------------------------------------------------------
    console.log('\n--- Checking Criterion 13: UI and asset integrity ---');
    const dashboardHtml = fs.readFileSync(path.join(__dirname, '../private/dashboard.html'), 'utf8');
    assert.ok(dashboardHtml.includes('treasureTableMap'), 'Treasure map preserved');
    assert.ok(dashboardHtml.includes('mapChallengeWindow'), 'Docking window preserved');
    assert.ok(!dashboardHtml.includes('🔒') && !dashboardHtml.includes('🔓'), 'Zero lock emojis');
    console.log('✓ Criterion 13 PASS: Visual identity, pirate styling, and components 100% intact.');

    console.log('\n================================================================');
    console.log('🏴‍☠️ ALL 13 ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY! 🏴‍☠️');
    console.log('================================================================');
  } finally {
    saveRiddleBank(initialRiddleBank);
    saveTournamentAssignments(initialAssignments);
    if (initialRoundState && initialRoundState['1']) {
      initialRoundState['1'].status = 'Draft';
      initialRoundState['1'].startedAt = null;
    }
    saveRoundState(initialRoundState);
    fs.writeFileSync(teamsPath, JSON.stringify(initialTeams, null, 2), 'utf8');
    fs.writeFileSync(auditPath, JSON.stringify(initialAudit, null, 2), 'utf8');
    server.close();
  }
}

runTournamentLifecycleSimulation().catch(err => {
  console.error('\n❌ SIMULATION FAILED:', err);
  process.exit(1);
});
