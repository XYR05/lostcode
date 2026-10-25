# Timing System, Island State & Tournament Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the CTF platform from a points-based system to an admin-controlled round timing system with incremental hint time deductions (-5m, -10m), fix inner island lock states, persist and lock solved challenges in DB, polish challenge card theme accent styling, fix the header subtitle, and ensure real-time multi-device disqualification sync over WebSockets.

**Architecture:**
- **Timing Engine:** Admin configures round duration (e.g. Round 1: 30m, Round 2: 25m, etc.) stored in `roundState`. Hints deduct time directly from the team's clock (-5 mins for 1st hint, -10 mins for next). Standings and HUD rank teams by fastest completion time and remaining time rather than points.
- **Island Lock State Synchronization:** `renderRouteMap()` evaluates both global round Live state and team qualification state so active islands immediately clear their padlock medallions and `.is-locked` classes.
- **Challenge Completion Persistence:** Solved riddles are recorded in `teams.json` with `{ slotId, riddleId, answer, solvedAt, completed: true }`. The input card displays a permanent "✓ Bounty Claimed / Solved" banner and disables further submission.
- **Clean Theme Accent Styling:** Remove arbitrary colorful icons/vectors and mismatched teal buttons from the challenge cards; style with consistent dark aged wood (`#17110c`), subtle borders (`#3d2d1e`), antique gold (`#c99a52`), and amber parchment accents.
- **Lost Code Subtitle:** Replace `COREDUMP 2.0` under the Lost Code title with `TREASURE EXPEDITION`.
- **Disqualification WebSocket Sync:** Emit `team:disqualified` and `team:reinstated` via WebSockets. On disqualification, all connected devices for that crew immediately display the `#disqualifiedModal` lock-screen and sync with DB and Admin Roster with a "REINITIATE TEAM" button.

**Tech Stack:** Node.js, Express, Socket.io, Vanilla JS, HTML5/CSS3.

---

### Task 1: Lost Code Header Subtitle & Challenge Card Theme Accent Styling

**Files:**
- Modify: `private/dashboard.html:25-35`, `private/dashboard.html:240-305`
- Modify: `private/styles.css:1595-1805`

**Interfaces:**
- Consumes: CSS variables `--gold-primary`, `--border-subtle`, `--bg-primary`
- Produces: Polished challenge window cards without colorful vectors, clean antique gold accents, and updated header branding.

- [ ] **Step 1: Update brand subtitle in `private/dashboard.html`**
  - Change line 29 from `<div class="brand-subtitle">COREDUMP 2.0</div>` to `<div class="brand-subtitle">TREASURE EXPEDITION</div>`.
  - Update `<title>` from `Lost Code // CoreDump 2.0` to `Lost Code // Treasure Expedition`.

- [ ] **Step 2: Remove colorful/mismatched vectors and style challenge card boxes**
  - In `private/dashboard.html` inside `#mapChallengeWindow`:
    - Remove raw crosshair SVG, compass SVG, and flag SVGs from `.window-title-wrap`, `#windowCaptainBriefSection`, `#windowHintBox`, and `.window-flag-box`.
    - Replace with clean typography headers using theme-based accent badges (`[ BRIEF ]`, `[ QUARTERMASTER'S HINT ]`, `[ SALVAGE FLAG ]`).
  - In `private/styles.css`:
    - Update `.window-submit-btn` from teal (`#2b5952`) to theme antique gold (`background: var(--gold-primary); color: #17110c; border: 1px solid var(--gold-primary); font-weight: 700;`).
    - Update `.window-group-pill` from blue (`#528cc9`) to theme muted gold (`background: rgba(201,154,82,0.12); border: 1px solid var(--gold-primary); color: var(--gold-primary);`).
    - Refine padding, text hierarchy, and borders across `#windowCaptainBriefSection`, `#windowHintBox`, and `.window-flag-box` for seamless visual alignment.

---

### Task 2: Island Lock State & Solved Riddle Completion Persistence

**Files:**
- Modify: `server.js:180-275` (challenge fetch endpoint)
- Modify: `server.js:294-445` (challenge submit endpoint)
- Modify: `server.js:863-896` (round activate endpoint)
- Modify: `private/dashboard.html:1390-1435` (`renderRouteMap`)
- Modify: `private/dashboard.html:1610-1658` (`renderParticipantChallengeWindow`)
- Modify: `private/dashboard.html:3067-3124` (`updateChallengeBoxesFromTeam`)

**Interfaces:**
- Consumes: `roundState`, `team.roundSolves`, `team.unlockedRounds`
- Produces: Authoritative completion record in `teams.json`; active island padlock removal on map.

- [ ] **Step 1: Update `server.js` submission handling**
  - When a team submits a correct flag in `/api/team/submit`:
    - Save rich solve object to `team.roundSolves[String(roundNum)]`:
      ```javascript
      team.roundSolves[String(roundNum)] = {
        slotId: slot.slotId,
        riddleId: riddle.id,
        answer: answer.trim(),
        solvedAt: claimTime,
        completed: true
      };
      ```
    - Advance round tracking:
      ```javascript
      team.currentRound = Math.max(team.currentRound || 1, roundNum + 1);
      if (!Array.isArray(team.unlockedRounds)) team.unlockedRounds = [1];
      if (roundNum < 4 && !team.unlockedRounds.includes(roundNum + 1)) {
        team.unlockedRounds.push(roundNum + 1);
        team.unlockedRounds.sort((a, b) => a - b);
      }
      ```
    - Persist to `teams.json`.

- [ ] **Step 2: Update `/api/team/challenge` in `server.js`**
  - Check if the crew has already solved this round:
    ```javascript
    const isRoundSolved = !!(
      (team.roundSolves && team.roundSolves[String(roundNum)]) ||
      (currentRoundState.qualifiers || []).includes(team.id) ||
      (slot && slot.claimed && slot.claimedBy === team.id)
    );
    ```
  - If `isRoundSolved`: return `isSolved: true`, `isQualified: true`, `solvedAnswer: team.roundSolves[String(roundNum)]?.answer || 'Bounty Secured'`.
  - Block duplicate submissions in `/api/team/submit` with `400: 'Your crew has already secured qualification for Round ${roundNum}!'`.

- [ ] **Step 3: Fix island lock state in `renderRouteMap()`**
  - Update `renderRouteMap()` in `private/dashboard.html`:
    - Check both team unlock state AND tournament round state (`globalAdminRoundState[r]?.status === 'Live'`).
    - If a round is Live OR unlocked for the team, remove `is-locked` from `station`, hide the padlock medallion, and update banner text.
  - In `renderParticipantChallengeWindow()`:
    - If `data.isSolved || data.isQualified`:
      - Set `flagInput.value = data.solvedAnswer ? `✓ Solved: ${data.solvedAnswer}` : '✓ Bounty claimed by your crew!';`
      - Set `flagInput.disabled = true;`
      - Set `submitBtn.disabled = true; submitBtn.textContent = 'COMPLETED';`
      - Set `flagResult.textContent = '✓ Riddle completed. Your crew has advanced.';`

---

### Task 3: Multi-Device Disqualification Sync & Admin Reinitiate Feature

**Files:**
- Modify: `server.js:2000-2075` (proctor violation & reinstate endpoints)
- Modify: `private/dashboard.html:1175-1265` (proctoring event listeners)
- Modify: `private/dashboard.html:425-445`, `3530-3575` (Tournament Roster & Action buttons)
- Modify: `private/dashboard.html:3470-3530` (WebSocket listeners)

**Interfaces:**
- Consumes: `POST /api/proctor/violation`, `POST /api/admin/teams/reinstate`
- Produces: `team:disqualified` and `team:reinstated` socket broadcasts; live Admin Roster `REINITIATE TEAM` buttons.

- [ ] **Step 1: Harden server proctoring & socket broadcast in `server.js`**
  - In `/api/proctor/violation`:
    - On violation 2 (`isSecondViolation`):
      `team.disqualified = true; team.disqualifiedAt = Date.now();`
      Emit `io.emit('team:disqualified', { teamId: team.id, teamName: team.teamName, reason: team.disqualifiedReason });`
  - In `/api/admin/teams/reinstate`:
    - Clear `team.disqualified = false; team.violations = 0;`
    - Emit `io.emit('team:reinstated', { teamId: targetTeam.id, teamName: targetTeam.teamName });`
    - Emit `io.emit('teamsUpdate');`
  - In `/api/team/challenge` and `/api/team/submit`:
    - Return `403` if `team.disqualified`.

- [ ] **Step 2: Client proctoring deadlock fix & socket handlers in `private/dashboard.html`**
  - Replace blocking `violationInProgress` with a debounced 1200ms network guard so subsequent departures while warned trigger violation 2.
  - Add WebSocket listeners:
    - `socket.on('team:disqualified', (data) => { if (myTeamData?.team?.id === data.teamId) { lockDisqualified(data); } fetchTeams(); fetchTournamentStatus(); });`
    - `socket.on('team:reinstated', (data) => { if (myTeamData?.team?.id === data.teamId) { unlockReinstated(); } fetchTeams(); fetchTournamentStatus(); });`
  - Implement `unlockReinstated()` to dismiss lock screens and re-arm proctoring.
  - In `renderTournamentBracket()`:
    - Add `<th>ACTIONS</th>` to table header.
    - If `t.disqualified`: show `DISQUALIFIED (2/2)` badge and `<button onclick="reinstateCrew('${t.id}')">REINITIATE TEAM</button>`.
    - If `t.violations > 0`: show `WARNING (1/2)` badge and `REINITIATE TEAM` button.

---

### Task 4: Timing System Architecture (Replacing Points System)

**Files:**
- Modify: `server.js` (round duration config, timer endpoints, hint time deduction)
- Modify: `private/dashboard.html` (Admin Round Control Deck timing inputs, participant timer HUD, Standings by solve/remaining time)
- Modify: `private/styles.css` (timer badge & HUD styling)
- Test: `tests/test_timing_system.js`

**Interfaces:**
- Consumes: `ctfConfig.roundDurations`, `team.hintTimePenalties`
- Produces: Live round timers, time deductions on hints (-5m, -10m), standings ranked by time.

- [ ] **Step 1: Server timing model & hint penalty in `server.js`**
  - Add round duration config to `ctfConfig.roundDurations = { "1": 30, "2": 25, "3": 20, "4": 15 };` (in minutes).
  - Add `POST /api/admin/rounds/duration` to allow Admin to adjust minutes per round.
  - In `/api/admin/rounds/activate`: record `roundState[round].startedAt = Date.now(); roundState[round].durationMinutes = ctfConfig.roundDurations[round] || 30;`.
  - Update hint system:
    - Hint #1 penalty: 5 minutes.
    - Hint #2 penalty: 10 minutes.
    - In `/api/challenge/hint/unlock`: deduct penalty minutes:
      `team.hintTimePenalties = (team.hintTimePenalties || 0) + penaltyMinutes;`
      Remove score deductions.
  - In `/api/team/submit`:
    - Record solve elapsed time: `team.roundSolveTimes[round] = elapsedSeconds + (team.hintTimePenalties || 0) * 60`.
    - Remove score addition; standings calculate rank by fewest solve seconds / most remaining time.

- [ ] **Step 2: Admin UI for Round Timing Control in `private/dashboard.html`**
  - In `#roundControlDeck`: add duration input field (minutes) next to each round with "Save Duration" button.
  - In participant navigation / challenge window:
    - Replace points display (`500 PTS`, `100 PTS`) with live Round Countdown Timer (`⏱ 24:35 Remaining`).
    - In hint box: show `Deduct 5 Minutes (-5 MINS)` instead of points.
  - In Standings table: replace `POINTS` column with `ROUND STATUS / SOLVE TIME` (e.g. `Solved in 14m 20s (+5m hint)`).

---

### Task 5: Automated Verification & Regression Testing

**Files:**
- Create: `tests/test_timing_and_disqualification.js`
- Execute: all test suites in `tests/test_*.js`

- [ ] **Step 1: Write and run automated verification suite**
  - Verify hint deduction deducts minutes (-5m, -10m) and does not touch points.
  - Verify island lock state opens on round activation.
  - Verify duplicate submissions are prevented and solved status is returned.
  - Verify multi-device disqualification and reinstatement socket broadcasts.
  - Run: `node tests/test_timing_and_disqualification.js`
  - Run all tests: `for f in tests/test_*.js; do node "$f"; done`

- [ ] **Step 2: Restart server daemon & commit**
  - Restart background daemon `node server.js`.
  - Commit and push to `origin/main`.
