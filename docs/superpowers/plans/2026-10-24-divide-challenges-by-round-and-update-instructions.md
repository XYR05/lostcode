# Divide Challenges by Round & Update Tournament Instructions Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Divide the challenges display into 4 distinct tournament round sections in both the participant Challenges section and the Captain's Quarters (Admin Panel), while updating all tournament instructions, modals, and briefings with the exact competition rules (10 teams, random R1 allocation, pre-bound progression, physical field flag paste-in, auto-advance, and group elimination cutoffs).

**Architecture:** 
1. **Participant Challenges Section:** Below the interactive 4-island table map, introduce a responsive 4-Round Expedition Deck (`#participantChallengesRounds`). For participants, each round card clearly shows their allocated riddle, active/unlocked/solved/locked status, group quota, and direct flag submission that syncs seamlessly with the table map islands.
2. **Admin Challenges Panel:** Group `#adminChallengesList` into 4 dedicated round decks (Round 1: Setting Sail with 10 riddles; Round 2: High Seas with 6 riddles; Round 3: Dead Man's Creek with 2 riddles; Round 4: Treasure Island with 1 riddle), each with round summaries, elimination rules, and challenge management cards (Edit, Delete, Points, Difficulty).
3. **Tournament Instructions & Modals:** Fully update `#introModal` (Articles of the Expedition), `#tournamentFlowModal` (Expedition Route & Rules), and the Challenges section top briefing banner to explicitly document the full tournament law.

**Tech Stack:** Vanilla JavaScript (ES6+), HTML5, CSS3 Custom Properties, Node.js / Express backend.

**Spec:** User instructions detailing 10 teams, 1 random riddle in R1, pre-bound progression in R2-R4, physical field search, pasting answer into flag placeholder, automatic round unlocking, Round 2 (2 groups of 5 teams, first 3 from each group advance, 2 eliminated), Round 3 (2 groups of 3 teams, first 1 from each group advances, 2 eliminated), and Round 4 (1v1 showdown).

## Global Constraints
- Strictly zero lock emojis (`🔒`, `🔓`) anywhere in the UI or backend; use custom antique SVG padlock icons only.
- Strict scope boundary: `/vault/Projects/Lost-Code`. Do NOT touch `/vault/Projects/CTF-Dashboard`.
- Maintain AST syntax validity in `dashboard.html` (verified via `node -e "new vm.Script(...)"`).
- Keep all existing styling themes (`--gold-primary`, `--bg-primary`, `--border-subtle`, Cinzel & JetBrains Mono typography).

## Review Focus
- In participant view, only their allocated riddle for the active round is editable/submittable; locked rounds are gracefully muted with antique SVG padlocks.
- In admin view, all 19 challenges are visible and grouped cleanly under their respective 4 round decks with full Edit/Delete actions.
- Submitting a correct flag in the challenge card or island window updates both the map islands and the round challenge cards without requiring a page refresh.
- Instruction copy in `#introModal`, `#tournamentFlowModal`, and the top expedition briefing precisely reflects the 10 teams, physical clue salvage, auto-unlock, and group cutoffs.
- No JavaScript syntax or runtime errors occur during navigation or section switching.

---

### Task 1: Update Tournament Rules & Instructions in Modals and Briefings

**Files:**
- Modify: `private/dashboard.html` (`#introModal`, `#tournamentFlowModal`, `#challenges-section`)

**Interfaces:**
- Consumes: User prompt specifications for 10 teams, physical field clue paste-in, pre-bound riddle progression, and group elimination cutoffs.
- Produces: Updated copy in `#introModal`, `#tournamentFlowModal`, and Challenges section briefing.

- [ ] **Step 1: Check existing modal text in `dashboard.html`**
Verify the current text in lines 440-465 (`#tournamentFlowModal`) and lines 607-646 (`#introModal`).

- [ ] **Step 2: Update `#introModal` with exact tournament rules**
Embed the comprehensive rules:
- **10 Crews Enlisted:** Exactly 10 pirate crews compete in the expedition.
- **Round 1 Allocation:** Each crew receives 1 randomly allocated riddle out of 10.
- **Physical Field Search:** Crews search the physical campus/field for clues. The salvaged physical answer is entered directly into the flag placeholder: `lostcode{answer_found_in_field}`.
- **Automatic Round Progression:** Pasting the correct flag automatically unlocks the next island round and reveals that crew's pre-bound riddle.
- **Round 2 (High Seas):** 10 teams split into 2 groups of 5 (Group A & Group B). The first 3 teams from each group to solve advance to Round 3 (6 teams total). The remaining 2 teams per group are automatically eliminated (*Walk the Plank!*).
- **Round 3 (Dead Man's Creek):** 6 teams split into 2 groups of 3 (Group A & Group B). The first 1 team from each group to solve advances to Round 4. The other 2 per group are automatically eliminated (*Walk the Plank!*).
- **Round 4 (Treasure Island ❌):** 1 v 1 Final Showdown between Group A and Group B champions. The first crew to solve claims the ultimate Lost Code Treasure.

- [ ] **Step 3: Update `#tournamentFlowModal` with matching visual rule cards**
Update the 4 round stages and callouts in `#tournamentFlowModal` to match the exact mechanics.

- [ ] **Step 4: Update Challenges Section Header Briefing Banner**
Add an Expedition Protocol briefing bar above the table map displaying:
- Current crew's assigned group (Group A or Group B) and current round station.
- Notice: "Field Clue Protocol: Salvage physical clues on campus $\rightarrow$ enter flag $\rightarrow$ auto-unlock next round."

- [ ] **Step 5: Verify modal rendering and syntax**
Verify HTML structure and ensure no broken tags or unescaped characters.

---

### Task 2: Refactor Admin Challenges Panel (`#adminChallengesList`) into 4 Round Decks

**Files:**
- Modify: `private/dashboard.html` (`renderChallenges()`)
- Modify: `private/styles.css`

**Interfaces:**
- Consumes: `currentChallenges` dictionary from `/api/challenges` containing `{ round, riddleNumber, category, subtitle, points, difficulty, text }`.
- Produces: 4 distinct round containers in `#adminChallengesList` (`adminRoundDeck1`, `adminRoundDeck2`, `adminRoundDeck3`, `adminRoundDeck4`).

- [ ] **Step 1: Check existing `renderChallenges()` logic**
Currently, `renderChallenges()` creates a single flat list in `#adminChallengesList`.

- [ ] **Step 2: Update `renderChallenges()` to group challenges by round**
Create 4 Round Decks in `#adminChallengesList`:
- **Round 1: Setting Sail Deck (10 Riddles)**
  - Header: `ROUND 1: SETTING SAIL` | `10 TEAMS • 10 RIDDLES • 0 ELIMINATIONS (ALL ADVANCE UPON SOLVING)`
  - Subtitle: "Each team randomly receives 1 allocated riddle from this deck."
  - Grid containing all 10 Round 1 riddles with Riddle badge, subtitle, points, difficulty, brief preview, and Edit/Delete buttons.
- **Round 2: High Seas Deck (6 Riddles)**
  - Header: `ROUND 2: HIGH SEAS` | `2 GROUPS OF 5 TEAMS (GROUP A & B) • 6 RIDDLES • TOP 3 ADVANCE, 2 ELIMINATED PER GROUP`
  - Subtitle: "Pre-bound riddles distributed across Group A & Group B."
  - Grid containing all 6 Round 2 riddles.
- **Round 3: Dead Man's Creek Deck (2 Riddles)**
  - Header: `ROUND 3: DEAD MAN'S CREEK` | `2 GROUPS OF 3 TEAMS (GROUP A & B) • 2 RIDDLES • TOP 1 ADVANCES, 2 ELIMINATED PER GROUP`
  - Subtitle: "Finalist qualification riddles for surviving crews."
  - Grid containing all 2 Round 3 riddles.
- **Round 4: Treasure Island Deck (1 Riddle)**
  - Header: `ROUND 4: TREASURE ISLAND ❌` | `1 v 1 FINAL SHOWDOWN • 1 RIDDLE • CHAMPION CLAIMS TREASURE`
  - Subtitle: "Grand showdown riddle for the Group A vs Group B finalists."
  - Grid / showcase card containing the Round 4 riddle.

- [ ] **Step 3: Add CSS styling for Admin Round Decks**
In `private/styles.css`, define `.admin-round-deck`, `.admin-round-deck-header`, `.admin-round-deck-title`, and `.admin-round-badge`.

- [ ] **Step 4: Verify Admin challenges view**
Log in or simulate as Admin (`lostcode`) and verify that all 19 challenges are rendered cleanly within their respective 4 round decks.

---

### Task 3: Implement Participant Round-Divided Challenges in Challenges Section

**Files:**
- Modify: `private/dashboard.html` (`#challenges-section`, `renderChallenges()`, `updateChallengeBoxesFromTeam()`)
- Modify: `private/styles.css`

**Interfaces:**
- Consumes: `myTeamData` (team's `currentRound`, `unlockedRounds`, `allocatedRiddles`, `solvedChallenges`, `eliminated`), `currentChallenges`.
- Produces: `#participantChallengesRounds` deck below the table map displaying all 4 rounds with real-time status and interactive flag submission.

- [ ] **Step 1: Add container `#participantChallengesRounds` to `#challenges-section`**
Position below the `#treasureTableMap` with a divider:
`CHARTED EXPEDITION ROUNDS & ALLOCATED RIDDLES`.

- [ ] **Step 2: Render 4 Tournament Round Cards for Participants**
For each round (1 to 4):
- **Round Header:**
  - Round Number & Name (e.g., `ROUND 1: SETTING SAIL`, `ROUND 2: HIGH SEAS`, etc.).
  - Quota & Elimination Rule Pill (e.g., `10 Teams • 10 Riddles • 0 Elim`, `2 Groups of 5 • Top 3 Advance`, etc.).
  - State Badge:
    - If Solved: `✓ SOLVED & ADVANCED`
    - If Active: `⚡ ACTIVE ROUND // YOUR CHARTED OBJECTIVE`
    - If Locked: Antique SVG padlock + `LOCKED WATERS`
    - If Eliminated: `☠️ WALKED THE PLANK`
- **Round Body:**
  - If Unlocked/Active:
    - Display the crew's allocated riddle card: Title, Points, Difficulty.
    - Captain's brief / field objective.
    - Quartermaster's Hint button (with current penalty cost).
    - Embedded Flag Submission Box (`lostcode{...}`) with immediate submit action (or link to open the island window).
    - If solved: shows "✓ Bounty Salvaged! Next round unlocked."
  - If Locked:
    - Muted/greyed out with antique SVG padlock badge.
    - Explanation: "These waters remain sealed by the Admiralty. Salvage the physical flag in Round X to automatically unlock."
  - If Admin:
    - Shows all riddles in this round with quick-inspect and test actions.

- [ ] **Step 3: Sync Participant Round Decks with Island Map & Flag Submissions**
When `submitWindowFlag()` or inline flag submission succeeds:
- `fetchMyTeam()` triggers `updateChallengeBoxesFromTeam()`.
- Updates round status badges and unlocks the next round deck instantly without reload.

- [ ] **Step 4: Add CSS styling for Participant Round Decks**
In `private/styles.css`, define:
- `.participant-rounds-container`
- `.participant-round-card` (with `.is-active`, `.is-solved`, `.is-locked`, `.is-eliminated` states)
- Muted/greyed styling with gold borders for active stage.

---

### Task 4: End-to-End AST Validation, Verification, and Git Commit

**Files:**
- Test / Verify: Node AST compilation of `dashboard.html` scripts.
- Test / Verify: Automated curl tests for `/api/challenges`, `/api/my-team`, and `/api/challenge/flag`.
- Commit: Git repository `/vault/Projects/Lost-Code`.

- [ ] **Step 1: Validate JavaScript AST Syntax**
Run Node `vm.compileFunction` on all inline scripts in `dashboard.html` to guarantee 0 syntax errors.

- [ ] **Step 2: Verify UI in Browser / Headless Test**
Verify that `/dashboard` renders:
- The updated `#introModal` and `#tournamentFlowModal` text with the 10-team, auto-unlock, and group cutoffs rules.
- The 4 round decks in `#adminChallengesList` with all 19 challenges properly categorized.
- The 4 round decks in the participant `#challenges-section`.

- [ ] **Step 3: Ensure zero lock emojis in all files**
Grep for `🔒` and `🔓` across all modified files and confirm 0 matches.

- [ ] **Step 4: Commit and Push**
```bash
git add private/dashboard.html private/styles.css
git commit -m "feat: organize challenges by round in challenges section and admin panel, update tournament instructions"
git push origin main
```
