# UAudioLab Redesign Design

## Goal

Rebuild UAudioLab around the three supplied design drafts in `img/`: analysis, splitting, and conversion. The application is now Electron-first; browser development mode remains useful for visual debugging but does not need to provide full local-file persistence.

## Product Decisions

- Do not implement the top global search box or user menu from the drafts.
- Implement the rest of the desktop product surface as functional UI: persistent file library, categories, favorites, trash, recent files, storage stats, right-side context panels, output directory selection, and conversion options.
- Persist file metadata and local paths under Electron `userData`; do not copy source audio files into app storage.
- Default conversion output directory is the system Downloads directory. Existing output filenames are resolved by automatic renaming.

## Architecture

- `App.tsx` owns top-level state: active workspace, library items, current file, settings, and backend health.
- Shared layout components provide the shell used by all pages: persistent left navigation and file library, page header, main work area, and optional right panel.
- Electron exposes local file capabilities through `window.electron`, keeping renderer code free of Node integration.
- The Flask `/convert` endpoint accepts conversion parameters and builds a constrained ffmpeg command from allow-listed values.

## Page Behavior

- Analysis page shows summary cards, a latency table with selection/export controls, and a right panel with player, waveform preview, segment list, and selected segment stats.
- Splitter page keeps existing waveform editing behavior while matching the draft: file info strip, toolbars, large stereo canvas, mini overview, segment info editor, segment list, and selected/all export actions.
- Converter page shows metrics, add-file sources, a conversion queue, recent files, output settings, and per-item/overall progress.

## Validation

- Run `npm run lint`, `npm run build`, `npm run electron:build`, and `python3 -m unittest discover -s tests`.
- Verify the UI at 1400x900 and 1200x700 for overlap-free layout, scrollable tables/lists, and stable right panels.
