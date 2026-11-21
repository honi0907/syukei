const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('syukeiSettings', {
    pickTextFile: () => ipcRenderer.invoke('settings:pick-text-file')
});