const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const startServerBtn = document.getElementById('startServerBtn');
const stopServerBtn = document.getElementById('stopServerBtn');
const addressSection = document.getElementById('addressSection');
const openParentBtn = document.getElementById('openParentBtn');
const openScoreBtn = document.getElementById('openScoreBtn');
const openScoreFullscreenBtn = document.getElementById('openScoreFullscreenBtn');

function setUiState(state) {
    statusDot.className = 'launcher-status-dot ' + state;

    if (state === 'stopped') {
        statusText.textContent = 'サーバー停止中';
        startServerBtn.disabled = false;
        startServerBtn.hidden = false;
        stopServerBtn.hidden = true;
        addressSection.hidden = true;
        openParentBtn.disabled = false;
        openScoreBtn.disabled = false;
        openScoreFullscreenBtn.disabled = false;
        return;
    }

    if (state === 'starting') {
        statusText.textContent = 'サーバー起動中…';
        startServerBtn.disabled = true;
        stopServerBtn.hidden = true;
        addressSection.hidden = true;
        openParentBtn.disabled = true;
        openScoreBtn.disabled = true;
        openScoreFullscreenBtn.disabled = true;
        return;
    }

    if (state === 'running') {
        statusText.textContent = 'サーバー稼働中';
        startServerBtn.hidden = true;
        stopServerBtn.hidden = false;
        stopServerBtn.disabled = false;
        addressSection.hidden = false;
        openParentBtn.disabled = false;
        openScoreBtn.disabled = false;
        openScoreFullscreenBtn.disabled = false;
    }
}

async function fillAddresses() {
    const info = await window.launcherAPI.getNetworkInfo();
    document.getElementById('parentLocalUrl').textContent = info.urls.parentLocal;
    document.getElementById('parentLanUrl').textContent = info.urls.parentLan;
    document.getElementById('clientLocalUrl').textContent = info.urls.clientLocal;
    document.getElementById('clientLanUrl').textContent = info.urls.clientLan;
}

startServerBtn.addEventListener('click', async () => {
    setUiState('starting');
    const result = await window.launcherAPI.startServer();
    if (!result.ok) {
        setUiState('stopped');
        alert(result.error || 'サーバーの起動に失敗しました。');
        return;
    }
    await fillAddresses();
    setUiState('running');
});

stopServerBtn.addEventListener('click', async () => {
    stopServerBtn.disabled = true;
    await window.launcherAPI.stopServer();
    setUiState('stopped');
});

async function tryOpenWindow(openFn) {
    const result = await openFn();
    if (!result?.ok) {
        alert(result?.error || 'サーバーが起動していません。先に「サーバーを起動」を押してください。');
    }
}

openParentBtn.addEventListener('click', () => {
    tryOpenWindow(() => window.launcherAPI.openParent());
});

openScoreBtn.addEventListener('click', () => {
    tryOpenWindow(() => window.launcherAPI.openScoreDisplay());
});

openScoreFullscreenBtn.addEventListener('click', () => {
    tryOpenWindow(() => window.launcherAPI.openScoreDisplayFullscreen());
});

window.launcherAPI.onServerStatus((payload) => {
    if (payload.state === 'running') {
        fillAddresses().then(() => setUiState('running'));
    } else if (payload.state === 'stopped') {
        setUiState('stopped');
    } else if (payload.state === 'error') {
        setUiState('stopped');
        alert(payload.message || 'サーバーが異常終了しました。');
    }
});

const updateStatusEl = document.getElementById('updateStatus');
const installUpdateBtn = document.getElementById('installUpdateBtn');
const updateProgressWrap = document.getElementById('updateProgressWrap');
const updateProgressBar = document.getElementById('updateProgressBar');
const updateProgressText = document.getElementById('updateProgressText');
const checkUpdateBtn = document.getElementById('checkUpdateBtn');
const launcherVersionEl = document.getElementById('launcherVersion');

function setInstallVisible(visible) {
    if (installUpdateBtn) {
        installUpdateBtn.hidden = !visible;
    }
}

function resetProgressUi() {
    if (updateProgressWrap) {
        updateProgressWrap.hidden = true;
    }
    if (updateProgressBar) {
        updateProgressBar.style.width = '0%';
    }
    if (updateProgressText) {
        updateProgressText.textContent = '0%';
    }
}

async function initLauncherVersion() {
    if (!launcherVersionEl || !window.launcherAPI?.getAppVersion) {
        return;
    }
    try {
        const info = await window.launcherAPI.getAppVersion();
        launcherVersionEl.textContent = `${info.name || '集計システム 親機'} v${info.version}`;
    } catch {
        launcherVersionEl.textContent = 'バージョンを取得できませんでした';
    }
}

checkUpdateBtn?.addEventListener('click', async () => {
    if (!window.launcherAPI?.checkForUpdate) {
        updateStatusEl.textContent = 'この環境ではアプリ内更新は利用できません。';
        return;
    }

    checkUpdateBtn.disabled = true;
    setInstallVisible(false);
    resetProgressUi();
    updateStatusEl.textContent = '更新情報を確認しています…';

    try {
        const result = await window.launcherAPI.checkForUpdate();
        if (result.status === 'update-available') {
            updateStatusEl.textContent = `新しいバージョン v${result.latest} があります。`;
            setInstallVisible(true);
        } else if (result.status === 'update-not-available') {
            updateStatusEl.textContent = '現在のバージョンは最新です。';
        } else if (result.status === 'dev') {
            updateStatusEl.textContent = result.message || '開発モードではアプリ内更新は利用できません。';
        } else {
            updateStatusEl.textContent = result.message || '更新情報を取得できませんでした。';
        }
    } catch {
        updateStatusEl.textContent = '更新情報を取得できませんでした。ネットワーク接続を確認してください。';
    } finally {
        checkUpdateBtn.disabled = false;
    }
});

installUpdateBtn?.addEventListener('click', async () => {
    if (!window.launcherAPI?.installUpdate) {
        return;
    }

    installUpdateBtn.disabled = true;
    checkUpdateBtn.disabled = true;
    updateStatusEl.textContent = '更新をダウンロードしています…';
    updateProgressWrap.hidden = false;

    const removeProgressListener = window.launcherAPI.onUpdateProgress?.(({ percent }) => {
        updateProgressBar.style.width = `${percent}%`;
        updateProgressText.textContent = `${percent}%`;
    });

    try {
        const result = await window.launcherAPI.installUpdate();
        if (result?.ok) {
            updateStatusEl.textContent = 'インストールを開始しました。アプリを終了します…';
        } else {
            updateStatusEl.textContent = result?.error || '更新のインストールに失敗しました。';
            installUpdateBtn.disabled = false;
            checkUpdateBtn.disabled = false;
        }
    } catch {
        updateStatusEl.textContent = '更新のインストールに失敗しました。';
        installUpdateBtn.disabled = false;
        checkUpdateBtn.disabled = false;
    } finally {
        removeProgressListener?.();
    }
});

initLauncherVersion();
setUiState('stopped');
