const { ipcRenderer } = require('electron');

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

module.exports = { createUpdateApi };
