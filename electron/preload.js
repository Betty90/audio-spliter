const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  getPythonPort: () => ipcRenderer.invoke('get-python-port'),
});
