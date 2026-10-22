# Lost Code Background Image Update Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure `/vault/Projects/Lost-Code/public/bg.png` as the atmospheric background image across the entire Lost Code platform (both authenticated dashboard and login/registration pages) while preserving crisp text contrast and panel readability.

**Architecture:** Express static middleware already serves the `public/` directory at `/`. Replacing the previous background path `/map-bg.png` with `/bg.png` in `private/styles.css` and `public/styles.css` will apply the image globally. The existing dark gradient overlay (`rgba(23, 17, 12, ...)`) is preserved so the warm pirate illustration shines through without compromising legibility.

**Tech Stack:** CSS3, Vanilla JavaScript, Express.js.

---

## Global Constraints
- Target workspace: `/vault/Projects/Lost-Code/` only. Do NOT touch `/vault/Projects/CTF-Dashboard/`.
- Maintain WCAG contrast standards for all text over panels and background.
- Keep background fixed with cover sizing to prevent distortion or tiling.

---

## Proposed Changes

### Task 1: Update CSS Background References

**Files to modify:**
- `private/styles.css` (Line 65)
- `public/styles.css` (Line 41)

- [ ] **Step 1:** In `private/styles.css`, update `body` background:
  ```css
  body {
    background: 
      linear-gradient(rgba(23, 17, 12, 0.72), rgba(23, 17, 12, 0.80)),
      url("/bg.png") center / cover fixed;
  ...
  ```
- [ ] **Step 2:** In `public/styles.css`, update `body` background:
  ```css
  body {
    ...
    background: 
      linear-gradient(rgba(23, 17, 12, 0.78), rgba(23, 17, 12, 0.84)),
      url("/bg.png") center / cover fixed;
  ...
  ```

---

### Task 2: Verification & Testing

- [ ] **Step 1:** Verify image accessibility and CSS file integrity using static syntax checking.
- [ ] **Step 2:** Start server temporarily (`PORT=3000 node server.js`) and perform curl requests to verify `/bg.png`, `/dashboard-styles.css`, and `/styles.css` are served with HTTP 200 OK and correct content types.
- [ ] **Step 3:** Commit the background update to git repository in `/vault/Projects/Lost-Code`.
