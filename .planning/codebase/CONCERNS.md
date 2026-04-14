# Codebase Concerns

**Analysis Date:** 2026-04-14

## Security Considerations

### CORS and Network Exposure
- **Issue:** The Flask backend in `backend/server.py` binds to `0.0.0.0` (all interfaces) on both dynamic and static ports.
- **Files:** `backend/server.py` (lines 792, 802)
- **Impact:** In development or if the Python executable is run standalone, the backend is exposed to the local network, not just localhost. Uploaded audio files and processing endpoints are reachable from other devices on the same network.
- **Fix approach:** Bind to `127.0.0.1` explicitly. The `0.0.0.0` binding appears unnecessary for a desktop app where the frontend is either Electron or a local Vite dev server.

### File Upload Security
- **Issue:** Uploaded files are saved to a predictable temp path (`/tmp/audio_uploads` or `audio_uploads` in CWD) using only a UUID prefix. There is no file size limit, extension validation, or malware scanning.
- **Files:** `backend/server.py` (lines 102-111, 506-511)
- **Impact:** Large files can fill disk space. Malicious filenames or path traversal in `file.filename` could theoretically be exploited (though `os.path.join` with UUID prefix mitigates this somewhat). The `UPLOAD_FOLDER` uses a global constant, creating a shared namespace.
- **Fix approach:** Add a maximum file size check (e.g., 500MB), sanitize filenames, and use `tempfile.mkdtemp()` for per-session upload directories.

### IPC and Preload Surface
- **Issue:** The Electron preload script (`electron/preload.js`) exposes a single IPC channel `get-python-port`. Context isolation is enabled and node integration is disabled, which is good.
- **Files:** `electron/preload.js`, `electron/main.ts` (lines 64-66)
- **Impact:** Low direct impact from the single channel, but the pattern is minimal. There is no validation or allowlist for which renderers can invoke this.
- **Fix approach:** Consider adding an origin check or limiting the API to specific windows if the surface expands.

### Executable Spawning
- **Issue:** `electron/python-manager.ts` spawns a Python executable using a path constructed from `process.resourcesPath`. In dev mode, it falls back from `python` to `python3` using nested try/catch blocks that catch spawn errors.
- **Files:** `electron/python-manager.ts` (lines 119-142)
- **Impact:** If the bundled executable is compromised or replaced, the app will run it with user privileges. The fallback logic could mask misconfigurations.
- **Fix approach:** Verify the executable signature or hash in production. Ensure the fallback logic logs clearly and does not silently execute unexpected binaries.

### FFmpeg Path and Permissions
- **Issue:** `setup_ffmpeg()` in the Python backend attempts to `chmod` any found FFmpeg binary to add execute permissions.
- **Files:** `backend/server.py` (lines 60-68)
- **Impact:** Modifying permissions on files inside `node_modules` or bundled resources is a side effect that could fail or be exploited if the path is controlled.
- **Fix approach:** Bundle FFmpeg with correct permissions at build time rather than runtime.

### Subprocess Shell Usage
- **Issue:** The build script `scripts/build.js` passes `shell: true` (or `shell: IS_WINDOWS`) to `spawn` and `execSync`.
- **Files:** `scripts/build.js` (lines 40-45, 61-68)
- **Impact:** If any user-controlled input were injected into commands, this would be a shell injection vector. Currently the inputs are hardcoded, but the pattern is risky.
- **Fix approach:** Avoid `shell: true` where possible. Use array arguments and `spawn` without shell.

### Error Traceback Exposure
- **Issue:** The `/upload` endpoint in `backend/server.py` returns full Python tracebacks in the JSON error response.
- **Files:** `backend/server.py` (lines 536-540)
- **Impact:** Internal file paths, dependency versions, and code structure are leaked to any client that can trigger an error.
- **Fix approach:** Log the traceback server-side, but return a generic error message to the client.

---

## Performance Concerns

### Blocking Audio Processing
- **Issue:** The `/upload`, `/convert`, and `/export_segment` endpoints run CPU-intensive and I/O-bound operations (librosa feature extraction, K-Means/GMM clustering, FFmpeg transcoding) synchronously on the main Flask thread.
- **Files:** `backend/server.py` (lines 114-406, 408-477, 543-677)
- **Impact:** A single large audio file can block the entire backend for minutes. The frontend health checks will fail or timeout. Concurrent requests are effectively serialized and may starve.
- **Fix approach:** Offload processing to a background worker thread or process pool (e.g., `concurrent.futures.ProcessPoolExecutor`). Return a job ID and poll for completion.

### Memory Usage with Large Audio Files
- **Issue:** `librosa.load()` loads the entire audio file into memory as a NumPy array. For long files at high sample rates (e.g., 44100 Hz), this consumes significant RAM. The SplitterPage also loads the full file into an `AudioBuffer` and `Float32Array` channel data in the renderer process.
- **Files:** `backend/server.py` (line 135), `components/SplitterPage.tsx` (lines 104-114)
- **Impact:** Users processing multi-hour files will experience out-of-memory crashes in either the Python backend or the Electron renderer.
- **Fix approach:** Implement chunked/streaming processing in Python. In the frontend, avoid loading the entire decoded buffer into renderer memory for visualization; use `wavesurfer.js` with pre-generated peaks or chunked loading.

### Frontend Polling
- **Issue:** `App.tsx` polls the backend health endpoint every 30 seconds indefinitely.
- **Files:** `App.tsx` (lines 41-46)
- **Impact:** Negligible for a single user, but unnecessary network traffic when the app is idle.
- **Fix approach:** Back off polling when the window is not focused, or use an event-based health check after failures only.

### Canvas Rendering Bottleneck
- **Issue:** `SplitterPage.tsx` redraws the entire custom waveform canvas on every `requestAnimationFrame` tick and on every state change (zoom, region drag, playhead movement).
- **Files:** `components/SplitterPage.tsx` (lines 456-624)
- **Impact:** For long audio files with high zoom levels, the canvas width becomes extremely large (`duration * zoom`), causing browser layout thrashing and high CPU usage.
- **Fix approach:** Implement a virtualized canvas that only draws the visible viewport, or switch to `wavesurfer.js` (already a dependency) for the Splitter page as well.

---

## Maintenance Risks

### Dependency Version Pinning
- **Issue:** `backend/requirements.txt` lists packages without version constraints (`flask`, `librosa`, `numpy`, `scikit-learn`, etc.).
- **Files:** `backend/requirements.txt`
- **Impact:** CI builds and fresh installs will pull the latest versions, which may introduce breaking API changes (NumPy 2.x already caused ecosystem issues). The frontend also uses `^` ranges widely.
- **Fix approach:** Pin exact versions in `requirements.txt` and use a lockfile (e.g., `pip freeze` or `uv.lock`).

### Platform-Specific Build Complexity
- **Issue:** The build pipeline involves three separate build systems (Vite for frontend, tsc for Electron main, PyInstaller for Python) and platform-specific shell scripts (`scripts/build-python.sh`, `scripts/build-python.bat`).
- **Files:** `scripts/build.js`, `scripts/build-python.sh`, `.github/workflows/build.yml`
- **Impact:** The CI workflow has `continue-on-error: true` on Python build steps, meaning a broken backend build may not fail the pipeline. The Windows and Unix copy logic for `resources/server` is duplicated and fragile.
- **Fix approach:** Unify resource copying in `scripts/build.js`. Remove `continue-on-error: true` from critical build steps.

### Type Safety Gaps
- **Issue:** Multiple `any` types and `@ts-ignore` comments bypass TypeScript checks.
- **Files:**
  - `services/apiService.ts` (line 124: `s: any`)
  - `components/WaveformSidebar.tsx` (line 190: `@ts-ignore` for wavesurfer splitChannels)
  - `components/AnalysisTable.tsx` (line 216: `exportData: any[]`)
  - `components/SplitterPage.tsx` (line 106: `window as any`)
- **Impact:** Refactoring is error-prone. Runtime type mismatches in API responses or plugin options will not be caught at compile time.
- **Fix approach:** Define strict interfaces for API responses. Update `wavesurfer.js` types or contribute a patch for `splitChannels`.

### Deprecated GitHub Actions
- **Issue:** `.github/workflows/build.yml` uses `actions/create-release@v1`, which is deprecated and unmaintained.
- **Files:** `.github/workflows/build.yml` (line 204)
- **Impact:** The workflow may break without warning when GitHub retires the action.
- **Fix approach:** Migrate to `softprops/action-gh-release` or use `gh release create` directly.

---

## Known Issues and TODOs

### Disabled Auto-Updater
- **Issue:** `checkForUpdatesOnStartup()` in `electron/updater.ts` is explicitly disabled to prevent GitHub 404 errors.
- **Files:** `electron/updater.ts` (lines 133-140)
- **Impact:** Users will not receive automatic updates. The updater code is dead weight.
- **Fix approach:** Either configure `electron-builder` publish settings correctly and re-enable the updater, or remove the updater module entirely to reduce bundle size.

### Hardcoded Upload Path
- **Issue:** `UPLOAD_FOLDER` in `backend/server.py` hardcodes `/tmp/audio_uploads` and falls back to the current working directory on Windows.
- **Files:** `backend/server.py` (lines 102-111)
- **Impact:** On macOS, `/tmp` is cleared on reboot but shared across users. On Windows, the CWD fallback may be inside Program Files, causing permission errors.
- **Fix approach:** Use `tempfile.gettempdir()` and create a per-process subdirectory.

### Missing Cleanup for Exported Files
- **Issue:** The `/export_segment` and `/convert` endpoints do not delete the FFmpeg output temporary files after `send_file` streams them.
- **Files:** `backend/server.py` (lines 453-460, 656-661)
- **Impact:** The temp directory will accumulate exported audio files until the system cleans them up or disk space runs out.
- **Fix approach:** Use `flask.after_this_request` or a background thread to delete the temp file after the response is sent.

### React Hook Dependency Warnings
- **Issue:** `WaveformSidebar.tsx` disables the `react-hooks/exhaustive-deps` ESLint rule for the WaveSurfer initialization effect.
- **Files:** `components/WaveformSidebar.tsx` (line 285)
- **Impact:** Missing dependencies (`zoom`, `file?.segments`) can cause stale closures or missed updates. The current code works by coincidence because `file?.id` and `channelCount` changes trigger re-initialization.
- **Fix approach:** Refactor the effect to use a stable initialization pattern and include all dependencies, or split into smaller effects.

---

## Build/Distribution Complexities

### PyInstaller Output Path Fragility
- **Issue:** The CI workflow checks three possible PyInstaller output directories (`py-dist/server`, `backend/dist/server`, `dist/server`) because the spec file and build script use different output roots.
- **Files:** `.github/workflows/build.yml` (lines 86-106), `backend/server.spec` (lines 42-43), `scripts/build-python.sh` (lines 24-25)
- **Impact:** Build artifacts can end up in unexpected locations, causing the packaged Electron app to ship without the Python backend.
- **Fix approach:** Standardize on a single output directory (e.g., `backend/dist/server`) and update all scripts to use it.

### ASAR Unpack Bloat
- **Issue:** `electron-builder.yml` sets `asarUnpack` for `backend/**/*`, `python-dist/**/*`, and `**/*.node`.
- **Files:** `electron-builder.yml` (lines 112-117)
- **Impact:** Unpacking large directories from the ASAR archive increases install size and slows down app startup because Electron must extract them at runtime.
- **Fix approach:** The Python backend is already copied to `extraResources` (`resources/server`), so `asarUnpack` for `backend/**/*` and `python-dist/**/*` is redundant and should be removed.

### Missing Windows Python Build Script
- **Issue:** `scripts/build.js` references `scripts/build-python.bat`, but only `scripts/build-python.sh` exists in the repository.
- **Files:** `scripts/build.js` (line 129)
- **Impact:** Local builds on Windows that invoke `node scripts/build.js --python` will skip the Python build silently.
- **Fix approach:** Create `scripts/build-python.bat` or unify the build logic in `build.js` using cross-platform Node APIs.

---

## Code Smells and Anti-Patterns

### Large Components
- **Issue:** `SplitterPage.tsx` is ~1000 lines and mixes UI rendering, canvas drawing, audio decoding, mouse event handling, keyboard shortcuts, and export logic.
- **Files:** `components/SplitterPage.tsx`
- **Impact:** The component is difficult to test and reason about. Canvas drawing logic is tightly coupled to React state.
- **Fix approach:** Extract the canvas logic into a custom hook or a dedicated class. Separate the export modal into its own component.

### Duplicate API Calling Logic
- **Issue:** `apiService.ts`, `audioUtils.ts`, and `ConverterPage.tsx` all construct `FormData` and call `fetch` independently.
- **Files:** `services/apiService.ts`, `utils/audioUtils.ts`, `components/ConverterPage.tsx`
- **Impact:** Error handling patterns (e.g., JSON parsing fallbacks, content-type checks) are inconsistent. `audioUtils.ts` hardcodes `BACKEND_URL` instead of using `getApiBaseUrl()`.
- **Fix approach:** Centralize all fetch logic in `apiService.ts` and provide helper functions for common patterns.

### Global State Mutation in Python
- **Issue:** `backend/server.py` mutates global variables (`FFMPEG_BINARY`, `UPLOAD_FOLDER`, `os.environ["PATH"]`).
- **Files:** `backend/server.py` (lines 98, 74, 102-111)
- **Impact:** State leaks between requests. In a multi-threaded or multi-process deployment, this would be a race condition. Even in the single-threaded Flask dev server, it makes testing and reasoning about behavior harder.
- **Fix approach:** Encapsulate configuration in a class or use Flask's `app.config`. Pass `ffmpeg_path` explicitly to subprocess calls.

### Silent Catch Blocks
- **Issue:** `logger.ts` has multiple empty `catch` blocks for logging failures.
- **Files:** `electron/logger.ts` (lines 38-41, 72-74, 87-89)
- **Impact:** If logging fails (e.g., disk full, permissions), the app gives no indication. Debugging startup issues becomes harder.
- **Fix approach:** At minimum, log logging failures to `console.error`.

---

## Error Handling Gaps

### No Request Timeout on Frontend
- **Issue:** `fetch` calls in `apiService.ts` and `audioUtils.ts` do not use `AbortController` or timeout options.
- **Files:** `services/apiService.ts`, `utils/audioUtils.ts`
- **Impact:** A hung backend request will leave the UI in an "analyzing" or "converting" state indefinitely.
- **Fix approach:** Wrap all API calls in a timeout utility using `AbortController`.

### Backend Returns 500 with Tracebacks
- **Issue:** As noted above, internal errors return full tracebacks to the client. This is both a security and UX issue.
- **Files:** `backend/server.py` (lines 531-540)
- **Fix approach:** Return a generic 500 message and log details server-side.

### Missing Validation for Numeric Parameters
- **Issue:** `numSpeakers`, `sampleRate`, `smoothingWidth`, etc. are parsed from form data without range validation.
- **Files:** `backend/server.py` (lines 493-503)
- **Impact:** A `sampleRate` of `0` or a negative `minDuration` will cause cryptic NumPy/librosa errors later in processing.
- **Fix approach:** Add explicit range checks immediately after parsing and return a 400 with a clear message.

### Python Process Restart Loop
- **Issue:** `python-manager.ts` will attempt to restart the Python backend up to 3 times with exponential backoff. If it ultimately fails, it shows a dialog but does not always propagate the error to the renderer.
- **Files:** `electron/python-manager.ts` (lines 97-261)
- **Impact:** The renderer may be left with a stale or null port, causing API calls to fail with confusing network errors.
- **Fix approach:** Emit an IPC event to the renderer when the backend is permanently unavailable, and update the UI to a fatal-error state.

---

*Concerns audit: 2026-04-14*
