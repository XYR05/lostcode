# [Remove Admiralty Expedition Law Banner] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the static `⚔️ ADMIRALTY EXPEDITION LAW` protocol banner bar from the top of `#challenges-section` in `private/dashboard.html` to provide an uncluttered, map-first interface.

**Architecture:** Remove lines 105–117 in `private/dashboard.html`. The tournament rules remain fully accessible via the existing `TOURNAMENT FLOW & RULES` action modal button and inside the interactive island challenge window (`#windowQuotaRule`), removing unnecessary visual redundancy.

**Tech Stack:** HTML5 / CSS3 / Vanilla JavaScript.

---

## User Review Required

> [!NOTE]
> The tournament rules and round cutoff quotas (`R1: 10 Crews Advance`, `R2: Top 3/5 Advance`, etc.) will still be fully visible:
> 1. In the **TOURNAMENT FLOW & RULES** popup modal (opened via the action bar button above the map).
> 2. Inside the **Island Challenge Window** banner (`#windowQuotaRule`) whenever an island icon is clicked.
>
> Removing this static banner bar cleans up the Challenges screen, allowing the interactive table map to sit immediately below the header.

---

## Proposed Changes

### Challenges Section View Cleanup

#### [MODIFY] `private/dashboard.html`
- Delete the `.expedition-protocol-banner` element (lines 105–117):
```html
    <!-- Expedition Orders & Field Protocol Bar -->
    <div class="expedition-protocol-banner" style="background: rgba(23,17,12,0.85); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 10px 16px; margin: 0 10px 14px 10px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
      <div style="display: flex; align-items: center; gap: 10px; font-size: 0.88rem;">
        <span style="color: var(--gold-primary); font-family: 'Cinzel', serif; font-weight: 700; letter-spacing: 0.05em;">⚔️ ADMIRALTY EXPEDITION LAW:</span>
        <span style="color: var(--text-secondary); font-size: 0.82rem;">10 Enlisted Crews • Physical Field Clues • Auto-Advancing Pre-Bound Riddles</span>
      </div>
      <div style="display: flex; gap: 8px; font-size: 0.75rem; font-family: 'JetBrains Mono', monospace; flex-wrap: wrap;">
        <span style="background: rgba(201,154,82,0.15); border: 1px solid var(--gold-primary); color: var(--gold-primary); padding: 3px 8px; border-radius: 3px;">R1: 10 Crews Advance</span>
        <span style="background: rgba(226,125,96,0.15); border: 1px solid #e27d60; color: #ff9e9e; padding: 3px 8px; border-radius: 3px;">R2: Top 3/5 per Group Advance</span>
        <span style="background: rgba(255,107,107,0.15); border: 1px solid #ff6b6b; color: #ff9e9e; padding: 3px 8px; border-radius: 3px;">R3: Top 1/3 per Group Advance</span>
        <span style="background: rgba(255,209,102,0.15); border: 1px solid #ffd166; color: #ffd166; padding: 3px 8px; border-radius: 3px;">R4: 1v1 Final Showdown</span>
      </div>
    </div>
```

---

## Verification Plan

### Automated Verification
1. **HTML & Syntax Validation**:
   - Extract and validate inline `<script>` blocks using Node `vm.Script` to guarantee 0 syntax errors.
   - Grep for `ADMIRALTY EXPEDITION LAW` across `/vault/Projects/Lost-Code` to ensure complete removal from the Challenges section.
2. **Server & Response Test**:
   - Verify `/dashboard` returns HTTP 200 and does NOT contain `expedition-protocol-banner`.
   - Verify `#treasureTableMap` and `.tournament-flow-btn` remain fully intact.

### Manual Verification
- Navigate to the **Challenges** tab:
  - Confirm the static law banner is gone.
  - Confirm the interactive table map sits cleanly beneath the header.
  - Confirm clicking "TOURNAMENT FLOW & RULES" still opens the modal with the rules flowchart.
  - Confirm clicking an island icon still displays the round quota rule in the island challenge window.
