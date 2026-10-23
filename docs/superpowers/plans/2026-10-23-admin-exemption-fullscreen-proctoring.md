# Implementation Plan: Complete Admin Exemption from Fullscreen & Proctoring

Ensure that the Admin account (`lostcode` / `team_admin_1`) is completely exempt from the pre-rules fullscreen alert, mandatory fullscreen enforcement, departure tracking, warning modals, and disqualification in [`/vault/Projects/Lost-Code`](file:///vault/Projects/Lost-Code).

---

## User Review Required

> [!IMPORTANT]
> - **Zero Modals for Admin**: When logging in as `lostcode`, the admin will **never** see:
>   - `#fullscreenNoticeModal` (Strict Proctoring Protocol / Fullscreen prompt)
>   - `#introModal` (Articles of the Expedition / Rules popup)
>   - `#proctorWarningModal` (Departure Warning)
>   - `#disqualifiedModal` (Disqualification Lockout)
> - **Direct Access**: The admin lands directly on the dashboard with the Admin Portal immediately available and fully unlocked, without being forced into fullscreen.
> - **Server-Side Injection**: `server.js` will inject `window.isAdminUser = true;` into `<head>` upon rendering `/dashboard` so the client knows the admin identity synchronously before any DOM scripts run.

---

## Proposed Changes

### 1. Server-Side Dashboard Render (`server.js`)

#### [MODIFY] [`server.js`](file:///vault/Projects/Lost-Code/server.js)
- In `GET /dashboard`:
  - When `isAdminSession(req)` is true, inject `<script>window.isAdminUser = true;</script>` into `<head>`.
  - This guarantees `window.isAdminUser` is set synchronously, eliminating race conditions before async API profile fetches complete.

---

### 2. Dashboard Frontend Logic (`private/dashboard.html`)

#### [MODIFY] [`private/dashboard.html`](file:///vault/Projects/Lost-Code/private/dashboard.html)
- **Immediate Admin Bypass in DOMContentLoaded**:
  - At the very start of the startup modal check:
    ```javascript
    if (window.isAdminUser) {
      if (noticeModal) noticeModal.style.display = 'none';
      if (introModal) introModal.style.display = 'none';
      if (document.getElementById('proctorWarningModal')) document.getElementById('proctorWarningModal').style.display = 'none';
      if (document.getElementById('disqualifiedModal')) document.getElementById('disqualifiedModal').style.display = 'none';
      proctoringArmed = false;
      return;
    }
    ```
- **Proctoring Event Handlers**:
  - Ensure all `fullscreenchange`, `visibilitychange`, and `blur` listeners exit immediately if `window.isAdminUser === true`.
- **Async Profile Fetch Safeguard**:
  - In `fetchProfile()`: if `data.isAdmin`, ensure `noticeModal.style.display = 'none'` and `proctoringArmed = false`.

---

## Verification Plan

### Automated Tests
1. **Syntax Check**:
   ```bash
   node -c /vault/Projects/Lost-Code/server.js
   ```
2. **Admin Dashboard HTML Inspection via curl**:
   - Log in as admin (`lostcode` / `ahoy-captain`).
   - Query `GET /dashboard`.
   - Verify `<script>window.isAdminUser = true;</script>` is present in the rendered HTML.
3. **Crew Dashboard HTML Inspection via curl**:
   - Query `GET /dashboard` as a participant crew.
   - Verify `<script>window.isAdminUser = true;</script>` is NOT present in the crew's rendered HTML.
4. **Backend Route Exemption**:
   - As admin, send `POST /api/proctor/violation` -> verify response is `{"ignored":true,"message":"Admin session exempt from proctoring."}`.

### Manual / Browser Verification
1. Log in with admin (`lostcode` / `ahoy-captain`).
2. Verify dashboard opens immediately with **NO** fullscreen prompt, **NO** rules modal, and **NO** proctoring alerts.
3. Admin can switch tabs, resize window, and exit fullscreen freely with zero warnings.
4. Log in with a regular crew (e.g. `BlackPearl`).
5. Verify regular crew still receives the mandatory fullscreen alert and is subject to proctoring rules.
