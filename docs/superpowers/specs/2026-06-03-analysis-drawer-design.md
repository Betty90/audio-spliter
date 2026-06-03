# Analysis Drawer Responsive Layout Design

## Goal

Improve the analysis screen's right-side waveform panel so it no longer hides the center analysis content on small displays. The panel should behave like a responsive right drawer when horizontal space is tight, while preserving the current side-by-side workflow on larger screens.

## Current Problem

`WaveformSidebar` currently switches to `absolute right-0 top-0 bottom-0` when there is not enough room to keep the analysis content at its minimum width. `App.tsx` also fixes the analysis content width while this overlay state is active. On smaller displays, this creates a visually confusing overlap: the waveform panel covers the center table, and part of the analysis content becomes inaccessible or hard to read.

## Proposed Behavior

Use a hybrid responsive layout:

- Large workspace: render the waveform panel inline beside the analysis content.
- Tight workspace: render the waveform panel as an explicit right drawer.
- The drawer must have a clear close button and a light backdrop or visual separation so users understand it is a temporary panel.
- The center analysis content must remain readable and scrollable; it should not be silently covered by the panel.
- The drawer width should use viewport-aware sizing: target `min(720px, 88vw)` and preserve the existing usable minimum panel width whenever the viewport allows it.

## Component Responsibilities

### `App.tsx`

- Own the high-level analysis workspace layout.
- Track whether the waveform panel is in inline or drawer mode.
- Render the drawer backdrop and provide close behavior when the panel is in drawer mode.
- Avoid forcing the center analysis content into a fixed width that causes hidden content on smaller displays.

### `components/WaveformSidebar.tsx`

- Keep waveform, playback, segment editing, reanalysis, settings, and export behavior unchanged.
- Replace the current implicit overlay placement with an explicit layout mode: `inline` or `drawer`.
- Keep drag resizing for large inline layouts.
- In drawer mode, use responsive width constraints and avoid creating unusable panel sizes.
- Continue reporting layout mode changes to `App.tsx` if the parent needs to adjust surrounding layout.

## Interaction Details

- Opening a completed audio file still shows the waveform panel automatically.
- On large screens, the panel appears inline and can be resized as it does today.
- On smaller screens, the panel slides or appears from the right as a drawer, with the main content visually separated behind it.
- Closing the drawer returns focus to the analysis table area.
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
  - narrow screens use drawer mode without hiding the center content permanently;
  - wide screens keep the side-by-side panel;
  - close, resize, and segment selection still work.
