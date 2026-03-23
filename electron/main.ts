import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPythonPort, stopPythonProcess, waitForPython, setShuttingDown } from './python-manager.js';
import { logInfo, logError } from './logger.js';
import { initUpdater, checkForUpdatesOnStartup } from './updater.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'default',
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3001');
    mainWindow.webContents.openDevTools({ mode: 'bottom' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

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
  ipcMain.handle('get-python-port', () => getPythonPort());

  loadingWindow = createLoadingWindow();

  try {
    logInfo('[Main] Starting Python backend...');
    await waitForPython();
    logInfo('[Main] Python backend ready');
    createWindow();
  } catch (error) {
    logError(`[Main] Failed to start Python backend: ${error}`);
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
