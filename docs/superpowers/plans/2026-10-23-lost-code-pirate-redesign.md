# Lost Code: Minimal Pirate-Themed CTF Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the existing CoreDump 2.0 CTF platform in `/vault/Projects/CTF-Dashboard` into **Lost Code**, a minimal pirate-themed treasure hunt web application inspired by dark aged wood, nautical maps, antique gold (`#C99A52`), and ocean teal (`#31584F`), complete with an incremental hint penalty system (-5, -10, -15 pts) and confirmation popups.

**Architecture:** 
- **Backend (Node.js/Express/Socket.io):** Extend existing endpoints in [server.js](file:///vault/Projects/CTF-Dashboard/server.js) with a secure hint unlock endpoint (`POST /api/challenge/hint/unlock`) that prevents hint leakage in `/api/challenges`, tracks unlocked hints and penalty counters in [teams.json](file:///vault/Projects/CTF-Dashboard/teams.json), dynamically applies escalating deductions (-5, -10, -15...), and emits real-time score updates over Socket.io.
- **Frontend Core (Vanilla JS & HTML5):** Redesign [dashboard.html](file:///vault/Projects/CTF-Dashboard/private/dashboard.html) and [index.html](file:///vault/Projects/CTF-Dashboard/public/index.html) into a clean, responsive layout matching the reference mockup (Top navigation bar with Lost Code emblem, two-column challenges interface with category cards, solves count, Captain's Brief, Quartermaster's Hint, Salvaged Files, Flag Submission, and pirate confirmation modals).
- **Styling System (CSS Tokens):** Rebuild [private/styles.css](file:///vault/Projects/CTF-Dashboard/private/styles.css) and [public/styles.css](file:///vault/Projects/CTF-Dashboard/public/styles.css) using design tokens: `#17110C` (primary bg), `#211810` (panel bg), `#2B2016` (secondary panel), `#C99A52` (antique gold), `#8D6A3D` (muted gold), `#31584F` (ocean teal), `#E4D5B8` (primary text), `#A99A82` (secondary text), and `#493622` (subtle borders).

**Tech Stack:** Node.js, Express, Socket.io, Chart.js, HTML5, CSS3, Vanilla JavaScript, Google Fonts (`Cinzel`, `Rajdhani`, `JetBrains Mono`).

---

## Global Constraints

- **Preserve Existing Architecture:** Do not replace Express or Socket.io with a heavy new framework; maintain all existing routing, sessions, admin access, flag verification, and score histories.
- **No Hint Text Leakage:** The `/api/challenges` endpoint must not return raw hint text for locked challenges; clients only receive `hasHint: true` until unlocked by the team.
- **Scoring Integrity:** Hint penalties must escalate per team: 1st hint = -5 pts, 2nd hint = -10 pts, 3rd hint = -15 pts, Nth hint = `-(N * 5) pts`.
- **Theme Authenticity Without Clutter:** Adhere strictly to the requested minimalist aesthetic (no cartoonish illustrations, no blinding neon glow, high text contrast on dark aged wood and parchment).

---

## Review Focus

1. **Unauthenticated or Tampered Hint Requests:** Ensure `POST /api/challenge/hint/unlock` rejects requests from users not in a team, unstarted CTFs, non-existent challenges, or challenges without hints.
2. **Double-Deduction Prevention:** If a user clicks unlock multiple times or two teammates unlock the same challenge simultaneously, points must only be deducted once.
3. **Data Wipe Integrity:** `POST /api/admin/wipe` must securely reset all team hint records (`hintsUnlocked = {}`) in addition to scores and solves.
4. **Mobile Navigation & Two-Column Collapse:** On mobile devices (< 768px), the two-column challenges grid must cleanly stack and the header must provide a functioning mobile drawer.
5. **Chart.js Compatibility:** Score graph on the Leaderboard tab must use the antique gold, muted gold, and ocean teal color palette instead of the military cyber neon green.

---

## Tasks

### Task 1: Backend Secure Hint System & Scoring Logic
**Files:**
- Modify: `server.js`
- Test: Verification script testing `POST /api/challenge/hint/unlock` and `GET /api/challenges`

**Interfaces:**
- Consumes: `users`, `teams`, `flagsData`
- Produces: `POST /api/challenge/hint/unlock` returning `{ success, hint, cost, teamScore }`

- [ ] **Step 1:** In `server.js`, modify `GET /api/challenges` so that hint text is hidden unless `team.hintsUnlocked[category]` is present. Include `subtitle` and `hasHint`.
- [ ] **Step 2:** Implement `POST /api/challenge/hint/unlock` calculating `(hintsCount + 1) * 5` penalty, deducting from `team.score`, recording to `team.scoreHistory` and `team.hintsUnlocked`, saving to `teams.json`, and emitting `teamsUpdate`.
- [ ] **Step 3:** Update `/api/myteam` to expose team hint stats, and `/api/admin/wipe` to clear hint history.
- [ ] **Step 4:** Run verification script to ensure -5, -10, -15 deduction and protection against double-deduction.

### Task 2: Subtitles & Challenge Metadata
**Files:**
- Modify: `private/flags.json`

- [ ] **Step 1:** Add theme subtitles ("The Forged Manifest", "Follow the Trail", "Message in a Bottle", "Dead Man's Switch", "Cipher Chest", etc.) to `private/flags.json`.
- [ ] **Step 2:** Verify `flags.json` valid JSON syntax.

### Task 3: Pirate Design Tokens, Typography & Assets
**Files:**
- Modify: `private/styles.css`
- Modify: `public/styles.css`
- Create / Update: `public/map-bg.png` and embedded pirate SVG icon set

- [ ] **Step 1:** Configure color variables (`--bg-primary: #17110C`, `--panel-bg: #211810`, `--gold-primary: #C99A52`, `--teal-accent: #31584F`, `--text-primary: #E4D5B8`, etc.) and Google Fonts (`Cinzel`, `Rajdhani`, `JetBrains Mono`).
- [ ] **Step 2:** Style base layout, background textures, buttons, inputs, scrollbars, and cards.
- [ ] **Step 3:** Ensure responsive breakpoint styles for mobile and tablet.

### Task 4: Pirate Dashboard Header, Challenges Two-Column Layout & Modals
**Files:**
- Modify: `private/dashboard.html`

- [ ] **Step 1:** Redesign header with pirate skull emblem, `LOST CODE`, `COREDUMP 2.0`, and active gold underlines.
- [ ] **Step 2:** Redesign challenges two-column layout: category cards with icons, subtitles, solves count, active teal background and gold border.
- [ ] **Step 3:** Redesign right challenge details panel: `CAPTAIN'S BRIEF`, `QUARTERMASTER'S HINT`, `SALVAGED FILES`, `SUBMIT FLAG`.
- [ ] **Step 4:** Implement Quartermaster hint popup modal with penalty preview (-5, -10, -15 pts) and confirmation trigger.
- [ ] **Step 5:** Theme all other tabs (Leaderboard with gold/teal Chart.js, Teams, Users, Profile, Admin Portal).

### Task 5: Pirate Landing / Auth Screen
**Files:**
- Modify: `public/index.html`
- Modify: `public/styles.css`

- [ ] **Step 1:** Apply Lost Code pirate styling to login and registration cards.
- [ ] **Step 2:** Verify registration and login flows function properly and redirect to `/dashboard`.

### Task 6: End-to-End Verification & Responsive Polish
**Files:**
- Inspect & Test: Server running on port 3000

- [ ] **Step 1:** Start server and perform end-to-end user flows (login, view challenges, filter by difficulty, unlock hint with penalty confirmation, submit flag, view leaderboard).
- [ ] **Step 2:** Verify mobile layout and responsive drawer.
