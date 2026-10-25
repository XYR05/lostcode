# [Wipe All Challenges & Rounds for Fresh Start] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all existing challenges and riddles from `private/flags.json`, clear all round challenge decks in the admin panel and table map, and reset all 10 teams' solves, scores, and allocations to start with a fresh slate.

**Architecture:**
1. Create a safe backup of the current challenge file at `private/flags.backup.json`.
2. Clear `private/flags.json` to an empty JSON object `{}`.
3. Reset `teams.json` and `users.json`:
   - Maintain the 10 official teams (`BUCCANEERS`, `CUTTHROATS`, etc.) and admin `lostcode`.
   - Reset `score: 0`, `solvedChallenges: []`, `hintsUnlocked: {}`, `roundSolves: {}`, `currentRound: 1`, `unlockedRounds: [1]`, `eliminated: false`.
   - Set `allocatedRiddles: { "1": null, "2": null, "3": null, "4": null }`.
4. Update `private/config.json` to `{ "ctfStartTime": null, "unlockedRounds": [1] }`.
5. Enhance the island challenge window empty state in `private/dashboard.html`:
   - When an island is clicked with 0 riddles charted, display a clean, nautical **"Uncharted Island: Awaiting Admiralty Challenges"** card inside `#mapChallengeWindow` instead of abruptly closing with a toast.
6. Enable challenge text/brief input for all rounds in the admin form so organizers can configure field directions for any round.

**Tech Stack:** Node.js, Express.js, Vanilla JavaScript, HTML5/CSS3.

---

## User Review Required

> [!IMPORTANT]
> - **Clean Slate:** All 19 pre-existing sample challenges will be backed up to `private/flags.backup.json` and removed from `private/flags.json`.
> - **The 10 Official Teams Are Preserved:** The 10 official teams (`BUCCANEERS`, `CUTTHROATS`, `CORSAIRS`, `KRAKENS`, `SCALLYWAGS`, `PRIVATEERS`, `BLACKFLAGS`, `PLUNDERERS`, `DREADSAILS`, `SEARAVENS`) will remain in `teams.json` with their taglines, default password (`ahoy123`), and Group A/B assignments, ready to receive the fresh riddles.
> - **Admin Challenge Creation Ready:** The admin form will immediately allow creating new challenges for Round 1, Round 2, Round 3, or Round 4.

---

## Proposed Changes

### Component 1: Data Reset & Backup

#### [NEW] `private/flags.backup.json`
- Full archival copy of the 19 existing challenges and bcrypt hashes for recovery if needed.

#### [MODIFY] `private/flags.json`
- Reset to `{}`.

#### [MODIFY] `teams.json` & `users.json`
- Reset all scores, solves, score histories, round solves, and set `allocatedRiddles: { "1": null, "2": null, "3": null, "4": null }`.

#### [MODIFY] `private/config.json`
- Reset to:
  ```json
  {
    "ctfStartTime": null,
    "unlockedRounds": [1]
  }
  ```

---

### Component 2: Frontend Dashboard Island Window & Admin Form

#### [MODIFY] `private/dashboard.html`
- In `openRoundIsland(roundNum)`:
  - If `roundCategories.length === 0`, render an in-window empty state:
    ```html
    <div class="window-uncharted-card">
      <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">⚓</div>
      <div class="window-uncharted-title">UNCHARTED ISLAND</div>
      <p class="window-uncharted-desc">
        No riddles charted yet for Round ${roundNum}. The Admiralty will chart new challenges soon.
      </p>
    </div>
    ```
- In `syncAdminRoundFields()` and admin form:
  - Allow brief/clue description input across all rounds so organizers can enter campus field directions for Rounds 2, 3, and 4.

---

## Verification Plan

### Automated Verification
1. **API State Validation**:
   - Verify `/api/challenges` returns `{}` (0 challenges).
   - Verify `/api/tournament/status` returns all 10 teams with `score: 0`, `currentRound: 1`, and `solvedChallenges: []`.
   - Verify `/api/myteam` for `BUCCANEERS` returns clean slate data.
2. **Admin Challenge Addition Test**:
   - Test adding a test challenge to Round 1 via `/api/admin/challenges`.
   - Verify `/api/challenges` shows 1 challenge in Round 1.
   - Delete the test challenge via `/api/admin/challenges/delete`.
   - Verify `/api/challenges` returns `{}` again.
3. **Syntax & Script Check**:
   - `vm.Script` check on `private/dashboard.html` to guarantee 0 syntax errors.

### Manual Verification
- Open `http://localhost:3000/dashboard` as Admin (`lostcode` / `lostcode123`):
  - Check **Challenges** tab: Table map displays islands. Clicking any island shows the clean "Uncharted Island" view.
  - Check **Captain's Quarters**: All 4 round decks show `0 RIDDLES CHARTED` and `No riddles added yet for Round X`.
  - Click "+" on the challenge configuration card to verify ready state for fresh challenge entry.
