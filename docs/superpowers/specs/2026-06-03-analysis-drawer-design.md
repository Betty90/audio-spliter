# Analysis Sidebar Responsive Layout Design

## Goal

Improve the analysis screen's right-side waveform panel so it can be shown or hidden by the user and never covers the center analysis content. The panel should remain part of the normal horizontal layout when visible, while the center analysis area shrinks responsively down to a defined minimum width.

## Current Problem

`WaveformSidebar` can switch to `absolute right-0 top-0 bottom-0` when there is not enough room to keep the analysis content at its minimum width. This creates a visually confusing overlap: the waveform panel covers the center table, and part of the analysis content becomes inaccessible or hard to read.

## Proposed Behavior

Use a side-by-side collapsible layout:

- When the waveform panel is visible, render it inline beside the analysis content.
- When the waveform panel is hidden, let the analysis content fill the remaining workspace.
- Provide a clear button that toggles the waveform panel between visible and hidden.
- The center analysis content must remain readable and scrollable; it must not be covered by the panel.
- The center analysis content should keep a minimum width of `720px` when the workspace allows it.
- The waveform panel resize maximum should be clamped to `workspaceWidth - 720px`, so dragging the panel wider cannot push the center analysis content below its minimum width.
- If the entire workspace is narrower than `720px + 360px`, preserve both minimum widths and allow the analysis workspace to scroll horizontally instead of overlapping or clipping content.

## Component Responsibilities

### `App.tsx`

- Own the high-level analysis workspace layout.
- Track whether the waveform panel is visible.
- Render the show/hide control in the analysis workspace.
- Avoid forcing the center analysis content into a fixed width that causes hidden content on smaller displays.
- Render `WaveformSidebar` only when the panel is visible.

### `components/WaveformSidebar.tsx`

- Keep waveform, playback, segment editing, reanalysis, settings, and export behavior unchanged.
- Remove the implicit overlay/drawer placement.
- Always render as a relative inline panel when visible.
- Keep drag resizing, but clamp width so the analysis content retains its `720px` minimum whenever the workspace allows it.
- Avoid creating unusable panel sizes below the existing `360px` minimum width.

## Interaction Details

- Opening a completed audio file can show the waveform panel automatically.
- The panel appears inline and can be resized.
- The toggle button hides the panel and gives the analysis area the full remaining workspace.
- The toggle button shows the panel again using the most recent usable width.
- The panel never appears as a drawer or overlay.
- Selecting a row in `AnalysisTable` should still activate the corresponding segment in the waveform panel.

## Out of Scope

- Redesigning the analysis table.
- Changing audio analysis, waveform rendering, or segment editing behavior.
- Reworking the left file sidebar.
- Introducing a new design system.

## Verification

- Run `npm run lint` for TypeScript checks.
- Run `npm run build` because this changes renderer layout behavior.
- If practical, inspect the app at a narrow viewport and a wide viewport to confirm:
  - the waveform panel never covers the center content;
  - the show/hide button toggles the panel;
  - resizing stops before the analysis area drops below its minimum width when the workspace allows it;
  - segment selection still works.
