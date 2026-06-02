const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  getPythonPort: () => ipcRenderer.invoke('get-python-port'),
  selectAudioFiles: () => ipcRenderer.invoke('select-audio-files'),
  importAudioFilesToLibrary: () => ipcRenderer.invoke('import-audio-files-to-library'),
  selectOutputDirectory: () => ipcRenderer.invoke('select-output-directory'),
  readFileAsBytes: (filePath) => ipcRenderer.invoke('read-file-as-bytes', filePath),
  saveFile: (options) => ipcRenderer.invoke('save-file', options),
  loadLibraryState: () => ipcRenderer.invoke('load-library-state'),
  saveLibraryState: (state) => ipcRenderer.invoke('save-library-state', state),
  getStorageStats: (targetPath) => ipcRenderer.invoke('get-storage-stats', targetPath),
  revealInFinder: (targetPath) => ipcRenderer.invoke('reveal-in-finder', targetPath),
  getDownloadsDirectory: () => ipcRenderer.invoke('get-downloads-directory'),
});
