# Implementation Plan: Fullscreen Proctoring & 1-Warning Disqualification System

Implement an anti-cheating proctoring system for the Lost Code tournament in [`/vault/Projects/Lost-Code`](file:///vault/Projects/Lost-Code). Upon logging in, participants are alerted to mandatory fullscreen mode *before* reading the rules. Any attempt to leave the screen (exiting fullscreen, switching tabs, or unfocusing the window) is tracked: **1 warning is issued**, and a **second violation permanently disqualifies the crew**.

---

## User Review Required

> [!IMPORTANT]
> - **Pre-Rules Fullscreen Prompt**: Upon logging into `/dashboard`, a mandatory proctoring alert modal appears *before* the rules modal. Clicking `"Enter Fullscreen & View Articles"` engages browser fullscreen (`requestFullscreen()`) and reveals the rules.
> - **Departure Detection**: Screen departure is detected via `fullscreenchange` (exiting fullscreen), `visibilitychange` (switching tabs / minimizing), and `blur` (clicking outside the window or opening another application).
> - **1 Warning Rule**:
>   - **Violation 1**: A prominent warning modal interrupts the screen: *"WARNING 1 OF 1: Screen departure detected. This is your ONLY warning. If you leave the screen again, your crew will be permanently disqualified."* Clicking `"Return to Fullscreen"` re-engages fullscreen and resets focus.
>   - **Violation 2**: The crew is **permanently disqualified**.
> - **Disqualification Enforcement**:
>   - Backend marks `team.disqualified = true` in `teams.json`.
>   - All flag submissions and hint unlocks are blocked (HTTP 403).
>   - The participant's UI is locked behind a permanent `[ CREW DISQUALIFIED ]` screen.
>   - On the public leaderboard and Crews directory, disqualified crews are tagged with `[ DISQUALIFIED ]`.
> - **Admin Exemption**: The admin account (`lostcode`) is strictly exempt from fullscreen enforcement and proctoring penalties.
> - **Admin Reinstate Option**: Admins receive a button in the Admin Portal to reinstate any accidentally disqualified crew if needed.

---

## Proposed Changes

### 1. Dashboard UI (`private/dashboard.html`)

#### [MODIFY] [`private/dashboard.html`](file:///vault/Projects/Lost-Code/private/dashboard.html)
- **New Pre-Rules Fullscreen Modal (`#fullscreenNoticeModal`)**:
  - Inserted before `#introModal`.
  - Explains fullscreen rules, anti-cheating tracking, and the 1-warning disqualification policy.
  - Action button: `#enterFullscreenBtn` (`ENTER FULLSCREEN & VIEW ARTICLES`).
  - Triggers `document.documentElement.requestFullscreen()` and opens `#introModal`.
- **Proctoring Warning Modal (`#proctorWarningModal`)**:
  - Displays: `WARNING 1 OF 1 // SCREEN DEPARTURE DETECTED`.
  - Button: `RETURN TO FULLSCREEN & RESUME`.
- **Permanent Disqualification Screen (`#disqualifiedModal`)**:
  - High-impact pirate lock-screen (`☠️ CREW DISQUALIFIED ☠️`).
  - Covers the entire page with no close button. Disables all inputs, buttons, and navigation.
- **Proctoring Event Listeners**:
  - Listen to `fullscreenchange`, `visibilitychange`, and `blur`.
  - Include grace window and check `!window.isAdminUser`.
  - Dispatches violation to `/api/proctor/violation`.
- **Crew Headquarters & Scoreboard Updates**:
  - Show violation counter and disqualified status badge on My Crew tab and standings.
- **Admin Portal**:
  - Add "Reinstate Disqualified Crew" action next to crew list in Admin Portal.

---

### 2. Backend Logic (`server.js`)

#### [MODIFY] [`server.js`](file:///vault/Projects/Lost-Code/server.js)
- **New Proctoring Violation Route (`POST /api/proctor/violation`)**:
  - Checks `getCurrentTeam(req)`.
  - Ignores admin sessions.
  - Increments `team.violations`.
  - If `team.violations === 1`: returns `{ warning: true, violations: 1 }`.
  - If `team.violations >= 2`: sets `team.disqualified = true`, `team.disqualifiedAt = Date.now()`, emits `teamsUpdate`, and returns `{ disqualified: true, violations: team.violations }`.
  - Saves to `teams.json`.
- **New Admin Reinstate Route (`POST /api/admin/teams/reinstate`)**:
  - Allows admin to reset a crew's violations: `team.violations = 0; team.disqualified = false;`.
- **Disqualification Safeguards**:
  - In `POST /api/challenge/flag`: reject if `team.disqualified` (HTTP 403).
  - In `POST /api/challenge/hint/unlock`: reject if `team.disqualified` (HTTP 403).
  - In `GET /api/myteam`: include `disqualified` and `violations` in team payload.
  - In `GET /api/teams`: include `disqualified` property.

---

## Verification Plan

### Automated Tests
1. **Syntax Check**:
   ```bash
   node -c /vault/Projects/Lost-Code/server.js
   ```
2. **Automated Proctoring Flow via curl**:
   - Register new test crew (`ProctorTestCrew`).
   - Log in as `ProctorTestCrew`.
   - Send 1st violation: `POST /api/proctor/violation` -> expect `{ warning: true, violations: 1 }`.
   - Submit flag -> expect normal operation (team still active).
   - Send 2nd violation: `POST /api/proctor/violation` -> expect `{ disqualified: true, violations: 2 }`.
   - Submit flag -> expect HTTP 403 `{"error": "Your crew has been disqualified..."}`.
   - Unlock hint -> expect HTTP 403 `{"error": "Your crew has been disqualified..."}`.
   - Query `GET /api/myteam` -> expect `disqualified: true`.
   - Test Admin Reinstate: `POST /api/admin/teams/reinstate` -> expect `team.disqualified: false`.

### Manual / Browser Verification
1. Log in with a test crew on `http://localhost:3000`.
2. Verify `#fullscreenNoticeModal` appears *before* the rules modal.
3. Click "Enter Fullscreen & View Articles" -> verify browser enters fullscreen and rules modal appears.
4. Agree to rules and enter dashboard.
5. Press `Esc` or switch tabs -> verify Warning 1 modal appears with "WARNING 1 OF 1".
6. Click "Return to Fullscreen & Resume" -> returns to fullscreen.
7. Switch tabs again -> verify permanent Disqualification lock-screen appears, locking all activity.
8. Log in as admin (`lostcode` / `ahoy-captain`) -> verify admin is exempt from fullscreen enforcement.
