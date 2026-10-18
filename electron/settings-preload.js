const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('syukeiDesktop', {});
