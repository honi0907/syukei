const { app, BrowserWindow, ipcMain } = require('electron');
const { registerAppUpdateIpc } = require('../app-updater');
const { parseServerHost } = require('../parse-server-host');
const path = require('path');
const fs = require('fs');
const http = require('http');

const PORT = 5555;
const CONFIG_FILE = 'server-host.txt';

/** @type {BrowserWindow | null} */
let connectWindow = null;
/** @type {BrowserWindow | null} */
let clientWindow = null;

function getConfigPath() {
    return path.join(app.getPath('userData'), CONFIG_FILE);
}

function readSavedHost() {
    try {
        const host = parseServerHost(fs.readFileSync(getConfigPath(), 'utf8'));
        return host || 'localhost';
    } catch {
        return 'localhost';
    }
}

function saveHost(host) {
    fs.writeFileSync(getConfigPath(), host, 'utf8');
}

function pingServerOnce(host) {
    return new Promise((resolve) => {
        const req = http.get(`http://${host}:${PORT}/client`, (res) => {
            res.resume();
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(3000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

/** @returns {Promise<{ ok: true; host: string } | { ok: false }>} */
async function pingServer(hostInput) {
    const parsed = parseServerHost(hostInput);
    if (!parsed) {
        return { ok: false };
    }

    const candidates =
        parsed === 'localhost' || parsed === '127.0.0.1'
            ? ['127.0.0.1', 'localhost']
            : [parsed];

    for (const host of candidates) {
        if (await pingServerOnce(host)) {
            return { ok: true, host };
        }
    }
    return { ok: false };
}

function createConnectWindow() {
    connectWindow = new BrowserWindow({
        width: 520,
        height: 400,
        minWidth: 440,
        minHeight: 360,
        title: '集計システム 子機',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    connectWindow.loadFile(path.join(__dirname, 'connect.html'));
    connectWindow.on('closed', () => {
        connectWindow = null;
    });
}

function openClientWindow(host, fullscreen) {
    const url = `http://${host}:${PORT}/client`;

    if (clientWindow && !clientWindow.isDestroyed()) {
        clientWindow.loadURL(url);
        clientWindow.show();
        clientWindow.focus();
        if (fullscreen) {
            clientWindow.setFullScreen(true);
        }
        return;
    }

    clientWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        show: false,
        title: '子機 - 点数入力',
        autoHideMenuBar: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    clientWindow.loadURL(url);
    clientWindow.once('ready-to-show', () => {
        if (fullscreen) {
            clientWindow.setFullScreen(true);
        }
        clientWindow.show();
    });

    clientWindow.on('closed', () => {
        clientWindow = null;
    });
}

ipcMain.handle('koki:get-default-host', () => readSavedHost());

ipcMain.handle('koki:connect', async (_event, payload) => {
    const raw = (payload?.host || 'localhost').trim();
    const host = parseServerHost(raw);
    const fullscreen = Boolean(payload?.fullscreen);

    if (!host) {
        return {
            ok: false,
            error: 'サーバーアドレスを入力してください。（例: localhost または 192.168.1.10）'
        };
    }

    const reachable = await pingServer(host);
    if (!reachable.ok) {
        return {
            ok: false,
            error: `親機サーバーに接続できません（http://${host}:${PORT}/client）。\n・親機で「サーバーを起動」しているか確認\n・アドレスは URL 全体ではなく IP または localhost のみ入力`
        };
    }

    saveHost(reachable.host);
    openClientWindow(reachable.host, fullscreen);
    if (connectWindow && !connectWindow.isDestroyed()) {
        connectWindow.hide();
    }
    return { ok: true, url: `http://${reachable.host}:${PORT}/client` };
});

ipcMain.handle('app:version', () => ({
    app: 'child',
    version: app.getVersion(),
    name: app.getName()
}));

registerAppUpdateIpc(ipcMain, app, 'child');

app.whenReady().then(() => {
    createConnectWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createConnectWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
