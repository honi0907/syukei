const { app, BrowserWindow, ipcMain, net } = require('electron');
const { registerAppUpdateIpc } = require('../app-updater');
const { parseServerHost } = require('../parse-server-host');
const { getBrowserWindowIcon } = require('../app-icon');
const { repairDesktopShortcutIfPresent } = require('../repair-desktop-shortcut');
const path = require('path');
const fs = require('fs');

const PORT = 5555;
const CONFIG_FILE = 'server-host.txt';
const CLIENT_ID_FILE = 'client-id.txt';

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

function getClientIdConfigPath() {
    return path.join(app.getPath('userData'), CLIENT_ID_FILE);
}

function readSavedClientId() {
    try {
        const raw = fs.readFileSync(getClientIdConfigPath(), 'utf8').trim();
        const match = raw.match(/^ID(\d+)$/i);
        if (match) {
            const n = Number(match[1]);
            if (n >= 1 && n <= 10) {
                return `ID${n}`;
            }
        }
        if (raw.toLowerCase() === 'test') {
            return 'test';
        }
    } catch {
        /* use default */
    }
    return 'ID1';
}

function saveClientId(clientId) {
    fs.writeFileSync(getClientIdConfigPath(), clientId, 'utf8');
}

/**
 * @param {string} host
 * @returns {Promise<{ ok: true; names: string[] } | { ok: false }>}
 */
function fetchClientNamesFromServer(host) {
    return new Promise((resolve) => {
        const url = `http://${host}:${PORT}/api/client-names`;
        const request = net.request({ method: 'GET', url });
        let body = '';
        let settled = false;

        const finish = (result) => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(result);
        };

        request.on('response', (response) => {
            response.on('data', (chunk) => {
                body += chunk.toString();
            });
            response.on('end', () => {
                if (response.statusCode !== 200) {
                    finish({ ok: false });
                    return;
                }
                try {
                    const data = JSON.parse(body);
                    if (Array.isArray(data.names)) {
                        finish({ ok: true, names: data.names });
                        return;
                    }
                } catch {
                    /* ignore */
                }
                finish({ ok: false });
            });
        });
        request.on('error', () => finish({ ok: false }));
        request.end();
        setTimeout(() => {
            try {
                request.abort();
            } catch {
                /* ignore */
            }
            finish({ ok: false });
        }, 4000);
    });
}

function pingServerOnce(host) {
    return new Promise((resolve) => {
        const url = `http://${host}:${PORT}/client`;
        const request = net.request({ method: 'GET', url });
        let settled = false;

        const finish = (ok) => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(ok);
        };

        request.on('response', (response) => {
            response.on('data', () => {});
            response.on('end', () => {
                finish(response.statusCode === 200);
            });
        });
        request.on('error', () => finish(false));
        request.end();

        setTimeout(() => {
            try {
                request.abort();
            } catch {
                /* ignore */
            }
            finish(false);
        }, 4000);
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

function browserWindowIconOptions() {
    const icon = getBrowserWindowIcon();
    return icon ? { icon } : {};
}

function createConnectWindow() {
    connectWindow = new BrowserWindow({
        width: 520,
        height: 640,
        minWidth: 440,
        minHeight: 520,
        title: '集計システム 子機',
        autoHideMenuBar: true,
        ...browserWindowIconOptions(),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    connectWindow.loadFile(path.join(__dirname, 'connect.html'));
    connectWindow.on('closed', () => {
        connectWindow = null;
    });
}

function openClientWindow(host, fullscreen, clientId) {
    const params = new URLSearchParams({
        serverHost: host,
        electron: '1',
        clientId: clientId || 'ID1',
        skipLogin: '1'
    });
    if (fullscreen) {
        params.set('startFullscreen', '1');
    }
    const url = `http://${host}:${PORT}/client?${params.toString()}`;

    if (clientWindow && !clientWindow.isDestroyed()) {
        clientWindow.loadURL(url);
        clientWindow.show();
        clientWindow.focus();
        clientWindow.setFullScreen(Boolean(fullscreen));
        return;
    }

    clientWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        show: false,
        title: '子機 - 点数入力',
        autoHideMenuBar: true,
        ...browserWindowIconOptions(),
        webPreferences: {
            preload: path.join(__dirname, 'client-preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
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
        if (connectWindow && !connectWindow.isDestroyed()) {
            connectWindow.show();
        }
    });
}

ipcMain.handle('koki:get-default-host', () => readSavedHost());

ipcMain.handle('koki:get-default-client-id', () => readSavedClientId());

ipcMain.handle('koki:ping-server', async (_event, hostInput) => {
    const host = parseServerHost(hostInput);
    if (!host) {
        return { ok: false };
    }
    const reachable = await pingServer(host);
    return reachable.ok ? { ok: true, host: reachable.host } : { ok: false };
});

ipcMain.handle('koki:toggle-client-fullscreen', () => {
    if (!clientWindow || clientWindow.isDestroyed()) {
        return { fullscreen: false };
    }
    const next = !clientWindow.isFullScreen();
    clientWindow.setFullScreen(next);
    return { fullscreen: next };
});

ipcMain.handle('koki:is-client-fullscreen', () => ({
    fullscreen: Boolean(clientWindow && !clientWindow.isDestroyed() && clientWindow.isFullScreen())
}));

ipcMain.handle('koki:fetch-client-names', async (_event, hostInput) => {
    const host = parseServerHost(hostInput);
    if (!host) {
        return { ok: false };
    }
    const reachable = await pingServer(host);
    if (!reachable.ok) {
        return { ok: false };
    }
    return fetchClientNamesFromServer(reachable.host);
});

ipcMain.handle('koki:connect', async (_event, payload) => {
    const raw = (payload?.host || 'localhost').trim();
    const host = parseServerHost(raw);
    const fullscreen = Boolean(payload?.fullscreen);
    let clientId = String(payload?.clientId || '').trim();
    if (!clientId) {
        clientId = readSavedClientId();
    }
    const idMatch = clientId.match(/^ID(\d+)$/i);
    if (idMatch) {
        const n = Number(idMatch[1]);
        if (n < 1 || n > 10) {
            return { ok: false, error: 'ID1〜ID10 から選択してください。' };
        }
        clientId = `ID${n}`;
    } else if (clientId.toLowerCase() !== 'test') {
        return { ok: false, error: 'ID1〜ID10 から選択してください。' };
    }

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
            error: `親機サーバーに接続できません（http://${host}:${PORT}/client）。\n・親機で「サーバーを起動」しているか確認\n・アドレスは URL または IP / localhost のみ入力`
        };
    }

    saveHost(reachable.host);
    saveClientId(clientId);
    openClientWindow(reachable.host, fullscreen, clientId);
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

if (process.platform === 'win32') {
    app.setAppUserModelId('jp.syukei.client');
}

app.whenReady().then(() => {
    repairDesktopShortcutIfPresent(app);
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
