const { contextBridge, ipcRenderer } = require('electron');
const { createUpdateApi } = require('./preload-update-api');

contextBridge.exposeInMainWorld('syukeiDesktop', {
    getDesktopVersion: () => ipcRenderer.invoke('app:version'),
    ...createUpdateApi()
});
