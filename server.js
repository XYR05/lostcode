const path = require("path");
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const downloadsDir = path.join(__dirname, 'public', 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, downloadsDir) },
  filename: function (req, file, cb) {
    const safeCat = (req.body.category || 'misc').replace(/[^a-zA-Z0-9]/g, '');
    cb(null, safeCat + '_' + Date.now() + '_' + file.originalname.replace(/[^a-zA-Z0-9.]/g, ''));
  }
});
const upload = multer({ storage: storage });

const bcrypt = require('bcrypt');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());


app.use(express.urlencoded({ extended: false }));

// Set up session middleware
app.use(session({
  store: new FileStore({ path: './sessions', logFn: function(){} }),
  secret: 'someRandomSecretKey',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// Load Config
const configFilePath = path.join(__dirname, 'private', 'config.json');
let ctfConfig = { ctfStartTime: null, unlockedRounds: [1] };
if (fs.existsSync(configFilePath)) {
  ctfConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
} else {
  fs.writeFileSync(configFilePath, JSON.stringify(ctfConfig, null, 2));
}
if (!Array.isArray(ctfConfig.unlockedRounds)) {
  ctfConfig.unlockedRounds = [1];
}

// -----------------------
// Tournament Engine Persistence Helpers
// -----------------------
const riddleBankFilePath = path.join(__dirname, 'private', 'riddle_bank.json');
const tournamentAssignmentsFilePath = path.join(__dirname, 'private', 'tournament_assignments.json');
const roundStateFilePath = path.join(__dirname, 'private', 'round_state.json');
const auditLogFilePath = path.join(__dirname, 'private', 'audit_log.json');

function atomicWriteJsonSync(filePath, data) {
  const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function getRiddleBank() {
  if (!fs.existsSync(riddleBankFilePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(riddleBankFilePath, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveRiddleBank(data) {
  atomicWriteJsonSync(riddleBankFilePath, data);
}

function getTournamentAssignments() {
  if (!fs.existsSync(tournamentAssignmentsFilePath)) return { rounds: {} };
  try {
    return JSON.parse(fs.readFileSync(tournamentAssignmentsFilePath, 'utf8'));
  } catch (e) {
    return { rounds: {} };
  }
}

function saveTournamentAssignments(data) {
  atomicWriteJsonSync(tournamentAssignmentsFilePath, data);
}

function getRoundState() {
  if (!fs.existsSync(roundStateFilePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(roundStateFilePath, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveRoundState(data) {
  atomicWriteJsonSync(roundStateFilePath, data);
}

function logAuditEvent(event) {
  let log = [];
  if (fs.existsSync(auditLogFilePath)) {
    try {
      log = JSON.parse(fs.readFileSync(auditLogFilePath, 'utf8'));
    } catch (e) {
      log = [];
    }
  }
  const entry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...event
  };
  log.unshift(entry);
  atomicWriteJsonSync(auditLogFilePath, log);
  return entry;
}

function findTeamSlotInRound(assignments, roundNum, teamId) {
  const roundKey = String(roundNum);
  const roundData = assignments.rounds && assignments.rounds[roundKey];
  if (!roundData) return null;

  if (roundNum === 1) {
    const slots = roundData.slots || [];
    return slots.find(s => s.assignedTeamId === teamId) || null;
  }

  if (roundNum === 2 || roundNum === 3) {
    const groups = roundData.groups || {};
    for (const gKey of ['A', 'B']) {
      const group = groups[gKey];
      if (group && Array.isArray(group.teams) && group.teams.includes(teamId)) {
        const slots = group.slots || [];
        // 1. Explicit team assignment
        let slot = slots.find(s => s.assignedTeamId === teamId);
        // 2. If no explicit assignedTeamId, find first unclaimed slot team is eligible for
        if (!slot) {
          slot = slots.find(s => Array.isArray(s.eligibleTeams) && s.eligibleTeams.includes(teamId) && !s.claimed);
        }
        // 3. Fallback to any slot team is eligible for (even if claimed)
        if (!slot) {
          slot = slots.find(s => Array.isArray(s.eligibleTeams) && s.eligibleTeams.includes(teamId));
        }
        // 4. Fallback to first slot
        if (!slot) {
          slot = slots[0] || null;
        }
        if (slot) {
          return { ...slot, groupId: gKey };
        }
      }
    }
    return null;
  }

  if (roundNum === 4) {
    const slots = roundData.slots || [];
    return slots[0] || null;
  }

  return null;
}

// -----------------------
// Private Participant Challenge Endpoint (Strict Privacy Enforced)
// -----------------------
app.get('/api/team/challenge', (req, res) => {
  const team = getCurrentTeam(req);
  if (!team) {
    return res.status(401).json({ error: 'Authentication required. Please board your ship.' });
  }

  const requestedRound = parseInt(req.query.round, 10);
  const roundNum = (!isNaN(requestedRound) && requestedRound >= 1 && requestedRound <= 4)
    ? requestedRound
    : (team.currentRound || 1);

  const roundState = getRoundState();
  const currentRoundState = roundState[String(roundNum)] || { status: 'Locked' };
  const roundStatus = currentRoundState.status || 'Locked';

  if (team.eliminated) {
    return res.json({
      success: false,
      round: roundNum,
      roundStatus,
      isEliminated: true,
      eliminatedRound: team.eliminatedRound,
      message: `Your crew was marooned in Round ${team.eliminatedRound || roundNum}. Ye cannot participate in active challenges.`,
      riddle: null
    });
  }

  if (roundStatus !== 'Live') {
    return res.json({
      success: false,
      round: roundNum,
      roundStatus,
      isEliminated: false,
      isQualified: !!(currentRoundState.qualifiers || []).includes(team.id),
      message: `Waters uncharted: Round ${roundNum} is currently ${roundStatus}.`,
      riddle: null
    });
  }

  const assignments = getTournamentAssignments();
  const slot = findTeamSlotInRound(assignments, roundNum, team.id);

  if (!slot || !slot.riddleId) {
    return res.json({
      success: true,
      round: roundNum,
      slotId: slot ? slot.slotId : null,
      roundStatus,
      isEliminated: false,
      isQualified: !!(currentRoundState.qualifiers || []).includes(team.id),
      message: 'The Admiralty has not yet charted a riddle for your crew in this round.',
      riddle: null
    });
  }

  const riddleBank = getRiddleBank();
  const rawRiddle = riddleBank[slot.riddleId];

  if (!rawRiddle || rawRiddle.status !== 'published') {
    return res.json({
      success: true,
      round: roundNum,
      slotId: slot.slotId,
      roundStatus,
      isEliminated: false,
      isQualified: !!(currentRoundState.qualifiers || []).includes(team.id),
      message: 'Riddle configuration is in draft state by the Admiralty.',
      riddle: null
    });
  }

  // Sanitize riddle: NEVER leak expectedAnswer, normalizedAnswer, or matching rules
  const sanitizedRiddle = {
    id: rawRiddle.id,
    title: rawRiddle.title,
    text: rawRiddle.text,
    points: rawRiddle.points || 100,
    hints: Array.isArray(rawRiddle.hints) ? rawRiddle.hints.map(h => ({
      text: (team.hintsUnlocked && team.hintsUnlocked[rawRiddle.id]) ? h.text : 'Hint locked. Consult the Admiralty.',
      cost: h.cost || 0,
      unlocked: !!(team.hintsUnlocked && team.hintsUnlocked[rawRiddle.id])
    })) : []
  };

  return res.json({
    success: true,
    round: roundNum,
    slotId: slot.slotId,
    groupId: slot.groupId || null,
    riddle: sanitizedRiddle,
    roundStatus,
    isClaimed: !!slot.claimed,
    claimedBy: slot.claimedBy || null,
    claimedAt: slot.claimedAt || null,
    isQualified: !!(currentRoundState.qualifiers || []).includes(team.id),
    isEliminated: false
  });
});

// -----------------------
// Authoritative Concurrency-Safe Submission & Slot Claiming Engine
// -----------------------
function checkAnswerMatch(submitted, expected, rule) {
  if (!submitted || !expected) return false;
  let s = String(submitted);
  let e = String(expected);
  const trim = (rule && rule.trim !== undefined) ? rule.trim : true;
  const caseSensitive = (rule && rule.caseSensitive !== undefined) ? rule.caseSensitive : false;
  
  if (trim) {
    s = s.trim();
    e = e.trim();
  }
  if (!caseSensitive) {
    s = s.toLowerCase();
    e = e.toLowerCase();
  }
  return s === e;
}

app.post('/api/team/submit', (req, res) => {
  const team = getCurrentTeam(req);
  if (!team) {
    return res.status(401).json({ error: 'Authentication required. Please board your ship.' });
  }

  const { answer, round } = req.body || {};
  if (!answer || typeof answer !== 'string' || !answer.trim()) {
    return res.status(400).json({ error: 'Flag or answer cannot be empty.' });
  }

  if (team.eliminated) {
    return res.status(403).json({
      error: `Your crew was marooned in Round ${team.eliminatedRound || 'previous'} and cannot submit flags.`
    });
  }

  const requestedRound = parseInt(round, 10);
  const roundNum = (!isNaN(requestedRound) && requestedRound >= 1 && requestedRound <= 4)
    ? requestedRound
    : (team.currentRound || 1);

  const roundState = getRoundState();
  const currentRoundState = roundState[String(roundNum)];
  if (!currentRoundState || currentRoundState.status !== 'Live') {
    return res.status(400).json({
      error: `Round ${roundNum} is not currently Live (Status: ${currentRoundState?.status || 'Locked'}).`
    });
  }

  if (Array.isArray(currentRoundState.qualifiers) && currentRoundState.qualifiers.includes(team.id)) {
    return res.status(400).json({
      error: `Your crew has already secured qualification for Round ${roundNum}!`
    });
  }

  const assignments = getTournamentAssignments();
  const slot = findTeamSlotInRound(assignments, roundNum, team.id);
  if (!slot || !slot.riddleId) {
    return res.status(400).json({ error: 'No active riddle assigned to your crew in this round.' });
  }

  const riddleBank = getRiddleBank();
  const riddle = riddleBank[slot.riddleId];
  if (!riddle || riddle.status !== 'published') {
    return res.status(400).json({ error: 'Riddle is not published for competition.' });
  }

  // Answer matching check
  const isMatch = checkAnswerMatch(answer, riddle.expectedAnswer, riddle.answerMatchingRule);
  if (!isMatch) {
    return res.json({
      success: false,
      message: 'Avast! That flag be incorrect. Check your coordinates and try again.',
      qualified: false
    });
  }

  // Check atomic slot claim
  if (slot.claimed) {
    return res.json({
      success: false,
      message: `Treasure claimed! Another crew claimed this slot seconds before ye.`,
      qualified: false
    });
  }

  // Synchronously claim slot
  const claimTime = new Date().toISOString();
  slot.claimed = true;
  slot.claimedBy = team.id;
  slot.claimedAt = claimTime;

  // Persist into assignments blueprint
  if (roundNum === 1) {
    const target = assignments.rounds['1'].slots.find(s => s.slotId === slot.slotId);
    if (target) { target.claimed = true; target.claimedBy = team.id; target.claimedAt = claimTime; }
  } else if (roundNum === 2 || roundNum === 3) {
    const grp = assignments.rounds[String(roundNum)].groups[slot.groupId];
    if (grp) {
      const target = grp.slots.find(s => s.slotId === slot.slotId);
      if (target) { target.claimed = true; target.claimedBy = team.id; target.claimedAt = claimTime; }
    }
  } else if (roundNum === 4) {
    const target = assignments.rounds['4'].slots.find(s => s.slotId === slot.slotId);
    if (target) { target.claimed = true; target.claimedBy = team.id; target.claimedAt = claimTime; }
  }
  saveTournamentAssignments(assignments);

  // Update round state qualifiers
  if (!Array.isArray(currentRoundState.qualifiers)) {
    currentRoundState.qualifiers = [];
  }
  if (!currentRoundState.qualifiers.includes(team.id)) {
    currentRoundState.qualifiers.push(team.id);
  }

  let isWinner = false;
  if (roundNum === 4) {
    isWinner = true;
    team.isWinner = true;
    team.wonAt = claimTime;
    currentRoundState.winner = team.id;
    currentRoundState.status = 'Completed';
  }
  saveRoundState(roundState);

  // Update team score & solved list
  const pointsAwarded = riddle.points || 100;
  team.score = (team.score || 0) + pointsAwarded;
  if (!Array.isArray(team.scoreHistory)) team.scoreHistory = [];
  const solveTimestamp = Date.now();
  team.scoreHistory.push({
    timestamp: solveTimestamp,
    time: new Date(solveTimestamp).toLocaleTimeString(),
    score: team.score,
    challengeKey: riddle.id,
    round: roundNum
  });
  if (!Array.isArray(team.solvedChallenges)) team.solvedChallenges = [];
  if (!team.solvedChallenges.includes(riddle.id)) {
    team.solvedChallenges.push(riddle.id);
  }
  if (!team.roundSolves) team.roundSolves = {};
  team.roundSolves[String(roundNum)] = slot.slotId;

  fs.writeFileSync(path.join(__dirname, 'teams.json'), JSON.stringify(teams, null, 2));

  // Real-time broadcasts
  io.emit('tournament:slot_claimed', {
    round: roundNum,
    slotId: slot.slotId,
    teamId: team.id,
    teamName: team.teamName,
    claimedAt: claimTime
  });
  io.emit('teamsUpdate');
  io.emit('scoreboardUpdate');

  return res.json({
    success: true,
    message: isWinner
      ? '🏆 VICTORY! Your crew has solved the final riddle and won the Lost Code Championship!'
      : `⚓ Treasure secured! Qualification claimed for Round ${roundNum}!`,
    qualified: true,
    isWinner,
    slotId: slot.slotId,
    pointsAwarded
  });
});

// -----------------------
// Admin Riddle Bank REST API
// -----------------------
app.get('/api/admin/riddle-bank', (req, res) => {
  if (!isAdminSession(req)) return res.status(403).json({ error: 'Forbidden' });
  const riddles = getRiddleBank();
  return res.json({ success: true, riddles });
});

app.post('/api/admin/riddle-bank', (req, res) => {
  if (!isAdminSession(req)) return res.status(403).json({ error: 'Forbidden' });

  const { title, text, expectedAnswer, targetRound, status, answerMatchingRule, points, hints } = req.body || {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Riddle title or reference name is required.' });
  }

  const riddleStatus = (status === 'published') ? 'published' : 'draft';
  if (riddleStatus === 'published' && (!expectedAnswer || !String(expectedAnswer).trim())) {
    return res.status(400).json({ error: 'Published riddles must include an expected answer or flag.' });
  }

  const roundNum = parseInt(targetRound, 10) || 1;
  const id = `riddle_r${roundNum}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const newRiddle = {
    id,
    title: title.trim(),
    text: text ? String(text).trim() : '',
    expectedAnswer: expectedAnswer ? String(expectedAnswer).trim() : '',
    targetRound: roundNum,
    status: riddleStatus,
    answerMatchingRule: {
      caseSensitive: !!(answerMatchingRule && answerMatchingRule.caseSensitive),
      trim: (answerMatchingRule && answerMatchingRule.trim !== undefined) ? !!answerMatchingRule.trim : true
    },
    points: parseInt(points, 10) || 100,
    hints: Array.isArray(hints) ? hints : [],
    createdAt: now,
    updatedAt: now
  };

  const riddleBank = getRiddleBank();
  riddleBank[id] = newRiddle;
  saveRiddleBank(riddleBank);

  // If published, automatically bind to first open slot in target round if round is not live
  if (riddleStatus === 'published') {
    const assignments = getTournamentAssignments();
    const roundData = assignments.rounds && assignments.rounds[String(roundNum)];
    const roundState = getRoundState();
    const isLive = roundState[String(roundNum)] && roundState[String(roundNum)].status === 'Live';
    if (roundData && !isLive) {
      if (roundNum === 1 || roundNum === 4) {
        const openSlot = (roundData.slots || []).find(s => !s.riddleId);
        if (openSlot) {
          openSlot.riddleId = id;
          saveTournamentAssignments(assignments);
        }
      } else {
        for (const g of ['A', 'B']) {
          const grp = roundData.groups && roundData.groups[g];
          const openSlot = grp && (grp.slots || []).find(s => !s.riddleId);
          if (openSlot) {
            openSlot.riddleId = id;
            saveTournamentAssignments(assignments);
            break;
          }
        }
      }
    }
  }

  return res.status(201).json({ success: true, riddle: newRiddle });
});

app.put('/api/admin/riddle-bank/:id', (req, res) => {
  if (!isAdminSession(req)) return res.status(403).json({ error: 'Forbidden' });

  const { id } = req.params;
  const riddleBank = getRiddleBank();
  const existing = riddleBank[id];
  if (!existing) {
    return res.status(404).json({ error: 'Riddle not found in bank.' });
  }

  const { title, text, expectedAnswer, targetRound, status, answerMatchingRule, points, hints } = req.body || {};
  if (title !== undefined && (!title || !String(title).trim())) {
    return res.status(400).json({ error: 'Riddle title cannot be empty.' });
  }

  const updatedStatus = (status !== undefined) ? status : existing.status;
  const checkAnswer = (expectedAnswer !== undefined) ? expectedAnswer : existing.expectedAnswer;
  if (updatedStatus === 'published' && (!checkAnswer || !String(checkAnswer).trim())) {
    return res.status(400).json({ error: 'Published riddles must have an expected answer.' });
  }

  if (title !== undefined) existing.title = String(title).trim();
  if (text !== undefined) existing.text = String(text).trim();
  if (expectedAnswer !== undefined) existing.expectedAnswer = String(expectedAnswer).trim();
  if (targetRound !== undefined) existing.targetRound = parseInt(targetRound, 10) || existing.targetRound;
  if (status !== undefined) existing.status = updatedStatus;
  if (points !== undefined) existing.points = parseInt(points, 10) || existing.points;
  if (hints !== undefined && Array.isArray(hints)) existing.hints = hints;
  if (answerMatchingRule !== undefined) {
    existing.answerMatchingRule = {
      caseSensitive: !!answerMatchingRule.caseSensitive,
      trim: answerMatchingRule.trim !== undefined ? !!answerMatchingRule.trim : true
    };
  }
  existing.updatedAt = new Date().toISOString();

  riddleBank[id] = existing;
  saveRiddleBank(riddleBank);

  return res.json({ success: true, riddle: existing });
});

app.delete('/api/admin/riddle-bank/:id', (req, res) => {
  if (!isAdminSession(req)) return res.status(403).json({ error: 'Forbidden' });

  const { id } = req.params;
  const riddleBank = getRiddleBank();
  if (!riddleBank[id]) {
    return res.status(404).json({ error: 'Riddle not found in bank.' });
  }

  // Check if assigned in a Live round
  const assignments = getTournamentAssignments();
  const roundState = getRoundState();

  for (const rKey of ['1', '2', '3', '4']) {
    if (roundState[rKey] && roundState[rKey].status === 'Live') {
      const rData = assignments.rounds && assignments.rounds[rKey];
      if (rData) {
        if (rKey === '1' || rKey === '4') {
          const inSlots = (rData.slots || []).some(s => s.riddleId === id);
          if (inSlots) {
            return res.status(400).json({ error: `Cannot delete riddle assigned to Live Round ${rKey}.` });
          }
        } else {
          for (const g of ['A', 'B']) {
            const grp = rData.groups && rData.groups[g];
            const inGrp = grp && (grp.slots || []).some(s => s.riddleId === id);
            if (inGrp) {
              return res.status(400).json({ error: `Cannot delete riddle assigned to Live Round ${rKey}.` });
            }
          }
        }
      }
    }
  }

  // Unbind from non-live slots
  for (const rKey of ['1', '2', '3', '4']) {
    const rData = assignments.rounds && assignments.rounds[rKey];
    if (rData) {
      if (rKey === '1' || rKey === '4') {
        (rData.slots || []).forEach(s => { if (s.riddleId === id) s.riddleId = null; });
      } else {
        for (const g of ['A', 'B']) {
          const grp = rData.groups && rData.groups[g];
          if (grp) (grp.slots || []).forEach(s => { if (s.riddleId === id) s.riddleId = null; });
        }
      }
    }
  }
  saveTournamentAssignments(assignments);

  delete riddleBank[id];
  saveRiddleBank(riddleBank);

  return res.json({ success: true, message: 'Riddle removed from bank.' });
});

// -----------------------
// Admin Tournament Assignment Matrix, Validation & Override Engine
// -----------------------
function validateRoundConfiguration(roundNum) {
  const rKey = String(roundNum);
  const assignments = getTournamentAssignments();
  const riddleBank = getRiddleBank();
  const roundData = assignments.rounds && assignments.rounds[rKey];
  const errors = [];
  const warnings = [];

  if (!roundData) {
    return { valid: false, errors: [`Round ${roundNum} blueprint is missing.`] };
  }

  if (roundNum === 1) {
    const slots = roundData.slots || [];
    if (slots.length !== 10) {
      errors.push(`Round 1 requires exactly 10 slots (found ${slots.length}).`);
    }
    const assignedTeams = new Set();
    const assignedRiddles = new Set();

    slots.forEach((s, idx) => {
      if (!s.assignedTeamId) {
        errors.push(`Slot ${s.slotId || idx + 1} has no assigned crew.`);
      } else {
        if (assignedTeams.has(s.assignedTeamId)) {
          errors.push(`Duplicate crew assignment: ${s.assignedTeamId} is assigned more than once.`);
        }
        assignedTeams.add(s.assignedTeamId);
      }

      if (!s.riddleId) {
        errors.push(`Slot ${s.slotId || idx + 1} has no riddle assigned.`);
      } else {
        const riddle = riddleBank[s.riddleId];
        if (!riddle) {
          errors.push(`Slot ${s.slotId} references non-existent riddle ID "${s.riddleId}".`);
        } else if (riddle.status !== 'published') {
          errors.push(`Riddle "${riddle.title || s.riddleId}" in slot ${s.slotId} is in Draft state (must be Published).`);
        } else if (!riddle.expectedAnswer || !riddle.expectedAnswer.trim()) {
          errors.push(`Riddle "${riddle.title || s.riddleId}" has no expected answer.`);
        }

        if (assignedRiddles.has(s.riddleId)) {
          errors.push(`Riddle "${s.riddleId}" is assigned to multiple teams. In Round 1, all 10 teams must receive distinct riddles.`);
        }
        assignedRiddles.add(s.riddleId);
      }
    });

    if (assignedTeams.size < 10) {
      errors.push(`All 10 official crews must be assigned (currently ${assignedTeams.size}/10).`);
    }
  } else if (roundNum === 2) {
    const groups = roundData.groups || {};
    for (const g of ['A', 'B']) {
      const grp = groups[g];
      if (!grp) {
        errors.push(`Group ${g} definition is missing in Round 2.`);
        continue;
      }
      const teams = grp.teams || [];
      if (teams.length !== 5) {
        errors.push(`Round 2 Group ${g} must contain exactly 5 crews (currently ${teams.length}).`);
      }
      const slots = grp.slots || [];
      if (slots.length !== 3) {
        errors.push(`Round 2 Group ${g} must have exactly 3 qualifying slots (found ${slots.length}).`);
      }
      slots.forEach((s, idx) => {
        if (!s.riddleId) {
          errors.push(`Group ${g} Slot ${s.slotId || idx + 1} has no riddle assigned.`);
        } else {
          const riddle = riddleBank[s.riddleId];
          if (!riddle || riddle.status !== 'published' || !riddle.expectedAnswer) {
            errors.push(`Group ${g} Slot ${s.slotId} riddle is missing or in Draft state.`);
          }
        }
      });
    }
  } else if (roundNum === 3) {
    const groups = roundData.groups || {};
    for (const g of ['A', 'B']) {
      const grp = groups[g];
      if (!grp) {
        errors.push(`Group ${g} definition is missing in Round 3.`);
        continue;
      }
      const teams = grp.teams || [];
      if (teams.length !== 3) {
        errors.push(`Round 3 Group ${g} must contain exactly 3 crews (currently ${teams.length}).`);
      }
      const slots = grp.slots || [];
      if (slots.length !== 1) {
        errors.push(`Round 3 Group ${g} must have exactly 1 qualifying slot (found ${slots.length}).`);
      }
      if (slots[0]) {
        const s = slots[0];
        if (!s.riddleId) {
          errors.push(`Group ${g} Slot ${s.slotId} has no riddle assigned.`);
        } else {
          const riddle = riddleBank[s.riddleId];
          if (!riddle || riddle.status !== 'published' || !riddle.expectedAnswer) {
            errors.push(`Group ${g} Slot ${s.slotId} riddle is missing or in Draft state.`);
          }
        }
      }
    }
  } else if (roundNum === 4) {
    const slots = roundData.slots || [];
    if (slots.length !== 1) {
      errors.push(`Round 4 requires exactly 1 qualifying championship slot.`);
    }
    const s = slots[0];
    if (!s || !s.riddleId) {
      errors.push(`Round 4 final championship riddle has not been assigned.`);
    } else {
      const riddle = riddleBank[s.riddleId];
      if (!riddle || riddle.status !== 'published' || !riddle.expectedAnswer) {
        errors.push(`Round 4 final riddle is missing, empty, or in Draft state.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

app.get('/api/admin/assignments', (req, res) => {
  if (!isAdminSession(req)) return res.status(403).json({ error: 'Forbidden' });
  return res.json({
    success: true,
    assignments: getTournamentAssignments(),
    roundState: getRoundState(),
    auditLog: (function() {
      try { return JSON.parse(fs.readFileSync(auditLogFilePath, 'utf8')); } catch(e) { return []; }
    })()
  });
});

app.post('/api/admin/assignments', (req, res) => {
  if (!isAdminSession(req)) return res.status(403).json({ error: 'Forbidden' });

  const { round, assignments: incomingAssignments } = req.body || {};
  const roundNum = parseInt(round, 10);
  if (!roundNum || roundNum < 1 || roundNum > 4) {
    return res.status(400).json({ error: 'Invalid round number.' });
  }

  const roundState = getRoundState();
  if (roundState[String(roundNum)] && roundState[String(roundNum)].status === 'Live') {
    return res.status(400).json({
      error: `Round ${roundNum} is currently Live. Direct edits are frozen. Use administrative override with reason.`
    });
  }

  const currentAssignments = getTournamentAssignments();
  if (incomingAssignments) {
    currentAssignments.rounds[String(roundNum)] = incomingAssignments;
    saveTournamentAssignments(currentAssignments);
  }

  return res.json({
    success: true,
    message: `Round ${roundNum} assignments updated successfully.`,
    assignments: currentAssignments.rounds[String(roundNum)]
  });
});

app.post('/api/admin/assignments/assign-slot', (req, res) => {
  if (!isAdminSession(req)) return res.status(403).json({ error: 'Forbidden' });
  const { round, slotId, riddleId } = req.body || {};
  const roundNum = parseInt(round, 10);
  if (!roundNum || roundNum < 1 || roundNum > 4) {
    return res.status(400).json({ error: 'Invalid round number.' });
  }

  const roundState = getRoundState();
  if (roundState[String(roundNum)] && roundState[String(roundNum)].status === 'Live') {
    return res.status(400).json({
      error: `Round ${roundNum} is currently Live. Direct edits are frozen. Use administrative override with reason.`
    });
  }

  const assignments = getTournamentAssignments();
  const roundData = assignments.rounds && assignments.rounds[String(roundNum)];
  if (!roundData) {
    return res.status(404).json({ error: `Round ${roundNum} blueprint not found.` });
  }

  let slotFound = false;
  if (roundNum === 1 || roundNum === 4) {
    const slot = (roundData.slots || []).find(s => s.slotId === slotId);
    if (slot) {
      slot.riddleId = riddleId ? String(riddleId).trim() : null;
      slotFound = true;
    }
  } else {
    for (const g of ['A', 'B']) {
      const grp = roundData.groups && roundData.groups[g];
      if (grp) {
        const slot = (grp.slots || []).find(s => s.slotId === slotId);
        if (slot) {
          slot.riddleId = riddleId ? String(riddleId).trim() : null;
          slotFound = true;
          break;
        }
      }
    }
  }

  if (!slotFound) {
    return res.status(404).json({ error: `Slot ${slotId} not found in Round ${roundNum}.` });
  }

  saveTournamentAssignments(assignments);
  return res.json({
    success: true,
    message: `Slot ${slotId} updated.`,
    slotId,
    riddleId: riddleId || null
  });
});

app.post('/api/admin/rounds/validate', (req, res) => {
  if (!isAdminSession(req)) return res.status(403).json({ error: 'Forbidden' });
  const roundNum = parseInt(req.body.round, 10) || 1;
  const result = validateRoundConfiguration(roundNum);
  return res.json({
    success: true,
    round: roundNum,
    valid: result.valid,
    errors: result.errors,
    warnings: result.warnings
  });
});

app.post('/api/admin/rounds/activate', (req, res) => {
  if (!isAdminSession(req)) return res.status(403).json({ error: 'Forbidden' });
  const roundNum = parseInt(req.body.round, 10) || 1;
  const rKey = String(roundNum);

  const result = validateRoundConfiguration(roundNum);
  if (!result.valid) {
    return res.status(400).json({
      error: `Pre-launch checklist failed for Round ${roundNum}. Resolve all issues before activation.`,
      errors: result.errors
    });
  }

  const roundState = getRoundState();
  if (!roundState[rKey]) roundState[rKey] = {};
  roundState[rKey].status = 'Live';
  roundState[rKey].startedAt = new Date().toISOString();
  saveRoundState(roundState);

  logAuditEvent({
    action: 'ROUND_ACTIVATION',
    admin: req.session.teamName || 'admin',
    reason: `Round ${roundNum} successfully activated to Live state`,
    details: { round: roundNum }
  });

  io.emit('tournament:round_state', { round: roundNum, status: 'Live' });

  return res.json({
    success: true,
    message: `Round ${roundNum} is now Live!`,
    roundState: roundState[rKey]
  });
});

app.post('/api/admin/assignments/override', (req, res) => {
  if (!isAdminSession(req)) return res.status(403).json({ error: 'Forbidden' });
  const { round, slotId, newRiddleId, newTeamId, reason } = req.body || {};

  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ error: 'A valid reason is required for administrative overrides.' });
  }

  const roundNum = parseInt(round, 10);
  const rKey = String(roundNum);
  const assignments = getTournamentAssignments();
  const roundData = assignments.rounds && assignments.rounds[rKey];

  if (!roundData) {
    return res.status(404).json({ error: `Round ${roundNum} blueprint not found.` });
  }

  let slotFound = false;
  let previousState = null;

  if (roundNum === 1 || roundNum === 4) {
    const slot = (roundData.slots || []).find(s => s.slotId === slotId);
    if (slot) {
      previousState = { ...slot };
      if (newRiddleId !== undefined) slot.riddleId = newRiddleId;
      if (newTeamId !== undefined) slot.assignedTeamId = newTeamId;
      slotFound = true;
    }
  } else {
    for (const g of ['A', 'B']) {
      const grp = roundData.groups && roundData.groups[g];
      if (grp) {
        const slot = (grp.slots || []).find(s => s.slotId === slotId);
        if (slot) {
          previousState = { ...slot };
          if (newRiddleId !== undefined) slot.riddleId = newRiddleId;
          if (newTeamId !== undefined) slot.assignedTeamId = newTeamId;
          slotFound = true;
          break;
        }
      }
    }
  }

  if (!slotFound) {
    return res.status(404).json({ error: `Slot ${slotId} not found in Round ${roundNum}.` });
  }

  saveTournamentAssignments(assignments);

  logAuditEvent({
    action: 'ASSIGNMENT_OVERRIDE',
    admin: req.session.teamName || 'admin',
    reason: reason.trim(),
    details: {
      round: roundNum,
      slotId,
      previousState,
      newRiddleId,
      newTeamId
    }
  });

  return res.json({
    success: true,
    message: `Assignment override applied to ${slotId} and recorded in audit log.`
  });
});






app.get('/api/config', (req, res) => {
  res.json({
    ctfStartTime: ctfConfig.ctfStartTime,
    unlockedRounds: ctfConfig.unlockedRounds || [1],
    fullscreenEnforced: ctfConfig.fullscreenEnforced !== false
  });
});

// shortcut: stored in config.json, migrate to DB if multi-instance
app.post('/api/admin/toggle-proctoring', (req, res) => {
  if (!isAdminSession(req)) return res.status(403).json({ error: 'Forbidden' });
  const { enabled } = req.body || {};
  ctfConfig.fullscreenEnforced = enabled !== undefined ? !!enabled : !(ctfConfig.fullscreenEnforced !== false);
  try {
    fs.writeFileSync(configFilePath, JSON.stringify(ctfConfig, null, 2));
  } catch (e) {
    console.error('Failed writing config:', e);
  }
  io.emit('configUpdate', ctfConfig);
  res.json({ success: true, fullscreenEnforced: ctfConfig.fullscreenEnforced });
});

app.post('/api/admin/rounds/toggle', (req, res) => {
  if (!isAdminSession(req)) return res.status(403).json({ error: 'Forbidden' });
  const { round, unlocked } = req.body;
  const roundNum = parseInt(round, 10);
  if (!roundNum || roundNum < 1 || roundNum > 4) {
    return res.status(400).json({ error: 'Invalid round number (1-4).' });
  }

  ctfConfig.unlockedRounds = Array.isArray(ctfConfig.unlockedRounds) ? ctfConfig.unlockedRounds : [1];

  if (unlocked) {
    if (!ctfConfig.unlockedRounds.includes(roundNum)) {
      ctfConfig.unlockedRounds.push(roundNum);
      ctfConfig.unlockedRounds.sort((a, b) => a - b);
    }
  } else {
    ctfConfig.unlockedRounds = ctfConfig.unlockedRounds.filter(r => r !== roundNum);
  }

  fs.writeFileSync(configFilePath, JSON.stringify(ctfConfig, null, 2));
  io.emit('configUpdate', ctfConfig);
  io.emit('roundsUpdate', ctfConfig.unlockedRounds);
  io.emit('challengesUpdate');

  res.json({
    message: `Round ${roundNum} ${unlocked ? 'unlocked' : 'locked'} successfully!`,
    unlockedRounds: ctfConfig.unlockedRounds
  });
});

app.post('/api/admin/start', (req, res) => {
  if (!isAdminSession(req)) return res.status(403).json({ error: 'Forbidden' });
  
  ctfConfig.ctfStartTime = Date.now();
  fs.writeFileSync(configFilePath, JSON.stringify(ctfConfig, null, 2));
  io.emit('configUpdate', ctfConfig);
  
  res.json({ message: 'Treasure Hunt Started!', config: ctfConfig });
});

app.post('/api/admin/stop', (req, res) => {
  if (!isAdminSession(req)) return res.status(403).json({ error: 'Forbidden' });
  
  ctfConfig.ctfStartTime = null;
  fs.writeFileSync(configFilePath, JSON.stringify(ctfConfig, null, 2));
  io.emit('configUpdate', ctfConfig);
  
  res.json({ message: 'Treasure Hunt Stopped!', config: ctfConfig });
});

app.post('/api/admin/wipe', (req, res) => {
  if (!isAdminSession(req)) return res.status(403).json({ error: 'Forbidden' });
  
  teams.forEach(team => {
      team.scoreHistory = [];
      team.score = 0;
      team.solvedChallenges = [];
      team.hintsUnlocked = {};
      team.currentRound = 1;
      team.unlockedRounds = [1];
      team.eliminated = false;
      team.eliminatedRound = null;
      team.eliminatedReason = null;
      team.roundSolves = {};
      team.isWinner = false;
      delete team.wonAt;
  });
  users.forEach(user => {
      user.solvedChallenges = [];
  });
  fs.writeFileSync(path.join(__dirname, 'teams.json'), JSON.stringify(teams, null, 2));
  fs.writeFileSync(path.join(__dirname, 'users.json'), JSON.stringify(users, null, 2));
  io.emit('teamsUpdate');
  io.emit('tournamentUpdate');
  
  res.json({ message: 'All scores, solves, and tournament rounds have been securely reset to Round 1.' });
});



// -----------------------
// Validation Utility
// -----------------------
const validateNoTags = (str, fieldName) => {
  if (typeof str === 'string' && /[<>]/.test(str)) {
    return `${fieldName} cannot contain '<' or '>' characters.`;
  }
  return null;
};

// -----------------------
// Tournament Engine Utilities: Riddle Allocations & Group Binding
// -----------------------
function getRiddlesByRound() {
  const bank = getRiddleBank();
  const grouped = { 1: [], 2: [], 3: [], 4: [] };
  Object.keys(bank).forEach(k => {
    const item = bank[k];
    const r = item.targetRound || 1;
    if (grouped[r]) {
      grouped[r].push({
        key: k,
        riddleNumber: item.riddleNumber || (grouped[r].length + 1),
        subtitle: item.title || k,
        points: item.points || 100,
        text: item.text || ''
      });
    }
  });

  if (grouped[1].length === 0) {
    const flagsFilePath = path.join(__dirname, 'private', 'flags.json');
    if (fs.existsSync(flagsFilePath)) {
      try {
        const flagsData = JSON.parse(fs.readFileSync(flagsFilePath, 'utf8'));
        Object.keys(flagsData).forEach(k => {
          const r = flagsData[k].round || 1;
          if (grouped[r]) {
            grouped[r].push({
              key: k,
              riddleNumber: flagsData[k].riddleNumber || 1,
              subtitle: flagsData[k].subtitle || k,
              points: flagsData[k].points || 500,
              text: flagsData[k].text || ''
            });
          }
        });
      } catch (e) {}
    }
  }

  for (const r in grouped) {
    grouped[r].sort((a, b) => a.riddleNumber - b.riddleNumber);
  }
  return grouped;
}

function allocateRiddlesForTeamIndex(teamIndex) {
  const riddles = getRiddlesByRound();

  // Group assignment: 5 teams in Group A, 5 in Group B
  // Alternate: 0, 2, 4, 6, 8 => Group A; 1, 3, 5, 7, 9 => Group B
  const groupRound2 = (teamIndex % 2 === 0) ? 'A' : 'B';

  // Round 1 (10 riddles): exactly 1 unique riddle per team
  const r1List = riddles[1] || [];
  const r1Key = r1List.length > 0 ? r1List[teamIndex % r1List.length].key : null;

  // Round 2 (6 riddles): deterministic distribution across the 10 teams
  const r2List = riddles[2] || [];
  const r2Key = r2List.length > 0 ? r2List[teamIndex % r2List.length].key : null;

  // Round 3 (2 riddles): Group A gets Riddle 1, Group B gets Riddle 2
  const r3List = riddles[3] || [];
  let r3Key = null;
  if (r3List.length > 0) {
    r3Key = (groupRound2 === 'A') ? r3List[0].key : (r3List[1] ? r3List[1].key : r3List[0].key);
  }

  // Round 4 (1 riddle): 1v1 Final Showdown
  const r4List = riddles[4] || [];
  const r4Key = r4List.length > 0 ? r4List[0].key : null;

  return {
    allocatedRiddles: {
      "1": r1Key,
      "2": r2Key,
      "3": r3Key,
      "4": r4Key
    },
    groupRound2: groupRound2,
    groupRound3: groupRound2
  };
}

function ensureTeamTournamentAttributes(team, index) {
  if (isAdminTeam(team)) return false;
  let changed = false;

  if (!team.currentRound) {
    team.currentRound = 1;
    changed = true;
  }
  if (!Array.isArray(team.unlockedRounds) || team.unlockedRounds.length === 0) {
    team.unlockedRounds = [1];
    changed = true;
  }
  if (!team.allocatedRiddles || typeof team.allocatedRiddles !== 'object') {
    const alloc = allocateRiddlesForTeamIndex(index);
    team.allocatedRiddles = alloc.allocatedRiddles;
    team.groupRound2 = alloc.groupRound2;
    team.groupRound3 = alloc.groupRound3;
    changed = true;
  }
  if (!team.groupRound2) {
    team.groupRound2 = (index % 2 === 0) ? 'A' : 'B';
    team.groupRound3 = team.groupRound2;
    changed = true;
  }
  if (!team.roundSolves || typeof team.roundSolves !== 'object') {
    team.roundSolves = {};
    changed = true;
  }
  if (team.eliminated === undefined) {
    team.eliminated = false;
    team.eliminatedRound = null;
    team.eliminatedReason = null;
    changed = true;
  }

  return changed;
}

// -----------------------
// Load Teams
// -----------------------
const teamsFilePath = path.join(__dirname, 'teams.json');
let teams = [];
try {
  if (fs.existsSync(teamsFilePath)) {
    const teamsData = fs.readFileSync(teamsFilePath, 'utf8');
    teams = JSON.parse(teamsData);
  }
} catch (err) {
  console.error("Error reading teams.json:", err);
}

// Ensure existing teams have tournament progression attributes
let teamsUpdatedOnBoot = false;
let nonAdminBootIndex = 0;
teams.forEach(team => {
  if (!isAdminTeam(team)) {
    if (ensureTeamTournamentAttributes(team, nonAdminBootIndex)) {
      teamsUpdatedOnBoot = true;
    }
    nonAdminBootIndex++;
  }
});
if (teamsUpdatedOnBoot) {
  try {
    fs.writeFileSync(teamsFilePath, JSON.stringify(teams, null, 2));
  } catch (e) {
    console.error("Error saving updated teams on boot:", e);
  }
}

// -----------------------
// Load Users (maintained as shadow file for backward compatibility)
// -----------------------
const usersFilePath = path.join(__dirname, 'users.json');
let users = [];
try {
  if (fs.existsSync(usersFilePath)) {
    const usersData = fs.readFileSync(usersFilePath, 'utf8');
    users = JSON.parse(usersData);
  }
} catch (err) {
  console.error("Error reading users.json:", err);
}

// Helper: Identify admin teams to exclude from public rankings and solve counters
function isAdminTeam(team) {
  if (!team) return false;
  const name = (team.teamName || '').toLowerCase().trim();
  return team.id === 'team_admin_1' || name === 'admin@lostcode' || name === 'lostcode' || name === 'admin' || name.includes('admin');
}

function getCurrentTeam(req) {
  if (!req.session) return null;
  if (req.session.teamId) {
    return teams.find(t => t.id === req.session.teamId) || null;
  }
  if (req.session.userId) {
    const u = users.find(user => user.id === req.session.userId);
    if (u && u.teamId) return teams.find(t => t.id === u.teamId) || null;
    return teams.find(t => t.id === req.session.userId) || null;
  }
  return null;
}

function isAdminSession(req) {
  if (!req.session) return false;
  if (req.session.isAdmin) return true;
  if (req.session.userId === 'user_admin_1') return true;
  const team = getCurrentTeam(req);
  return team ? isAdminTeam(team) : false;
}

// -----------------------
// Crew Registration & Login
// -----------------------

app.post('/api/register', (req, res) => {
  return res.status(403).json({ error: 'Public registration is closed. Contact the Admiralty to receive your official crew credentials.' });
});

app.post('/api/login', (req, res) => {
  const { teamName, identifier, email, username, password } = req.body;
  const loginKey = (teamName || identifier || email || username || '').trim();
  if (!loginKey || !password) {
    return res.status(400).json({ error: 'Crew / Team name and password required.' });
  }

  let matchedTeam = teams.find(t => t.teamName.trim().toLowerCase() === loginKey.toLowerCase());

  if (!matchedTeam && (
    loginKey.toLowerCase() === 'lostcode' ||
    loginKey.toLowerCase() === 'admin@lostcode' ||
    loginKey.toLowerCase() === 'admin' ||
    loginKey.toLowerCase() === 'admin@ctf.com'
  )) {
    matchedTeam = teams.find(t => t.id === 'team_admin_1' || isAdminTeam(t));
  }

  if (matchedTeam) {
    const teamPwMatches = matchedTeam.password && bcrypt.compareSync(password, matchedTeam.password);
    if (teamPwMatches) {
      req.session.teamId = matchedTeam.id;
      req.session.teamName = matchedTeam.teamName;
      req.session.isAdmin = (matchedTeam.id === 'team_admin_1' || isAdminTeam(matchedTeam));
      req.session.userId = matchedTeam.id;
      return res.json({ message: 'Login successful!', teamName: matchedTeam.teamName });
    }
  }

  return res.status(400).json({ error: 'Invalid crew name or password.' });
});

app.get('/api/challenges', (req, res) => {
  const flagsFilePath = path.join(__dirname, 'private', 'flags.json');
  if (!fs.existsSync(flagsFilePath)) return res.json({});
  const flagsData = JSON.parse(fs.readFileSync(flagsFilePath, 'utf8'));

  const userTeam = getCurrentTeam(req);
  const isAdminUser = isAdminSession(req);
  const globalUnlockedRounds = Array.isArray(ctfConfig.unlockedRounds) ? ctfConfig.unlockedRounds : [1];
  const teamUnlockedRounds = (userTeam && Array.isArray(userTeam.unlockedRounds)) ? userTeam.unlockedRounds : globalUnlockedRounds;

  const hintsUnlockedCount = (userTeam && userTeam.hintsUnlocked) ? Object.keys(userTeam.hintsUnlocked).length : 0;
  const nextHintCost = (hintsUnlockedCount + 1) * 5;

  const safeData = {};
  for (const key in flagsData) {
    let solvesCount = 0;
    teams.forEach(team => {
      if (isAdminTeam(team)) return;
      const solvedList = Array.isArray(team.solvedChallenges)
        ? team.solvedChallenges
        : (team.solvedChallenges ? Object.keys(team.solvedChallenges) : []);
      if (solvedList.includes(key)) solvesCount++;
    });

    const roundNum = flagsData[key].round || 1;
    const isRoundUnlocked = isAdminUser || teamUnlockedRounds.includes(roundNum);
    const isAllocatedToTeam = Boolean(isAdminUser || (userTeam && userTeam.allocatedRiddles && userTeam.allocatedRiddles[roundNum] === key));

    const hasHint = Boolean(flagsData[key].hint && flagsData[key].hint.trim());
    const isHintUnlocked = Boolean(userTeam && userTeam.hintsUnlocked && userTeam.hintsUnlocked[key]);

    safeData[key] = { 
      text: isRoundUnlocked ? flagsData[key].text : "These waters remain sealed by the Admiralty. Advance your crew to unlock this riddle.", 
      subtitle: flagsData[key].subtitle || "",
      points: flagsData[key].points || 500,
      difficulty: flagsData[key].difficulty || "EASY",
      round: roundNum,
      roundName: flagsData[key].roundName || "Round 1: Setting Sail",
      riddleNumber: flagsData[key].riddleNumber || 1,
      category: flagsData[key].category || "Miscellaneous",
      hint: isRoundUnlocked ? (isHintUnlocked ? (flagsData[key].hint || "") : null) : null,
      adminHint: isAdminUser ? (flagsData[key].hint || "") : null,
      hasHint: isRoundUnlocked ? hasHint : false,
      hintUnlocked: isRoundUnlocked ? isHintUnlocked : false,
      resource: isRoundUnlocked ? flagsData[key].resource : null,
      originalResourceName: isRoundUnlocked ? flagsData[key].originalResourceName : null,
      solves: solvesCount,
      nextHintCost: nextHintCost,
      unlocked: isRoundUnlocked,
      allocatedToTeam: isAllocatedToTeam
    };
  }
  res.json(safeData);
});

const isAdmin = (req, res, next) => {
  if (!isAdminSession(req)) return res.status(403).json({ error: 'Forbidden' });
  next();
};

app.post('/api/admin/challenges', isAdmin, upload.single('resource'), (req, res) => {
  
  const { category, text, flag, points, removeResource, difficulty, hint, subtitle, round } = req.body;
  
  const flagsFilePath = path.join(__dirname, 'private', 'flags.json');
  let flagsData = {};
  if (fs.existsSync(flagsFilePath)) {
    flagsData = JSON.parse(fs.readFileSync(flagsFilePath, 'utf8'));
  }
  
  const roundNum = parseInt(round, 10) || (flagsData[category] && flagsData[category].round) || 1;
  if (!category || !flag || !points) {
    return res.status(400).json({ error: 'All required fields (Category, Flag, Points) must be provided.' });
  }
  
  let oldPoints = null;
  if (!flagsData[category]) {
    flagsData[category] = {};
  } else {
    oldPoints = flagsData[category].points !== undefined ? Number(flagsData[category].points) : 500;
  }
  
  const newPoints = parseInt(points) || 500;
  flagsData[category].text = text || "";
  flagsData[category].subtitle = subtitle || flagsData[category].subtitle || "";
  flagsData[category].points = newPoints;
  flagsData[category].difficulty = difficulty || "EASY";
  flagsData[category].hint = hint || "";
  flagsData[category].round = roundNum;
  const roundNames = {
    1: 'Round 1: Setting Sail',
    2: 'Round 2: High Seas',
    3: "Round 3: Dead Man's Creek",
    4: 'Round 4: Treasure Island'
  };
  flagsData[category].roundName = roundNames[roundNum] || `Round ${roundNum}`;
  if (!flagsData[category].riddleNumber) {
    const roundCount = Object.values(flagsData).filter(c => c.round === roundNum && c !== flagsData[category]).length;
    flagsData[category].riddleNumber = roundCount + 1;
  }
  if (!flagsData[category].category) {
    flagsData[category].category = category;
  }
  
  if (req.file) {
    flagsData[category].resource = req.file.filename;
    flagsData[category].originalResourceName = req.file.originalname;
  }
  if (removeResource === 'true') {
    delete flagsData[category].resource;
    delete flagsData[category].originalResourceName;
  }
  
  if (flag && flag !== '********') {
    flagsData[category].hash = bcrypt.hashSync(flag, 10);
  } else if (!flagsData[category].hash) {
    return res.status(400).json({ error: 'Valid flag required for new challenges.' });
  }
  
  fs.writeFileSync(flagsFilePath, JSON.stringify(flagsData, null, 2));
  
  // Retroactively adjust scores if points changed
  if (oldPoints !== null && oldPoints !== newPoints) {
    const pointDiff = newPoints - oldPoints;
    let teamsChanged = false;
    
    teams.forEach(team => {
      const solvedList = Array.isArray(team.solvedChallenges) ? team.solvedChallenges : Object.keys(team.solvedChallenges || {});
      const teamSolvedIt = solvedList.includes(category);
      
      if (teamSolvedIt) {
        team.score += pointDiff;
        if (!team.scoreHistory) {
          team.scoreHistory = [{ timestamp: Date.now() - 1000, score: team.score - pointDiff }];
        }
        team.scoreHistory.push({ timestamp: Date.now(), score: team.score });
        teamsChanged = true;
      }
    });
    
    if (teamsChanged) {
      fs.writeFileSync(path.join(__dirname, 'teams.json'), JSON.stringify(teams, null, 2));
      io.emit('teamsUpdate');
    }
  }

  io.emit('challengesUpdate');
  res.json({ message: 'Challenge updated successfully.' });
});

app.post('/api/admin/challenges/delete', isAdmin, (req, res) => {
  const { category } = req.body;
  if (!category) return res.status(400).json({ error: 'Category required.' });
  
  const flagsFilePath = path.join(__dirname, 'private', 'flags.json');
  if (fs.existsSync(flagsFilePath)) {
    let flagsData = JSON.parse(fs.readFileSync(flagsFilePath, 'utf8'));
    const challengeObj = flagsData[category];
    
    if (challengeObj) {
      const pointsToDeduct = challengeObj.points !== undefined ? Number(challengeObj.points) : 500;
      
      // Remove points from teams that solved it
      let teamsChanged = false;
      teams.forEach(team => {
        let teamSolvedIt = false;
        if (Array.isArray(team.solvedChallenges) && team.solvedChallenges.includes(category)) {
          team.solvedChallenges = team.solvedChallenges.filter(c => c !== category);
          teamSolvedIt = true;
        } else if (team.solvedChallenges && team.solvedChallenges[category]) {
          delete team.solvedChallenges[category];
          teamSolvedIt = true;
        }
        
        if (teamSolvedIt) {
          team.score -= pointsToDeduct;
          if (!team.scoreHistory) {
            team.scoreHistory = [{ timestamp: Date.now() - 1000, score: team.score + pointsToDeduct }];
          }
          team.scoreHistory.push({ timestamp: Date.now(), score: team.score });
          teamsChanged = true;
        }
      });
      
      // Remove challenge from all users' solved lists
      let usersChanged = false;
      users.forEach(user => {
        if (Array.isArray(user.solvedChallenges) && user.solvedChallenges.includes(category)) {
          user.solvedChallenges = user.solvedChallenges.filter(c => c !== category);
          usersChanged = true;
        }
      });
      
      // Save data
      delete flagsData[category];
      fs.writeFileSync(flagsFilePath, JSON.stringify(flagsData, null, 2));
      
      if (usersChanged || teamsChanged) {
        fs.writeFileSync(path.join(__dirname, 'users.json'), JSON.stringify(users, null, 2));
        fs.writeFileSync(path.join(__dirname, 'teams.json'), JSON.stringify(teams, null, 2));
        io.emit('teamsUpdate');
      }
    }
  }
  io.emit('challengesUpdate');
  res.json({ message: 'Challenge deleted successfully.' });
});

// -----------------------
// Team Endpoints
// -----------------------

app.get('/api/teams', (req, res) => {
  const safeTeams = teams.filter(t => !isAdminTeam(t)).map(team => {
    const solvedChallenges = Array.isArray(team.solvedChallenges) 
      ? team.solvedChallenges 
      : (team.solvedChallenges ? Object.keys(team.solvedChallenges) : []);
    return {
      id: team.id,
      teamName: team.teamName,
      tagline: team.tagline || '',
      score: typeof team.score === 'number' ? team.score : 0,
      solvedChallenges,
      scoreHistory: team.scoreHistory || [],
      disqualified: Boolean(team.disqualified),
      violations: team.violations || 0,
      currentRound: team.currentRound || 1,
      unlockedRounds: team.unlockedRounds || [1],
      groupRound2: team.groupRound2 || 'A',
      groupRound3: team.groupRound3 || 'A',
      eliminated: Boolean(team.eliminated),
      eliminatedRound: team.eliminatedRound || null,
      eliminatedReason: team.eliminatedReason || null,
      isWinner: Boolean(team.isWinner),
      roundSolves: team.roundSolves || {}
    };
  });
  res.json(safeTeams);
});

app.get('/api/myteam', (req, res) => {
  const myTeam = getCurrentTeam(req);
  if (!myTeam) return res.status(403).json({ error: 'Not logged in' });

  const solvedChallenges = Array.isArray(myTeam.solvedChallenges) 
    ? myTeam.solvedChallenges 
    : (myTeam.solvedChallenges ? Object.keys(myTeam.solvedChallenges) : []);

  if (typeof myTeam.score !== 'number') myTeam.score = 0;
  if (!myTeam.hintsUnlocked || typeof myTeam.hintsUnlocked !== 'object') {
    myTeam.hintsUnlocked = {};
  }
  const hintsUnlockedCount = Object.keys(myTeam.hintsUnlocked).length;
  const nextHintCost = (hintsUnlockedCount + 1) * 5;

  res.json({
    team: {
      id: myTeam.id,
      teamName: myTeam.teamName,
      tagline: myTeam.tagline || '',
      score: myTeam.score,
      solvedChallenges,
      hintsUnlocked: myTeam.hintsUnlocked,
      hintsUnlockedCount,
      nextHintCost,
      disqualified: Boolean(myTeam.disqualified),
      violations: myTeam.violations || 0,
      currentRound: myTeam.currentRound || 1,
      unlockedRounds: myTeam.unlockedRounds || [1],
      allocatedRiddles: myTeam.allocatedRiddles || {},
      groupRound2: myTeam.groupRound2 || 'A',
      groupRound3: myTeam.groupRound3 || 'A',
      eliminated: Boolean(myTeam.eliminated),
      eliminatedRound: myTeam.eliminatedRound || null,
      eliminatedReason: myTeam.eliminatedReason || null,
      roundSolves: myTeam.roundSolves || {},
      isWinner: Boolean(myTeam.isWinner)
    }
  });
});

app.get('/api/profile', (req, res) => {
  const myTeam = getCurrentTeam(req);
  if (!myTeam) return res.status(403).json({ error: 'Not logged in' });
  res.json({
    teamName: myTeam.teamName,
    isAdmin: isAdminSession(req),
    disqualified: Boolean(myTeam.disqualified),
    violations: myTeam.violations || 0,
    eliminated: Boolean(myTeam.eliminated),
    currentRound: myTeam.currentRound || 1
  });
});

// Tournament Status API
app.get('/api/tournament/status', (req, res) => {
  const activeTeams = teams.filter(t => !isAdminTeam(t)).map(t => ({
    id: t.id,
    teamName: t.teamName,
    score: t.score || 0,
    currentRound: t.currentRound || 1,
    unlockedRounds: t.unlockedRounds || [1],
    allocatedRiddles: t.allocatedRiddles || {},
    groupRound2: t.groupRound2 || 'A',
    groupRound3: t.groupRound3 || 'A',
    eliminated: Boolean(t.eliminated),
    eliminatedRound: t.eliminatedRound || null,
    eliminatedReason: t.eliminatedReason || null,
    roundSolves: t.roundSolves || {},
    isWinner: Boolean(t.isWinner)
  }));

  res.json({
    teams: activeTeams,
    winner: activeTeams.find(t => t.isWinner) || null
  });
});

// Admin Endpoint: Provision / Seed 10 Tournament Pirate Crews
app.post('/api/admin/tournament/seed-teams', isAdmin, (req, res) => {
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

  const crewTaglines = {
    "BUCCANEERS": "Ruthless pirate adventurers",
    "CUTTHROATS": "Fearless and dangerous",
    "CORSAIRS": "Elite sea raiders",
    "KRAKENS": "Mythical forces of the deep",
    "SCALLYWAGS": "Mischievous pirates",
    "PRIVATEERS": "Strategic naval raiders",
    "BLACKFLAGS": "Rogue pirates of the seas",
    "PLUNDERERS": "Seekers of hidden treasure",
    "DREADSAILS": "Ghostly ships of the ocean",
    "SEARAVENS": "Dark and cunning voyagers"
  };

  // Preserve admin team
  const adminTeam = teams.find(t => isAdminTeam(t)) || {
    id: "team_admin_1",
    teamName: "admin@lostcode",
    password: bcrypt.hashSync("foundcode", 10),
    score: 0,
    solvedChallenges: [],
    hintsUnlocked: {},
    scoreHistory: []
  };

  const adminUser = users.find(u => u.id === 'user_admin_1') || {
    id: "user_admin_1",
    username: "admin@lostcode",
    email: "admin@lostcode",
    password: adminTeam.password,
    teamId: "team_admin_1",
    solvedChallenges: []
  };

  const newTeams = [adminTeam];
  const newUsers = [adminUser];

  crewNames.forEach((name, i) => {
    const teamId = `crew_${i + 1}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const alloc = allocateRiddlesForTeamIndex(i);
    const defaultPw = bcrypt.hashSync("ahoy123", 10);

    const team = {
      id: teamId,
      teamName: name,
      tagline: crewTaglines[name] || "Pirate Crew",
      password: defaultPw,
      score: 0,
      solvedChallenges: [],
      hintsUnlocked: {},
      scoreHistory: [{ timestamp: Date.now(), score: 0 }],
      currentRound: 1,
      unlockedRounds: [1],
      allocatedRiddles: alloc.allocatedRiddles,
      groupRound2: alloc.groupRound2,
      groupRound3: alloc.groupRound3,
      eliminated: false,
      eliminatedRound: null,
      eliminatedReason: null,
      roundSolves: {}
    };

    const user = {
      id: teamId,
      username: name,
      email: `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@lostcode`,
      password: defaultPw,
      teamId: teamId,
      solvedChallenges: []
    };

    newTeams.push(team);
    newUsers.push(user);
  });

  teams = newTeams;
  users = newUsers;

  fs.writeFileSync(teamsFilePath, JSON.stringify(teams, null, 2));
  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));

  io.emit('teamsUpdate');
  io.emit('tournamentUpdate');

  res.json({
    message: 'Successfully seeded 10 pirate crews with pre-bound tournament riddle chains (Password: ahoy123)!',
    crews: teams.filter(t => !isAdminTeam(t)).map(t => ({
      name: t.teamName,
      group: t.groupRound2,
      round1Riddle: t.allocatedRiddles["1"]
    }))
  });
});

// Single-Submitter Flag Submission (Team-level)
app.post('/api/challenge/flag', (req, res) => {
  const isAdminUser = isAdminSession(req);
  if (!ctfConfig.ctfStartTime && !isAdminUser) return res.status(403).json({ error: 'The Treasure Hunt has not started yet!' });
  const team = getCurrentTeam(req);
  if (!team) return res.status(403).json({ error: 'Not logged in' });
  if (team.disqualified) {
    return res.status(403).json({ error: 'Your crew has been disqualified from the tournament for proctoring violations.' });
  }

  // Elimination check
  if (!isAdminUser && team.eliminated) {
    return res.status(403).json({
      error: team.eliminatedReason || "Arr! Your crew has Walked the Plank and cannot submit further flags."
    });
  }
  
  const { category, flag } = req.body;
  if (!category || !flag) return res.status(400).json({ error: 'Category and flag required.' });
  const flagsFilePath = path.join(__dirname, 'private', 'flags.json');
  if (!fs.existsSync(flagsFilePath)) return res.status(500).json({ error: 'Flags file not found.' });
  const flagsData = JSON.parse(fs.readFileSync(flagsFilePath, 'utf8'));
  const challengeObj = flagsData[category];
  if (!challengeObj) return res.status(404).json({ error: 'Challenge not found for this category.' });

  const challengeRound = challengeObj.round || 1;
  const unlockedRounds = (team.unlockedRounds && Array.isArray(team.unlockedRounds)) ? team.unlockedRounds : (ctfConfig.unlockedRounds || [1]);
  if (!isAdminUser && !unlockedRounds.includes(challengeRound)) {
    return res.status(403).json({ error: "These waters remain locked by the Admiralty! Solve your active round to chart this course." });
  }

  if (!Array.isArray(team.solvedChallenges)) {
    team.solvedChallenges = team.solvedChallenges ? Object.keys(team.solvedChallenges) : [];
  }
  
  if (team.solvedChallenges.includes(category)) {
    return res.status(400).json({ error: 'This challenge has already been solved by your team.' });
  }

  // For non-admin teams, enforce active allocated riddle
  if (!isAdminUser && team.allocatedRiddles) {
    const curRound = team.currentRound || 1;
    const assignedCat = team.allocatedRiddles[curRound];
    if (assignedCat && category !== assignedCat) {
      return res.status(403).json({
        error: `Arr! Your crew is currently charted for Round ${curRound}. You must submit the flag for your allocated riddle: "${assignedCat}".`
      });
    }
  }

  const storedHash = challengeObj.hash;
  if (!storedHash) return res.status(404).json({ error: 'Challenge not found for this category.' });
  
  if (!bcrypt.compareSync(flag, storedHash)) {
    return res.status(400).json({ error: 'Incorrect flag.' });
  }
  
  team.solvedChallenges.push(category);
  const pointsEarned = challengeObj.points !== undefined ? Number(challengeObj.points) : 500;
  team.score = (team.score || 0) + pointsEarned;
  const solveTs = Date.now();
  if (!team.scoreHistory) {
    team.scoreHistory = [{ timestamp: solveTs - 1000, time: new Date(solveTs - 1000).toLocaleTimeString(), score: team.score - pointsEarned }];
  }
  team.scoreHistory.push({ timestamp: solveTs, time: new Date(solveTs).toLocaleTimeString(), score: team.score });

  if (!team.roundSolves) team.roundSolves = {};
  const currentRoundNum = challengeRound;
  team.roundSolves[currentRoundNum] = Date.now();

  let advanceMessage = `Correct flag! ${pointsEarned} points added to your crew.`;

  // Advance tournament rounds and apply group elimination engine
  if (!isAdminUser) {
    if (currentRoundNum === 1) {
      // Round 1 -> Advance to Round 2 (All 10 teams advance)
      team.currentRound = 2;
      if (!Array.isArray(team.unlockedRounds)) team.unlockedRounds = [1];
      if (!team.unlockedRounds.includes(2)) {
        team.unlockedRounds.push(2);
        team.unlockedRounds.sort((a, b) => a - b);
      }
      advanceMessage = `Bounty Claimed! Round 1 completed. High Seas (Round 2) unlocked! Chart your course to Island 2.`;
    } else if (currentRoundNum === 2) {
      // Round 2 -> Top 3 from team's group advance to Round 3
      const group = team.groupRound2 || 'A';
      // Find all teams in this group that have solved Round 2
      const solvedInGroup = teams.filter(t => !isAdminTeam(t) && t.groupRound2 === group && t.roundSolves && t.roundSolves[2]);
      const groupRank = solvedInGroup.length;

      if (groupRank <= 3) {
        team.currentRound = 3;
        if (!team.unlockedRounds.includes(3)) {
          team.unlockedRounds.push(3);
          team.unlockedRounds.sort((a, b) => a - b);
        }
        team.groupRound3 = group;
        advanceMessage = `Bounty Claimed! Crew finished #${groupRank} in Group ${group}! Dead Man's Creek (Round 3) unlocked!`;

        // If this was the 3rd team in the group to solve Round 2:
        // Automatically eliminate the remaining 2 teams in this group who haven't solved Round 2!
        if (groupRank === 3) {
          teams.forEach(t => {
            if (!isAdminTeam(t) && t.groupRound2 === group && (!t.roundSolves || !t.roundSolves[2]) && !t.eliminated) {
              t.eliminated = true;
              t.eliminatedRound = 2;
              t.eliminatedAt = Date.now();
              t.eliminatedReason = `Walked the Plank in Round 2: Top 3 spots in Group ${group} have been claimed! Your crew was outpaced.`;
            }
          });
        }
      } else {
        // Outpaced
        team.eliminated = true;
        team.eliminatedRound = 2;
        team.eliminatedAt = Date.now();
        team.eliminatedReason = `Walked the Plank in Round 2: Top 3 spots in Group ${group} were already claimed!`;
        advanceMessage = `Flag correct, but the top 3 spots in Group ${group} have already been claimed! Your crew has Walked the Plank.`;
      }
    } else if (currentRoundNum === 3) {
      // Round 3 -> Top 1 from team's group advances to Round 4 (1v1 Final Showdown)
      const group = team.groupRound3 || team.groupRound2 || 'A';
      const solvedInGroup = teams.filter(t => !isAdminTeam(t) && t.groupRound3 === group && t.roundSolves && t.roundSolves[3]);
      const groupRank = solvedInGroup.length;

      if (groupRank === 1) {
        team.currentRound = 4;
        if (!team.unlockedRounds.includes(4)) {
          team.unlockedRounds.push(4);
          team.unlockedRounds.sort((a, b) => a - b);
        }
        advanceMessage = `Bounty Claimed! Finalist berth secured for Group ${group}! Treasure Island (Round 4) unlocked for the 1v1 Final Showdown!`;

        // Automatically eliminate the other 2 teams in this group
        teams.forEach(t => {
          if (!isAdminTeam(t) && t.groupRound3 === group && t.id !== team.id && !t.eliminated) {
            t.eliminated = true;
            t.eliminatedRound = 3;
            t.eliminatedAt = Date.now();
            t.eliminatedReason = `Walked the Plank in Round 3: ${team.teamName} claimed the sole finalist spot for Group ${group}!`;
          }
        });
      } else {
        team.eliminated = true;
        team.eliminatedRound = 3;
        team.eliminatedAt = Date.now();
        team.eliminatedReason = `Walked the Plank in Round 3: Finalist berth for Group ${group} was already claimed!`;
        advanceMessage = `Flag correct, but the finalist berth for Group ${group} was already claimed! Your crew has Walked the Plank.`;
      }
    } else if (currentRoundNum === 4) {
      // Round 4 -> Grand Champion!
      team.isWinner = true;
      team.wonAt = Date.now();
      advanceMessage = `VICTORY! ${team.teamName} has uncovered the Final Treasure and won the CoreDump 2.0 Lost Code Championship!`;
      io.emit('tournamentWinner', { winner: team.teamName, score: team.score });
    }
  }
  
  try {
    fs.writeFileSync(teamsFilePath, JSON.stringify(teams, null, 2));
  } catch (err) {
    console.error("Error writing files:", err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
  
  io.emit('teamsUpdate');
  io.emit('tournamentUpdate');
  return res.json({
    message: advanceMessage,
    currentRound: team.currentRound,
    unlockedRounds: team.unlockedRounds,
    eliminated: team.eliminated,
    eliminatedReason: team.eliminatedReason,
    isWinner: Boolean(team.isWinner),
    pointsEarned: pointsEarned
  });
});

// Unlock Hint with Escalating Deduction (-5, -10, -15...)
app.post('/api/challenge/hint/unlock', (req, res) => {
  const isAdminUser = isAdminSession(req);
  if (!ctfConfig.ctfStartTime && !isAdminUser) return res.status(403).json({ error: 'The Treasure Hunt has not started yet!' });
  const team = getCurrentTeam(req);
  if (!team) return res.status(403).json({ error: 'Not logged in' });
  if (team.disqualified) {
    return res.status(403).json({ error: 'Your crew has been disqualified from the tournament for proctoring violations.' });
  }
  const { category } = req.body;
  if (!category) return res.status(400).json({ error: 'Category required.' });

  const flagsFilePath = path.join(__dirname, 'private', 'flags.json');
  if (!fs.existsSync(flagsFilePath)) return res.status(500).json({ error: 'Flags file not found.' });
  const flagsData = JSON.parse(fs.readFileSync(flagsFilePath, 'utf8'));
  const challengeObj = flagsData[category];
  if (!challengeObj) return res.status(404).json({ error: 'Challenge not found.' });
  if (!challengeObj.hint || !challengeObj.hint.trim()) return res.status(400).json({ error: 'This challenge has no hint.' });

  const challengeRound = challengeObj.round || 1;
  const unlockedRounds = Array.isArray(ctfConfig.unlockedRounds) ? ctfConfig.unlockedRounds : [1];
  if (!isAdminUser && !unlockedRounds.includes(challengeRound)) {
    return res.status(403).json({ error: "These waters remain locked by the Admiralty! Await captain's orders before seeking clues here." });
  }

  if (!team.hintsUnlocked || typeof team.hintsUnlocked !== 'object') {
    team.hintsUnlocked = {};
  }

  // If already unlocked for this team, return it without deducting again
  if (team.hintsUnlocked[category]) {
    return res.json({
      message: 'Hint already unlocked.',
      hint: challengeObj.hint,
      cost: 0,
      alreadyUnlocked: true,
      teamScore: team.score,
      hintsUnlockedCount: Object.keys(team.hintsUnlocked).length,
      nextHintCost: (Object.keys(team.hintsUnlocked).length + 1) * 5
    });
  }

  // Calculate escalating penalty: 1st hint = 5, 2nd = 10, 3rd = 15...
  const currentCount = Object.keys(team.hintsUnlocked).length;
  const cost = (currentCount + 1) * 5;

  team.score = (team.score || 0) - cost;
  team.hintsUnlocked[category] = {
    cost,
    unlockedAt: Date.now()
  };

  const hintTs = Date.now();
  if (!team.scoreHistory) {
    team.scoreHistory = [{ timestamp: hintTs - 1000, time: new Date(hintTs - 1000).toLocaleTimeString(), score: team.score + cost }];
  }
  team.scoreHistory.push({ timestamp: hintTs, time: new Date(hintTs).toLocaleTimeString(), score: team.score });

  try {
    fs.writeFileSync(teamsFilePath, JSON.stringify(teams, null, 2));
  } catch (err) {
    console.error("Error writing teams.json:", err);
    return res.status(500).json({ error: 'Internal server error.' });
  }

  io.emit('teamsUpdate');
  return res.json({
    message: `Quartermaster's secret revealed! ${cost} points deducted from your team.`,
    hint: challengeObj.hint,
    cost,
    teamScore: team.score,
    hintsUnlockedCount: currentCount + 1,
    nextHintCost: (currentCount + 2) * 5
  });
});

// Proctoring: Screen Departure Violation & Disqualification Endpoint
app.post('/api/proctor/violation', (req, res) => {
  const team = getCurrentTeam(req);
  if (!team) return res.status(403).json({ error: 'Not logged in' });
  if (isAdminTeam(team) || isAdminSession(req)) {
    return res.json({ ignored: true, message: 'Admin session exempt from proctoring.' });
  }
  if (ctfConfig.fullscreenEnforced === false) {
    return res.json({ ignored: true, message: 'Fullscreen proctoring disabled by administrator.' });
  }

  if (team.disqualified) {
    return res.json({ disqualified: true, violations: team.violations || 2, message: 'Crew is already disqualified.' });
  }

  team.violations = (team.violations || 0) + 1;
  const isSecondViolation = team.violations >= 2;

  if (isSecondViolation) {
    team.disqualified = true;
    team.disqualifiedAt = Date.now();
    team.disqualifiedReason = 'Screen departure violation limit exceeded (2/2).';
  }

  try {
    fs.writeFileSync(teamsFilePath, JSON.stringify(teams, null, 2));
  } catch (err) {
    console.error("Error writing teams.json during proctor violation:", err);
  }

  io.emit('teamsUpdate');

  if (isSecondViolation) {
    return res.json({
      disqualified: true,
      violations: team.violations,
      message: 'Crew has been disqualified for leaving the screen after receiving a warning.'
    });
  } else {
    return res.json({
      warning: true,
      violations: team.violations,
      message: 'Warning 1 of 1: Screen departure detected. The next departure will disqualify your crew.'
    });
  }
});

// Admin Route: Reinstate Disqualified Crew
app.post('/api/admin/teams/reinstate', isAdmin, (req, res) => {
  const { teamId } = req.body;
  if (!teamId) return res.status(400).json({ error: 'teamId required.' });

  const targetTeam = teams.find(t => t.id === teamId || t.teamName.toLowerCase() === teamId.toLowerCase());
  if (!targetTeam) return res.status(404).json({ error: 'Team not found.' });

  targetTeam.disqualified = false;
  targetTeam.violations = 0;
  delete targetTeam.disqualifiedAt;
  delete targetTeam.disqualifiedReason;

  try {
    fs.writeFileSync(teamsFilePath, JSON.stringify(teams, null, 2));
  } catch (err) {
    console.error("Error writing teams.json during reinstate:", err);
    return res.status(500).json({ error: 'Failed to update teams.' });
  }

  io.emit('teamsUpdate');
  return res.json({ message: `Crew ${targetTeam.teamName} reinstated successfully!` });
});

app.get('/dashboard', (req, res) => {
  const team = getCurrentTeam(req);
  if (!team) return res.redirect('/');
  let html = fs.readFileSync(path.join(__dirname, 'private', 'dashboard.html'), 'utf8');
  if (isAdminSession(req)) {
    html = html.replace('id="adminNavLi" style="display:none;"', 'id="adminNavLi"');
    html = html.replace('<head>', '<head><script>window.isAdminUser = true;</script>');
  }
  res.send(html);
});

app.get('/dashboard-styles.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'private', 'styles.css'));
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => { res.redirect('/'); });
});

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\x1b[31m[ERROR]\x1b[0m Port ${PORT} is already in use by another process.`);
    console.error(`To free port ${PORT}, run: fuser -k ${PORT}/tcp or lsof -ti :${PORT} | xargs kill -9`);
    process.exit(1);
  } else {
    throw err;
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = {
  app,
  server,
  io,
  teams,
  atomicWriteJsonSync,
  getRiddleBank,
  saveRiddleBank,
  getTournamentAssignments,
  saveTournamentAssignments,
  getRoundState,
  saveRoundState,
  logAuditEvent
};

