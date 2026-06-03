# Analysis Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the analysis screen's implicit right-panel overlay with a responsive inline/drawer layout that keeps center analysis content readable on small displays.

**Architecture:** `App.tsx` owns the analysis workspace shell and renders drawer chrome when the panel needs drawer behavior. `components/WaveformSidebar.tsx` owns waveform behavior and reports a concrete layout mode, `inline` or `drawer`, based on measured workspace width and panel width. Existing audio, segment, and table behavior stays unchanged.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind utility classes, lucide-react icons.

---

## File Structure

- Modify `App.tsx`: replace `isAnalysisSidebarOverlaying` with `analysisSidebarMode`, remove the fixed center-content width, and render a drawer backdrop when mode is `drawer`.
- Modify `components/WaveformSidebar.tsx`: add the `WaveformSidebarLayoutMode` type, replace `onOverlayChange` with `onLayoutModeChange`, calculate drawer width as `min(720px, 88vw)` while preserving the usable minimum when possible, and disable resize handle in drawer mode.
- No new runtime dependencies.

## Task 1: Introduce Explicit Sidebar Layout Mode

**Files:**
- Modify: `components/WaveformSidebar.tsx`
- Modify: `App.tsx`

- [ ] **Step 1: Confirm current typecheck baseline**

Run:

```bash
npm run lint
```

Expected: PASS before code changes, or existing unrelated errors documented before continuing.

- [ ] **Step 2: Add the layout mode type and prop**

In `components/WaveformSidebar.tsx`, replace the old overlay callback prop:

```ts
export type WaveformSidebarLayoutMode = 'inline' | 'drawer';

interface WaveformSidebarProps {
  file: AudioFile | null;
  onUpdateSegments: (fileId: string, segments: AudioSegment[]) => void;
  onClose: () => void;
  settings?: AppSettings;
  activeSegmentId?: string | null;
  onSegmentSelect?: (id: string | null) => void;
  onReanalyze?: (fileId: string) => void;
  onOpenSettings?: (fileId: string) => void;
  onLayoutModeChange?: (mode: WaveformSidebarLayoutMode) => void;
}
```

Update the component signature:

```ts
const WaveformSidebar: React.FC<WaveformSidebarProps> = ({
  file,
  onUpdateSegments,
  onClose,
  settings,
  activeSegmentId,
  onSegmentSelect,
  onReanalyze,
  onOpenSettings,
  onLayoutModeChange,
}) => {
```

- [ ] **Step 3: Update App imports and state**

In `App.tsx`, change the import:

```ts
import WaveformSidebar, { type WaveformSidebarLayoutMode } from './components/WaveformSidebar';
```

Replace:

```ts
const ANALYSIS_CONTENT_WIDTH = 800;
```

with:

```ts
const ANALYSIS_SIDEBAR_DRAWER_BACKDROP_CLASS =
  'absolute inset-0 z-10 bg-slate-950/10 backdrop-blur-[1px]';
```

Replace:

```ts
const [isAnalysisSidebarOverlaying, setIsAnalysisSidebarOverlaying] = useState(false);
```

with:

```ts
const [analysisSidebarMode, setAnalysisSidebarMode] = useState<WaveformSidebarLayoutMode>('inline');
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
npm run lint
```

Expected: FAIL only because `onOverlayChange` references still need to be replaced in later tasks, or PASS if all replacements were completed in this task.

## Task 2: Convert WaveformSidebar Overlay Logic Into Drawer Logic

**Files:**
- Modify: `components/WaveformSidebar.tsx`

- [ ] **Step 1: Add drawer width constants**

Near the existing width constants in `components/WaveformSidebar.tsx`, add:

```ts
const DRAWER_WIDTH = 720;
const DRAWER_VIEWPORT_WIDTH_RATIO = 0.88;
```

- [ ] **Step 2: Replace overlay calculations**

Replace:

```ts
const effectiveWidth = workspaceWidth > 0 ? Math.min(width, workspaceWidth) : width;
const shouldOverlay = workspaceWidth > 0 && workspaceWidth - effectiveWidth < MIN_ANALYSIS_CONTENT_WIDTH;
const panelPlacementClass = shouldOverlay ? 'absolute right-0 top-0 bottom-0' : 'relative';
```

with:

```ts
const inlineWidth = workspaceWidth > 0 ? Math.min(width, workspaceWidth) : width;
const layoutMode: WaveformSidebarLayoutMode =
  workspaceWidth > 0 && workspaceWidth - inlineWidth < MIN_ANALYSIS_CONTENT_WIDTH ? 'drawer' : 'inline';
const drawerTargetWidth =
  typeof window === 'undefined'
    ? Math.min(DRAWER_WIDTH, inlineWidth)
    : Math.min(DRAWER_WIDTH, Math.round(window.innerWidth * DRAWER_VIEWPORT_WIDTH_RATIO));
const effectiveWidth = layoutMode === 'drawer'
  ? Math.min(typeof window === 'undefined' ? drawerTargetWidth : window.innerWidth, Math.max(MIN_PANEL_WIDTH, drawerTargetWidth))
  : inlineWidth;
const panelPlacementClass =
  layoutMode === 'drawer'
    ? 'absolute right-0 top-0 bottom-0'
    : 'relative';
```

This keeps existing compact toolbar calculations based on `effectiveWidth`, while making the drawer mode explicit.

- [ ] **Step 3: Report layout mode to parent**

Replace:

```ts
useEffect(() => {
  if (onOverlayChange) onOverlayChange(shouldOverlay);
  return () => onOverlayChange?.(false);
}, [onOverlayChange, shouldOverlay]);
```

with:

```ts
useEffect(() => {
  onLayoutModeChange?.(layoutMode);
  return () => onLayoutModeChange?.('inline');
}, [layoutMode, onLayoutModeChange]);
```

- [ ] **Step 4: Disable resizing in drawer mode**

Replace the resize handle block with:

```tsx
{layoutMode === 'inline' && (
  <div
    className="absolute left-0 top-0 bottom-0 z-50 -ml-0.5 w-1.5 cursor-ew-resize transition-colors hover:bg-[var(--psbc-green)]"
    onMouseDown={(e) => {
      e.preventDefault();
      setIsResizing(true);
    }}
  />
)}
```

- [ ] **Step 5: Give drawer mode stronger separation**

Change the populated panel class expression to include drawer-specific shadow:

```tsx
className={`${panelPlacementClass} z-20 flex h-full shrink-0 flex-col border-l border-slate-200 bg-white ${
  layoutMode === 'drawer' ? 'shadow-[-12px_0_32px_rgba(15,23,42,0.18)]' : 'shadow-[-4px_0_16px_rgba(15,23,42,0.08)]'
} transition-none`}
```

Apply the same shadow expression to the empty-state panel so the visual behavior is consistent when no file is selected.

- [ ] **Step 6: Run typecheck**

Run:

```bash
npm run lint
```

Expected: PASS, or only App-level callback name errors if Task 3 has not been applied yet.

## Task 3: Add Parent Drawer Chrome And Remove Fixed Content Width

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Remove fixed center width style**

In the analysis `<main>` element, remove:

```tsx
style={isAnalysisSidebarOverlaying ? { width: ANALYSIS_CONTENT_WIDTH, flex: '0 0 auto' } : undefined}
```

The `<main>` should keep:

```tsx
className={`relative flex min-w-0 flex-1 flex-col gap-4 overflow-hidden bg-slate-50/70 p-5 transition-colors ${
  isDragging ? 'bg-[var(--psbc-green-soft)]/60 ring-4 ring-[var(--psbc-green-line)]' : ''
}`}
```

- [ ] **Step 2: Render the drawer backdrop**

Immediately before `<WaveformSidebar ... />`, add:

```tsx
{analysisSidebarMode === 'drawer' && activeFile && (
  <button
    type="button"
    aria-label="关闭波形抽屉"
    className={ANALYSIS_SIDEBAR_DRAWER_BACKDROP_CLASS}
    onClick={() => setSelectedAnalyzerFileId(null)}
  />
)}
```

- [ ] **Step 3: Update the WaveformSidebar callback**

Replace:

```tsx
onOverlayChange={setIsAnalysisSidebarOverlaying}
```

with:

```tsx
onLayoutModeChange={setAnalysisSidebarMode}
```

- [ ] **Step 4: Run typecheck and production build**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands PASS.

## Task 4: Manual Responsive Verification

**Files:**
- Inspect: `App.tsx`
- Inspect: `components/WaveformSidebar.tsx`

- [ ] **Step 1: Start browser debug mode**

Run:

```bash
npm run web:dev
```

Expected: Vite starts on `http://localhost:3000` and Flask starts on `http://127.0.0.1:5001`.

- [ ] **Step 2: Verify wide layout**

Open `http://localhost:3000` at a viewport around `1440x900`.

Expected:

- Right waveform panel appears inline.
- Center analysis area is not covered.
- Resize handle is visible on the left edge of the waveform panel.

- [ ] **Step 3: Verify narrow layout**

Resize viewport to around `1024x700` or narrower.

Expected:

- Right waveform panel appears as an explicit right drawer.
- Center analysis area remains visible behind a light backdrop instead of being silently hidden by a fixed-width overlay.
- Clicking the backdrop or the panel close button closes the drawer.
- Resize handle is hidden in drawer mode.

- [ ] **Step 4: Stop dev server**

Stop the `npm run web:dev` session with `Ctrl-C`.

## Task 5: Commit Implementation

**Files:**
- Modify: `App.tsx`
- Modify: `components/WaveformSidebar.tsx`

- [ ] **Step 1: Review diff**

Run:

```bash
git diff -- App.tsx components/WaveformSidebar.tsx
```

Expected: diff only contains responsive drawer layout changes.

- [ ] **Step 2: Commit code**

Run:

```bash
git add App.tsx components/WaveformSidebar.tsx
git commit -m "fix: make analysis sidebar responsive drawer"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage: Tasks 1-3 cover explicit `inline` / `drawer` modes, parent-owned drawer chrome, responsive width, removed fixed center width, close behavior, and preserving existing waveform features. Task 4 covers wide and narrow visual behavior.
- Placeholder scan: No `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: The exported type is `WaveformSidebarLayoutMode`, the callback is `onLayoutModeChange`, and `App.tsx` uses matching state.
