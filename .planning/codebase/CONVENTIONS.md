# Coding Conventions

**Analysis Date:** 2026-04-14

## Naming Patterns

**Files:**
- React components use PascalCase: `SplitterPage.tsx`, `WaveformSidebar.tsx`, `ConfirmDialog.tsx`
- Utility modules use camelCase: `audioUtils.ts`, `timeUtils.ts`, `apiService.ts`
- Entry points use lowercase: `index.tsx`, `main.ts`
- Constants file uses UPPER_SNAKE_CASE for exports: `constants.ts`

**Functions:**
- camelCase for all functions: `analyzeAudio`, `extractAudioSegment`, `getPythonPort`
- Async functions prefixed with action verbs: `analyzeAudio`, `exportSegment`, `waitForPython`
- Event handlers prefixed with `handle`: `handleFileUpload`, `handleDeleteFile`, `handleSegmentUpdate`
- Boolean getters prefixed with `is`: `isPythonReady`, `isShuttingDown`

**Variables:**
- camelCase for local variables: `audioFile`, `selectedFileId`, `isDragging`
- React state follows `[noun, setNoun]` pattern: `[files, setFiles]`, `[zoom, setZoom]`
- Refs use `Ref` suffix: `audioRef`, `canvasRef`, `wsFileIdRef`
- Constants at module level use UPPER_SNAKE_CASE: `PORT_TIMEOUT`, `MAX_RESTART_ATTEMPTS`, `PYTHON_START_TIMEOUT`

**Types/Interfaces:**
- Interfaces use PascalCase: `AudioSegment`, `AppSettings`, `AudioFile`
- Enums use PascalCase with UPPER_SNAKE_CASE values: `FileStatus.IDLE`, `FileStatus.ANALYZING`
- Props interfaces use `ComponentNameProps`: `SplitterPageProps`, `WaveformSidebarProps`
- Discriminated union types use `type` field: `DragState` with `type: 'none' | 'move' | 'resize-left' | 'resize-right'`

**Components:**
- Functional components typed as `React.FC<Props>`: `const App: React.FC = () => { ... }`
- Default export for page/feature components: `export default ConfirmDialog;`
- Named exports for utilities, types, and helper functions

## Code Style

**Formatting:**
- No Prettier configuration file detected; formatting relies on editor defaults
- No ESLint configuration file detected
- Python uses `ruff` (cache directory `.ruff_cache` present) but no explicit config file found
- Indentation is 2 spaces in TypeScript, 4 spaces in Python

**TypeScript Configuration:**
- Frontend: `tsconfig.json` with `"module": "ESNext"`, `"jsx": "react-jsx"`, `"moduleResolution": "bundler"`
- Electron: `electron/tsconfig.json` with `"module": "NodeNext"`, `"strict": true`, `"noUnusedLocals": true`, `"noImplicitReturns": true`
- Path alias `@/*` maps to `./*` in frontend

**Tailwind CSS:**
- Utility-first CSS with arbitrary values: `w-[100px]`, `z-[100]`
- Conditional classes use template literals with ternary operators
- Color scheme: slate/gray for UI, blue for primary actions, red for errors, amber for warnings

## Import Organization

**Order (observed pattern):**
1. React imports
2. Third-party libraries (lucide-react, wavesurfer.js, jszip, file-saver)
3. Internal types (`../types`)
4. Internal constants (`../constants`)
5. Internal utilities/services (`../utils/*`, `../services/*`)
6. Internal components (`../components/*`)

**Path Aliases:**
- `@/` mapped to project root in Vite and TypeScript
- Relative paths (`../`) used heavily in practice

**Python Imports:**
- Standard library first, then third-party, then local modules
- Flask app imports: `flask`, `librosa`, `numpy`, `sklearn`, `soundfile`, `scipy`

## Error Handling

**Frontend Patterns:**
- Try/catch around async operations with user-facing error messages in Chinese
- Network errors include diagnostic context (mixed content warnings, port info): `services/apiService.ts`
- Fallback values using `.catch(() => ({}))` for JSON parsing: `const errorData = await response.json().catch(() => ({}));`
- React error states stored in component state: `const [error, setError] = useState<string | null>(null);`

**Electron Patterns:**
- Process spawning wrapped in try/catch with fallback to `python3`: `electron/python-manager.ts`
- Dialog boxes for fatal errors: `dialog.showErrorBox('Python Server Error', ...)`
- Graceful shutdown on `SIGTERM`/`SIGINT`

**Python Patterns:**
- Try/except with `logging.error(..., exc_info=True)` in `backend/server.py`
- Cleanup in `finally` blocks for temp files
- Full traceback returned in 500 responses during development

## Type Safety Usage

**TypeScript Strictness:**
- Electron uses `strict: true` with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`
- Frontend tsconfig does NOT enable `strict` mode explicitly
- `any` is used occasionally: `rawSegments.map((s: any, index: number) => ...)` in `apiService.ts`
- `unknown` not widely used; `Error` types often inferred

**Type Patterns:**
- Discriminated unions for state machines: `DragState` in `SplitterPage.tsx`
- `Map` and `Set` used with explicit generic types: `new Set<string>()`
- Optional chaining and nullish coalescing: `file?.settings || settings`, `settings?.backendUrl`

**Global Type Augmentation:**
- `window.electron` API typed via ambient declarations (not visible in source files)

## Repeated Design Patterns

**State Management:**
- React hooks only; no Redux, Zustand, or Context API
- Lifted state in `App.tsx` for files, settings, and active selections
- Callback props drilled 1-2 levels deep

**Modal Pattern:**
- Modals controlled by `isOpen` boolean + `onClose` callback
- Internal `ConfirmConfig` state object for reusable confirm dialog

**File Upload Pattern:**
- Hidden `<input type="file">` triggered by button click
- `URL.createObjectURL(file)` for local preview
- `FormData` + `fetch` for backend upload

**Polling Pattern:**
- `setInterval` with cleanup in `useEffect` return: health check every 30s in `App.tsx`

**Python Backend Pattern:**
- Single Flask file (`backend/server.py`) with ~800 lines
- Routes return `jsonify(...)` with consistent error shape `{"error": "..."}`
- Temporary files via `tempfile.NamedTemporaryFile`

## Logging

**Electron:**
- Custom file logger in `electron/logger.ts`
- Platform-specific log directories (`~/Library/Logs/AudioSlicer`, `%APPDATA%/AudioSlicer/logs`)
- 7-day log retention

**Python:**
- Standard `logging` module with timestamp and level formatting

**Frontend:**
- `console.error` for debugging; no structured logging

---

*Convention analysis: 2026-04-14*
