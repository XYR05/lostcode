# [Remove Login 'New Buccaneer?' Sign-Up & Seed Official Teams] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the "New Buccaneer? / Enlist Crew" sign-up panel and registration form from the login page, converting it into a clean, centered sign-in portal, and configure the 10 official tournament teams provided by the user with pre-bound tournament riddle allocations.

**Architecture:** 
1. Remove `.panels-container` ("New Buccaneer?") and `#registerForm` from `public/index.html`.
2. Clean up `public/app.js` to remove obsolete toggle event listeners, preventing runtime errors.
3. Update `public/styles.css` to style `.container` as a centered, responsive authentication card (~460px width) with an Admiralty notice: *"Credentials issued manually by Admiralty"*.
4. Disable public self-registration on `/api/register` in `server.js`.
5. Update `crewNames` in `server.js` and reseed `teams.json` / `users.json` with the 10 official tournament teams and their taglines from the user's list:
   - **01 BUCCANEERS** (*Ruthless pirate adventurers*) — Group A
   - **02 CUTTHROATS** (*Fearless and dangerous*) — Group B
   - **03 CORSAIRS** (*Elite sea raiders*) — Group A
   - **04 KRAKENS** (*Mythical forces of the deep*) — Group B
   - **05 SCALLYWAGS** (*Mischievous pirates*) — Group A
   - **06 PRIVATEERS** (*Strategic naval raiders*) — Group B
   - **07 BLACKFLAGS** (*Rogue pirates of the seas*) — Group A
   - **08 PLUNDERERS** (*Seekers of hidden treasure*) — Group B
   - **09 DREADSAILS** (*Ghostly ships of the ocean*) — Group A
   - **10 SEARAVENS** (*Dark and cunning voyagers*) — Group B

**Tech Stack:** HTML5, CSS3, Vanilla JS, Express.js, bcrypt.

---

## User Review Required

> [!IMPORTANT]
> - **Self-Registration Removal:** With the removal of "New Buccaneer?", participants can no longer register their own crews on the login page. Only authorized crews provided credentials by the Admiralty can log in.
> - **Default Password:** The 10 seeded teams will have a default password: `ahoy123` (admin password remains `lostcode123`). Teams can be handed these credentials directly.
> - **Case-Insensitive Login:** Crew names are verified case-insensitively, so typing `buccaneers`, `Buccaneers`, or `BUCCANEERS` will all sign in successfully.

---

## Proposed Changes

### Component 1: Login Page Frontend Cleanup

#### [MODIFY] `public/index.html`
- Remove `#registerForm` (`.sign-up-form`).
- Remove `.panels-container` containing the "New Buccaneer? / Enlist Crew" right panel and "Already Sailing?" left panel.
- Add an Admiralty advisory below the sign-in button:
  ```html
  <div class="auth-footer-notice">
    <span>⚓ Official Tournament Portal</span>
    <p>Crew credentials are chartered manually by the Admiralty.</p>
  </div>
  ```

#### [MODIFY] `public/app.js`
- Remove `signUpBtn` and `signInBtn` toggle event listeners that throw `null` property errors.
- Remove `registerForm` submit event listener.
- Keep the clean `loginForm` handler intact with redirection to `/dashboard`.

#### [MODIFY] `public/styles.css`
- Update `.container`:
  - Set `max-width: 460px; width: 100%; min-height: auto; margin: 1.5rem; padding: 2.5rem 2rem;`.
  - Remove multi-panel split styles (`.panels-container`, `.container.sign-up-mode`).
- Add styling for `.auth-footer-notice` in theme gold/muted typography.

---

### Component 2: Backend & Official Team Roster

#### [MODIFY] `server.js`
- Update `/api/register` to return HTTP 403: `{ error: 'Public registration is closed. Contact the Admiralty to receive your official crew credentials.' }`.
- Update `crewNames` array in `/api/admin/tournament/seed-teams` (around line 746) to:
  ```javascript
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
  ```
- Store the taglines in the team metadata:
  ```javascript
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
  ```

#### [MODIFY] `teams.json` & `users.json`
- Reseed all 10 teams with their official names, taglines, pre-bound riddle chains (Round 1–4), and default password hash for `ahoy123`:
  - Group A: `BUCCANEERS`, `CORSAIRS`, `SCALLYWAGS`, `BLACKFLAGS`, `DREADSAILS`
  - Group B: `CUTTHROATS`, `KRAKENS`, `PRIVATEERS`, `PLUNDERERS`, `SEARAVENS`

---

## Verification Plan

### Automated Verification
1. **Frontend Assets Validation**:
   - Verify `index.html` does NOT contain `signUpBtn`, `registerForm`, or `New Buccaneer?`.
   - Verify `node` syntax check on `public/app.js` passes with 0 errors.
2. **Backend Authentication & Data Test**:
   - Test login as `BUCCANEERS` with password `ahoy123` via `/api/login` -> HTTP 200.
   - Test login with lowercase `buccaneers` -> HTTP 200 (case-insensitive check).
   - Test login as `CUTTHROATS` (Group B) with password `ahoy123` -> HTTP 200.
   - Verify `/api/myteam` returns correct team name, allocated riddles, and assigned group.
   - Verify `/api/tournament/status` returns exactly 10 teams divided evenly into Group A (5) and Group B (5).
   - Verify `/api/register` rejects registration attempts.

### Manual Verification
- Open `http://localhost:3000/` in browser:
  - Verify clean, centered pirate login card without the "New Buccaneer?" side panel.
  - Log in with `BUCCANEERS` / `ahoy123`.
  - Confirm dashboard loads seamlessly with crew name, island map, and assigned riddle.
