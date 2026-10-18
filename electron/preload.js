const { contextBridge, ipcRenderer } = require('electron');
const { createUpdateApi } = require('./preload-update-api');

contextBridge.exposeInMainWorld('launcherAPI', {
    startServer: () => ipcRenderer.invoke('server:start'),
    stopServer: () => ipcRenderer.invoke('server:stop'),
    getNetworkInfo: () => ipcRenderer.invoke('network:info'),
    getAppVersion: () => ipcRenderer.invoke('app:version'),
    openParent: () => ipcRenderer.invoke('window:open', 'parent'),
    openScoreDisplay: () => ipcRenderer.invoke('window:open', 'score'),
    openScoreDisplayFullscreen: () => ipcRenderer.invoke('window:open', 'score-fullscreen'),
    onServerStatus: (callback) => {
        ipcRenderer.on('server:status', (_event, payload) => callback(payload));
    },
    ...createUpdateApi()
});
