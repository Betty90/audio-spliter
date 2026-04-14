# Architecture

**Analysis Date:** 2026-04-14

## Pattern Overview

**Overall:** Desktop Electron application with an embedded Python Flask backend. The architecture follows a **three-tier desktop app pattern**: Electron main process manages the application lifecycle and spawns the Python backend; the React renderer process serves as the frontend UI; the Python backend performs CPU-intensive audio processing.

**Key Characteristics:**
- **Hybrid stack:** TypeScript/React frontend + Python/Flask backend bundled into a single desktop installer.
- **Process isolation:** Python backend runs as a separate child process; the frontend communicates over HTTP (localhost).
- **Dynamic port allocation:** In production, the Python server binds to port `0` (dynamic) and advertises its port via stdout (`READY http://127.0.0.1:<port>`). The Electron main process captures this and exposes it to the renderer via preload IPC.
- **No persistent database:** Application state is held entirely in React component state; audio files are processed ephemerally with temp file storage.

## Layers

**Electron Main Process:**
- Purpose: Application shell, window management, Python lifecycle management, auto-updater.
- Location: `electron/main.ts`, `electron/python-manager.ts`, `electron/updater.ts`, `electron/logger.ts`
- Contains: BrowserWindow creation, single-instance lock, Python spawn/kill logic, update checks.
- Depends on: Node.js `child_process`, `electron-updater`, OS APIs.
- Used by: The OS launches this; it launches the renderer and Python backend.

**Renderer / Frontend:**
- Purpose: User interface for uploading audio, visualizing waveforms, reviewing analysis results, exporting segments, converting formats.
- Location: `App.tsx`, `components/`, `services/apiService.ts`, `utils/`
- Contains: React 19 functional components, hooks, `wavesurfer.js` integration, fetch-based API client.
- Depends on: Electron preload API (`window.electron.getPythonPort`), Python backend HTTP API, browser APIs (Blob, Canvas, Web Audio).
- Used by: Electron main process loads it into a BrowserWindow.

**Python Backend:**
- Purpose: Audio analysis (speaker diarization / segmentation), format conversion, segment export using FFmpeg.
- Location: `backend/server.py`, `backend/server.spec`, `backend/runtime_hook.py`
- Contains: Flask routes (`/health`, `/upload`, `/convert`, `/export_segment`, `/debug`), `librosa`/`sklearn` ML pipeline, FFmpeg orchestration.
- Depends on: Flask, librosa, numpy, scikit-learn, soundfile, scipy, audioread, FFmpeg binary.
- Used by: Frontend via HTTP; spawned and managed by Electron main process.

**Build / Packaging Layer:**
- Purpose: Orchestrates Vite build, TypeScript compilation for Electron, PyInstaller bundling of Python, and electron-builder packaging.
- Location: `scripts/build.js`, `scripts/build-python.sh`, `scripts/build-python.bat`, `electron-builder.yml`
- Contains: Node.js build orchestration, platform-specific Python build scripts, electron-builder config.

## Data Flow

**Audio Analysis Flow:**

1. User drags/drops or pastes audio files into the frontend (`App.tsx` `handleFileUpload`).
2. Frontend creates `AudioFile` objects with `blobUrl`, adds them to local React state (`files`), and triggers `analyze()`.
3. `services/apiService.ts` resolves the backend URL:
   - In packaged app: calls `window.electron.getPythonPort()` to get the dynamically assigned port.
   - In dev: falls back to `http://localhost:5001` or uses Vite proxy (`/api`).
4. API client POSTs `FormData` to `/upload` with analysis parameters (`numSpeakers`, `minSegmentDuration`, `silenceThreshold`, etc.).
5. Python backend (`backend/server.py`) saves the file to a temp directory (`/tmp/audio_uploads` or cwd fallback), runs `process_audio()`.
6. `process_audio()` loads audio with `librosa`, extracts MFCC + delta features, scales/smooths them, clusters with `GaussianMixture` (fallback to `KMeans`), applies median filtering and silence detection, then returns JSON segments.
7. Backend deletes the temp file and returns the segment array.
8. Frontend maps raw segments to `AudioSegment[]` (assigning IDs), updates the file status to `COMPLETED`, and renders the table in `AnalysisTable`.
9. If a file is selected, `WaveformSidebar` loads the audio via `wavesurfer.js` and renders `RegionsPlugin` overlays for each segment.

**Segment Export Flow:**

1. In `WaveformSidebar` or `SplitterPage`, user selects a region and clicks export.
2. Frontend calls `extractAudioSegment()` in `utils/audioUtils.ts`.
3. If the source is a `File`, it calls `/export_segment` on the Python backend with `start`, `end`, `output_filename`, and optional `channels`.
4. Backend runs FFmpeg to slice the segment, optionally downmixing to left/right channel, and returns the audio blob.
5. Frontend triggers a browser download via `URL.createObjectURL`.

**Format Conversion Flow:**

1. User navigates to the Converter tab (`ConverterPage`).
2. Frontend POSTs to `/convert` with the file and `targetFormat`.
3. Backend runs FFmpeg to transcode and returns the converted blob.
4. Frontend offers individual or ZIP batch download.

**State Management:**
- **No Redux or external state library.** All state is local React `useState` in `App.tsx`.
- Key state slices:
  - `files: AudioFile[]` — uploaded files and their analysis results.
  - `selectedFileId: string | null` — which file is active in the waveform sidebar.
  - `settings: AppSettings` — global default analysis settings.
  - `activeTab: 'analyzer' | 'converter' | 'splitter'` — current view.
- Per-file settings override: each `AudioFile` has an optional `settings` field. If present, analysis uses those instead of global settings.
- Health polling: `App.tsx` polls `/health` every 30 seconds via `useEffect` to show a backend connectivity banner.

## Key Abstractions

**AudioFile / AudioSegment:**
- Purpose: Core domain models for uploaded audio and detected speaker segments.
- Location: `types.ts`
- Pattern: Plain TypeScript interfaces; segments include `id`, `speaker`, `start`, `end`, optional `color` and `remark`.

**API Service:**
- Purpose: Encapsulates all HTTP communication with the Python backend.
- Location: `services/apiService.ts`
- Pattern: Async functions that resolve the backend URL (dynamic port in production), construct `FormData`, and handle fetch errors with user-friendly Chinese messages.
- Key exports: `analyzeAudio`, `exportSegment`, `exportSegmentWithOptions`, `convertAudio`, `checkHealth`.

**Python Manager:**
- Purpose: Abstracts Python process lifecycle, restart logic, and port discovery.
- Location: `electron/python-manager.ts`
- Pattern: Module-level singleton state (`pythonProcess`, `pythonPort`, `isReady`). Exponential backoff restart up to `MAX_RESTART_ATTEMPTS` (3). Parses `READY` message from stdout to discover the dynamic port.

**Waveform Sidebar:**
- Purpose: Interactive audio visualization and segment editing.
- Location: `components/WaveformSidebar.tsx`
- Pattern: Uses `wavesurfer.js` + `RegionsPlugin`. Regions are synced bidirectionally with `App.tsx` state via `onUpdateSegments`.

## Entry Points

**Electron Main:**
- Location: `electron/main.ts` (compiled to `electron/dist/main.js`)
- Triggers: OS launches the packaged executable.
- Responsibilities:
  - Enforce single instance lock.
  - Show a loading window while starting Python.
  - Spawn Python backend via `waitForPython()`.
  - Create the main BrowserWindow and load either `http://localhost:3001` (dev) or `dist/index.html` (prod).
  - Register IPC handler `get-python-port`.
  - Initialize auto-updater on window ready.
  - Cleanly kill Python on `before-quit` / `quit`.

**Frontend (Vite):**
- Location: `index.html` → `index.tsx` → `App.tsx`
- Triggers: Loaded by Electron BrowserWindow or served by Vite dev server.
- Responsibilities: Mount React root, render the main app shell, handle routing between analyzer/converter/splitter tabs.

**Python Backend:**
- Location: `backend/server.py`
- Triggers: Spawned by Electron main process (production) or run manually via `python backend/server.py` (development).
- Responsibilities: Start Flask server, expose REST endpoints, perform audio ML processing and FFmpeg operations.

## Error Handling

**Strategy:** Layered with user-facing messages in the frontend and file-based logging in the main process.

**Patterns:**
- **Frontend API errors:** `services/apiService.ts` catches fetch failures and throws descriptive `Error` objects (often in Chinese) that `App.tsx` displays in file status chips and a red banner.
- **Backend processing errors:** `backend/server.py` wraps `process_audio` in try/except, returns 500 with full traceback in JSON for debugging.
- **Python process failures:** `electron/python-manager.ts` detects crashes, attempts up to 3 restarts with exponential backoff, and shows native Electron `dialog.showErrorBox` if unrecoverable.
- **Logging:** `electron/logger.ts` writes rotating daily logs to platform-specific directories (e.g., `~/Library/Logs/AudioSlicer` on macOS) with 7-day retention.

## Cross-Cutting Concerns

**Logging:** File-based in Electron main (`electron/logger.ts`). Console + file output with `INFO`/`WARN`/`ERROR` levels. Python backend uses Python `logging` to stdout/stderr, which Electron main captures and logs.

**Validation:**
- Frontend: MIME type and extension checks in `App.tsx` and `SplitterPage`.
- Backend: Parameter type casting with `ValueError` guards in Flask route handlers.

**Authentication:** Not applicable. The app is a local desktop application with no user auth layer.

**CORS:** In development, Vite proxy handles cross-origin forwarding. In production, the frontend is served from `file://` and makes direct localhost HTTP calls; the backend does not use `flask-cors` (commented out) and relies on local-only access.

---

*Architecture analysis: 2026-04-14*
