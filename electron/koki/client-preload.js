const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kokiWindow', {
    toggleFullscreen: () => ipcRenderer.invoke('koki:toggle-client-fullscreen'),
    isFullscreen: () => ipcRenderer.invoke('koki:is-client-fullscreen')
});