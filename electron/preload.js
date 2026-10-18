const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherAPI', {
    startServer: () => ipcRenderer.invoke('server:start'),
    stopServer: () => ipcRenderer.invoke('server:stop'),
    getNetworkInfo: () => ipcRenderer.invoke('network:info'),
    openParent: () => ipcRenderer.invoke('window:open', 'parent'),
    openScoreDisplay: () => ipcRenderer.invoke('window:open', 'score'),
    openScoreDisplayFullscreen: () => ipcRenderer.invoke('window:open', 'score-fullscreen'),
    onServerStatus: (callback) => {
        ipcRenderer.on('server:status', (_event, payload) => callback(payload));
    }
});
