# External Integrations

**Analysis Date:** 2026-04-14

## APIs & External Services

**No cloud APIs or SaaS services are used.** The application is fully offline/local.

## Native Dependencies

**FFmpeg:**
- Package: `ffmpeg-static` 5.3.0
- Purpose: Audio decoding, format conversion, segment export, and info probing
- Runtime discovery in `backend/server.py` (`setup_ffmpeg()`):
  - Searches bundled paths inside PyInstaller `_MEIPASS` or current working directory
  - Falls back to system `ffmpeg` in `PATH`
- Included in PyInstaller bundle via `backend/server.spec` as a data file

**Python Scientific Stack (bundled via PyInstaller):**
- `librosa`, `numpy`, `scikit-learn`, `scipy`, `soundfile`, `audioread`
- Built into a standalone executable (`server` / `server.exe`) deployed under Electron `resources/server`

## OS-Level Integrations

**File System:**
- Temporary upload folder: `/tmp/audio_uploads` on macOS/Linux; fallback to `audio_uploads` in CWD on Windows
- Electron logs written to OS-standard directories:
  - macOS: `~/Library/Logs/AudioSlicer/`
  - Windows: `%APPDATA%/AudioSlicer/logs/`
  - Linux: `~/.config/AudioSlicer/logs/`
- Log rotation: 7-day retention in `electron/logger.ts`

**Single Instance Lock:**
- `app.requestSingleInstanceLock()` in `electron/main.ts` prevents multiple app instances

**External URL Handling:**
- `shell.openExternal(url)` in main process opens links in the system default browser

**Clipboard:**
- Frontend listens to `paste` events to accept audio file drops from clipboard

**Drag & Drop:**
- Full drag-and-drop file upload support in the analyzer tab

## CI/CD & Deployment Pipeline

**GitHub Actions:**
- Workflow file: `.github/workflows/build.yml`
- Triggers: Git tags matching `v*` and manual `workflow_dispatch` with optional publish flag
- Matrix builds across `macos-latest`, `windows-latest`, `ubuntu-latest`

**Build Steps:**
1. Checkout code
2. Setup Node.js 20 and Python 3.11
3. Install system dependencies (`ffmpeg`, `libsndfile1`)
4. Install Node and Python dependencies
5. Build frontend (`npm run build`) and Electron main process (`npm run electron:build`)
6. Build Python backend with PyInstaller (`scripts/build-python.sh` / inline Windows batch)
7. Copy Python build output to `resources/server`
8. Package with `electron-builder` per platform
9. Publish to GitHub Releases when triggered by a version tag
10. Upload artifacts and create a draft release with auto-generated notes

**Secrets:**
- `GITHUB_TOKEN` — used by `electron-builder` publish and release asset upload

## Auto-Updater Mechanism

**Library:** `electron-updater` 6.8.3

**Implementation:** `electron/updater.ts`
- Configures `autoDownload = true` and `autoInstallOnAppQuit = true`
- Publishes to GitHub Releases (`provider: github` in `electron-builder.yml`)
- Owner: `Betty90`, repo: `audio-spliter`
- **Currently disabled on startup** — `checkForUpdatesOnStartup()` is a no-op that logs "Auto-updater is disabled"
- Manual update checks can be triggered via `checkForUpdates()` (not wired to UI in the current codebase)

## Third-Party SDKs or Tools

**No third-party analytics, crash reporting, or telemetry SDKs are integrated.**

**Notable tooling:**
- PyInstaller — Python executable bundler
- electron-builder — Electron packaging and updater orchestration
- `concurrently` — Local dev process orchestration

## Environment Configuration

**Required env vars (CI only):**
- `GITHUB_TOKEN` — For publishing releases and uploading assets
- `CSC_IDENTITY_AUTO_DISCOVERY=false` — Disables macOS code signing auto-discovery in CI

**Runtime configuration:**
- No `.env` file present or consumed by the application
- Backend port can be overridden via CLI `--port` or `PORT` environment variable

## Webhooks & Callbacks

**Incoming:** None

**Outgoing:** None

---

*Integration audit: 2026-04-14*
