# GitHub Auto Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable quiet startup update checks from GitHub Releases and add a native manual `检查更新...` menu item.

**Architecture:** Keep all update behavior in `electron/updater.ts` and call it from `electron/main.ts`. Startup checks run silently after the main window appears; native menu actions run manual checks with user-visible feedback.

**Tech Stack:** Electron 35, electron-updater 6, electron-builder GitHub provider, TypeScript.

---

## File Structure

- Modify `electron/updater.ts`: restore startup checks, separate silent/manual dialog behavior, and swallow silent network failures.
- Modify `electron/main.ts`: import `Menu`, create the native application menu, and wire `检查更新...` to `checkForUpdates(false)`.
- Verification only: no new renderer code or IPC is needed.

### Task 1: Restore Update Check Semantics

**Files:**
- Modify: `electron/updater.ts`

- [ ] **Step 1: Change startup check to run silently**

Replace the disabled `checkForUpdatesOnStartup()` function with:

```ts
export function checkForUpdatesOnStartup(): void {
  setTimeout(() => {
    checkForUpdates(true).catch((error) => {
      logWarn(`[Updater] Silent startup update check failed: ${error}`);
    });
  }, 5000);
}
```

- [ ] **Step 2: Make manual checks use direct update checking**

In `checkForUpdates(silent = false)`, call:

```ts
await electronAutoUpdater.checkForUpdates();
```

This keeps all user-facing dialogs in this wrapper's event handlers.

- [ ] **Step 3: Keep silent failures quiet**

In the `catch` block inside `checkForUpdates`, log the failure and only show an error dialog when `silent` is false:

```ts
const message = error instanceof Error ? error.message : String(error);
logError(`[Updater] Failed to check for updates: ${message}`);

if (!silent) {
  dialog.showErrorBox(
    'Update Error',
    `An error occurred while checking for updates:\n${message}`
  );
}
```

### Task 2: Add Native Menu Entry

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Import Menu**

Change the Electron import to include `Menu`:

```ts
import { app, BrowserWindow, dialog, ipcMain, shell, Menu } from 'electron';
```

- [ ] **Step 2: Import manual check function**

Change the updater import to:

```ts
import { initUpdater, checkForUpdatesOnStartup, checkForUpdates } from './updater.js';
```

- [ ] **Step 3: Add menu builder**

Add a `createApplicationMenu()` function before `createWindow()`:

```ts
function createApplicationMenu(): void {
  const checkUpdatesItem = {
    label: '检查更新...',
    click: () => {
      checkForUpdates(false).catch((error) => {
        logError(`[Main] Manual update check failed: ${error}`);
      });
    },
  };

  const template: Electron.MenuItemConstructorOptions[] = process.platform === 'darwin'
    ? [
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            checkUpdatesItem,
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        },
        {
          label: '编辑',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' },
          ],
        },
        {
          label: '视图',
          submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' },
          ],
        },
        {
          label: '窗口',
          submenu: [
            { role: 'minimize' },
            { role: 'close' },
          ],
        },
      ]
    : [
        {
          label: '文件',
          submenu: [
            { role: 'quit' },
          ],
        },
        {
          label: '视图',
          submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' },
          ],
        },
        {
          label: '帮助',
          submenu: [
            checkUpdatesItem,
          ],
        },
      ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
```

- [ ] **Step 4: Install menu when app is ready**

Call `createApplicationMenu();` inside `app.whenReady().then(async () => { ... })` before creating windows.

### Task 3: Verify

**Files:**
- Inspect: `electron/updater.ts`
- Inspect: `electron/main.ts`
- Verify: GitHub release metadata

- [ ] **Step 1: Run TypeScript check**

Run:

```bash
npm run lint
```

Expected: command exits with status 0.

- [ ] **Step 2: Confirm latest release metadata exists**

Run:

```bash
gh release view v1.1.2 --repo Betty90/audio-spliter --json assets --jq '.assets[].name' | rg '^latest(-mac|-linux)?\.yml$'
```

Expected: output includes `latest.yml`, `latest-mac.yml`, and `latest-linux.yml`.

- [ ] **Step 3: Review changed files**

Run:

```bash
git diff -- electron/updater.ts electron/main.ts
```

Expected: startup calls `checkForUpdates(true)`, menu item calls `checkForUpdates(false)`, and silent error paths do not show dialogs.
