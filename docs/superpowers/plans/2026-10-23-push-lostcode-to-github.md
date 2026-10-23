# Implementation Plan: Push Lost-Code to GitHub Repository `lostcode`

Create a new repository named **`lostcode`** under GitHub account **`c1ph3r-1337`**, track all necessary UI assets and prompt documentation, update the git remote, and push the complete project.

---

## User Review Required

> [!IMPORTANT]
> - **New Repository Name**: `lostcode` on GitHub (`c1ph3r-1337/lostcode`).
> - **Visibility**: Will be created as **Public** by default (standard for your CTF repositories, e.g. `CoreDump-CTF`). Please let me know if you prefer **Private** instead.
> - **Remote Redirection**: The local remote `origin` in `/vault/Projects/Lost-Code` currently points to `c1ph3r-1337/CoreDump-CTF.git`. It will be updated to point to `https://github.com/c1ph3r-1337/lostcode.git`.
> - **Asset Inclusion**: The `.gitignore` currently has `*.png` at line 19, which caused the newly added pirate assets (`1.png`, `2.png`, `3.png`, `4.png`, `challenges-bg.png`, `treasure_map.png`) to be ignored by default. We will whitelist `!public/*.png` and commit them so anyone cloning `lostcode` has complete, working visual assets.

---

## Proposed Execution Steps

### 1. Asset & `.gitignore` Alignment
- **Update [`.gitignore`](file:///vault/Projects/Lost-Code/.gitignore)**:
  - Whitelist public PNG images by adding `!public/*.png` right after `*.png`.
- **Stage Assets & Docs**:
  - `public/1.png` (Round 1: Setting Sail island)
  - `public/2.png` (Round 2: High Seas island)
  - `public/3.png` (Round 3: Dead Man's Creek island)
  - `public/4.png` (Round 4: Treasure Island)
  - `public/challenges-bg.png` (Challenges background parchment texture)
  - `public/treasure_map.png` (Parchment route flow map)
  - `prompt.md` (Lost Code Master Clue & Riddle prompt)
- **Commit**:
  - `chore: include public island assets, background texture, and master prompt`

---

### 2. GitHub Repository Creation
- Use GitHub CLI (`gh` authenticated as `c1ph3r-1337`):
  ```bash
  gh repo create lostcode --public --description "Lost Code - Pirate-Themed CTF Treasure Hunt Platform"
  ```

---

### 3. Remote Configuration & Push
- Update local repository remote:
  ```bash
  git -C /vault/Projects/Lost-Code remote set-url origin https://github.com/c1ph3r-1337/lostcode.git
  ```
- Push all local commits to `main` on the new GitHub repository:
  ```bash
  git -C /vault/Projects/Lost-Code push -u origin main
  ```

---

## Verification Plan

### Automated Verification
1. **GitHub CLI Inspection**:
   ```bash
   gh repo view c1ph3r-1337/lostcode --json name,owner,isPrivate,url,defaultBranchRef
   ```
2. **Git Remote Check**:
   ```bash
   git -C /vault/Projects/Lost-Code remote -v
   ```
3. **Remote Branch Sync**:
   ```bash
   git -C /vault/Projects/Lost-Code status
   ```
   *Expected: `Your branch is up to date with 'origin/main'.`*
4. **Asset Presence on GitHub**:
   Query GitHub API via `gh api repos/c1ph3r-1337/lostcode/contents/public` to confirm all island images and textures are present on GitHub.

### Manual Verification
- Visit `https://github.com/c1ph3r-1337/lostcode` in the browser to view the repository.
