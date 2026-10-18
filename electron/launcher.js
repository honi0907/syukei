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

setUiState('stopped');
