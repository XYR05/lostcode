# Implementation Plan: Dynamic Challenge Window Docking & Faster Smoother Animations

Make the interactive table map animations significantly faster and smoother, and implement dynamic side docking for the floating challenge modal in [`/vault/Projects/Lost-Code`](file:///vault/Projects/Lost-Code):
- For islands on the **left** (Round 1 & Round 3) $\rightarrow$ open challenge window on the **right** (keeping the selected island visible on the left).
- For islands on the **right** (Round 2 & Round 4) $\rightarrow$ open challenge window on the **left** (keeping the selected island visible on the right).

---

## Goal Description

Currently:
1. The floating challenge window always docks on the right side (`right: 3%`), which obscures Islands 2 and 4 when the user clicks them.
2. The island hover bounce animation runs on a slow 1.2s cycle, and the window entrance and dash flow can be made much snappier and smoother with GPU acceleration (`will-change`).

This update accomplishes:
- **Context-Aware Dynamic Docking:**
  - Clicking **Island 1 (Top-Left)** or **Island 3 (Bottom-Left)** docks the window on the **RIGHT** with a right-to-left slide-in (`dock-right`).
  - Clicking **Island 2 (Top-Right)** or **Island 4 (Bottom-Right)** docks the window on the **LEFT** with a left-to-right slide-in (`dock-left`).
  - In both cases, the clicked island and its vertical neighbor remain completely unobstructed on their side of the table map.
- **Faster, Smoother Animations:**
  - Island hover bounce accelerated from `1.2s` to `0.75s` with an optimized sinusoidal cubic-bezier curve and `will-change: transform, filter`.
  - Modal window entrance accelerated from `0.3s` to `0.22s` with snappy deceleration (`cubic-bezier(0.16, 1, 0.3, 1)`).
  - Hover transitions made instantaneous and fluid (`0.2s`).

---

## User Review Required

> [!IMPORTANT]
> - **Docking Placement:**
>   - Island 1 (Setting Sail) & Island 3 (Dead Man's Creek) $\rightarrow$ Challenge Window on the **RIGHT**.
>   - Island 2 (High Seas) & Island 4 (Treasure Island ❌) $\rightarrow$ Challenge Window on the **LEFT**.
> - **Animation Speed:**
>   - Hover bounce reduced from `1.2s` to `0.75s` for a lively, responsive nautical feel.
>   - Window slide transition reduced to `0.22s` for immediate feedback upon clicking an island.
> - **Mobile/Tablet Fallback:**
>   - On screens $\le 900\text{px}$, the window automatically centers and takes 92% width for optimal usability.

---

## Proposed Changes

### 1. Styling & Animation Optimization (`private/styles.css`)

#### [MODIFY] [`private/styles.css`](file:///vault/Projects/Lost-Code/private/styles.css)

1. **Optimize Island Station & Hover Bounce:**
   - Add `will-change: transform, filter;` for hardware-accelerated 60/120fps rendering.
   - Adjust bounce cycle to `0.75s`:
     ```css
     .map-island-station {
       position: absolute;
       transform: translate(-50%, -50%);
       cursor: pointer;
       z-index: 10;
       text-align: center;
       display: flex;
       flex-direction: column;
       align-items: center;
       transition: transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1), filter 0.2s ease, opacity 0.25s ease;
       will-change: transform, filter;
     }

     .map-island-station:hover {
       animation: islandHoverBounce 0.75s infinite cubic-bezier(0.4, 0, 0.6, 1);
       filter: drop-shadow(0 18px 24px rgba(0, 0, 0, 0.8)) drop-shadow(0 0 18px rgba(201, 154, 82, 0.65));
       z-index: 25;
     }

     @keyframes islandHoverBounce {
       0%, 100% {
         transform: translate(-50%, -50%) scale(1.04);
       }
       50% {
         transform: translate(-50%, -56%) scale(1.07);
       }
     }
     ```

2. **Add Dynamic Docking Classes for Challenge Window:**
   - Define `.map-challenge-window.dock-right` and `.map-challenge-window.dock-left` with directional slide-in keyframes:
     ```css
     /* Default/Right Dock (for Left Islands 1 & 3) */
     .map-challenge-window.dock-right {
       right: 3%;
       left: auto;
       animation: windowSlideInRight 0.22s cubic-bezier(0.16, 1, 0.3, 1);
     }

     @keyframes windowSlideInRight {
       from {
         opacity: 0;
         transform: translateY(-50%) translateX(35px);
       }
       to {
         opacity: 1;
         transform: translateY(-50%) translateX(0);
       }
     }

     /* Left Dock (for Right Islands 2 & 4) */
     .map-challenge-window.dock-left {
       left: 3%;
       right: auto;
       animation: windowSlideInLeft 0.22s cubic-bezier(0.16, 1, 0.3, 1);
     }

     @keyframes windowSlideInLeft {
       from {
         opacity: 0;
         transform: translateY(-50%) translateX(-35px);
       }
       to {
         opacity: 1;
         transform: translateY(-50%) translateX(0);
       }
     }
     ```

---

### 2. Client Controller Logic (`private/dashboard.html`)

#### [MODIFY] [`private/dashboard.html`](file:///vault/Projects/Lost-Code/private/dashboard.html)

1. **In `openRoundIsland(roundNum)`:**
   - Determine if the selected island is on the left (`roundNum === 1 || roundNum === 3`).
   - Add `.dock-right` for left islands, or `.dock-left` for right islands:
     ```javascript
     const isLeftIsland = (roundNum === 1 || roundNum === 3);
     const win = document.getElementById('mapChallengeWindow');
     if (win) {
       win.classList.remove('dock-left', 'dock-right');
       win.classList.add(isLeftIsland ? 'dock-right' : 'dock-left');
       win.style.display = 'flex';
     }
     ```

2. **In `closeChallengeWindow()`:**
   - Clean up `.dock-left` and `.dock-right` classes on close.

3. **Bump stylesheet version:**
   - Update `<link rel="stylesheet" href="/dashboard-styles.css?v=22" />`.

---

## Verification Plan

### Automated Checks
1. Syntax validation:
   ```bash
   node -c /vault/Projects/Lost-Code/server.js
   ```
2. Verify CSS endpoints serve `.dock-left`, `.dock-right`, and `0.75s` bounce:
   ```bash
   curl -s http://localhost:3000/dashboard-styles.css | grep -E "dock-left|dock-right|0.75s"
   ```

### Manual Verification
1. Open `http://localhost:3000` in browser and go to **Challenges**.
2. **Hover Test:** Hover over Island 1, 2, 3, 4 $\rightarrow$ verify the bounce is noticeably faster, snappier (0.75s), and buttery smooth without lag.
3. **Left Island Click (Round 1):** Click Island 1 $\rightarrow$ verify Challenge Window slides in on the **RIGHT** side (`dock-right`). Island 1 remains visible on the left.
4. **Left Island Click (Round 3):** Click Island 3 $\rightarrow$ verify Challenge Window slides in on the **RIGHT** side (`dock-right`).
5. **Right Island Click (Round 2 & 4):** Click Island 2 or Island 4 $\rightarrow$ verify Challenge Window slides in on the **LEFT** side (`dock-left`). Island 2/4 remains visible on the right.
6. Commit and push to GitHub `c1ph3r-1337/lostcode`.
