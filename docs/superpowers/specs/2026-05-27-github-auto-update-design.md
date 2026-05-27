# GitHub Auto Update Design

## Goal

Restore GitHub Releases based auto-update for the Electron app while keeping startup behavior quiet when the network or GitHub is unavailable.

## Behavior

- On app startup, initialize `electron-updater` and run a silent update check shortly after the main window is ready.
- Silent startup checks must not show an error dialog if the network is unavailable, GitHub is blocked, or update metadata cannot be reached. These failures are logged only.
- If a startup check finds and downloads an update, the app may notify the user that the update is ready and offer to install immediately or later.
- Add a native app menu item for manual checks:
  - macOS: app menu item `检查更新...`
  - Windows/Linux: `帮助 > 检查更新...`
- Manual checks should give explicit feedback for available updates, no updates, and failures.

## Architecture

- Keep `electron-builder` GitHub publish configuration as the update source.
- Keep `electron/updater.ts` as the single wrapper around `electron-updater`.
- Add menu creation in the Electron main process and route the menu action to `checkForUpdates(false)`.
- Avoid renderer IPC for this change because the expected manual entry is a native desktop menu, not an in-app control.

## Error Handling

- Startup checks use `silent = true`; errors are logged and swallowed.
- Manual checks use `silent = false`; errors show a dialog.
- Development builds continue to skip update checks.
- Concurrent checks are ignored with a log warning.

## Verification

- Type-check the project with `npm run lint`.
- Confirm the GitHub release still contains platform update metadata: `latest.yml`, `latest-mac.yml`, and `latest-linux.yml`.
- Inspect the Electron code path to confirm startup calls the silent check and the menu calls the manual check.
