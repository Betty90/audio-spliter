# Codebase Structure

**Analysis Date:** 2026-04-14

## Directory Layout

```
/Users/fanwendi/work/vibe_coding/audio-spliter/
├── .github/           # GitHub Actions CI workflows
├── .planning/         # GSD planning documents (this directory)
├── .vscode/           # VS Code workspace settings
├── .vite/             # Vite dependency cache
├── assets/            # Static assets for Electron packaging
├── backend/           # Python Flask backend source and build artifacts
├── components/        # React UI components
├── dist/              # Vite frontend build output
├── electron/          # Electron main process TypeScript source
├── electron/dist/     # Compiled Electron main process JS
├── node_modules/      # npm dependencies
├── python-dist/       # PyInstaller Python backend build output
├── release/           # electron-builder installer output
├── resources/         # Extra resources bundled into the app
│   └── server/        # Bundled Python backend executable
├── scripts/           # Build and packaging scripts
├── services/          # Frontend API service layer
├── src/               # Shared frontend styles
├── utils/             # Frontend utility functions
├── App.tsx            # Root React component
├── index.html         # Vite HTML entry point
├── index.tsx          # React root mount
├── types.ts           # Shared TypeScript interfaces
├── constants.ts       # Frontend constants and defaults
├── package.json       # Node project manifest
├── tsconfig.json      # Frontend TypeScript config
├── vite.config.ts     # Vite dev/build configuration
├── electron-builder.yml # Electron packaging configuration
├── tailwind.config.js # Tailwind CSS configuration
└── postcss.config.js  # PostCSS configuration
```

## Directory Purposes

**`backend/`:**
- Purpose: Python Flask server and its packaging configuration.
- Contains: `server.py` (Flask app), `server.spec` (PyInstaller spec), `runtime_hook.py`, `requirements.txt`, build/dist subdirectories.
- Key files: `backend/server.py`, `backend/server.spec`, `backend/requirements.txt`

**`components/`:**
- Purpose: React functional components that make up the UI.
- Contains: `.tsx` files for each major view or modal.
- Key files: `components/App.tsx` (root), `components/WaveformSidebar.tsx`, `components/AnalysisTable.tsx`, `components/SplitterPage.tsx`, `components/ConverterPage.tsx`, `components/SettingsModal.tsx`, `components/LabModal.tsx`, `components/ConfirmDialog.tsx`

**`electron/`:**
- Purpose: Electron main process source code.
- Contains: TypeScript files for window management, Python process management, auto-updater, logger, and compiled output in `electron/dist/`.
- Key files: `electron/main.ts`, `electron/python-manager.ts`, `electron/updater.ts`, `electron/logger.ts`, `electron/preload.js`, `electron/tsconfig.json`

**`scripts/`:**
- Purpose: Build orchestration and helper scripts.
- Contains: Node.js build script and platform-specific shell/batch scripts for Python bundling.
- Key files: `scripts/build.js`, `scripts/build-python.sh`, `scripts/build-python.bat`

**`services/`:**
- Purpose: Frontend HTTP client and backend communication abstraction.
- Contains: API service functions.
- Key file: `services/apiService.ts`

**`utils/`:**
- Purpose: Pure helper functions used across the frontend.
- Contains: Time formatting and audio extraction helpers.
- Key files: `utils/timeUtils.ts`, `utils/audioUtils.ts`

**`src/`:**
- Purpose: Global frontend styles.
- Contains: Tailwind CSS import and custom scrollbar styles.
- Key file: `src/styles.css`

**`assets/`:**
- Purpose: Static assets required by electron-builder.
- Contains: App icons (`.icns`, `.ico`, `.png`), macOS entitlements plist, NSIS installer script.
- Key files: `assets/icons/icon.icns`, `assets/icons/icon.ico`, `assets/entitlements.mac.plist`, `assets/nsis/installer.nsh`

**`resources/`:**
- Purpose: Runtime resources copied into the packaged app by electron-builder.
- Contains: `resources/server/` — the PyInstaller-built Python backend executable that Electron copies at build time.

## Key File Locations

**Entry Points:**
- `index.html` — Vite HTML entry point; loads `src/styles.css` and `/index.tsx`.
- `index.tsx` — React application bootstrap; mounts `<App />` into `#root`.
- `App.tsx` — Root React component; holds global state and tab router.
- `electron/main.ts` — Electron main process entry point.
- `electron/dist/main.js` — Compiled Electron main entry point (referenced by `package.json` `"main"`).
- `backend/server.py` — Python Flask backend entry point.

**Configuration:**
- `package.json` — npm scripts, dependencies, and Electron main entry declaration.
- `tsconfig.json` — Frontend TypeScript configuration (ES2022, bundler resolution, `@/*` alias).
- `electron/tsconfig.json` — Electron main process TypeScript config (NodeNext, strict).
- `vite.config.ts` — Vite dev server config, proxy rules (`/api` → `5001`, `/convert` → `5001`), React plugin, path aliases.
- `electron-builder.yml` — Electron packaging config: output dir, extra resources, platform targets (DMG, NSIS, AppImage, DEB), code signing, updater publish config.
- `tailwind.config.js` — Tailwind CSS configuration.
- `postcss.config.js` — PostCSS configuration (Tailwind + autoprefixer).
- `backend/requirements.txt` — Python dependencies.
- `backend/server.spec` — PyInstaller specification for bundling the Python backend.

**Core Logic:**
- `backend/server.py` — Flask routes and audio ML processing (`process_audio`).
- `electron/python-manager.ts` — Python process spawn, port discovery, health checks, restart logic.
- `services/apiService.ts` — Frontend HTTP client for all backend endpoints.

**Testing:**
- Not detected. No test files, Jest config, or Vitest config were found in the repository.

## Naming Conventions

**Files:**
- React components: PascalCase (`WaveformSidebar.tsx`, `AnalysisTable.tsx`).
- Utility/service files: camelCase (`apiService.ts`, `timeUtils.ts`, `audioUtils.ts`).
- Configuration files: kebab-case or lowercase (`vite.config.ts`, `tsconfig.json`, `electron-builder.yml`).
- Build scripts: kebab-case (`build-python.sh`, `build-python.bat`).

**Directories:**
- Lowercase, descriptive (`components`, `services`, `utils`, `scripts`, `backend`, `electron`).

**TypeScript interfaces:**
- PascalCase, defined in `types.ts` (`AudioFile`, `AudioSegment`, `AppSettings`, `LatencyRow`).

## Where to Add New Code

**New Feature (new tab or major view):**
- Primary code: Create a new component in `components/MyFeature.tsx`.
- Integration: Import and render it inside `App.tsx` in the tab switcher.
- Types: If new domain models are needed, add them to `types.ts`.
- API: If backend communication is required, add service functions to `services/apiService.ts` and Flask routes to `backend/server.py`.

**New Component (reusable UI piece):**
- Implementation: `components/MyComponent.tsx`.
- Props interface: Co-located in the same file or in `types.ts` if shared.

**Utilities:**
- Shared helpers: `utils/myHelper.ts`.
- Import using the `@/` alias: `import { myHelper } from '@/utils/myHelper'`.

**Electron main process changes:**
- Source: `electron/*.ts`.
- Compile: Run `npm run electron:build` to output to `electron/dist/`.
- IPC additions: expose new channels in `electron/preload.js` and handle them in `electron/main.ts`.

**Backend endpoint:**
- Route handler: Add to `backend/server.py`.
- If the endpoint needs new audio processing logic, add a helper function above the route handlers or in a new module inside `backend/`.

## Special Directories

**`dist/`:**
- Purpose: Vite production build of the React frontend.
- Generated: Yes (by `vite build`).
- Committed: No (implied by standard practice; build artifact).

**`electron/dist/`:**
- Purpose: Compiled Electron main process JavaScript.
- Generated: Yes (by `npm run electron:build`).
- Committed: No (build artifact).

**`python-dist/`:**
- Purpose: PyInstaller output directory for the standalone Python backend.
- Generated: Yes (by `scripts/build-python.sh` or `scripts/build-python.bat`).
- Committed: No (build artifact).

**`release/`:**
- Purpose: Final packaged application installers (DMG, EXE, AppImage, DEB).
- Generated: Yes (by `electron-builder`).
- Committed: No (build artifact).

**`resources/server/`:**
- Purpose: Staging area for the Python backend executable that gets bundled into the Electron app.
- Generated: Yes (copied from `backend/dist/server` or `python-dist/server` by `scripts/build.js`).
- Committed: No (contains large binary artifacts).

---

*Structure analysis: 2026-04-14*
