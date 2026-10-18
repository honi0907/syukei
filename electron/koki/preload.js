const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kokiAPI', {
    getDefaultHost: () => ipcRenderer.invoke('koki:get-default-host'),
    connect: (host, fullscreen) => ipcRenderer.invoke('koki:connect', { host, fullscreen }),
    getAppVersion: () => ipcRenderer.invoke('app:version')
});
