# Manage Everything Inside the Island Challenge Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Streamline the participant Challenges section so that everything is managed exclusively where the user clicks the island icon (the interactive table map's floating challenge window), eliminating the duplicate round list below the map and providing a complete, immersive station for each round upon clicking its island.

**Architecture:** 
1. **Interactive Island Challenge Window (`#mapChallengeWindow`):** When clicking an island icon (Round 1, 2, 3, or 4), the challenge window opens with all information and controls for that specific round:
   - **Round & Group Header:** Round badge (①, ②, ③, ④), Stage Title, Assigned Group (`GROUP A` or `GROUP B`), and Elimination Cutoff Rule (e.g., `Top 3 of 5 Teams Advance • 2 Walk the Plank`).
   - **Round Status Pill:** `⚡ ACTIVE STAGE // ALLOCATED OBJECTIVE`, `✓ SOLVED & ADVANCED`, `LOCKED WATERS`, or `☠️ WALKED THE PLANK`.
   - **Crew's Charted Riddle:** Subtitle/Title, points, category, difficulty, solve count, and field mission text.
   - **Quartermaster's Hint Box:** Escalating penalty hint reveal (-5, -10, -15 pts...).
   - **Field Flag Submission:** Flag placeholder `lostcode{answer_found_in_field}`, submit action, and auto-unlock feedback that instantly charts the route to the next island.
   - **Locked Waters State:** When clicking a locked island, the challenge window displays an antique SVG padlock with clear instructions on which preceding island must be solved first.
   - **Admin Management Strip:** For Admins, the window provides round riddle selector pills, riddle previews, and quick management controls.
2. **Remove Redundant Container Below Map:** Remove `#participantChallengesRoundsContainer` from beneath `#treasureTableMap` so the Challenges section is 100% focused on the interactive pirate table map.
3. **Preserve Admin Panel Round Decks:** Retain the 4-round deck division in the Captain's Quarters (Admin Portal) for backend challenge configuration.

**Tech Stack:** Vanilla JavaScript (ES6+), HTML5, CSS3 Custom Properties, Node.js / Express.

**Spec:** User directive: "but had to manage evry thing in that section only where we clcik the icon".

## Global Constraints
- Strictly zero lock emojis (`🔒`, `🔓`); use custom antique SVG padlock icons only.
- Strict scope boundary: `/vault/Projects/Lost-Code`. Do NOT touch `/vault/Projects/CTF-Dashboard`.
- Zero AST JavaScript syntax errors (verified with Node `vm.Script`).
- Maintain left/right dynamic window docking (Left islands dock right, Right islands dock left).

## Review Focus
- Clicking each of the 4 islands (Setting Sail, High Seas, Dead Man's Creek, Treasure Island) opens the challenge window with complete round information, group quota rules, and the team's allocated riddle.
- Submitting a flag inside the island window automatically unlocks the next island icon and route trail immediately without a page reload.
- Clicking a locked island gracefully renders the locked waters view inside the window with antique SVG padlock.
- No redundant round list appears below the table map; the Challenges section is clean and compact.
- Admin view allows switching between all riddles of that round inside the island window.

---

### Task 1: Clean Up Challenges Section Markup & Elevate Island Challenge Window

**Files:**
- Modify: `private/dashboard.html` (`#challenges-section`, `#mapChallengeWindow`)
- Modify: `private/styles.css`

**Interfaces:**
- Consumes: Existing island click handler `openRoundIsland(roundNum)`.
- Produces: Enhanced `#mapChallengeWindow` containing round metadata, group tag, quota law, and removal of `#participantChallengesRoundsContainer`.

- [ ] **Step 1: Remove `#participantChallengesRoundsContainer` from `#challenges-section`**
Delete the redundant container lines 250-265 below `#treasureTableMap` in `private/dashboard.html`.

- [ ] **Step 2: Add Round Stage Banner to `#mapChallengeWindow`**
Add `#windowRoundStageBanner` inside `#mapChallengeWindow` before `#windowChallengeTitle`:
- Round badge (e.g. `①`, `②`, `③`, `④`)
- Round name (e.g. `ROUND 1: SETTING SAIL`)
- Group allocation tag (e.g. `GROUP A` or `GROUP B`)
- Elimination rule tag (e.g. `TOP 3 OF 5 ADVANCE • 2 WALK THE PLANK`)
- Status badge (`⚡ ACTIVE OBJECTIVE`, `✓ SOLVED & ADVANCED`, or `LOCKED WATERS`)

- [ ] **Step 3: Add CSS styles for the enhanced Island Challenge Window**
In `private/styles.css`, style:
- `.window-stage-banner`
- `.window-group-badge`
- `.window-rule-tag`
- `.window-locked-view` (antique padlock, sealed waters text, unlock requirements)

---

### Task 2: Enhance JavaScript Window Controller (`openRoundIsland` & `selectWindowRiddle`)

**Files:**
- Modify: `private/dashboard.html` (`openRoundIsland()`, `selectWindowRiddle()`, `renderChallenges()`, `updateChallengeBoxesFromTeam()`)

**Interfaces:**
- Consumes: `myTeamData` (team group, current round, unlocked rounds, allocated riddles), `currentChallenges`.
- Produces: Complete in-window rendering of round laws, allocated riddle, hints, submission, and locked states.

- [ ] **Step 1: Update `openRoundIsland(roundNum)`**
Allow clicking on both unlocked and locked islands:
- If locked: Open the challenge window in a dedicated `.window-locked-view` showing antique SVG padlock, round stage rules, and instructions: *"Solve your physical field clue in Round (roundNum - 1) to unlock Island roundNum and reveal your pre-allocated riddle."*
- If unlocked: Open the challenge window populated with the team's allocated riddle, group allocation, quota rules, Captain's brief, hint, and flag submission box.
- If solved: Show `✓ Bounty Claimed by Crew! Island (roundNum + 1) unlocked.`

- [ ] **Step 2: Update `selectWindowRiddle(catKey)`**
- Ensure Captain's brief displays for any round riddle that contains brief text.
- Display physical field clue instructions: *"Salvage the physical answer from the campus grounds $\rightarrow$ Paste into flag box below."*
- Sync Quartermaster Hint status and cost.

- [ ] **Step 3: Update `renderChallenges()` and `updateChallengeBoxesFromTeam()`**
Remove references to the deleted participant container and ensure real-time updates of the island challenge window and map sprites upon solve.

---

### Task 3: Verification, Testing & Git Commit

**Files:**
- Test / Verify: Node AST script compilation.
- Test / Verify: Browser / API testing of island clicking, locked island view, flag submission, and auto-unlock.
- Commit: Git repository `/vault/Projects/Lost-Code`.

- [ ] **Step 1: Validate JavaScript AST Syntax**
Verify inline scripts in `dashboard.html` compile with zero errors using Node `vm.Script`.

- [ ] **Step 2: Test Island Window Flows**
- Click Island 1 (Setting Sail): Verify Round 1 stage header, allocated riddle, and flag submission form appear.
- Click Island 2 while locked: Verify locked waters view appears inside the window with antique SVG padlock.
- Submit flag for Round 1: Verify Island 2 unlocks immediately on the map and displays the pre-bound Round 2 riddle with Group A/B cutoffs.

- [ ] **Step 3: Verify Zero Lock Emojis**
Grep for `🔒` and `🔓` to confirm zero emojis.

- [ ] **Step 4: Commit and Push**
```bash
git add private/dashboard.html private/styles.css docs/superpowers/plans/
git commit -m "feat: manage challenges exclusively in island window upon icon click, remove redundant round list"
git push origin main
```
