# Repository Guidelines

## Project Overview

AudioSlicer AI is an offline desktop audio slicing app. It combines a React 19 + TypeScript + Vite renderer, an Electron main process, and a Flask/Python audio-processing backend that uses librosa, scikit-learn, soundfile, scipy, and ffmpeg.

## Key Paths

- `App.tsx`, `index.tsx`, `components/`, `services/`, `utils/`, `types.ts`: renderer app code.
- `electron/`: Electron main process, preload bridge, Python process manager, and auto-update wiring.
- `backend/server.py`: Flask API and audio processing implementation.
- `backend/requirements.txt`: Python runtime dependencies.
- `scripts/build.js`, `scripts/build-python.sh`, `scripts/build-python.bat`: build orchestration.
- `tests/`: Python `unittest` coverage for backend/runtime integration details.
- `assets/`, `electron-builder.yml`: desktop packaging assets and configuration.

## Development Commands

- Install Node dependencies: `npm install`
- Install Python dependencies when running backend tests or backend locally: `python3 -m pip install -r backend/requirements.txt`
- Start web dev mode: `npm run dev`
  - Runs Flask backend on port `5001` and Vite on port `3000`.
  - Vite proxies `/api` and `/convert` to `http://127.0.0.1:5001`.
- Type-check renderer: `npm run lint`
- Build renderer: `npm run build`
- Build Electron main process: `npm run electron:build`
- Run Electron dev app: `npm run electron:dev`
- Package current platform: `npm run electron:pack`
- Package macOS: `npm run electron:pack:mac`
- Full build/package flow: `npm run build:all`
- Python backend bundle only: `npm run build:python`

## Test Commands

- Run all Python tests: `python3 -m unittest discover -s tests`
- Run a single test file: `python3 -m unittest tests.test_ffmpeg_resolution`
- Before claiming a change is complete, prefer at least:
  - `npm run lint` for TypeScript changes.
  - `python3 -m unittest discover -s tests` for backend/Electron packaging/runtime changes.
  - `npm run build` when renderer behavior or Vite config changes.
  - `npm run electron:build` when files under `electron/` change.

## Code Style Notes

- This project uses ESM (`"type": "module"`) for Node/TypeScript code.
- Frontend imports may use the `@/*` alias for repository-root paths.
- Electron TypeScript is stricter than renderer TypeScript; `electron/tsconfig.json` enables `strict`, unused checks, and no implicit returns.
- Keep renderer UI consistent with the existing component style: Tailwind utility classes, lucide-react icons, compact desktop-app layouts, and no broad visual restyling unless requested.
- Backend API behavior is currently concentrated in `backend/server.py`; keep audio-processing changes focused and add tests for path resolution, packaging assumptions, and edge cases.

## Runtime And Packaging Notes

- FFmpeg is expected from `node_modules/ffmpeg-static` first, with fallback to system `ffmpeg`.
- PyInstaller packaging may run under `sys._MEIPASS`; keep path logic compatible with bundled layouts.
- Build outputs such as `dist/`, `electron/dist/`, `release/`, `backend/dist/`, `backend/build/`, `resources/`, and `py-dist/` are generated artifacts.
- `AGENTS.md` is tracked and should stay current when project workflows change.

## Collaboration Notes

- Do not revert user changes or generated artifacts unless explicitly asked.
- Prefer small, targeted patches over broad refactors.
- If updating README instructions, note that Vite is configured for port `3000`.
- The repository currently contains empty files named `EOF`, `find`, and `ls`; treat them as pre-existing unless the user asks for cleanup.
