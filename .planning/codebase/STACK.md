# Technology Stack

**Analysis Date:** 2026-04-14

## Languages

**Primary:**
- TypeScript (ES2022 target) — Frontend UI, Electron main process, build scripts
- Python 3.11 — Backend audio processing server

**Secondary:**
- CSS — Tailwind-based styling in `src/styles.css`
- Shell/Batch — Python bundling scripts (`scripts/build-python.sh`, `scripts/build-python.bat`)

## Runtime

**Frontend / Electron:**
- Node.js 20 (specified in CI and typical for Electron 35)
- Electron 35.0.3

**Backend:**
- Python 3.11 (CI target)
- Flask development server (Werkzeug)

**Package Manager:**
- npm (lockfile not tracked; CI removes `package-lock.json` before install)

## Frameworks

**Core Frontend:**
- React 19.2.4 — UI framework
- React DOM 19.2.4 — Root rendering in `index.tsx`

**Styling:**
- Tailwind CSS 4.2.2 — Utility-first CSS
- `@tailwindcss/postcss` 4.2.2 — PostCSS plugin for Tailwind v4
- Autoprefixer 10.4.27 — PostCSS autoprefixing

**Build / Dev:**
- Vite 6.2.0 — Frontend bundler and dev server
- `@vitejs/plugin-react` 5.0.0 — Fast Refresh and JSX transform
- TypeScript 5.8.2 — Type checking for both renderer and main processes

**Electron Tooling:**
- electron-builder 25.1.8 — Packaging and installer generation
- electron-updater 6.8.3 — Auto-updater framework

**Python Bundling:**
- PyInstaller — Builds standalone Python executable from `backend/server.spec`

## Key Dependencies

**Frontend Runtime:**
- `wavesurfer.js` 7.12.1 — Audio waveform visualization and region interaction
- `lucide-react` 0.574.0 — Icon library used across UI components
- `jszip` 3.10.1 — ZIP archive generation for batch exports
- `file-saver` 2.0.5 — Client-side file downloads

**Backend Runtime (Python):**
- Flask — HTTP API server
- `flask-cors` — CORS support (imported but manually controlled in code)
- `librosa` — Audio loading, feature extraction (MFCC, RMS), resampling
- `numpy` — Numerical arrays and operations
- `scikit-learn` — `KMeans`, `GaussianMixture`, `StandardScaler` for speaker clustering
- `soundfile` — Audio I/O fallback when librosa fails
- `scipy` — `medfilt`, `gaussian_filter1d` for signal smoothing
- `audioread` — Audio decoding backend abstraction

**Native / Binary:**
- `ffmpeg-static` 5.3.0 — Bundled FFmpeg binary for audio conversion and decoding

**Development Utilities:**
- `concurrently` 9.2.1 — Runs Python backend and Vite dev server together
- `@types/node`, `@types/file-saver` — TypeScript type definitions

## Configuration

**Environment:**
- No `.env` file usage detected in source
- Backend port determined at runtime: dynamic port (`--port 0`) in production; defaults to 5001 in development
- `BACKEND_URL` in `constants.ts` is empty string, letting `getApiBaseUrl()` resolve to Electron-provided localhost port or fallback `http://localhost:5001`

**Build Config Files:**
- `vite.config.ts` — Vite config with proxy rules for `/api` and `/convert` to `127.0.0.1:5001`
- `tsconfig.json` — Renderer process TS config (ES2022, bundler resolution, `@/*` alias)
- `electron/tsconfig.json` — Main process TS config (NodeNext module resolution, strict mode)
- `tailwind.config.js` — Tailwind content paths and font customization
- `postcss.config.js` — PostCSS plugin registration for Tailwind
- `electron-builder.yml` — Cross-platform packaging, code signing entitlements, publish target
- `backend/server.spec` — PyInstaller spec defining hidden imports, data files, FFmpeg inclusion, and excluded packages

## Platform Requirements

**Development:**
- Node.js 20+ and npm
- Python 3.9+ with pip
- macOS: `brew install ffmpeg` recommended
- Linux: `libsndfile1` and `ffmpeg` system packages

**Production Targets:**
- macOS — DMG and ZIP for arm64; hardened runtime with entitlements at `assets/entitlements.mac.plist`
- Windows — NSIS installer (`x64`, `ia32`) and portable executable (`x64`)
- Linux — AppImage and DEB for `x64`; DEB depends on `python3`, `python3-pip`, `ffmpeg`

---

*Stack analysis: 2026-04-14*
