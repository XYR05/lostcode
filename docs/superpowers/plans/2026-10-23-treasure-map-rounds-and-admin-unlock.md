# Implementation Plan: Treasure Map Expedition Route & Admin Round Unlock System

Transform the Challenges section into an interactive **Treasure Route Map**, integrate official island graphics (`1.png`, `2.png`, `3.png`, `4.png`) and the `/challenges-bg.png` parchment background, update all round names and elimination lore to authentic pirate slang, and implement the **Admiralty Round Unlock Control Deck** so subsequent rounds can only be accessed when unlocked by the Admin in [`/vault/Projects/Lost-Code`](file:///vault/Projects/Lost-Code).

---

## User Review Required

> [!IMPORTANT]
> - **The 4 Official Tournament Rounds**:
>   1. **Round 1: Setting Sail** (`/1.png`) — 10 Teams • 10 Riddles • All Hands Advance (0 Eliminations). Unlocked by default.
>   2. **Round 2: High Seas** (`/2.png`) — 2 Squadrons of 5 Teams • 6 Riddles • 4 Walk the Plank (2 per group) → 6 Advance. Locked until Admin unlocks.
>   3. **Round 3: Dead Man's Creek** (`/3.png`) — 2 Squadrons of 3 Teams • 2 Riddles • 4 Walk the Plank (2 per group) → 2 Finalists Advance. Locked until Admin unlocks.
>   4. **Round 4: Treasure Island** (`/4.png`) — 1 v 1 Showdown • 1 Riddle • Winner Plunders the Grand Lost Treasure (Marked with the iconic **Red X**). Locked until Admin unlocks.
> - **Admin Round Unlock Control**:
>   - In the Admin Portal (`#admin-section`), a new **Admiralty Round Control Deck** allows the Admin to toggle **Unlock / Lock** for each round with instant real-time Socket.io updates to all connected crews.
>   - Locked rounds are blocked on the server: `POST /api/challenge/flag` and `POST /api/challenge/hint/unlock` reject attempts on locked rounds with HTTP 403.
>   - Participants clicking a locked round on the map see a pirate alert: `🔒 UNCHARTED WATERS: Awaiting Captain's orders to unlock this round.`
> - **Treasure Map Navigation UI**:
>   - Replaces the plain text category tabs with a visual 4-waypoint Treasure Route Map strip with red dashed trail lines, red numbered waypoint badges (`①`, `②`, `③`, `④`), island graphics, lock overlays, and a glowing **❌ Red X** over Treasure Island.
>   - Background of the Challenges section is upgraded to `/challenges-bg.png` with pirate vignette styling.

---

## Visual Treasure Route Map

```
  [PORT]                                                                          [TREASURE CHEST]
   ( 1 )  - - - - - - - - >  ( 2 )  - - - - - - - - >  ( 3 )  - - - - - - - - >    ( 4 ) ❌
 SETTING SAIL               HIGH SEAS             DEAD MAN'S CREEK            TREASURE ISLAND
  10 Teams • 10 Riddles      2 Groups of 5 Teams    2 Groups of 3 Teams         1 v 1 Showdown
  0 Eliminations             4 Walk the Plank       4 Walk the Plank            Grand Plunder
  [ CHARTED ]                [ 🔒 UNCHARTED ]       [ 🔒 UNCHARTED ]            [ 🔒 UNCHARTED ]
```

---

## Proposed Changes

### 1. Data Model & Backend API (`server.js` & `private/config.json`)

#### [MODIFY] [`private/config.json`](file:///vault/Projects/Lost-Code/private/config.json)
- Store `unlockedRounds: [1]` by default.

#### [MODIFY] [`server.js`](file:///vault/Projects/Lost-Code/server.js)
- **Round Names Mapping**:
  Update round names everywhere to:
  ```javascript
  const roundNames = {
    1: "Round 1: Setting Sail",
    2: "Round 2: High Seas",
    3: "Round 3: Dead Man's Creek",
    4: "Round 4: Treasure Island"
  };
  ```
- **New Admin Round Control Route (`POST /api/admin/rounds/toggle`)**:
  - Requires `isAdmin`.
  - Accepts `{ round: number, unlocked: boolean }`.
  - Updates `ctfConfig.unlockedRounds` and writes to `private/config.json`.
  - Broadcasts `io.emit('roundsUpdate', ctfConfig.unlockedRounds)`.
- **Config & Challenge APIs**:
  - `GET /api/config`: returns `{ ctfStartTime, unlockedRounds: ctfConfig.unlockedRounds || [1] }`.
  - `GET /api/challenges`: for each challenge, compute `isUnlocked = isAdminUser || (unlockedRounds.includes(chall.round))`.
    - If `!isUnlocked`, set `locked: true` and omit sensitive details (or mark as locked).
- **Submission Protection**:
  - In `POST /api/challenge/flag`:
    ```javascript
    const unlockedRounds = ctfConfig.unlockedRounds || [1];
    if (!isAdminUser && !unlockedRounds.includes(challengeObj.round)) {
      return res.status(403).json({ error: "These waters remain locked by the Admiralty! Awaiting Captain's orders." });
    }
    ```
  - In `POST /api/challenge/hint/unlock`: same check, rejecting if round is locked.

---

### 2. Challenge Manifest Updates (`private/flags.json`)

#### [MODIFY] [`private/flags.json`](file:///vault/Projects/Lost-Code/private/flags.json)
- Update `roundName` for all challenges:
  - Round 1 challenges: `"roundName": "Round 1: Setting Sail"`
  - Round 2 challenges: `"roundName": "Round 2: High Seas"`
  - Round 3 challenges: `"roundName": "Round 3: Dead Man's Creek"`
  - Round 4 challenges: `"roundName": "Round 4: Treasure Island"`

---

### 3. Dashboard UI & Treasure Map Interface (`private/dashboard.html`)

#### [MODIFY] [`private/dashboard.html`](file:///vault/Projects/Lost-Code/private/dashboard.html)
- **Challenges Section Background**:
  - Style `#challenges-section` with `background: linear-gradient(rgba(23,17,12,0.88), rgba(23,17,12,0.92)), url('/challenges-bg.png') center / cover; border: 1px solid var(--border-subtle); border-radius: 8px; padding: 25px;`.
- **Interactive Treasure Route Map Navigation (`#treasureRouteMap`)**:
  - Replace `#challengeTabs` with an interactive **Treasure Route Map Stage Bar**:
    - Station 1: Thumbnail `/1.png`, badge `①`, title `Setting Sail`, subtitle `All Hands Advance`, status `CHARTED`.
    - Red dashed connecting trail with glowing red accents.
    - Station 2: Thumbnail `/2.png`, badge `②`, title `High Seas`, subtitle `2 Groups of 5 • 4 Walk Plank`, status `LOCKED / UNLOCKED`.
    - Red dashed connecting trail.
    - Station 3: Thumbnail `/3.png`, badge `③`, title `Dead Man's Creek`, subtitle `2 Groups of 3 • 4 Walk Plank`, status `LOCKED / UNLOCKED`.
    - Red dashed connecting trail.
    - Station 4: Thumbnail `/4.png`, badge `④`, title `Treasure Island`, subtitle `1 v 1 Showdown • Red X`, glowing `❌ RED X` marker, status `LOCKED / UNLOCKED`.
  - Add quick filter: `[ ALL CHARTED WATERS ]`.
- **Locked Round Client Interaction**:
  - If a crew clicks a locked round waypoint, show a pirate notification:
    *"Arrr! These waters be uncharted! Round [X] is sealed until the Admiralty signals the next leg of the expedition."*
  - In the challenges list, locked challenge cards display `🔒 LOCKED BY ADMIRALTY` and cannot be clicked.
- **Admin Portal: Admiralty Round Control Deck (`#adminRoundControlDeck`)**:
  - Inside `#admin-section`: displays the 4 rounds with direct `[ 🔓 UNLOCK ROUND ]` and `[ 🔒 LOCK ROUND ]` buttons.
- **Rules & Flowchart Modals (`#introModal` & `#tournamentFlowModal`)**:
  - Update `#introModal` with the 4 pirate round names, squad rules, and elimination stages.
  - In `#tournamentFlowModal`, replace the generic diagram with `/treasure_map.png` (the user's high-res parchment map image) with full-screen zoom support!

---

## Verification Plan

### Automated Tests
1. **Syntax Check**:
   ```bash
   node -c /vault/Projects/Lost-Code/server.js
   ```
2. **API Verification via curl**:
   - Query `GET /api/config` -> verify `unlockedRounds: [1]` by default.
   - As a crew, attempt to submit flag for a Round 2 challenge -> verify HTTP 403 `These waters remain locked by the Admiralty!`.
   - As admin, unlock Round 2: `POST /api/admin/rounds/toggle` with `{"round": 2, "unlocked": true}` -> verify HTTP 200.
   - As crew, query `GET /api/config` -> verify `unlockedRounds: [1, 2]`.
   - Submit flag for Round 2 challenge -> verify HTTP 200 success.
   - As admin, lock Round 2 -> verify Round 2 is locked again.
3. **Round Names Verification**:
   - Check `GET /api/challenges` -> verify all riddles display `Round 1: Setting Sail`, `Round 2: High Seas`, `Round 3: Dead Man's Creek`, `Round 4: Treasure Island`.

### Manual / Browser Verification
1. Log in as a participant crew:
   - Navigate to Challenges: see the parchment background (`/challenges-bg.png`) and the 4 Treasure Map island stations (`/1.png`, `/2.png`, `/3.png`, `/4.png`) connected by red dashed trails.
   - Round 4 prominently displays the red **X** on Treasure Island.
   - Station 1 is active; Stations 2, 3, 4 show `🔒 LOCKED`.
   - Clicking Station 2 shows the locked alert.
2. In Admin Portal (`lostcode` / `ahoy-captain`):
   - Open the **Admiralty Round Control Deck**.
   - Click "Unlock Round 2".
   - Switch back to participant screen -> Station 2 instantly lights up as `CHARTED / ACTIVE` without page refresh via Socket.io!
3. Open Tournament Flow Modal:
   - Verify the uploaded `/treasure_map.png` parchment map displays clearly.
