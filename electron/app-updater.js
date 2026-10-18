const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const GITHUB_RELEASES_API = 'https://api.github.com/repos/honi0907/syukei/releases/latest';

/** @type {Record<'parent' | 'child', string>} */
const ASSET_PREFIX = {
    parent: 'syukei-parent-setup',
    child: 'syukei-child-setup'
};

/** @type {{ latest: string; downloadUrl: string; fileName: string } | null} */
let cachedUpdate = null;
/** @type {boolean} */
let installInProgress = false;

function normalizeVersion(version) {
    return String(version || '')
        .replace(/^v/i, '')
        .trim();
}

function compareVersion(a, b) {
    const pa = normalizeVersion(a)
        .split('.')
        .map((n) => parseInt(n, 10) || 0);
    const pb = normalizeVersion(b)
        .split('.')
        .map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff !== 0) {
            return diff;
        }
    }
    return 0;
}

async function fetchLatestRelease() {
    const response = await fetch(GITHUB_RELEASES_API, {
        headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'syukei-desktop-updater'
        }
    });
    if (!response.ok) {
        throw new Error(`GitHub API ${response.status}`);
    }
    return response.json();
}

/**
 * @param {import('electron').App} electronApp
 * @param {'parent' | 'child'} variant
 */
function findInstallerAsset(release, variant) {
    const prefix = ASSET_PREFIX[variant];
    const assets = release.assets || [];
    return assets.find((asset) => asset.name.startsWith(prefix) && asset.name.endsWith('.exe'));
}

/**
 * @param {import('electron').App} electronApp
 * @param {'parent' | 'child'} variant
 */
async function checkForAppUpdate(electronApp, variant) {
    cachedUpdate = null;

    if (!electronApp.isPackaged) {
        return {
            status: 'dev',
            current: electronApp.getVersion(),
            message: '開発モードではアプリ内更新は利用できません。'
        };
    }

    try {
        const release = await fetchLatestRelease();
        const asset = findInstallerAsset(release, variant);
        if (!asset) {
            return {
                status: 'error',
                current: electronApp.getVersion(),
                message: 'リリースにインストーラが見つかりませんでした。'
            };
        }

        const latest = normalizeVersion(release.tag_name);
        const current = electronApp.getVersion();

        if (compareVersion(latest, current) <= 0) {
            return {
                status: 'update-not-available',
                current,
                latest
            };
        }

        cachedUpdate = {
            latest,
            downloadUrl: asset.browser_download_url,
            fileName: asset.name
        };

        return {
            status: 'update-available',
            current,
            latest,
            fileName: asset.name
        };
    } catch {
        return {
            status: 'error',
            current: electronApp.getVersion(),
            message: '更新情報を取得できませんでした。ネットワーク接続を確認してください。'
        };
    }
}

/**
 * @param {string} url
 * @param {string} destPath
 * @param {(percent: number) => void} [onProgress]
 */
async function downloadInstaller(url, destPath, onProgress) {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok || !response.body) {
        throw new Error(`ダウンロードに失敗しました (${response.status})`);
    }

    const total = Number(response.headers.get('content-length')) || 0;
    let received = 0;

    const nodeStream = Readable.fromWeb(response.body);
    nodeStream.on('data', (chunk) => {
        received += chunk.length;
        if (total > 0 && onProgress) {
            onProgress(Math.min(100, Math.round((received / total) * 100)));
        }
    });

    await pipeline(nodeStream, fs.createWriteStream(destPath));

    if (onProgress) {
        onProgress(100);
    }
}

/**
 * @param {import('electron').App} electronApp
 * @param {'parent' | 'child'} variant
 * @param {(percent: number) => void} [onProgress]
 */
async function downloadAndInstallUpdate(electronApp, variant, onProgress) {
    if (!electronApp.isPackaged) {
        return { ok: false, error: '開発モードではアプリ内更新は利用できません。' };
    }
    if (installInProgress) {
        return { ok: false, error: '更新の処理中です。' };
    }

    if (!cachedUpdate) {
        const check = await checkForAppUpdate(electronApp, variant);
        if (check.status !== 'update-available') {
            return { ok: false, error: 'インストール可能な更新がありません。' };
        }
    }

    const { downloadUrl, fileName } = cachedUpdate;
    installInProgress = true;

    const destPath = path.join(electronApp.getPath('temp'), fileName);

    try {
        if (onProgress) {
            onProgress(0);
        }
        await downloadInstaller(downloadUrl, destPath, onProgress);

        spawn(destPath, ['/S'], {
            detached: true,
            stdio: 'ignore'
        }).unref();

        setTimeout(() => {
            electronApp.quit();
        }, 800);

        return { ok: true };
    } catch (err) {
        installInProgress = false;
        const message = err instanceof Error ? err.message : '更新のインストールに失敗しました。';
        return { ok: false, error: message };
    }
}

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {import('electron').App} electronApp
 * @param {'parent' | 'child'} variant
 */
function registerAppUpdateIpc(ipcMain, electronApp, variant) {
    ipcMain.handle('app-update:check', () => checkForAppUpdate(electronApp, variant));

    ipcMain.handle('app-update:install', async (event) => {
        const sendProgress = (percent) => {
            if (!event.sender.isDestroyed()) {
                event.sender.send('app-update:progress', { percent });
            }
        };
        return downloadAndInstallUpdate(electronApp, variant, sendProgress);
    });
}

module.exports = {
    registerAppUpdateIpc,
    checkForAppUpdate,
    compareVersion,
    normalizeVersion
};
