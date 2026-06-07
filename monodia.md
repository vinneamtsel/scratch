# Monodia Feature - Integration Guide

AI chatbox feature for Scratch markdown notes app.

## Overview

Monodia is an AI chatbox feature that integrates with the Scratch markdown notes app. It uses OpenRouter API to provide AI assistance for notes, with per-note chat history persistence.

## Getting Started

### Initial Setup (One-time)

1. **Fork the repository:**
   - Go to https://github.com/ericli0927/scratch
   - Click "Fork" button
   - Clone YOUR fork: `git clone https://github.com/YOUR_USERNAME/scratch.git`

2. **Add upstream remote:**
   ```bash
   cd scratch
   git remote add upstream https://github.com/ericli0927/scratch.git
   ```

3. **Create monodia branch:**
   ```bash
   git checkout -b monodia
   ```

4. **Install dependencies:**
   ```bash
   npm install
   ```

## Development Workflow

### Daily Development
```bash
# Work on your feature
git checkout monodia
# ... make changes ...
git add .
git commit -m "Your message"
git push origin monodia
```

### Upgrading Base App & Reapplying Monodia

When the original Scratch project gets new updates:

**Step 1: Update base app (main branch)**
```bash
git checkout main
git fetch upstream
git merge upstream/main
# OR for cleaner history:
# git rebase upstream/main
```

**Step 2: Update monodia branch with new base**
```bash
git checkout monodia
git rebase main
# OR:
# git merge main
```

**Step 3: Verify build still works**
```bash
npm install
npm run build
```

**Step 4: Test the app**
```bash
npm run tauri dev
```

**Step 5: Push updated monodia**
```bash
git push origin monodia --force-with-lease
```

### Handling Conflicts

Common conflicts will be in:
- `src/components/editor/Editor.tsx`
- `src/components/settings/ToolsSettingsSection.tsx`
- `src-tauri/src/lib.rs`

**To resolve:**
1. Open conflicted file
2. Find conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
3. Keep monodia changes + add upstream changes
4. Remove conflict markers
5. `git add .`
6. `git rebase --continue`

**Easier alternative (merge instead of rebase):**
```bash
git checkout monodia
git merge main  # Creates merge commit, safer for beginners
```

## Key Integration Points

To apply monodia to a fresh Scratch copy, modify these files:

### New Files (copy these):
- `src/components/chatbox/AiChatbox.tsx` - Chatbox UI component
- `src/services/chatbox.ts` - OpenRouter API + history functions

### Modified Files (merge these):
- `src/components/icons/index.tsx` - Add `AiChatIcon`, `SendIcon`
- `src/types/note.ts` - Add `ChatboxSettings` interface
- `src/components/settings/ToolsSettingsSection.tsx` - Add `ChatboxSettingsSection`
- `src/components/editor/Editor.tsx` - Add AI Chat button
- `src/App.tsx` - Add chatbox state and rendering
- `src/App.css` - Add slide-in animation
- `src-tauri/src/lib.rs` - Add chat history commands

## Storage

- **Settings:** Stored in `.scratch/settings.json` (API key, model)
- **Chat history:** Stored in `.scratch/chatbox.json` (per-note messages)

## Known Limitations

1. **Note rename/move:** Chat history is tied to note ID (file path). Renaming/moving notes creates new IDs, losing history.

2. **Note ID stability:** The note ID is derived from the file path. When you rename or move a note, its ID changes.

## Future: CRDT Sync Infrastructure

Planned separate projects (not in this repo):
- `~/Projects/scratch-sync/` - Sync daemon
- `~/Projects/scratch-mobile/` - Mobile app
- `~/Projects/scratch-sync-server/` - Sync server

These will enable mobile access with offline support and real-time sync. The sync daemon will read notes from the existing folder, so it won't interfere with monodia or base app updates.

## Troubleshooting

**Build errors after rebase:**
```bash
npm install
npm run build
```

**Tauri build errors:**
```bash
cd src-tauri
cargo clean
cargo check
```

**Lost history after note operations:** This is expected - history is path-based. Consider not renaming/moving notes with important chat history.

**Chatbox not appearing:** Check Settings → Integrations → Chatbox for API key configuration.