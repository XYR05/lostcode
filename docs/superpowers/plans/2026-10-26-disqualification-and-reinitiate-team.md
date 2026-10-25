# Multi-Device Disqualification & Reinitiate Team Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure disqualification works reliably across multiple devices and tabs in real-time, prevent client-side departure deadlock, guard tournament endpoints, and restore the prominent "Reinitiate Team" feature in the Admin Portal with live status badges.

**Architecture:** 
- Real-time bidirectional WebSocket events (`team:disqualified` and `team:reinstated`) broadcasted by `server.js` to immediately synchronize all connected devices/tabs for that crew.
- Client-side violation handler in `private/dashboard.html` refactored to replace the blocking `violationInProgress` state with a debounced network lock, ensuring departures while viewing a warning trigger violation #2 without requiring manual button clicks.
- Tournament endpoints (`/api/team/challenge`, `/api/team/submit`) hardened with explicit `team.disqualified` checks returning HTTP 403.
- Admin Portal Tournament Roster updated with an `ACTIONS` column featuring a `REINITIATE TEAM` button for flagged/disqualified teams, and live `DISQUALIFIED (2/2)` / `WARNING (1/2)` status badges.
- Dedicated "Proctoring & Disqualification Monitor" admin section restored with full departure breakdown.

**Tech Stack:** Node.js, Express, Socket.io, Vanilla JS, HTML5 Fullscreen/Page Visibility API.

**Spec:** User request: "disqualification is not working properly, when two devices are disqualified why only 1 device shown disqualified ?? and also put back the reinitiate team feature.....and disqualification should work properly make sure you plan and think the act accordingly".

## Global Constraints
- Ponytail mode active: direct, robust, minimal code changes.
- Zero lock emojis (`🔒`, `🔓`).
- Preserve technical administrative terminology in the Admin Portal.
- All existing 11 test suites must pass 100%.

## Review Focus
1. Multi-device sync: When one device causes violation #2, all other devices logged into that team must immediately display `#disqualifiedModal` via socket without page refresh.
2. Departure while warned: If a user leaves the screen while the warning modal is active, that departure must record as violation #2 (disqualification) rather than being dropped.
3. Rapid blur spam: Switching tabs produces multiple browser events (`blur`, `visibilitychange`, `fullscreenchange`) in quick succession (<100ms); the client must debounce requests so one departure only counts as one violation.
4. Server endpoint enforcement: Disqualified teams attempting to call `/api/team/challenge` or `/api/team/submit` must receive HTTP 403 Forbidden.
5. Reinitiate team execution: When an admin clicks "REINITIATE TEAM", server clears `team.disqualified` and `team.violations`, emits `team:reinstated`, and all team devices immediately dismiss the lock screen and re-arm proctoring.

---

### Task 1: Server-Side Disqualification & Reinstatement Hardening

**Files:**
- Modify: `server.js`
- Modify: `private/config.json`
- Test: `tests/test_disqualification_and_reinstate.js`

**Interfaces:**
- Consumes: `teams.json`, `ctfConfig.fullscreenEnforced`, `io.emit()`
- Produces: `team:disqualified` and `team:reinstated` socket events; 403 checks in `/api/team/challenge` and `/api/team/submit`.

- [ ] **Step 1: Write automated tests for disqualification and reinstatement**
  Create `tests/test_disqualification_and_reinstate.js` testing:
  - Violation 1 records warning (`violations: 1, warning: true`).
  - Violation 2 records disqualification (`violations: 2, disqualified: true`).
  - Disqualified crew receives 403 from `/api/team/challenge` and `/api/team/submit`.
  - Admin `POST /api/admin/teams/reinstate` clears violations and restores status.
  - Reinstated crew can access challenge and submit answers.

- [ ] **Step 2: Run test to verify it fails on existing implementation**
  Run: `node tests/test_disqualification_and_reinstate.js`
  Expected: FAIL on challenge/submit 403 checks.

- [ ] **Step 3: Update `server.js`**
  - In `/api/team/challenge`:
    ```javascript
    if (team.disqualified) {
      return res.status(403).json({
        success: false,
        isDisqualified: true,
        error: 'Your crew has been disqualified due to proctoring violations.',
        riddle: null
      });
    }
    ```
  - In `/api/team/submit`:
    ```javascript
    if (team.disqualified) {
      return res.status(403).json({
        error: 'Your crew has been disqualified due to proctoring violations and cannot submit flags.'
      });
    }
    ```
  - In `/api/proctor/violation`:
    On `isSecondViolation`: emit `io.emit('team:disqualified', { teamId: team.id, teamName: team.teamName, reason: team.disqualifiedReason });`
  - In `/api/admin/teams/reinstate`:
    Emit `io.emit('team:reinstated', { teamId: targetTeam.id, teamName: targetTeam.teamName });`
  - Ensure `private/config.json` has `"fullscreenEnforced": true`.

- [ ] **Step 4: Run test to verify server changes pass**
  Run: `node tests/test_disqualification_and_reinstate.js`
  Expected: PASS

---

### Task 2: Client-Side Multi-Device Synchronization & Proctoring Deadlock Fix

**Files:**
- Modify: `private/dashboard.html` (proctor violation handlers and socket listeners)

**Interfaces:**
- Consumes: WebSocket events `team:disqualified`, `team:reinstated`, `teamsUpdate`
- Produces: `lockDisqualified()`, `unlockReinstated()`, debounced `triggerProctorViolation()`

- [ ] **Step 1: Refactor client violation handling in `private/dashboard.html`**
  - Replace persistent `violationInProgress` with debounced in-flight guard `violationRequestPending` with a 1200ms cooldown window.
  - In `showProctorWarning()`: display `#proctorWarningModal`, but do NOT permanently block subsequent departures.
  - In `lockDisqualified()`: hide `#fullscreenNoticeModal`, `#introModal`, `#proctorWarningModal`, and show `#disqualifiedModal`.
  - Implement `unlockReinstated()`:
    - Hide `#disqualifiedModal` and `#proctorWarningModal`.
    - Reset `violationRequestPending = false`.
    - Restore `#submitFlagBtn`, `#flagInput`, `#flagResult`.
    - Update local `myTeamData.team.disqualified = false; myTeamData.team.violations = 0;`.
    - Show custom toast / notification: "Crew Reinstated: Proctoring re-armed."
    - Call `armProctoring()`.

- [ ] **Step 2: Add real-time socket listeners in `private/dashboard.html`**
  - Listen for `team:disqualified`:
    ```javascript
    socket.on('team:disqualified', (data) => {
      if (myTeamData && myTeamData.team && (myTeamData.team.id === data.teamId || myTeamData.team.teamName === data.teamName)) {
        lockDisqualified(data);
      }
      fetchTeams();
      if (typeof fetchTournamentStatus === 'function') fetchTournamentStatus();
    });
    ```
  - Listen for `team:reinstated`:
    ```javascript
    socket.on('team:reinstated', (data) => {
      if (myTeamData && myTeamData.team && (myTeamData.team.id === data.teamId || myTeamData.team.teamName === data.teamName)) {
        unlockReinstated();
      }
      fetchTeams();
      if (typeof fetchTournamentStatus === 'function') fetchTournamentStatus();
    });
    ```

---

### Task 3: Admin Portal "Reinitiate Team" UI & Tournament Roster Integration

**Files:**
- Modify: `private/dashboard.html` (Tournament Roster table and proctor monitor section)

**Interfaces:**
- Consumes: `teamsData`, `POST /api/admin/teams/reinstate`
- Produces: `ACTIONS` column in Tournament Roster, interactive `REINITIATE TEAM` buttons, and `DISQUALIFIED` / `WARNING` status badges.

- [ ] **Step 1: Update Tournament Roster table structure in `private/dashboard.html`**
  - In `tournament-bracket-table` `<thead>`: add `<th>ACTIONS</th>`.
  - In `renderTournamentBracket()`:
    - Check `if (t.disqualified)`:
      Status: `<span class="status-tag status-eliminated" style="background:#5a1a1a; color:#ff8b8b; border:1px solid var(--danger);">DISQUALIFIED (${t.violations || 2}/2)</span>`
    - Check `else if (t.violations > 0)`:
      Status: `<span class="status-tag" style="background:rgba(201,154,82,0.15); color:var(--gold-primary); border:1px solid var(--gold-primary);">WARNING (1/2)</span>`
    - Add Actions column cell:
      If `t.disqualified || t.violations > 0`:
      `<button type="button" onclick="reinstateCrew('${escapeHTML(t.id)}')" style="padding: 0.35rem 0.75rem; background: rgba(201,154,82,0.15); border: 1px solid var(--gold-primary); color: var(--gold-primary); font-family: 'Cinzel', serif; font-size: 0.75rem; font-weight: 700; border-radius: 3px; cursor: pointer;">REINITIATE TEAM</button>`
      Else:
      `<span style="color:var(--text-secondary); font-size:0.75rem;">Active</span>`

- [ ] **Step 2: Add dedicated Proctoring Monitor dropdown card or integrate with Admin panel**
  - Un-hide `#adminCrewsProctorList` into an Admin dropdown section "Proctoring & Disqualification Monitor" so the administrator has full visibility over violation counts and one-click re-initiation for all 10 teams.
  - In `reinstateCrew()`: call both `fetchTeams()` and `fetchTournamentStatus()`.

---

### Task 4: End-to-End Verification & Regression Testing

**Files:**
- Execute: `tests/test_disqualification_and_reinstate.js`
- Execute: all 12 test suites in `tests/test_*.js`

- [ ] **Step 1: Run comprehensive test suite**
  Run: `for f in tests/test_*.js; do echo "=== Running $f ===" && node "$f"; done`
  Expected: All 12 test suites PASS with 0 failures.

- [ ] **Step 2: Restart server background daemon**
  Restart task `node server.js` to run on port 3000 with clean state.

- [ ] **Step 3: Commit and push changes**
  Run git commit and push to `origin/main`.
