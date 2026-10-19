const { app, BrowserWindow, ipcMain } = require('electron');
const { registerAppUpdateIpc } = require('./app-updater');
const { getBrowserWindowIcon } = require('./app-icon');
const { repairDesktopShortcutIfPresent } = require('./repair-desktop-shortcut');
const path = require('path');
const http = require('http');
const net = require('net');
const os = require('os');
const { spawn, execSync } = require('child_process');

const PORT = 5555;
const SERVER_READY_TIMEOUT_MS = 30000;
const SERVER_POLL_INTERVAL_MS = 400;

/** @type {import('child_process').ChildProcess | null} */
let serverProcess = null;
/** @type {BrowserWindow | null} */
let launcherWindow = null;
/** @type {BrowserWindow | null} */
let parentWindow = null;
/** @type {BrowserWindow | null} */
let scoreWindow = null;
/** @type {BrowserWindow | null} */
let settingsWindow = null;
/** @type {string} */
let lastServerErrorLog = '';

function getAppRoot() {
    if (app.isPackaged) {
        const asarPath = app.getAppPath();
        if (asarPath.endsWith('.asar')) {
            return `${asarPath}.unpacked`;
        }
        return asarPath;
    }
    return path.join(__dirname, '..');
}

function getServerScriptPath() {
    return path.join(getAppRoot(), 'server.js');
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getLocalIPAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return null;
}

function buildNetworkInfo() {
    const lanIp = getLocalIPAddress();
    const baseLocal = `http://localhost:${PORT}`;
    const baseLan = lanIp ? `http://${lanIp}:${PORT}` : null;

    return {
        port: PORT,
        lanIp,
        urls: {
            parentLocal: `${baseLocal}/`,
            parentLan: baseLan ? `${baseLan}/` : '（LAN IPを取得できません）',
            clientLocal: `${baseLocal}/client`,
            clientLan: baseLan ? `${baseLan}/client` : '（LAN IPを取得できません）',
            rankingLocal: `${baseLocal}/ranking`,
            rankingLan: baseLan ? `${baseLan}/ranking` : null
        }
    };
}

function pingServer() {
    return new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${PORT}/`, (res) => {
            res.resume();
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

function isPortListening(port) {
    return new Promise((resolve) => {
        const socket = net.createConnection({ port, host: '127.0.0.1' });
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('error', () => resolve(false));
        socket.setTimeout(1500, () => {
            socket.destroy();
            resolve(false);
        });
    });
}

function getListeningPid(port) {
    if (process.platform !== 'win32') {
        return null;
    }
    try {
        const output = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
        const suffix = `:${port}`;
        for (const line of output.split('\n')) {
            if (!line.includes('LISTENING') || !line.includes(suffix)) {
                continue;
            }
            const parts = line.trim().split(/\s+/);
            const pid = parseInt(parts[parts.length - 1], 10);
            if (!Number.isNaN(pid)) {
                return pid;
            }
        }
    } catch {
        return null;
    }
    return null;
}

async function terminatePid(pid) {
    if (!pid || pid === process.pid) {
        return false;
    }
    try {
        if (process.platform === 'win32') {
            execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
        } else {
            process.kill(pid, 'SIGTERM');
        }
        await sleep(800);
        return true;
    } catch {
        return false;
    }
}

async function preparePortForServerStart() {
    if (await pingServer()) {
        return { ok: true, mode: 'already-running' };
    }

    if (!(await isPortListening(PORT))) {
        return { ok: true, mode: 'start-new' };
    }

    const blockerPid = getListeningPid(PORT);
    if (blockerPid) {
        await terminatePid(blockerPid);
        await sleep(500);
    }

    if (await pingServer()) {
        return { ok: true, mode: 'already-running' };
    }

    if (await isPortListening(PORT)) {
        return {
            ok: false,
            error: `ポート ${PORT} が他のプログラムに占有されています（PID: ${blockerPid ?? '不明'}）。`
        };
    }

    return { ok: true, mode: 'start-new' };
}

async function waitForServerReady() {
    const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (await pingServer()) {
            return true;
        }
        await sleep(SERVER_POLL_INTERVAL_MS);
    }
    return false;
}

function broadcastServerStatus(payload) {
    if (launcherWindow && !launcherWindow.isDestroyed()) {
        launcherWindow.webContents.send('server:status', payload);
    }
}

function appendServerLog(chunk, isError) {
    const text = chunk.toString();
    lastServerErrorLog = (lastServerErrorLog + text).slice(-4000);
    if (isError) {
        console.error('[server]', text.trim());
    } else {
        console.log('[server]', text.trim());
    }
}

function startServerProcess() {
    return new Promise(async (resolve) => {
        if (serverProcess) {
            resolve({ ok: true, alreadyRunning: true });
            return;
        }

        lastServerErrorLog = '';
        const portPrep = await preparePortForServerStart();
        if (!portPrep.ok) {
            resolve({ ok: false, error: portPrep.error });
            return;
        }
        if (portPrep.mode === 'already-running') {
            broadcastServerStatus({ state: 'running' });
            resolve({ ok: true, alreadyRunning: true });
            return;
        }

        const appRoot = getAppRoot();
        const serverScript = getServerScriptPath();
        let settled = false;

        const finish = (result) => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(result);
        };

        if (app.isPackaged) {
            try {
                process.chdir(appRoot);
                process.env.SYUKEI_APP_VERSION = app.getVersion();
                const serverModule = require(serverScript);
                serverModule.startServer();
                serverProcess = { inProcess: true, server: serverModule.server };
            } catch (error) {
                finish({
                    ok: false,
                    error: error instanceof Error ? error.message : 'サーバーの起動に失敗しました。'
                });
                return;
            }
        } else {
            serverProcess = spawn(process.execPath, [serverScript], {
                cwd: appRoot,
                env: {
                    ...process.env,
                    ELECTRON_RUN_AS_NODE: '1'
                },
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true
            });

            serverProcess.stdout?.on('data', (chunk) => appendServerLog(chunk, false));
            serverProcess.stderr?.on('data', (chunk) => appendServerLog(chunk, true));

            serverProcess.on('exit', (code) => {
                serverProcess = null;
                if (!settled && code !== 0) {
                    const detail = lastServerErrorLog.trim();
                    const message = detail.includes('EADDRINUSE') || detail.includes('使用中')
                        ? `ポート ${PORT} が使用中です。以前起動したサーバーが残っている可能性があります。`
                        : detail || `サーバーが異常終了しました（コード: ${code}）`;
                    finish({ ok: false, error: message });
                    broadcastServerStatus({ state: 'error', message });
                    return;
                }
                if (settled) {
                    broadcastServerStatus({ state: 'stopped' });
                }
            });
        }

        const ready = await waitForServerReady();
        if (!ready) {
            await stopServerProcess();
            finish({
                ok: false,
                error:
                    lastServerErrorLog.trim() ||
                    `サーバーの起動がタイムアウトしました。ポート ${PORT} の状態を確認してください。`
            });
            return;
        }

        broadcastServerStatus({ state: 'running' });
        finish({ ok: true });
    });
}

async function stopServerProcess() {
    if (serverProcess?.inProcess) {
        await new Promise((resolve) => {
            serverProcess.server.close(() => {
                serverProcess = null;
                resolve(undefined);
            });
        });
    } else if (serverProcess) {
        await new Promise((resolve) => {
            const proc = serverProcess;
            const forceKillTimer = setTimeout(() => {
                if (proc && !proc.killed) {
                    proc.kill('SIGKILL');
                }
            }, 5000);

            proc.once('exit', () => {
                clearTimeout(forceKillTimer);
                serverProcess = null;
                resolve(undefined);
            });

            proc.kill('SIGTERM');
        });
    }

    if (await pingServer()) {
        const pid = getListeningPid(PORT);
        if (pid) {
            await terminatePid(pid);
        }
    }

    broadcastServerStatus({ state: 'stopped' });
    return { ok: true };
}

function browserWindowIconOptions() {
    const icon = getBrowserWindowIcon();
    return icon ? { icon } : {};
}

function createLauncherWindow() {
    launcherWindow = new BrowserWindow({
        width: 960,
        height: 720,
        minWidth: 720,
        minHeight: 660,
        title: '集計システム ランチャー',
        autoHideMenuBar: true,
        ...browserWindowIconOptions(),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    launcherWindow.loadFile(path.join(__dirname, 'launcher.html'));
    launcherWindow.on('closed', () => {
        launcherWindow = null;
    });
}

function getWindowConfig(kind, info, options = {}) {
    const fullscreen = Boolean(options.fullscreen);
    const baseLocal = info.urls.parentLocal.replace(/\/$/, '');

    switch (kind) {
        case 'parent':
            return {
                url: `${baseLocal}/`,
                existing: parentWindow,
                title: '親機 - 点数集計',
                width: 1400,
                height: 900,
                preload: path.join(__dirname, 'desktop-preload.js'),
                fullscreen: false
            };
        case 'score':
            return {
                url: info.urls.rankingLocal,
                existing: scoreWindow,
                title: '親機点数画面 - 得点発表',
                width: 1280,
                height: 720,
                preload: undefined,
                fullscreen
            };
        case 'settings':
            return {
                url: `${baseLocal}/settings`,
                existing: settingsWindow,
                title: '得点発表 設定',
                width: 980,
                height: 720,
                preload: path.join(__dirname, 'settings-preload.js'),
                fullscreen: false
            };
        default:
            return null;
    }
}

function setWindowRef(kind, win) {
    if (kind === 'parent') {
        parentWindow = win;
    } else if (kind === 'score') {
        scoreWindow = win;
    } else if (kind === 'settings') {
        settingsWindow = win;
    }
}

function clearWindowRef(kind) {
    setWindowRef(kind, null);
}

function openAppWindow(kind, options = {}) {
    const info = buildNetworkInfo();
    const config = getWindowConfig(kind, info, options);
    if (!config) {
        return;
    }

    if (config.existing && !config.existing.isDestroyed()) {
        config.existing.show();
        config.existing.focus();
        if (kind === 'score') {
            config.existing.setFullScreen(config.fullscreen);
        }
        return;
    }

    const win = new BrowserWindow({
        width: config.width,
        height: config.height,
        show: false,
        title: config.title,
        autoHideMenuBar: true,
        ...browserWindowIconOptions(),
        webPreferences: {
            preload: config.preload,
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    win.loadURL(config.url);
    win.once('ready-to-show', () => {
        if (kind === 'score' && config.fullscreen) {
            win.setFullScreen(true);
        }
        win.show();
    });
    win.on('closed', () => {
        clearWindowRef(kind);
    });

    setWindowRef(kind, win);
}

ipcMain.handle('server:start', () => startServerProcess());
ipcMain.handle('server:stop', () => stopServerProcess());
ipcMain.handle('network:info', () => buildNetworkInfo());
ipcMain.handle('window:open', async (_event, kind) => {
    const fullscreen = kind === 'score-fullscreen';
    const normalizedKind = fullscreen ? 'score' : kind;
    if (normalizedKind !== 'parent' && normalizedKind !== 'score' && normalizedKind !== 'settings') {
        return { ok: false };
    }
    if (!(await pingServer())) {
        return {
            ok: false,
            error: 'サーバーが起動していません。先にランチャーで「サーバーを起動」を押してください。'
        };
    }
    openAppWindow(normalizedKind, { fullscreen });
    return { ok: true };
});

ipcMain.handle('app:version', () => ({
    app: 'parent',
    version: app.getVersion(),
    name: app.getName()
}));

registerAppUpdateIpc(ipcMain, app, 'parent');

if (process.platform === 'win32') {
    app.setAppUserModelId('jp.syukei.parent');
}

app.whenReady().then(() => {
    repairDesktopShortcutIfPresent(app);
    createLauncherWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createLauncherWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    if (serverProcess) {
        serverProcess.kill('SIGTERM');
    }
});
