# Analysis Collapsible Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the analysis waveform drawer with an inline show/hide sidebar that never covers the center analysis content.

**Architecture:** `App.tsx` owns sidebar visibility and renders a toggle button in the analysis workspace. `components/WaveformSidebar.tsx` always renders as a relative inline panel when visible and clamps drag resizing so the center analysis area keeps a `720px` minimum width whenever the workspace allows it. No audio processing behavior changes.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind utility classes, lucide-react icons.

---

## File Structure

- Modify `App.tsx`: remove drawer state/backdrop, add `isWaveformSidebarVisible`, render show/hide button, conditionally render `WaveformSidebar`, reserve space for the toggle button, and allow horizontal workspace scrolling below the combined minimum widths.
- Modify `components/WaveformSidebar.tsx`: remove drawer mode constants/type/callback, force relative inline placement, and clamp resize to `workspaceWidth - 720`.
- Modify `docs/superpowers/specs/2026-06-03-analysis-drawer-design.md`: update design language to the corrected collapsible inline sidebar behavior.

## Task 1: Remove Drawer State From Parent

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Replace the sidebar import**

Change:

```ts
import WaveformSidebar, { type WaveformSidebarLayoutMode } from './components/WaveformSidebar';
```

to:

```ts
import WaveformSidebar from './components/WaveformSidebar';
```

- [ ] **Step 2: Replace drawer backdrop constant**

Remove:

```ts
const ANALYSIS_SIDEBAR_DRAWER_BACKDROP_CLASS =
  'absolute inset-0 z-10 bg-slate-950/10 backdrop-blur-[1px]';
```

Add:

```ts
const MIN_ANALYSIS_CONTENT_WIDTH = 720;
```

- [ ] **Step 3: Replace drawer mode state**

Change:

```ts
const [analysisSidebarMode, setAnalysisSidebarMode] = useState<WaveformSidebarLayoutMode>('inline');
```

to:

```ts
const [isWaveformSidebarVisible, setIsWaveformSidebarVisible] = useState(true);
```

- [ ] **Step 4: Remove drawer backdrop JSX**

Delete the JSX block:

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

## Task 2: Add Inline Show/Hide Control

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Add icons**

Change:

```ts
import { AlertCircle, AudioWaveform, Clock3, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
```

to:

```ts
import { AlertCircle, AudioWaveform, Clock3, PanelRightClose, PanelRightOpen, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
```

- [ ] **Step 2: Add a minimum width style to main**

Add this style to the analysis `<main>`:

```tsx
style={{ minWidth: MIN_ANALYSIS_CONTENT_WIDTH }}
```

- [ ] **Step 3: Allow horizontal workspace scrolling**

Change the analysis workspace wrapper from:

```tsx
<div className="relative flex min-h-0 flex-1 overflow-hidden">
```

to:

```tsx
<div className="relative flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
```

- [ ] **Step 4: Reserve space for the toggle button**

Change:

```tsx
<div className="grid shrink-0 grid-cols-4 gap-2">
```

to:

```tsx
<div className="grid shrink-0 grid-cols-4 gap-2 pr-10">
```

- [ ] **Step 5: Render the toggle button inside main**

Add this button near the top of `<main>`, before the stat card grid:

```tsx
<button
  type="button"
  onClick={() => setIsWaveformSidebarVisible(prev => !prev)}
  className="absolute right-3 top-3 z-30 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900"
  title={isWaveformSidebarVisible ? '隐藏波形侧栏' : '显示波形侧栏'}
  aria-label={isWaveformSidebarVisible ? '隐藏波形侧栏' : '显示波形侧栏'}
>
  {isWaveformSidebarVisible ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
</button>
```

- [ ] **Step 6: Condition sidebar rendering**

Replace:

```tsx
<WaveformSidebar
  file={activeFile}
  onUpdateSegments={handleSegmentUpdate}
  onClose={() => setSelectedAnalyzerFileId(null)}
  settings={activeFile?.settings || settings}
  activeSegmentId={activeSegmentId}
  onSegmentSelect={setActiveSegmentId}
  onReanalyze={handleReanalyzeRequest}
  onOpenSettings={setEditingSettingsFileId}
  onLayoutModeChange={setAnalysisSidebarMode}
/>
```

with:

```tsx
{isWaveformSidebarVisible && (
  <WaveformSidebar
    file={activeFile}
    onUpdateSegments={handleSegmentUpdate}
    onClose={() => setSelectedAnalyzerFileId(null)}
    settings={activeFile?.settings || settings}
    activeSegmentId={activeSegmentId}
    onSegmentSelect={setActiveSegmentId}
    onReanalyze={handleReanalyzeRequest}
    onOpenSettings={setEditingSettingsFileId}
  />
)}
```

## Task 3: Remove Drawer Logic From WaveformSidebar

**Files:**
- Modify: `components/WaveformSidebar.tsx`

- [ ] **Step 1: Remove drawer constants and exported type**

Remove:

```ts
const DRAWER_WIDTH = 720;
const DRAWER_VIEWPORT_WIDTH_RATIO = 0.88;
export type WaveformSidebarLayoutMode = 'inline' | 'drawer';
```

- [ ] **Step 2: Remove layout callback prop**

Remove this prop from `WaveformSidebarProps`:

```ts
onLayoutModeChange?: (mode: WaveformSidebarLayoutMode) => void;
```

Remove `onLayoutModeChange` from the component destructuring.

- [ ] **Step 3: Clamp drag resize**

In `handleMouseMove`, replace:

```ts
const maxWidth = Math.min(measuredWorkspaceWidth, window.innerWidth * MAX_PANEL_WIDTH_RATIO);
```

with:

```ts
const maxWidth = Math.max(
  Math.min(MIN_PANEL_WIDTH, measuredWorkspaceWidth),
  Math.min(measuredWorkspaceWidth, measuredWorkspaceWidth - MIN_ANALYSIS_CONTENT_WIDTH)
);
```

- [ ] **Step 4: Replace layout calculations**

Replace the drawer-aware layout calculations with:

```ts
const maxInlineWidth =
  workspaceWidth > 0
    ? Math.max(Math.min(MIN_PANEL_WIDTH, workspaceWidth), workspaceWidth - MIN_ANALYSIS_CONTENT_WIDTH)
    : width;
const effectiveWidth = workspaceWidth > 0 ? Math.min(width, maxInlineWidth) : width;
const panelPlacementClass = 'relative';
const panelShadowClass = 'shadow-[-4px_0_16px_rgba(15,23,42,0.08)]';
```

- [ ] **Step 5: Remove layout mode effect**

Delete:

```ts
useEffect(() => {
  onLayoutModeChange?.(layoutMode);
  return () => onLayoutModeChange?.('inline');
}, [layoutMode, onLayoutModeChange]);
```

- [ ] **Step 6: Always show resize handle**

Replace:

```tsx
{layoutMode === 'inline' && (
  <div ... />
)}
```

with the same `<div ... />` without the wrapper condition.

## Task 4: Verify

**Files:**
- Inspect: `App.tsx`
- Inspect: `components/WaveformSidebar.tsx`

- [ ] **Step 1: Run TypeScript check**

Run:

```bash
npm run lint
```

Expected: exit code 0.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: exit code 0.

- [ ] **Step 3: Inspect responsive behavior**

Run:

```bash
npm run web:dev
```

Inspect around `1440x900` and `1024x700`.

Expected:

- The waveform panel is inline when visible.
- The toggle button hides and shows the panel.
- The panel never covers the main content.
- At very narrow widths, the workspace scrolls horizontally instead of clipping either minimum-width area.
- Dragging the panel wider does not push the main content below `720px` when the workspace is wide enough.

## Self-Review

- Spec coverage: The plan removes drawer/backdrop behavior, adds show/hide control, keeps inline layout, and clamps resizing by the main content minimum width.
- Placeholder scan: No placeholder tasks remain.
- Type consistency: `WaveformSidebarLayoutMode` and `onLayoutModeChange` are fully removed; parent state is `isWaveformSidebarVisible`.
