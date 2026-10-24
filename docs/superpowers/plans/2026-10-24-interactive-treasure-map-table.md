# Implementation Plan: Interactive Treasure Map Table & Floating Challenge Window

Reconstruct the Challenges section in [`/vault/Projects/Lost-Code`](file:///vault/Projects/Lost-Code) into an interactive **Treasure Map on the Pirate Table** matching the user's reference images (`uploaded_media_0_1792827723156.png` and `uploaded_media_1_1792827723156.png`).

---

## Goal Description
The user wants the Challenges section to be the actual pirate table with the rolled-out parchment map (`/challenges-bg.png`), where:
1. **Interactive Islands on Map (Closed State):**
   - The 4 island artworks (`/1.png`, `/2.png`, `/3.png`, `/4.png`) are positioned in 2D space directly on the parchment map:
     - **Island ① (Top-Left):** Round 1: Setting Sail (10 Teams • 10 Riddles • All Hands Advance)
     - **Island ② (Top-Right):** Round 2: High Seas (2 Groups of 5 • 6 Riddles • 4 Walk the Plank)
     - **Island ③ (Bottom-Left):** Round 3: Dead Man's Creek (2 Groups of 3 • 2 Riddles • 4 Walk the Plank)
     - **Island ④ (Bottom-Right):** Round 4: Treasure Island (1 v 1 Showdown • 1 Riddle • Winner Plunders Bounty)
   - Connecting red dotted trails arch across the compass rose between the islands.
   - **Hover Bounce:** Hovering over any island triggers a playful pirate bounce animation (`@keyframes islandHoverBounce`) with a glowing drop-shadow.
2. **Floating Challenge Window (Opened State):**
   - Clicking an island opens the challenge window on the right side over the map (matching `uploaded_media_1_1792827723156.png`):
     - Nautical crosshair icon + Riddle Title
     - Subtitle: `ROUND X: [Round Name] // RIDDLE Y // [DIFFICULTY] // [POINTS] POINTS`
     - Sleek riddle selector strip (for rounds with multiple riddles like Round 1 [10 riddles] and Round 2 [6 riddles]) with solve checkmarks (`✓`)
     - Captain's brief (Round 1 only)
     - Quartermaster's Hint box with unlock button & escalating deduction (-5, -10, -15...)
     - Submit Flag box with input placeholder `lostcode{___________________________}` and dark teal `[ SUBMIT FLAG ]` button
     - Close button `[x]` at top-right to dismiss and return to the open map view.
3. **Admiralty Lock Preservation:**
   - If a round is locked by the Admiralty, its island displays a `🔒 LOCKED` badge.
   - Clicking a locked island shows the pirate warning (*"Arr! Island X remains locked by the Admiralty! Stand by for the Captain's signal."*), while admin (`lostcode`) can freely inspect any island.

---

## User Review Required

> [!IMPORTANT]
> - **Visual Reference Alignment:**
>   - Closed View matches [`uploaded_media_0_1792827723156.png`](file:///home/c1ph3r/.gemini/antigravity-cli/brain/8b3fb594-a888-41d6-80ee-06b382a6485d/.user_uploaded/uploaded_media_0_1792827723156.png): Full map on table, all 4 islands with parchment ribbon banners and red dotted route trails.
>   - Opened View matches [`uploaded_media_1_1792827723156.png`](file:///home/c1ph3r/.gemini/antigravity-cli/brain/8b3fb594-a888-41d6-80ee-06b382a6485d/.user_uploaded/uploaded_media_1_1792827723156.png): Island 1 & 3 visible on the left, challenge card on the right with hint, flag input, and close button.
> - **Riddle Navigation for Multi-Riddle Rounds:**
>   - Because Round 1 has 10 riddles, Round 2 has 6 riddles, and Round 3 has 2 riddles, the opened window will feature a clean riddle navigation bar (`[ Riddle 01 ] [ Riddle 02 ] ...`) so players can easily cycle through all riddles of the selected island without leaving the window.

---

## Proposed Changes

### 1. Challenges Section HTML (`private/dashboard.html`)

#### [MODIFY] [`private/dashboard.html`](file:///vault/Projects/Lost-Code/private/dashboard.html)
- Replace the current `#challenges-section` layout with the **Treasure Table Map Container** (`#treasureTableMapContainer`):
  ```html
  <section id="challenges-section" class="info-section" style="display: none; padding: 15px 0;">
    <div class="treasure-table-map" id="treasureTableMap">
      <!-- Background: /challenges-bg.png (Table with parchment map) -->
      
      <!-- SVG Red Dotted Trails connecting islands across compass rose -->
      <svg class="map-dotted-trails-svg" viewBox="0 0 1000 562" preserveAspectRatio="none">
        <path d="M 280,175 Q 480,120 680,225" class="red-trail-path" /> <!-- Island 1 -> 2 -->
        <path d="M 280,175 Q 260,260 305,340" class="red-trail-path" /> <!-- Island 1 -> 3 -->
        <path d="M 680,225 Q 700,300 680,390" class="red-trail-path" /> <!-- Island 2 -> 4 -->
        <path d="M 305,340 Q 490,440 680,390" class="red-trail-path" /> <!-- Island 3 -> 4 -->
      </svg>

      <!-- Island 1: Top-Left -->
      <div class="map-island-station" id="mapIsland1" onclick="openRoundIsland(1)">
        <img src="/1.png" alt="Round 1: Setting Sail" class="island-sprite" />
        <div class="island-banner">
          <span class="banner-badge">①</span>
          <div class="banner-text">
            <span class="banner-title">SETTING SAIL</span>
            <span class="banner-sub">10 TEAMS • 10 RIDDLES • 0 ELIM</span>
          </div>
        </div>
      </div>

      <!-- Island 2: Top-Right -->
      <div class="map-island-station" id="mapIsland2" onclick="openRoundIsland(2)">
        <img src="/2.png" alt="Round 2: High Seas" class="island-sprite" />
        <div class="island-banner">
          <span class="banner-badge">②</span>
          <div class="banner-text">
            <span class="banner-title">HIGH SEAS</span>
            <span class="banner-sub">2 GROUPS OF 5 • 6 RIDDLES</span>
          </div>
        </div>
      </div>

      <!-- Island 3: Bottom-Left -->
      <div class="map-island-station" id="mapIsland3" onclick="openRoundIsland(3)">
        <img src="/3.png" alt="Round 3: Dead Man's Creek" class="island-sprite" />
        <div class="island-banner">
          <span class="banner-badge">③</span>
          <div class="banner-text">
            <span class="banner-title">DEAD MAN'S CREEK</span>
            <span class="banner-sub">2 GROUPS OF 3 • 2 RIDDLES</span>
          </div>
        </div>
      </div>

      <!-- Island 4: Bottom-Right -->
      <div class="map-island-station" id="mapIsland4" onclick="openRoundIsland(4)">
        <img src="/4.png" alt="Round 4: Treasure Island" class="island-sprite" />
        <div class="island-banner">
          <span class="banner-badge">④</span>
          <div class="banner-text">
            <span class="banner-title">TREASURE ISLAND</span>
            <span class="banner-sub">1 v 1 FINAL SHOWDOWN</span>
          </div>
        </div>
      </div>

      <!-- Floating Challenge Window (Right-side Modal from Reference 2) -->
      <div class="map-challenge-window" id="mapChallengeWindow" style="display: none;">
        <button class="close-btn" onclick="closeChallengeWindow()" aria-label="Close window">&times;</button>
        
        <!-- Header -->
        <div class="window-header">
          <div class="window-title-wrap">
            <span class="target-crosshair-icon">⌖</span>
            <h3 id="windowChallengeTitle">WALK THE PLANK</h3>
          </div>
          <div class="window-subtitle" id="windowChallengeSubtitle">
            ROUND 4: TREASURE ISLAND // RIDDLE 1 // HARD // 1000 POINTS
          </div>
        </div>

        <!-- Riddle Selector Strip (for multi-riddle rounds) -->
        <div class="riddle-selector-strip" id="windowRiddleSelectorStrip" style="display: none;">
          <!-- JS injects pills: [ Riddle 1 ✓ ] [ Riddle 2 ] ... -->
        </div>

        <!-- Captain's Brief (Round 1 only) -->
        <div class="window-section" id="windowCaptainBriefSection" style="display: none;">
          <div class="window-section-title">CAPTAIN'S BRIEF</div>
          <div class="window-text" id="windowChallengeDescription"></div>
        </div>

        <!-- Quartermaster's Hint Box -->
        <div class="window-hint-box" id="windowHintBox">
          <div class="hint-header">
            <span class="hint-icon">🧭</span>
            <span>QUARTERMASTER'S HINT</span>
          </div>
          <div id="windowHintContent"></div>
        </div>

        <!-- Submit Flag Box -->
        <div class="window-flag-box">
          <div class="flag-header">
            <span class="flag-icon">⚑</span>
            <span>SUBMIT FLAG</span>
          </div>
          <input type="text" id="windowFlagInput" class="flag-input" placeholder="lostcode{___________________________}" autocomplete="off" />
          <button id="windowSubmitFlagBtn" class="window-submit-btn">SUBMIT FLAG</button>
          <p id="windowFlagResult"></p>
        </div>
      </div>
    </div>
  </section>
  ```

---

### 2. Styling & Bounce Animation (`private/styles.css`)

#### [MODIFY] [`private/styles.css`](file:///vault/Projects/Lost-Code/private/styles.css)
- **Map Container**:
  - `background: url('/challenges-bg.png') center center / cover no-repeat;`
  - Fixed 16:9 aspect ratio (`aspect-ratio: 16 / 9; max-width: 1360px; margin: 0 auto; border-radius: 8px; position: relative;`).
- **Island Stations Positioning**:
  - Island 1: `left: 28%; top: 31%; width: 25%;`
  - Island 2: `left: 68%; top: 39%; width: 21%;`
  - Island 3: `left: 30%; top: 61%; width: 25%;`
  - Island 4: `left: 68%; top: 70%; width: 21%;`
- **Island Hover Bounce**:
  ```css
  .map-island-station {
    position: absolute;
    transform: translate(-50%, -50%);
    cursor: pointer;
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.3s ease;
    z-index: 5;
    text-align: center;
  }
  .map-island-station:hover {
    animation: islandHoverBounce 1.2s infinite ease-in-out;
    filter: drop-shadow(0 20px 25px rgba(0, 0, 0, 0.7)) drop-shadow(0 0 15px rgba(201, 154, 82, 0.5));
    z-index: 15;
  }
  @keyframes islandHoverBounce {
    0%, 100% { transform: translate(-50%, -50%) scale(1.05); }
    50% { transform: translate(-50%, -58%) scale(1.08); }
  }
  ```
- **Parchment Banner**:
  - Styled with antique parchment ribbon gradient, dark brown pirate typography (`font-family: 'Cinzel', serif`), golden badges, and subtle drop shadow.
- **Floating Challenge Window**:
  - Exactly matching reference 2: `position: absolute; right: 4%; top: 50%; transform: translateY(-50%); width: 44%; max-width: 580px; max-height: 86%; background: rgba(18, 14, 10, 0.94); border: 1px solid rgba(201, 154, 82, 0.4); border-radius: 6px; box-shadow: 0 10px 40px rgba(0,0,0,0.85);`
  - When open, non-selected islands on the left dim (`opacity: 0.4;`), while the active island stays fully visible.
- **Teal Submit Button**:
  - `background: #2b5952; border: 1px solid #3d7a71; color: #fff; font-family: 'Cinzel', serif; font-weight: 700;`

---

### 3. Client JavaScript Logic (`private/dashboard.html`)

#### [MODIFY] [`private/dashboard.html`](file:///vault/Projects/Lost-Code/private/dashboard.html)
- `openRoundIsland(roundNum)`:
  - Checks if round is unlocked (or user is admin). If locked, alerts user with Admiralty pirate message.
  - Highlights the clicked island and dims the rest.
  - Fetches the riddles for this round.
  - Selects the first unsolved riddle (or first riddle) of this round.
  - Populates the challenge window and displays it with a smooth slide-in.
- `closeChallengeWindow()`:
  - Hides the challenge window.
  - Restores all islands to normal brightness.
- `selectWindowRiddle(category)`:
  - Switches the active riddle within the opened island, updating the brief, hint, and flag submission form.
- Wires flag submission and hint unlocking to the existing backend API endpoints.

---

## Verification Plan

### Automated Tests
1. **Syntax Check**:
   ```bash
   node -c /vault/Projects/Lost-Code/server.js
   ```
2. **Asset Check**:
   Ensure `challenges-bg.png`, `1.png`, `2.png`, `3.png`, `4.png` load with HTTP 200 via curl.
3. **API & Lock Check**:
   Test flag submission on locked vs unlocked rounds via curl.

### Manual Verification
1. Open the dashboard on `http://localhost:3000`.
2. Navigate to **Challenges**.
3. Verify the screen displays the pirate table with the rolled-out parchment map (`challenges-bg.png`).
4. Verify the 4 islands are positioned at their exact 2D locations with red dotted trails connecting them.
5. Hover over each island: verify the island **bounces** smoothly with golden drop shadow.
6. Click on Island 4: verify the **Challenge Window** opens on the right side over the map (matching Reference Image 2).
7. Click on Island 1: verify the Challenge Window opens with the riddle selector strip allowing switching between riddles 1 to 10.
8. Click `[x]`: verify the window closes and the map view is restored.
9. Verify locked islands show lock badges and block unauthorized submissions.
