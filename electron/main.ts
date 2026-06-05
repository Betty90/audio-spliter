import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, Menu } from 'electron';
import type { MenuItemConstructorOptions, OpenDialogOptions } from 'electron';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { promisify } from 'util';
import { getPythonPort, stopPythonProcess, waitForPython, setShuttingDown } from './python-manager.js';
import { logInfo, logError } from './logger.js';
import { initUpdater, checkForUpdatesOnStartup, checkForUpdates } from './updater.js';

let mainWindow: BrowserWindow | null = null;
let loadingWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;
const libraryStateFileName = 'uaudiolab-library-state.json';
const audioLibraryDirectoryName = 'audio-library';
const execFileAsync = promisify(execFile);

interface SaveFileOptions {
  directory?: string;
  fileName: string;
  data: number[] | ArrayBuffer | Uint8Array;
  existingFile?: 'auto-rename' | 'overwrite';
}

interface PersistedLibraryStateCandidate {
  version?: unknown;
  library?: Array<Record<string, unknown> & { path?: unknown }>;
  collections?: unknown;
  outputPolicy?: unknown;
  conversionSettings?: unknown;
  activeCategory?: unknown;
  activeCollectionId?: unknown;
}

function getLibraryStatePath(): string {
  return path.join(app.getPath('userData'), libraryStateFileName);
}

function getAudioLibraryDirectory(): string {
  return path.join(app.getPath('userData'), audioLibraryDirectoryName);
}

function safeBaseName(fileName: string): string {
  const cleaned = path.basename(fileName).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  return cleaned || `uaudiolab-${Date.now()}`;
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
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

function isManagedAudioLibraryPath(filePath: string): boolean {
  const libraryDirectory = path.resolve(getAudioLibraryDirectory());
  const entryPath = path.resolve(filePath);
  return entryPath.startsWith(`${libraryDirectory}${path.sep}`);
}

async function importedFileReference(sourcePath: string) {
  const libraryDirectory = getAudioLibraryDirectory();
  await fsPromises.mkdir(libraryDirectory, { recursive: true });

  const existing = await findExistingImportedFile(sourcePath);
  if (existing) {
    return {
      ...(await fileReference(existing.path)),
      sourcePath,
    };
  }

  const storedPath = await resolveAvailablePath(libraryDirectory, path.basename(sourcePath));
  await fsPromises.copyFile(sourcePath, storedPath);
  const reference = await fileReference(storedPath);

  return {
    ...reference,
    sourcePath,
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

async function findExistingImportedFile(sourcePath: string): Promise<{ path: string } | null> {
  const state = await loadLibraryState();
  const candidate = state as PersistedLibraryStateCandidate | null;
  if (!candidate || !Array.isArray(candidate.library)) {
    return null;
  }

  const existing = candidate.library.find(item => (
    item.sourcePath === sourcePath &&
    typeof item.path === 'string' &&
    isManagedAudioLibraryPath(item.path) &&
    fs.existsSync(item.path)
  ));

  return typeof existing?.path === 'string' ? { path: existing.path } : null;
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

function readClipboardBufferText(format: string, encoding: BufferEncoding = 'utf8'): string {
  try {
    const buffer = clipboard.readBuffer(format);
    return buffer.length ? buffer.toString(encoding).replace(/\0+$/g, '') : '';
  } catch {
    return '';
  }
}

async function readMacClipboardFilePaths(): Promise<string[]> {
  if (process.platform !== 'darwin') {
    return [];
  }

  const script = [
    'ObjC.import("AppKit");',
    'const pasteboard = $.NSPasteboard.generalPasteboard;',
    'const value = pasteboard.propertyListForType("NSFilenamesPboardType");',
    'JSON.stringify(ObjC.deepUnwrap(value) || []);',
  ].join(' ');

  try {
    const { stdout } = await execFileAsync('osascript', ['-l', 'JavaScript', '-e', script], { timeout: 2000 });
    const parsed = JSON.parse(stdout.trim() || '[]');
    return Array.isArray(parsed) ? uniqueNonEmpty(parsed.filter((item): item is string => typeof item === 'string')) : [];
  } catch (error) {
    logInfo(`[Main] Failed to read macOS clipboard file paths: ${error}`);
    return [];
  }
}

async function getClipboardFilePaths(): Promise<string[]> {
  const paths = await readMacClipboardFilePaths();
  paths.push(...readClipboardBufferText('FileNameW', 'ucs2').split(/\0|\r?\n/));
  paths.push(...readClipboardBufferText('FileName').split(/\0|\r?\n/));
  return uniqueNonEmpty(paths);
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

function collectReferencedAudioLibraryPaths(state: unknown): Set<string> {
  const referencedPaths = new Set<string>();
  const candidate = state as PersistedLibraryStateCandidate | null;

  if (!candidate || !Array.isArray(candidate.library)) {
    return referencedPaths;
  }

  for (const item of candidate.library) {
    if (typeof item.path !== 'string') continue;
    const entryPath = path.resolve(item.path);
    if (isManagedAudioLibraryPath(entryPath)) {
      referencedPaths.add(entryPath);
    }
  }

  return referencedPaths;
}

async function pruneUnreferencedAudioLibraryFiles(state: unknown): Promise<void> {
  const candidate = state as PersistedLibraryStateCandidate | null;
  if (!candidate || !Array.isArray(candidate.library)) {
    return;
  }

  const libraryDirectory = getAudioLibraryDirectory();
  const referencedPaths = collectReferencedAudioLibraryPaths(state);

  let entries: string[];
  try {
    entries = await fsPromises.readdir(libraryDirectory);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      logError(`[Main] Failed to inspect audio-library directory: ${error}`);
    }
    return;
  }

  for (const entry of entries) {
    const entryPath = path.resolve(path.join(libraryDirectory, entry));
    if (referencedPaths.has(entryPath)) continue;

    try {
      const stats = await fsPromises.stat(entryPath);
      if (!stats.isFile()) continue;
      await fsPromises.unlink(entryPath);
      logInfo(`[Main] Pruned deleted audio-library file: ${entryPath}`);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        logError(`[Main] Failed to prune audio-library file ${entryPath}: ${error}`);
      }
    }
  }
}

async function loadLibraryState(): Promise<unknown | null> {
  try {
    const raw = await fsPromises.readFile(getLibraryStatePath(), 'utf-8');
    if (!raw.trim()) {
      return null;
    }
    return JSON.parse(raw);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    if (error instanceof SyntaxError) {
      logInfo(`[Main] Ignoring unreadable library state: ${error.message}`);
      return null;
    }
    logError(`[Main] Failed to load library state: ${error}`);
    return null;
  }
}

async function saveLibraryState(state: unknown): Promise<void> {
  const statePath = getLibraryStatePath();
  const temporaryPath = `${statePath}.${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
  await fsPromises.mkdir(path.dirname(statePath), { recursive: true });
  await fsPromises.writeFile(temporaryPath, JSON.stringify(state, null, 2), 'utf-8');
  await fsPromises.rename(temporaryPath, statePath);
  await pruneUnreferencedAudioLibraryFiles(state);
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
          <div style="font-size:18px;margin-bottom:10px;">UAudioLab</div>
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

  ipcMain.handle('import-audio-files-to-library', async () => {
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

    const references = [];
    for (const filePath of result.filePaths) {
      references.push(await importedFileReference(filePath));
    }
    return references;
  });

  ipcMain.handle('import-audio-file-paths-to-library', async (_event, filePaths: unknown) => {
    if (!Array.isArray(filePaths)) {
      return [];
    }

    const references = [];
    for (const filePath of filePaths) {
      if (typeof filePath !== 'string' || !filePath) continue;
      references.push(await importedFileReference(filePath));
    }
    return references;
  });

  ipcMain.handle('get-clipboard-file-paths', async () => {
    return getClipboardFilePaths();
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
    return loadLibraryState();
  });

  ipcMain.handle('save-library-state', async (_event, state: unknown) => {
    await saveLibraryState(state);
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
      'UAudioLab failed to start',
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
