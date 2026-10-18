const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('syukeiDesktop', {
    getDesktopVersion: () => ipcRenderer.invoke('app:version')
});
