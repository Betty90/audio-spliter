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
const audioLibraryDirectoryName = 'audio-library';
const audioLibraryIndexFileName = 'library-index.json';

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

interface IndexedAudioLibraryFile {
  id: string;
  name: string;
  path: string;
  sourcePath?: string;
  size: number;
  extension: string;
  addedAt: number;
  updatedAt: number;
}

interface AudioLibraryIndex {
  version: 1;
  files: IndexedAudioLibraryFile[];
}

function getLibraryStatePath(): string {
  return path.join(app.getPath('userData'), libraryStateFileName);
}

function getAudioLibraryDirectory(): string {
  return path.join(app.getPath('userData'), audioLibraryDirectoryName);
}

function getAudioLibraryIndexPath(): string {
  return path.join(getAudioLibraryDirectory(), audioLibraryIndexFileName);
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

function makeFileId(): string {
  return `file-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isManagedAudioLibraryPath(filePath: string): boolean {
  const libraryDirectory = path.resolve(getAudioLibraryDirectory());
  const entryPath = path.resolve(filePath);
  return entryPath.startsWith(`${libraryDirectory}${path.sep}`);
}

function normalizeAudioLibraryIndex(value: unknown): AudioLibraryIndex {
  const candidate = value as Partial<AudioLibraryIndex> | null;
  if (!candidate || !Array.isArray(candidate.files)) {
    return { version: 1, files: [] };
  }

  const files = candidate.files
    .filter((item): item is IndexedAudioLibraryFile => (
      typeof item?.id === 'string' &&
      typeof item.name === 'string' &&
      typeof item.path === 'string' &&
      typeof item.size === 'number' &&
      typeof item.extension === 'string' &&
      typeof item.addedAt === 'number' &&
      typeof item.updatedAt === 'number'
    ))
    .map(item => ({
      ...item,
      path: path.resolve(item.path),
      sourcePath: typeof item.sourcePath === 'string' ? item.sourcePath : undefined,
    }));

  return { version: 1, files };
}

async function loadAudioLibraryIndex(): Promise<AudioLibraryIndex> {
  try {
    const raw = await fsPromises.readFile(getAudioLibraryIndexPath(), 'utf-8');
    return normalizeAudioLibraryIndex(JSON.parse(raw));
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      logInfo(`[Main] Rebuilding unreadable audio-library index: ${error.message || error}`);
    }
    return rebuildAudioLibraryIndexFromFiles();
  }
}

async function saveAudioLibraryIndex(index: AudioLibraryIndex): Promise<void> {
  const indexPath = getAudioLibraryIndexPath();
  const temporaryPath = `${indexPath}.${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
  await fsPromises.mkdir(path.dirname(indexPath), { recursive: true });
  await fsPromises.writeFile(temporaryPath, JSON.stringify(index, null, 2), 'utf-8');
  await fsPromises.rename(temporaryPath, indexPath);
}

async function rebuildAudioLibraryIndexFromFiles(): Promise<AudioLibraryIndex> {
  const libraryDirectory = getAudioLibraryDirectory();
  let entries: string[];
  try {
    entries = await fsPromises.readdir(libraryDirectory);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      logError(`[Main] Failed to inspect audio-library directory: ${error}`);
    }
    return { version: 1, files: [] };
  }

  const files: IndexedAudioLibraryFile[] = [];
  for (const entry of entries) {
    if (entry === audioLibraryIndexFileName) continue;
    const entryPath = path.join(libraryDirectory, entry);
    try {
      const stats = await fsPromises.stat(entryPath);
      if (!stats.isFile()) continue;
      files.push({
        id: makeFileId(),
        name: path.basename(entryPath),
        path: path.resolve(entryPath),
        size: stats.size,
        extension: path.extname(entryPath).replace('.', '').toLowerCase(),
        addedAt: stats.birthtimeMs || stats.mtimeMs,
        updatedAt: stats.mtimeMs,
      });
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        logError(`[Main] Failed to index audio-library file ${entryPath}: ${error}`);
      }
    }
  }

  const index = { version: 1 as const, files };
  await saveAudioLibraryIndex(index);
  return index;
}

function toIndexedAudioLibraryFile(reference: Awaited<ReturnType<typeof fileReference>>, sourcePath?: string): IndexedAudioLibraryFile {
  return {
    id: makeFileId(),
    name: reference.name,
    path: path.resolve(reference.path),
    sourcePath,
    size: reference.size,
    extension: reference.extension,
    addedAt: Date.now(),
    updatedAt: Date.now(),
  };
}

async function importedFileReference(sourcePath: string) {
  const libraryDirectory = getAudioLibraryDirectory();
  await fsPromises.mkdir(libraryDirectory, { recursive: true });

  const index = await loadAudioLibraryIndex();
  const existing = index.files.find(item => item.sourcePath === sourcePath && fs.existsSync(item.path));
  if (existing) {
    return {
      ...(await fileReference(existing.path)),
      sourcePath: existing.sourcePath,
    };
  }

  const storedPath = await resolveAvailablePath(libraryDirectory, path.basename(sourcePath));
  await fsPromises.copyFile(sourcePath, storedPath);
  const reference = await fileReference(storedPath);
  const nextIndex = {
    version: 1 as const,
    files: [...index.files, toIndexedAudioLibraryFile(reference, sourcePath)],
  };
  await saveAudioLibraryIndex(nextIndex);

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

function toLibraryItemFromIndexedFile(file: IndexedAudioLibraryFile) {
  return {
    id: file.id,
    name: file.name,
    path: file.path,
    sourcePath: file.sourcePath,
    size: file.size,
    extension: file.extension,
    status: 'idle',
    segmentCount: 0,
    isFavorite: false,
    isDeleted: false,
    collectionIds: [],
    addedAt: file.addedAt,
    updatedAt: file.updatedAt,
  };
}

function mergeStateWithAudioLibraryIndex(state: unknown, index: AudioLibraryIndex): unknown {
  const candidate = state as PersistedLibraryStateCandidate | null;
  const indexedItems = index.files.map(toLibraryItemFromIndexedFile);

  if (!candidate || !Array.isArray(candidate.library)) {
    return {
      version: 1,
      library: indexedItems,
      collections: [],
      outputPolicy: undefined,
      conversionSettings: undefined,
      activeCategory: 'all',
      activeCollectionId: null,
    };
  }

  const existingPaths = new Set(
    candidate.library
      .map(item => typeof item.path === 'string' ? path.resolve(item.path) : null)
      .filter((item): item is string => !!item),
  );
  const missingIndexedItems = indexedItems.filter(item => !existingPaths.has(path.resolve(item.path)));

  return {
    ...candidate,
    library: [...candidate.library, ...missingIndexedItems],
  };
}

async function synchronizeAudioLibraryIndex(state: unknown): Promise<void> {
  const candidate = state as PersistedLibraryStateCandidate | null;
  if (!candidate || !Array.isArray(candidate.library)) {
    return;
  }

  const index = await loadAudioLibraryIndex();
  const referencedPaths = collectReferencedAudioLibraryPaths(state);
  const referencedByPath = new Map(
    candidate.library
      .filter(item => typeof item.path === 'string' && isManagedAudioLibraryPath(item.path))
      .map(item => [path.resolve(item.path as string), item]),
  );
  const nextIndex: AudioLibraryIndex = {
    version: 1,
    files: index.files
      .filter(item => referencedPaths.has(path.resolve(item.path)))
      .map(item => {
        const stateItem = referencedByPath.get(path.resolve(item.path));
        return {
          ...item,
          id: typeof stateItem?.id === 'string' ? stateItem.id : item.id,
          name: typeof stateItem?.name === 'string' ? stateItem.name : item.name,
          sourcePath: typeof stateItem?.sourcePath === 'string' ? stateItem.sourcePath : item.sourcePath,
          size: typeof stateItem?.size === 'number' ? stateItem.size : item.size,
          extension: typeof stateItem?.extension === 'string' ? stateItem.extension : item.extension,
          updatedAt: typeof stateItem?.updatedAt === 'number' ? stateItem.updatedAt : item.updatedAt,
        };
      }),
  };

  for (const item of candidate.library) {
    if (typeof item.path !== 'string' || !isManagedAudioLibraryPath(item.path)) continue;
    const entryPath = path.resolve(item.path);
    if (nextIndex.files.some(file => path.resolve(file.path) === entryPath)) continue;
    if (!fs.existsSync(entryPath)) continue;
    const reference = await fileReference(entryPath);
    nextIndex.files.push({
      id: typeof item.id === 'string' ? item.id : makeFileId(),
      name: typeof item.name === 'string' ? item.name : reference.name,
      path: entryPath,
      sourcePath: typeof item.sourcePath === 'string' ? item.sourcePath : undefined,
      size: typeof item.size === 'number' ? item.size : reference.size,
      extension: typeof item.extension === 'string' ? item.extension : reference.extension,
      addedAt: typeof item.addedAt === 'number' ? item.addedAt : Date.now(),
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
    });
  }

  for (const item of index.files) {
    const entryPath = path.resolve(item.path);
    if (!referencedPaths.has(entryPath)) {
      try {
        await fsPromises.unlink(entryPath);
        logInfo(`[Main] Pruned deleted audio-library file: ${entryPath}`);
      } catch (error: any) {
        if (error?.code !== 'ENOENT') {
          logError(`[Main] Failed to prune audio-library file ${entryPath}: ${error}`);
        }
      }
    }
  }

  await saveAudioLibraryIndex(nextIndex);
}

async function loadLibraryState(): Promise<unknown | null> {
  try {
    const index = await loadAudioLibraryIndex();
    const raw = await fsPromises.readFile(getLibraryStatePath(), 'utf-8');
    if (!raw.trim()) {
      return mergeStateWithAudioLibraryIndex(null, index);
    }
    const parsed = JSON.parse(raw);
    return mergeStateWithAudioLibraryIndex(parsed, index);
  } catch (error: any) {
    const index = await loadAudioLibraryIndex();
    if (error?.code === 'ENOENT') {
      return mergeStateWithAudioLibraryIndex(null, index);
    }
    if (error instanceof SyntaxError) {
      logInfo(`[Main] Ignoring unreadable library state: ${error.message}`);
      return mergeStateWithAudioLibraryIndex(null, index);
    }
    logError(`[Main] Failed to load library state: ${error}`);
    return mergeStateWithAudioLibraryIndex(null, index);
  }
}

async function saveLibraryState(state: unknown): Promise<void> {
  const statePath = getLibraryStatePath();
  const temporaryPath = `${statePath}.${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
  await fsPromises.mkdir(path.dirname(statePath), { recursive: true });
  await fsPromises.writeFile(temporaryPath, JSON.stringify(state, null, 2), 'utf-8');
  await fsPromises.rename(temporaryPath, statePath);
  await synchronizeAudioLibraryIndex(state);
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
