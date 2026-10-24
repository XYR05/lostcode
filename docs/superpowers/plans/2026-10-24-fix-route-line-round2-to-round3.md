# Implementation Plan: Fix Treasure Map Route Line from Round 2 to Round 3

Correct the SVG red dashed route line on the interactive Pirate Table Map in [`/vault/Projects/Lost-Code`](file:///vault/Projects/Lost-Code) so that the route leads sequentially from **Round 2 (High Seas)** to **Round 3 (Dead Man's Creek)** instead of Round 4.

---

## Goal Description

In the current interactive table map, an errant vertical line was connecting **Round 2 (Top-Right)** directly to **Round 4 (Bottom-Right)**.
Because the tournament progression is sequential:
1. **Round 1 (Setting Sail)** — Island 1 (Top-Left)
2. **Round 2 (High Seas)** — Island 2 (Top-Right)
3. **Round 3 (Dead Man's Creek)** — Island 3 (Bottom-Left)
4. **Round 4 (Treasure Island ❌)** — Island 4 (Bottom-Right)

The red dashed route line must guide crews along the actual progression path:
- **Leg 1:** Round 1 (Top-Left) $\rightarrow$ Round 2 (Top-Right)
- **Leg 2:** Round 2 (Top-Right) $\rightarrow$ Round 3 (Bottom-Left) *(Swooping across the central compass rose)*
- **Leg 3:** Round 3 (Bottom-Left) $\rightarrow$ Round 4 (Bottom-Right) *(Curving along the southern waters)*

The incorrect leg (Round 2 to Round 4) and redundant leg (Round 1 to Round 3) will be removed.

---

## User Review Required

> [!IMPORTANT]
> - **Visual Alignment with Reference:**
>   - The new Leg 2 curve follows the exact trajectory detected in your reference image ([`uploaded_media_0_1792827723156.png`](file:///home/c1ph3r/.gemini/antigravity-cli/brain/8b3fb594-a888-41d6-80ee-06b382a6485d/.user_uploaded/uploaded_media_0_1792827723156.png)): from Island 2 `(650, 220)`, sweeping across the center near the compass rose, and landing at Island 3 `(330, 345)`.
>   - After approval, changes will be applied, verified in the running server, and pushed to GitHub `c1ph3r-1337/lostcode`.

---

## Proposed Changes

### Challenges Table Map SVG

#### [MODIFY] [`private/dashboard.html`](file:///vault/Projects/Lost-Code/private/dashboard.html)

Update the `<svg class="map-dotted-trails-svg">` block inside `#treasureTableMap`:

```html
      <!-- SVG Red Dotted Trails connecting islands across compass rose -->
      <svg class="map-dotted-trails-svg" viewBox="0 0 1000 562" preserveAspectRatio="none">
        <!-- Leg 1: Round 1 (Setting Sail) to Round 2 (High Seas) -->
        <path d="M 280,180 Q 480,120 680,225" class="red-trail-path"></path>

        <!-- Leg 2: Round 2 (High Seas) to Round 3 (Dead Man's Creek) -->
        <path d="M 650,220 C 560,290 460,240 330,345" class="red-trail-path"></path>

        <!-- Leg 3: Round 3 (Dead Man's Creek) to Round 4 (Treasure Island) -->
        <path d="M 330,350 Q 500,440 680,395" class="red-trail-path"></path>
      </svg>
```

---

## Verification Plan

### Automated Checks
1. Verify node syntax:
   ```bash
   node -c /vault/Projects/Lost-Code/server.js
   ```
2. Verify dashboard markup:
   ```bash
   curl -s http://localhost:3000/dashboard | grep "red-trail-path"
   ```

### Visual & Manual Verification
1. Open `http://localhost:3000` in the browser and navigate to **Challenges**.
2. Inspect the red dotted route lines on the table map:
   - Verify line starts at Island 1 and arches across the top to Island 2.
   - Verify line leaves Island 2 and flows diagonally across the compass rose down to Island 3.
   - Verify line leaves Island 3 and curves along the bottom to Island 4.
   - Confirm there is NO vertical line between Island 2 and Island 4.
3. Commit and push to `c1ph3r-1337/lostcode` on GitHub.
