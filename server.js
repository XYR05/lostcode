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
let ctfConfig = { ctfStartTime: null };
if (fs.existsSync(configFilePath)) {
  ctfConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
} else {
  fs.writeFileSync(configFilePath, JSON.stringify(ctfConfig, null, 2));
}

app.get('/api/config', (req, res) => {
  res.json(ctfConfig);
});

app.post('/api/admin/start', (req, res) => {
  if (!isAdminSession(req)) return res.status(403).json({ error: 'Forbidden' });
  
  ctfConfig.ctfStartTime = Date.now();
  fs.writeFileSync(configFilePath, JSON.stringify(ctfConfig, null, 2));
  io.emit('configUpdate', ctfConfig);
  
  res.json({ message: 'CTF Started!', config: ctfConfig });
});

app.post('/api/admin/stop', (req, res) => {
  if (!isAdminSession(req)) return res.status(403).json({ error: 'Forbidden' });
  
  ctfConfig.ctfStartTime = null;
  fs.writeFileSync(configFilePath, JSON.stringify(ctfConfig, null, 2));
  io.emit('configUpdate', ctfConfig);
  
  res.json({ message: 'CTF Stopped!', config: ctfConfig });
});

app.post('/api/admin/wipe', (req, res) => {
  if (!isAdminSession(req)) return res.status(403).json({ error: 'Forbidden' });
  
  teams.forEach(team => {
      team.scoreHistory = [];
      team.score = 0;
      team.solvedChallenges = [];
      team.hintsUnlocked = {};
  });
  users.forEach(user => {
      user.solvedChallenges = [];
  });
  fs.writeFileSync(path.join(__dirname, 'teams.json'), JSON.stringify(teams, null, 2));
  fs.writeFileSync(path.join(__dirname, 'users.json'), JSON.stringify(users, null, 2));
  io.emit('teamsUpdate');
  
  res.json({ message: 'All scores and solves have been securely wiped.' });
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
  return team.id === 'team_admin_1' || name === 'lostcode' || name === 'admin' || name.includes('admin');
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
  const { teamName, password } = req.body;
  const crewName = (teamName || '').trim();

  const tagError = validateNoTags(crewName, "Crew name");
  if (tagError) return res.status(400).json({ error: tagError });

  if (!crewName || !password) {
    return res.status(400).json({ error: 'Crew name and password required.' });
  }

  if (teams.find(t => t.teamName.toLowerCase() === crewName.toLowerCase())) {
    return res.status(400).json({ error: 'Crew / Team name already in use.' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const newTeamId = 'team_' + Date.now();

  const newTeam = {
    id: newTeamId,
    teamName: crewName,
    password: hashedPassword,
    score: 0,
    solvedChallenges: [],
    hintsUnlocked: {},
    scoreHistory: [{ timestamp: Date.now(), score: 0 }]
  };

  const newUser = {
    id: newTeamId,
    username: crewName,
    email: `${crewName.toLowerCase().replace(/[^a-z0-9]/g, '')}@lostcode`,
    password: hashedPassword,
    teamId: newTeamId,
    solvedChallenges: []
  };

  teams.push(newTeam);
  users.push(newUser);

  try {
    fs.writeFileSync(teamsFilePath, JSON.stringify(teams, null, 2));
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
  } catch (err) {
    console.error("Error writing files:", err);
    return res.status(500).json({ error: 'Internal server error.' });
  }

  io.emit('teamsUpdate');
  res.json({ message: 'Crew enlisted successfully! Board the ship with your crew name and password.' });
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
    matchedTeam = teams.find(t => t.id === 'team_admin_1' || t.teamName.toLowerCase() === 'lostcode');
  }

  if (matchedTeam) {
    const teamPwMatches = matchedTeam.password && bcrypt.compareSync(password, matchedTeam.password);
    if (teamPwMatches) {
      req.session.teamId = matchedTeam.id;
      req.session.teamName = matchedTeam.teamName;
      req.session.isAdmin = (matchedTeam.id === 'team_admin_1' || matchedTeam.teamName.toLowerCase() === 'lostcode');
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

    const hasHint = Boolean(flagsData[key].hint && flagsData[key].hint.trim());
    const isHintUnlocked = Boolean(userTeam && userTeam.hintsUnlocked && userTeam.hintsUnlocked[key]);

    safeData[key] = { 
      text: flagsData[key].text, 
      subtitle: flagsData[key].subtitle || "",
      points: flagsData[key].points || 500,
      difficulty: flagsData[key].difficulty || "EASY",
      round: flagsData[key].round || 1,
      roundName: flagsData[key].roundName || "Round 1: Qualifiers",
      riddleNumber: flagsData[key].riddleNumber || 1,
      category: flagsData[key].category || "Miscellaneous",
      hint: isHintUnlocked ? (flagsData[key].hint || "") : null,
      adminHint: isAdminUser ? (flagsData[key].hint || "") : null,
      hasHint: hasHint,
      hintUnlocked: isHintUnlocked,
      resource: flagsData[key].resource,
      originalResourceName: flagsData[key].originalResourceName,
      solves: solvesCount,
      nextHintCost: nextHintCost
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
  if (!category || (roundNum === 1 && !text) || !flag || !points) {
    return res.status(400).json({ error: roundNum === 1 
      ? 'All fields (Category, Text, Flag, Points) are required.' 
      : 'All fields (Category, Flag, Points) are required.' });
  }
  
  let oldPoints = null;
  if (!flagsData[category]) {
    flagsData[category] = {};
  } else {
    oldPoints = flagsData[category].points !== undefined ? Number(flagsData[category].points) : 500;
  }
  
  const newPoints = parseInt(points) || 500;
  flagsData[category].text = roundNum === 1 ? (text || "") : "";
  flagsData[category].subtitle = subtitle || flagsData[category].subtitle || "";
  flagsData[category].points = newPoints;
  flagsData[category].difficulty = difficulty || "EASY";
  flagsData[category].hint = hint || "";
  flagsData[category].round = roundNum;
  const roundNames = {
    1: 'Round 1: Qualifiers',
    2: 'Round 2: Group Stage',
    3: 'Round 3: Semi-Finals',
    4: 'Round 4: Finals'
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
      score: typeof team.score === 'number' ? team.score : 0,
      solvedChallenges,
      scoreHistory: team.scoreHistory || [],
      disqualified: Boolean(team.disqualified),
      violations: team.violations || 0
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
      score: myTeam.score,
      solvedChallenges,
      hintsUnlocked: myTeam.hintsUnlocked,
      hintsUnlockedCount,
      nextHintCost,
      disqualified: Boolean(myTeam.disqualified),
      violations: myTeam.violations || 0
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
    violations: myTeam.violations || 0
  });
});

// Single-Submitter Flag Submission (Team-level)
app.post('/api/challenge/flag', (req, res) => {
  const isAdminUser = isAdminSession(req);
  if (!ctfConfig.ctfStartTime && !isAdminUser) return res.status(403).json({ error: 'The CTF has not started yet!' });
  const team = getCurrentTeam(req);
  if (!team) return res.status(403).json({ error: 'Not logged in' });
  if (team.disqualified) {
    return res.status(403).json({ error: 'Your crew has been disqualified from the tournament for proctoring violations.' });
  }
  
  const { category, flag } = req.body;
  if (!category || !flag) return res.status(400).json({ error: 'Category and flag required.' });
  const flagsFilePath = path.join(__dirname, 'private', 'flags.json');
  if (!fs.existsSync(flagsFilePath)) return res.status(500).json({ error: 'Flags file not found.' });
  const flagsData = JSON.parse(fs.readFileSync(flagsFilePath, 'utf8'));
  const challengeObj = flagsData[category];
  if (!challengeObj) return res.status(404).json({ error: 'Challenge not found for this category.' });

  if (!Array.isArray(team.solvedChallenges)) {
    team.solvedChallenges = team.solvedChallenges ? Object.keys(team.solvedChallenges) : [];
  }
  
  if (team.solvedChallenges.includes(category)) {
    return res.status(400).json({ error: 'This challenge has already been solved by your team.' });
  }

  const storedHash = challengeObj.hash;
  if (!storedHash) return res.status(404).json({ error: 'Challenge not found for this category.' });
  
  if (!bcrypt.compareSync(flag, storedHash)) {
    return res.status(400).json({ error: 'Incorrect flag.' });
  }
  
  team.solvedChallenges.push(category);
  const pointsEarned = challengeObj.points !== undefined ? Number(challengeObj.points) : 500;
  team.score = (team.score || 0) + pointsEarned;
  if (!team.scoreHistory) {
    team.scoreHistory = [{ timestamp: Date.now() - 1000, score: team.score - pointsEarned }];
  }
  team.scoreHistory.push({ timestamp: Date.now(), score: team.score });
  
  try {
    fs.writeFileSync(teamsFilePath, JSON.stringify(teams, null, 2));
  } catch (err) {
    console.error("Error writing files:", err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
  
  io.emit('teamsUpdate');
  return res.json({ message: `Correct flag! ${pointsEarned} points added to your team.` });
});

// Unlock Hint with Escalating Deduction (-5, -10, -15...)
app.post('/api/challenge/hint/unlock', (req, res) => {
  const isAdminUser = isAdminSession(req);
  if (!ctfConfig.ctfStartTime && !isAdminUser) return res.status(403).json({ error: 'The CTF has not started yet!' });
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

  if (!team.scoreHistory) {
    team.scoreHistory = [{ timestamp: Date.now() - 1000, score: team.score + cost }];
  }
  team.scoreHistory.push({ timestamp: Date.now(), score: team.score });

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

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
