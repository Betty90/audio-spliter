# Testing Patterns

**Analysis Date:** 2026-04-14

## Test Framework

**Runner:**
- No dedicated test runner configured in `package.json`
- No Jest, Vitest, Mocha, Cypress, or Playwright detected in dependencies
- Python: no pytest, unittest, or nose configuration found

**Assertion Library:**
- Not applicable — no tests exist

**Run Commands:**
```bash
npm run lint    # tsc --noEmit (type-checking only)
```

There is no `npm test`, `npm run test`, or equivalent script.

## Test File Organization

**Location:**
- No test files exist in the project source directories
- `.test.*` and `.spec.*` matches returned only files inside `node_modules/`

**Naming:**
- Not applicable

**Structure:**
- Not applicable

## What Is Tested vs Not Tested

**Tested:**
- Type-checking via `tsc --noEmit` (frontend only)
- Electron main process type-checking via `tsc -p electron/tsconfig.json`
- CI build verification via GitHub Actions (`.github/workflows/build.yml`)

**Not Tested:**
- No unit tests for React components
- No unit tests for utility functions (`utils/audioUtils.ts`, `utils/timeUtils.ts`)
- No unit tests for API service layer (`services/apiService.ts`)
- No unit tests for Electron main process (`electron/main.ts`, `electron/python-manager.ts`, `electron/updater.ts`)
- No integration tests between frontend and Python backend
- No Python tests for audio processing logic (`backend/server.py`)
- No end-to-end or UI automation tests
- No tests for build scripts (`scripts/build.js`, `scripts/build-python.sh`)

## CI Test Execution

**GitHub Actions Workflow:** `.github/workflows/build.yml`
- Triggers on version tags (`v*`) and manual dispatch
- Runs on macOS, Windows, and Ubuntu
- Steps performed:
  1. Install Node.js 20 and Python 3.11
  2. Install system dependencies (ffmpeg, libsndfile1)
  3. `npm install`
  4. `npm run build` (Vite frontend build)
  5. `npm run electron:build` (Electron TypeScript compilation)
  6. Build Python backend with PyInstaller
  7. Package with `electron-builder`
- **No test step is executed in CI**
- Windows build includes a runtime smoke test: starts `server.exe` for 10 seconds then kills it

## Gaps and Areas Lacking Tests

**Critical Gaps:**

1. **Audio Processing Logic (`backend/server.py`)**
   - The `process_audio()` function (~280 lines) performs MFCC extraction, GMM/KMeans clustering, silence detection, and segment merging
   - No tests verify correctness of speaker diarization output
   - No tests for edge cases: empty files, files shorter than `min_duration`, unsupported formats
   - No tests for FFmpeg integration (`convert_audio`, `export_segment`)

2. **Frontend State Management (`App.tsx`)**
   - File upload, analysis status transitions, segment updates, and settings persistence are untested
   - Drag-and-drop and clipboard paste handlers have no coverage

3. **API Service Layer (`services/apiService.ts`)**
   - `analyzeAudio`, `exportSegment`, `convertAudio` rely on `fetch`
   - No mocked tests for network failures, malformed JSON, or CORS errors
   - `getPythonPort()` Electron integration path is untestable without a browser/Electron environment

4. **Electron Main Process**
   - Python process spawning, restart logic, port parsing, and health checks in `electron/python-manager.ts` are untested
   - Auto-updater logic in `electron/updater.ts` is disabled but still present without tests

5. **Waveform and Canvas Rendering (`components/SplitterPage.tsx`)**
   - Custom canvas-based waveform visualization with drag/resize/selection interactions
   - No visual regression or interaction tests

6. **Build and Packaging Scripts**
   - `scripts/build.js` orchestrates complex cross-platform builds
   - `scripts/build-python.sh` / `build-python.bat` bundle Python with PyInstaller
   - No automated verification that packaged apps start correctly (only a partial Windows smoke test in CI)

## Recommended Test Additions

**Priority 1 — Python Backend:**
- Add pytest to `backend/requirements.txt` or dev dependencies
- Test `process_audio()` with synthetic audio inputs
- Test Flask route error handling and temp file cleanup

**Priority 2 — Frontend Utilities:**
- Add Vitest (lightweight, Vite-native) for testing `utils/timeUtils.ts`, `utils/audioUtils.ts`, and `services/apiService.ts`
- Mock `fetch` globally for API service tests

**Priority 3 — React Components:**
- Add `@testing-library/react` with Vitest or Jest
- Test `ConfirmDialog` rendering and interaction
- Test `AnalysisTable` selection and memoization logic

**Priority 4 — Electron:**
- Consider `vitest` with `happy-dom` or `playwright` for E2E smoke tests
- Validate packaged app startup on all three platforms in CI

---

*Testing analysis: 2026-04-14*
