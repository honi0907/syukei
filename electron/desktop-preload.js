const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('syukeiDesktop', {
    openScoreFullscreen: () => ipcRenderer.invoke('window:open', 'score-fullscreen'),
    openSettings: () => ipcRenderer.invoke('window:open', 'settings')
});
