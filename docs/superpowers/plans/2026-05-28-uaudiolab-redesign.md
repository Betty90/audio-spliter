# UAudioLab Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Electron-first redesign from the three `img/` drafts, excluding top global search and user menu.

**Architecture:** Add shared desktop shell components and Electron file-library services, then migrate analysis, splitter, and converter into the shared layout. Keep backend changes focused on conversion parameters and safe output behavior.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, lucide-react, wavesurfer.js, Electron IPC, Flask, ffmpeg.

---

### Task 1: Persist The Spec And Guard Interfaces

**Files:**
- Create: `docs/superpowers/specs/2026-05-28-uaudiolab-redesign-design.md`
- Create: `docs/superpowers/plans/2026-05-28-uaudiolab-redesign.md`
- Modify: `.gitignore`
- Create: `tests/test_redesign_interfaces.py`

- [ ] Add `.superpowers/` to `.gitignore`.
- [ ] Add tests that assert the Electron preload exposes the planned IPC methods.
- [ ] Add tests that assert backend conversion command construction supports allow-listed advanced options.
- [ ] Run `python3 -m unittest tests.test_redesign_interfaces` and confirm it fails before implementation.

### Task 2: Add Electron Local File Services

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.js`
- Modify: `global.d.ts`

- [ ] Add IPC handlers for selecting audio files and output directories.
- [ ] Add JSON persistence under `app.getPath('userData')`.
- [ ] Add file reads, saves with auto-rename, storage stats, and reveal-in-finder helpers.
- [ ] Run `npm run electron:build`.

### Task 3: Extend Shared Types And Renderer Services

**Files:**
- Modify: `types.ts`
- Modify: `services/apiService.ts`

- [ ] Add library, conversion, output, storage, and persisted-state interfaces.
- [ ] Make conversion requests use the shared `convertAudio` helper and append advanced settings.
- [ ] Run `npm run lint`.

### Task 4: Build Shared Desktop Shell

**Files:**
- Modify: `App.tsx`
- Modify: `components/AudioFileSidebar.tsx`
- Modify: `src/styles.css`

- [ ] Replace the old top-tab layout with the draft-style desktop shell.
- [ ] Keep the left library visible across analysis, splitter, and converter.
- [ ] Add library categories, favorites/trash state, storage stats, and upload actions.
- [ ] Preserve existing health warning, settings modal, and lab modal access.

### Task 5: Migrate Analysis Page

**Files:**
- Modify: `App.tsx`
- Modify: `components/AnalysisTable.tsx`
- Modify: `components/WaveformSidebar.tsx`

- [ ] Add summary cards and toolbar controls above the latency table.
- [ ] Restyle the table to match the draft density.
- [ ] Restyle the right waveform/segment panel to match the draft while preserving selection linkage.

### Task 6: Migrate Splitter Page

**Files:**
- Modify: `components/SplitterPage.tsx`

- [ ] Restyle the splitter as a draft-style waveform editor with file info, toolbar, mini overview, and right panels.
- [ ] Preserve upload, drag-select, region move/resize, playback, loop, channel export, and keyboard shortcuts.
- [ ] Add selected/all export affordances that use existing segment export behavior.

### Task 7: Migrate Converter Page And Backend

**Files:**
- Modify: `components/ConverterPage.tsx`
- Modify: `backend/server.py`

- [ ] Add queue metrics, recent files, output settings, and right-side conversion settings.
- [ ] Extend `/convert` to consume allow-listed advanced parameters.
- [ ] Use Electron output-directory helpers for downloads in packaged desktop mode.

### Task 8: Verify And Polish

**Files:**
- Modify as needed based on verification findings.

- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `npm run electron:build`.
- [ ] Run `python3 -m unittest discover -s tests`.
- [ ] Start `npm run dev` and visually check analysis, splitter, and converter at desktop and minimum supported sizes.
