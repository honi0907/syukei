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
    getDefaultClientId: () => ipcRenderer.invoke('koki:get-default-client-id'),
    pingServer: (host) => ipcRenderer.invoke('koki:ping-server', host),
    fetchClientNames: (host) => ipcRenderer.invoke('koki:fetch-client-names', host),
    connect: (host, fullscreen, clientId) =>
        ipcRenderer.invoke('koki:connect', { host, fullscreen, clientId }),
    getAppVersion: () => ipcRenderer.invoke('app:version'),
    ...createUpdateApi()
});
