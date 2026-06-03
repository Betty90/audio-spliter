const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  getPythonPort: () => ipcRenderer.invoke('get-python-port'),
  selectAudioFiles: () => ipcRenderer.invoke('select-audio-files'),
  importAudioFilesToLibrary: () => ipcRenderer.invoke('import-audio-files-to-library'),
  importAudioFilePathsToLibrary: (filePaths) => ipcRenderer.invoke('import-audio-file-paths-to-library', filePaths),
  getClipboardFilePaths: () => ipcRenderer.invoke('get-clipboard-file-paths'),
  selectOutputDirectory: () => ipcRenderer.invoke('select-output-directory'),
  readFileAsBytes: (filePath) => ipcRenderer.invoke('read-file-as-bytes', filePath),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  saveFile: (options) => ipcRenderer.invoke('save-file', options),
  loadLibraryState: () => ipcRenderer.invoke('load-library-state'),
  saveLibraryState: (state) => ipcRenderer.invoke('save-library-state', state),
  getStorageStats: (targetPath) => ipcRenderer.invoke('get-storage-stats'),
  revealInFinder: (targetPath) => ipcRenderer.invoke('reveal-in-finder'),
  getDownloadsDirectory: () => ipcRenderer.invoke('get-downloads-directory'),
});
