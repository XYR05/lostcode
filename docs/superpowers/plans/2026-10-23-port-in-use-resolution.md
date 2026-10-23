# Implementation Plan: Resolve EADDRINUSE Port 3000 Conflict

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release port 3000 by terminating the background agent task (`node server.js`) so that the user's terminal/nodemon process can bind to port 3000 without crashing, and make `server.js` support `process.env.PORT || 3000` with graceful error logging.

---

## User Review Required

> [!IMPORTANT]
> **Root Cause:**
> The agent had earlier started a background daemon task (`task-755`, PID 157583) running `node server.js` on port 3000. When you launched `nodemon` in your own terminal, Node encountered `EADDRINUSE: address already in use :::3000`.
>
> **Proposed Action:**
> 1. Immediately terminate background task `task-755` (and any orphaned processes on port 3000) so your `nodemon` can immediately claim port 3000 and restart cleanly.
> 2. Update `server.js` to use `const PORT = process.env.PORT || 3000;` and add a graceful `server.on('error', ...)` handler that explains the issue clearly if port 3000 is occupied in the future.

---

## Proposed Changes

### Component 1: Background Process Management
- Terminate agent background task `8b3fb594-a888-41d6-80ee-06b382a6485d/task-755`.
- Verify port 3000 is completely freed (`lsof -i :3000`).

### Component 2: Configurable Port & Graceful Error Handling (`server.js`)

#### [MODIFY] `server.js`
- Update line 875:
```diff
- const PORT = 3000;
+ const PORT = process.env.PORT || 3000;
```
- Add server error handler before `server.listen`:
```javascript
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\x1b[31m[ERROR]\x1b[0m Port ${PORT} is already in use by another process.`);
    console.error(`To free port ${PORT}, run: fuser -k ${PORT}/tcp or lsof -ti :${PORT} | xargs kill -9`);
    process.exit(1);
  } else {
    throw err;
  }
});
```

---

## Verification Plan

### Automated Checks
1. Confirm background task is terminated via `manage_task list`.
2. Confirm port 3000 is unblocked via `lsof -i :3000`.
3. Check `node -c /vault/Projects/Lost-Code/server.js`.
4. Run nodemon / your local server command to verify successful binding on port 3000.
