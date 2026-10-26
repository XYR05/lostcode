const fs = require('fs');
const path = require('path');

const riddleBankPath = path.join(__dirname, '../private/riddle_bank.json');
const assignmentsPath = path.join(__dirname, '../private/tournament_assignments.json');
const teamsPath = path.join(__dirname, '../teams.json');

const round1Riddles = [
  {
    id: "riddle_r1_compass",
    slotId: "R1_S1",
    teamId: "crew_1_buccaneers",
    title: "The Guiding Needle",
    text: "I have no voice, but I speak of four lands. I have a single trembling finger that points without hands. In iron or bronze I forever dwell; follow my needle and all shall be well. What nautical instrument am I?",
    expectedAnswer: "compass",
    targetRound: 1,
    status: "published",
    points: 100,
    answerMatchingRule: { caseSensitive: false, trim: true },
    hints: [
      { text: "A brass navigational instrument containing a magnetic needle pointing North.", cost: 20 }
    ]
  },
  {
    id: "riddle_r1_anchor",
    slotId: "R1_S2",
    teamId: "crew_2_cutthroats",
    title: "The Iron Sleeper",
    text: "Heavy as lead, forged in dark flame; cast me overboard, I stop the grand game. With flukes to the seabed and shank in the tide, until ye haul wind, right here ye abide. What am I?",
    expectedAnswer: "anchor",
    targetRound: 1,
    status: "published",
    points: 100,
    answerMatchingRule: { caseSensitive: false, trim: true },
    hints: [
      { text: "A heavy iron device dropped from the bow to moor a vessel to the seafloor.", cost: 20 }
    ]
  },
  {
    id: "riddle_r1_hourglass",
    slotId: "R1_S3",
    teamId: "crew_3_corsairs",
    title: "The Sands of Tide",
    text: "Two glass bells joined at the waist, I swallow fine shore with no sign of haste. Turn me on my head and my journey begins anew; mariners use me to strike the bells true. What timepiece am I?",
    expectedAnswer: "hourglass",
    targetRound: 1,
    status: "published",
    points: 100,
    answerMatchingRule: { caseSensitive: false, trim: true },
    hints: [
      { text: "A nautical sand timer with two glass bulbs connected by a narrow neck.", cost: 20 }
    ]
  },
  {
    id: "riddle_r1_spyglass",
    slotId: "R1_S4",
    teamId: "crew_4_krakens",
    title: "The Crow's Eye",
    text: "I stretch out long when brass sleeves slide, pulling far islands right to your side. Closed I am small, open I am tall; through lens of quartz I reveal ships to all. What tool am I?",
    expectedAnswer: "spyglass",
    targetRound: 1,
    status: "published",
    points: 100,
    answerMatchingRule: { caseSensitive: false, trim: true },
    hints: [
      { text: "A collapsible handheld refracting telescope used by sailors.", cost: 20 }
    ]
  },
  {
    id: "riddle_r1_map",
    slotId: "R1_S5",
    teamId: "crew_5_scallywags",
    title: "Parchment of the Red X",
    text: "I have cities without houses, forests without trees, and rivers without water crossing saltless seas. An inked scarlet 'X' marks where riches lay dead; hold me to candlefire to read what was said. What am I?",
    expectedAnswer: "map",
    targetRound: 1,
    status: "published",
    points: 100,
    answerMatchingRule: { caseSensitive: false, trim: true },
    hints: [
      { text: "A navigational chart on parchment showing landmarks and secret locations.", cost: 20 }
    ]
  },
  {
    id: "riddle_r1_lighthouse",
    slotId: "R1_S6",
    teamId: "crew_6_privateers",
    title: "The Stone Sentinel",
    text: "I stand on jagged crags where wild breakers roar. My single eye burns with flame, peering out from the shore. I wear stripes of white and crimson so bold, warning proud captains of reefs deep and cold. What tower am I?",
    expectedAnswer: "lighthouse",
    targetRound: 1,
    status: "published",
    points: 100,
    answerMatchingRule: { caseSensitive: false, trim: true },
    hints: [
      { text: "A coastal beacon tower emitting light to guide ships and warn of shoals.", cost: 20 }
    ]
  },
  {
    id: "riddle_r1_doubloon",
    slotId: "R1_S7",
    teamId: "crew_7_blackflags",
    title: "The Spanish Sun",
    text: "Stamped with royal crests and hauled from sunken hold, I clink in leather pouches, seven grams of solid gold. Pirates spill rum and duel for my shine; pieces of eight are humble cousins of mine. What coin am I?",
    expectedAnswer: "doubloon",
    targetRound: 1,
    status: "published",
    points: 100,
    answerMatchingRule: { caseSensitive: false, trim: true },
    hints: [
      { text: "A historic seven-gram Spanish gold coin.", cost: 20 }
    ]
  },
  {
    id: "riddle_r1_cannon",
    slotId: "R1_S8",
    teamId: "crew_8_plunderers",
    title: "The Bronze Dragon",
    text: "Feed me black powder and a sphere of cold lead. Pull back my lanyard, and silence is dead. Smoke fills the gun-deck and wooden hulls tear; my roar shakes the ocean and poisons the air. What weapon am I?",
    expectedAnswer: "cannon",
    targetRound: 1,
    status: "published",
    points: 100,
    answerMatchingRule: { caseSensitive: false, trim: true },
    hints: [
      { text: "A heavy muzzle-loading smoothbore artillery piece mounted on a carriage.", cost: 20 }
    ]
  },
  {
    id: "riddle_r1_rudder",
    slotId: "R1_S9",
    teamId: "crew_9_dreadsails",
    title: "The Silent Sternsman",
    text: "Tucked under the transom beneath ocean swell, I obey the wooden wheel's command very well. Turn me hard port or starboard to steer; without my flat blade no safe port can draw near. What ship's part am I?",
    expectedAnswer: "rudder",
    targetRound: 1,
    status: "published",
    points: 100,
    answerMatchingRule: { caseSensitive: false, trim: true },
    hints: [
      { text: "A flat timber attached vertically to the sternpost used for steering.", cost: 20 }
    ]
  },
  {
    id: "riddle_r1_crowsnest",
    slotId: "R1_S10",
    teamId: "crew_10_searavens",
    title: "The Perch of the Mast",
    text: "High above topsails where cold breezes sting, perched on the mainmast like a bird with no wing. From here sounds the cry when a landfall draws near: 'Land ho!' shouts the sailor with eagle eyes clear. What lookout perch am I?",
    expectedAnswer: "crows nest",
    targetRound: 1,
    status: "published",
    points: 100,
    answerMatchingRule: { caseSensitive: false, trim: true },
    hints: [
      { text: "A barrel or platform fitted high up on the masthead for the lookout.", cost: 20 }
    ]
  }
];

// 1. Update Riddle Bank
let riddleBank = {};
if (fs.existsSync(riddleBankPath)) {
  try {
    riddleBank = JSON.parse(fs.readFileSync(riddleBankPath, 'utf8'));
  } catch (e) {
    riddleBank = {};
  }
}

const now = new Date().toISOString();
round1Riddles.forEach(r => {
  riddleBank[r.id] = {
    id: r.id,
    title: r.title,
    text: r.text,
    expectedAnswer: r.expectedAnswer,
    targetRound: r.targetRound,
    status: r.status,
    points: r.points,
    answerMatchingRule: r.answerMatchingRule,
    hints: r.hints,
    createdAt: now,
    updatedAt: now
  };
});

fs.writeFileSync(riddleBankPath, JSON.stringify(riddleBank, null, 2), 'utf8');
console.log('✓ Riddle Bank updated with 10 Round 1 riddles.');

// 2. Update Tournament Assignments
let assignments = {};
if (fs.existsSync(assignmentsPath)) {
  assignments = JSON.parse(fs.readFileSync(assignmentsPath, 'utf8'));
}

if (!assignments.rounds) assignments.rounds = {};
if (!assignments.rounds["1"]) {
  assignments.rounds["1"] = {
    roundNumber: 1,
    name: "Round 1: Setting Sail",
    startingTeams: 10,
    advancingTeams: 10,
    eliminations: 0,
    slots: []
  };
}

assignments.rounds["1"].slots = round1Riddles.map(r => ({
  slotId: r.slotId,
  riddleId: r.id,
  assignedTeamId: r.teamId,
  claimed: false,
  claimedBy: null,
  claimedAt: null
}));

fs.writeFileSync(assignmentsPath, JSON.stringify(assignments, null, 2), 'utf8');
console.log('✓ Tournament Assignments updated for Round 1 (10 slots assigned).');

// 3. Update teams.json
let teams = [];
if (fs.existsSync(teamsPath)) {
  teams = JSON.parse(fs.readFileSync(teamsPath, 'utf8'));
}

round1Riddles.forEach(r => {
  const team = teams.find(t => t.id === r.teamId);
  if (team) {
    if (!team.allocatedRiddles) team.allocatedRiddles = {};
    team.allocatedRiddles["1"] = r.id;
  }
});

fs.writeFileSync(teamsPath, JSON.stringify(teams, null, 2), 'utf8');
console.log('✓ teams.json updated with allocated Round 1 riddles.');
console.log('⚓ All 10 Round 1 riddles successfully created, published, and bound!');
