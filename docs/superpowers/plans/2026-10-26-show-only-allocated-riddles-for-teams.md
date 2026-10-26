# Show Only Allocated Riddles to Individual Teams on Dashboard Implementation Plan

## Problem Statement
Currently, `GET /api/challenges` returns all 19 riddles across all rounds in the Admiralty bank to any caller regardless of team identity. Individual participant teams see all 19 riddles in their client state and network payload, and the dashboard stats counter displays 19 riddles rather than the 4 allocated riddles specific to that team's tournament voyage (one per round).

## Target Behavior
1. **Participant Crew Isolation:**
   - Non-admin callers (`!isAdminUser`) requesting `GET /api/challenges` must only receive the riddles allocated specifically to their crew (`userTeam.allocatedRiddles[r]` or assigned via tournament round slots).
   - Unauthenticated visitors (`!userTeam && !isAdminUser`) receive an empty dictionary `{}`.
   - Other teams' riddles, texts, hints, and IDs must never appear in a participant crew's challenges response.
2. **Admiralty Administrator Visibility:**
   - Admin sessions (`admin@lostcode` / `isAdminUser === true`) continue to receive all 19 charted riddles across all 4 rounds in `GET /api/challenges`.
3. **Dashboard Stat Consistency:**
   - On the participant dashboard, `totalChallengesCount` reflects the crew's allocated riddles (`keys.length` or `4`), and `totalUnlockedCount` reflects only their own currently unlocked round riddles (e.g. `1` when Round 1 is live).
   - Admin dashboards continue to display `19` charted riddles.
4. **Verification & Regression Defense:**
   - Add automated test assertions verifying that `/api/challenges` returns only allocated riddles for a logged-in team, returns all riddles for an admin, and leaks 0 foreign riddles.
   - All 15 existing test suites in `tests/` must pass 100%.

---

## User Review Required

> [!IMPORTANT]
> Non-admin teams will only receive the riddles pre-bound/allocated to their crew across the rounds (typically 4 riddles). They will no longer receive foreign riddles assigned to rival crews. Admins will continue to see all 19 riddles.

---

## Proposed Changes

### 1. `server.js`
- In `GET /api/challenges`:
  - Fetch tournament assignments via `getTournamentAssignments()`.
  - For each riddle in `getRiddleBank()` (and the fallback in `flags.json`):
    - Compute `isAllocatedToTeam` using both `userTeam.allocatedRiddles[r]` and `findTeamSlotInRound(assignments, r, userTeam.id)`.
    - If `!isAdminUser && !isAllocatedToTeam`, skip the riddle (`return;` in forEach or `continue;` in for loop).
  - Return the filtered `safeData`.

### 2. `private/dashboard.html`
- In `<div class="stat-value" id="totalChallengesCount">19</div>`:
  - Change default HTML placeholder to `--` so it does not flash 19 before team data loads.
- In `updateStatsOverview()`:
  - If `window.isAdminUser`, display `keys.length > 0 ? keys.length : 19`.
  - If participant team, display `keys.length > 0 ? keys.length : 4`.
- In `renderAdminChallenges()`:
  - Guard with `if (!adminList || !window.isAdminUser) return;` so non-admin users do not build admin DOM elements.

### 3. `tests/test_riddle_privacy.js`
- Add automated assertions to verify:
  - `GET /api/challenges` as BUCCANEERS returns only BUCCANEERS' allocated riddles (does not contain `test_r1_cutthroats` or any unallocated riddle).
  - `GET /api/challenges` as unauthenticated caller returns `{}`.
  - `GET /api/challenges` as admin returns all riddles.

---

## Verification Plan

### Automated Tests
Run all 15 automated test suites:
1. `node tests/test_riddle_privacy.js`
2. `node tests/test_atomic_submissions.js`
3. `node tests/test_tournament_lifecycle.js`
4. `node tests/test_tournament_schemas.js`
5. `node tests/test_island_timer_reset.js`
6. `node tests/test_scoregraph_updates.js`
7. `node tests/test_prereq_round_and_rounds_graph.js`
8. `node tests/test_round1_starts_only_on_tournament_start.js`
9. `node tests/test_timing_and_disqualification.js`
10. `node tests/test_admin_riddle_bank.js`
11. `node tests/test_admin_dom.js`
12. `node tests/test_admin_assignments_validation.js`
13. `node tests/test_participant_ui.js`
14. `node tests/test_dashboard_script_syntax.js`
15. `node tests/test_toggle_proctoring.js`

### Manual Verification
- Start server daemon and query `/api/challenges` with:
  1. Buccaneer session cookie -> verify only Buccaneer allocated riddles returned.
  2. Admin session cookie -> verify all 19 riddles returned.
  3. No cookie -> verify empty `{}` returned.
