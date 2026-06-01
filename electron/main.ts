import { app, BrowserWindow, dialog, ipcMain, shell, Menu } from 'electron';
import type { MenuItemConstructorOptions, OpenDialogOptions } from 'electron';
import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { getPythonPort, stopPythonProcess, waitForPython, setShuttingDown } from './python-manager.js';
import { logInfo, logError } from './logger.js';
import { initUpdater, checkForUpdatesOnStartup, checkForUpdates } from './updater.js';

let mainWindow: BrowserWindow | null = null;
let loadingWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;
const libraryStateFileName = 'uaudiolab-library-state.json';

interface SaveFileOptions {
  directory?: string;
  fileName: string;
  data: number[] | ArrayBuffer | Uint8Array;
  existingFile?: 'auto-rename' | 'overwrite';
}

function getLibraryStatePath(): string {
  return path.join(app.getPath('userData'), libraryStateFileName);
}

function safeBaseName(fileName: string): string {
  const cleaned = path.basename(fileName).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  return cleaned || `uaudiolab-${Date.now()}`;
}

async function fileReference(filePath: string) {
  const stats = await fsPromises.stat(filePath);
  return {
    path: filePath,
    name: path.basename(filePath),
    size: stats.size,
    lastModified: stats.mtimeMs,
    extension: path.extname(filePath).replace('.', '').toLowerCase(),
  };
}

async function resolveAvailablePath(directory: string, fileName: string): Promise<string> {
  const safeName = safeBaseName(fileName);
  const ext = path.extname(safeName);
  const stem = path.basename(safeName, ext);
  let candidate = path.join(directory, safeName);
  let counter = 1;

  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${stem} (${counter})${ext}`);
    counter += 1;
  }

  return candidate;
}

function coerceBuffer(data: SaveFileOptions['data']): Buffer {
  if (Array.isArray(data)) {
    return Buffer.from(data);
  }
  if (data instanceof Uint8Array) {
    return Buffer.from(data);
  }
  return Buffer.from(new Uint8Array(data));
}

async function calculateStorageStats(targetPath?: string) {
  const statsPath = targetPath || app.getPath('downloads');

  try {
    const statfs = await fsPromises.statfs(statsPath);
    const free = Number(statfs.bavail) * Number(statfs.bsize);
    const total = Number(statfs.blocks) * Number(statfs.bsize);
    return {
      path: statsPath,
      free,
      total,
      used: Math.max(total - free, 0),
    };
  } catch {
    return {
      path: statsPath,
      free: 0,
      total: 0,
      used: 0,
    };
  }
}

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
  const appRoot = isDev ? process.cwd() : app.getAppPath();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(appRoot, 'electron/preload.js'),
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

  ipcMain.handle('select-audio-files', async () => {
    const options: OpenDialogOptions = {
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Audio and video',
          extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'mp4', 'mov', 'webm'],
        },
      ],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled) {
      return [];
    }

    return Promise.all(result.filePaths.map(fileReference));
  });

  ipcMain.handle('select-output-directory', async () => {
    const options: OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: app.getPath('downloads'),
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('read-file-as-bytes', async (_event, filePath: string) => {
    const [reference, data] = await Promise.all([
      fileReference(filePath),
      fsPromises.readFile(filePath),
    ]);

    return {
      ...reference,
      data: Array.from(data),
    };
  });

  ipcMain.handle('save-file', async (_event, options: SaveFileOptions) => {
    const directory = options.directory || app.getPath('downloads');
    await fsPromises.mkdir(directory, { recursive: true });
    const outputPath = options.existingFile === 'overwrite'
      ? path.join(directory, safeBaseName(options.fileName))
      : await resolveAvailablePath(directory, options.fileName);
    await fsPromises.writeFile(outputPath, coerceBuffer(options.data));

    return {
      path: outputPath,
      fileName: path.basename(outputPath),
    };
  });

  ipcMain.handle('load-library-state', async () => {
    try {
      const raw = await fsPromises.readFile(getLibraryStatePath(), 'utf-8');
      return JSON.parse(raw);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        logError(`[Main] Failed to load library state: ${error}`);
      }
      return null;
    }
  });

  ipcMain.handle('save-library-state', async (_event, state: unknown) => {
    await fsPromises.mkdir(app.getPath('userData'), { recursive: true });
    await fsPromises.writeFile(getLibraryStatePath(), JSON.stringify(state, null, 2), 'utf-8');
    return { ok: true };
  });

  ipcMain.handle('get-storage-stats', async (_event, targetPath?: string) => {
    return calculateStorageStats(targetPath);
  });

  ipcMain.handle('reveal-in-finder', async (_event, targetPath: string) => {
    shell.showItemInFolder(targetPath);
    return { ok: true };
  });

  ipcMain.handle('get-downloads-directory', async () => {
    return app.getPath('downloads');
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
