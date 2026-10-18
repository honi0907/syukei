const { contextBridge, ipcRenderer } = require('electron');

function createUpdateApi() {
    return {
        checkForUpdate: () => ipcRenderer.invoke('app-update:check'),
        installUpdate: () => ipcRenderer.invoke('app-update:install'),
        onUpdateProgress: (callback) => {
            const listener = (_event, data) => {
                callback(data);
            };
            ipcRenderer.on('app-update:progress', listener);
            return () => {
                ipcRenderer.removeListener('app-update:progress', listener);
            };
        }
    };
}

contextBridge.exposeInMainWorld('kokiAPI', {
    getDefaultHost: () => ipcRenderer.invoke('koki:get-default-host'),
    connect: (host, fullscreen) => ipcRenderer.invoke('koki:connect', { host, fullscreen }),
    getAppVersion: () => ipcRenderer.invoke('app:version'),
    ...createUpdateApi()
});
