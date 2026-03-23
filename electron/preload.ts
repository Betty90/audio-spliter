import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  getPythonPort: () => ipcRenderer.invoke('get-python-port'),
});

declare global {
  interface Window {
    electron: {
      getPythonPort: () => Promise<number>;
    };
  }
}
