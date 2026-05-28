import { app, BrowserWindow, dialog, ipcMain, shell, Menu } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import path from 'path';
import { getPythonPort, stopPythonProcess, waitForPython, setShuttingDown } from './python-manager.js';
import { logInfo, logError } from './logger.js';
import { initUpdater, checkForUpdatesOnStartup, checkForUpdates } from './updater.js';

let mainWindow: BrowserWindow | null = null;
let loadingWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  logInfo('[Main] Another instance is already running, quitting...');
  app.quit();
} else {
  app.on('second-instance', () => {
    logInfo('[Main] Second instance detected, focusing window...');
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

function createLoadingWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 400,
    height: 200,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  window.loadURL(
    `data:text/html,
    <html>
      <body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#1a1a1a;color:#fff;font-family:sans-serif;">
        <div style="text-align:center;">
          <div style="font-size:18px;margin-bottom:10px;">AudioSlicer AI</div>
          <div style="font-size:14px;color:#888;">Starting Python backend...</div>
        </div>
      </body>
    </html>`
  );

  return window;
}

function createApplicationMenu(): void {
  const checkUpdatesItem: MenuItemConstructorOptions = {
    label: '检查更新...',
    click: () => {
      checkForUpdates(false).catch((error) => {
        logError(`[Main] Manual update check failed: ${error}`);
      });
    },
  };

  const viewMenu: MenuItemConstructorOptions = {
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
  };

  const template: MenuItemConstructorOptions[] = process.platform === 'darwin'
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
        viewMenu,
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
        viewMenu,
        {
          label: '帮助',
          submenu: [
            checkUpdatesItem,
          ],
        },
      ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(app.getAppPath(), 'electron/preload.js'),
    },
    titleBarStyle: 'default',
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    // In packaged app, use app.getAppPath() to get the correct path to app.asar
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
  }
  // DevTools disabled for production

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    loadingWindow?.close();
    loadingWindow = null;
    initUpdater();
    checkForUpdatesOnStartup();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  createApplicationMenu();

  ipcMain.handle('get-python-port', async () => {
    if (!getPythonPort()) {
      await waitForPython();
    }
    return getPythonPort();
  });

  loadingWindow = createLoadingWindow();

  try {
    logInfo('[Main] Starting Python backend...');
    await waitForPython();
    logInfo('[Main] Python backend ready');
    createWindow();
  } catch (error) {
    logError(`[Main] Failed to start Python backend: ${error}`);
    dialog.showErrorBox(
      'AudioSlicer AI failed to start',
      `The bundled Python backend could not be started.\n\n${error}`
    );
    loadingWindow?.close();
    loadingWindow = null;
    app.quit();
  }

  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  setShuttingDown(true);
  logInfo('[Main] Stopping Python backend...');
  stopPythonProcess();
});

app.on('quit', () => {
  setShuttingDown(true);
  stopPythonProcess();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
