# Implementation Plan: Remove Captain's Brief for Rounds 2, 3, & 4

Remove the "Captain's Brief" (riddle description) for Tournament Rounds 2, 3, and 4 across the player dashboard, the Admin Portal, and backend validation in [`/vault/Projects/Lost-Code`](file:///vault/Projects/Lost-Code). In these later rounds, the challenge briefing is revealed within the answer/flag of the preceding round.

---

## User Review Required

> [!IMPORTANT]
> - **Round 1 (Qualifiers)** will continue to require and display the Captain's Brief.
> - **Rounds 2, 3, and 4 (Group Stage, Semi-Finals, Finals)** will omit the Captain's Brief in the player challenge view.
> - In the Admin Portal, the `#adminTextInput` (Challenge Text / Brief) will dynamically hide when Round 2, 3, or 4 is selected, and will not be required by the form or backend validation.
> - Existing challenges in `private/flags.json` for rounds 2, 3, and 4 will have their `text` set to `""`.

---

## Proposed Changes

### 1. Dashboard UI & Admin Form (`private/dashboard.html`)

#### [MODIFY] [`private/dashboard.html`](file:///vault/Projects/Lost-Code/private/dashboard.html)
- **Player Modal Section**:
  - Add `id="captainBriefSection"` to the Captain's Brief container.
  - In `selectChallenge(category)`:
    - If `chall.round > 1`: hide `captainBriefSection` (`captainBriefSection.style.display = 'none'`).
    - If `(chall.round || 1) === 1`: show `captainBriefSection` (`captainBriefSection.style.display = 'block'`) and populate `challengeDescription.textContent = chall.text`.
- **Admin Portal Input Toggle**:
  - Wrap `#adminTextInput` in a container `#adminTextContainer` (or toggle `#adminTextInput.style.display`).
  - Attach a `change` event listener to `#adminRoundInput`:
    - When round is `'2'`, `'3'`, or `'4'`: hide `#adminTextInput` (`display: none`) and reset its value.
    - When round is `'1'`: show `#adminTextInput` (`display: block`).
  - In `editChallenge(category)`:
    - Trigger round check so if `chall.round > 1`, `#adminTextInput` is hidden.
- **Admin Form Submission Validation**:
  - Update `#adminSubmitBtn` click listener:
    - Only enforce `text` when `roundNum === 1`. For `roundNum > 1`, allow `text` to be empty string.
- **Admin Challenges List Cards**:
  - In `renderChallenges()`: for cards with `roundNum > 1`, hide the description element or omit the brief text line.

---

### 2. Backend Validation (`server.js`)

#### [MODIFY] [`server.js`](file:///vault/Projects/Lost-Code/server.js)
- In `POST /api/admin/challenges`:
  - Extract and parse `roundNum`: `const roundNum = parseInt(round, 10) || 1;`.
  - Update required parameter check:
    ```javascript
    if (!category || (roundNum === 1 && !text) || !flag || !points) {
      return res.status(400).json({ error: roundNum === 1 
        ? 'Missing required challenge parameters (Category, Text, Flag, Points).' 
        : 'Missing required challenge parameters (Category, Flag, Points).' });
    }
    ```
  - For rounds > 1, save `text: text || ""`.

---

### 3. Data Cleanup (`private/flags.json`)

#### [MODIFY] [`private/flags.json`](file:///vault/Projects/Lost-Code/private/flags.json)
- Set `text: ""` for all challenges configured for rounds 2, 3, and 4.

---

## Verification Plan

### Automated Tests
1. **Syntax Check**:
   ```bash
   node -c /vault/Projects/Lost-Code/server.js
   ```
2. **API Verification via curl**:
   - Admin Login: `POST /api/login` with `lostcode` / `ahoy-captain`.
   - Update a Round 2 challenge with NO text (`text: ""`):
     ```bash
     curl -s -c /tmp/admin_cookie.txt -b /tmp/admin_cookie.txt -X POST http://localhost:3000/api/admin/challenges \
       -F "category=Round 2 - Riddle 1: The Governor's Vault" \
       -F "subtitle=The Governor's Vault" \
       -F "flag=lostcode{test_flag}" \
       -F "points=300" \
       -F "difficulty=MEDIUM" \
       -F "round=2"
     ```
     Verify response is HTTP 200 `{"message":"Challenge updated successfully."}`.
   - Attempt to update a Round 1 challenge with NO text:
     Verify response is HTTP 400 with missing text error.
   - Fetch challenges: `GET /api/challenges` and verify Round 2, 3, 4 challenges have empty text.

### Manual / Browser Verification
- Open `http://localhost:3000/dashboard`.
- In Challenges:
  - Click on a Round 1 riddle: Captain's Brief section is visible.
  - Click on a Round 2, 3, or 4 riddle: Captain's Brief section is hidden.
- In Admin Portal:
  - Switch round selector to Round 2, 3, or 4: Captain's Brief field vanishes.
  - Switch round selector to Round 1: Captain's Brief field reappears.
