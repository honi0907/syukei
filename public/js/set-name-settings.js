/* セット名（最大6件）のファイル読込 */
(function () {
    const socket = io();
    const SET_COUNT = 6;

    const pathInput = document.getElementById('setNameFilePath');
    const startLineInput = document.getElementById('setNameStartLine');
    const browseBtn = document.getElementById('browseSetNameFileBtn');
    const reloadBtn = document.getElementById('reloadSetNameFileBtn');
    const fileInput = document.getElementById('setNameFileInput');
    const previewList = document.getElementById('setNamePreviewList');
    const statusEl = document.getElementById('setNameLoadStatus');
    const previewLabel = document.getElementById('setNamePreviewLabel');

    function getStartLine() {
        const n = Number.parseInt(startLineInput?.value || '1', 10);
        return Number.isFinite(n) && n >= 1 ? n : 1;
    }

    function setStatus(message, kind) {
        if (!statusEl) {
            return;
        }
        statusEl.textContent = message;
        statusEl.className = 'settings-load-status' + (kind ? ` ${kind}` : '');
    }

    function renderPreview(names, startLine) {
        if (!previewList || !Array.isArray(names)) {
            return;
        }
        if (previewLabel) {
            previewLabel.textContent = `プレビュー（${startLine}行目＝セット1。最大${SET_COUNT}件）`;
        }
        previewList.innerHTML = names
            .slice(0, SET_COUNT)
            .map((name, index) => {
                const fileLine = startLine + index;
                const fallback = ['セット１', 'セット２', 'セット３', 'セット４', 'セット５', 'セット６'][index] || `セット${index + 1}`;
                const label = name || fallback;
                return `<li><span class="client-name-preview-id">行${fileLine}</span> ${label}</li>`;
            })
            .join('');
    }

    async function refreshFromServer() {
        try {
            const res = await fetch('/api/set-names', { cache: 'no-store' });
            if (!res.ok) {
                throw new Error('取得に失敗しました');
            }
            const data = await res.json();
            if (pathInput) {
                pathInput.value = data.path || '';
            }
            if (startLineInput && data.startLine) {
                startLineInput.value = data.startLine;
            }
            renderPreview(data.names, data.startLine || getStartLine());
        } catch (error) {
            setStatus(error.message || 'サーバーから読み込めませんでした', 'error');
        }
    }

    async function applyLoad(body) {
        setStatus('読み込み中...', 'info');
        try {
            const res = await fetch('/api/set-names/load', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...body, startLine: body.startLine ?? getStartLine() })
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                throw new Error(data.error || '読み込みに失敗しました');
            }
            if (pathInput && data.path) {
                pathInput.value = data.path;
            }
            if (startLineInput && data.startLine) {
                startLineInput.value = data.startLine;
            }
            renderPreview(data.names, data.startLine || getStartLine());
            setStatus('読み込み完了', 'success');
        } catch (error) {
            setStatus(error.message || '読み込みに失敗しました', 'error');
        }
    }

    browseBtn?.addEventListener('click', async () => {
        if (window.syukeiSettings?.pickTextFile) {
            const picked = await window.syukeiSettings.pickTextFile();
            if (picked?.path) {
                if (pathInput) {
                    pathInput.value = picked.path;
                }
                await applyLoad({ path: picked.path });
            }
            return;
        }
        fileInput?.click();
    });

    reloadBtn?.addEventListener('click', async () => {
        const path = pathInput?.value?.trim();
        if (path) {
            await applyLoad({ path });
        } else {
            await applyLoad({});
        }
    });

    startLineInput?.addEventListener('change', () => {
        const path = pathInput?.value?.trim();
        if (path) {
            applyLoad({ path, startLine: getStartLine() });
        } else {
            applyLoad({ startLine: getStartLine() });
        }
    });

    fileInput?.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) {
            return;
        }
        try {
            const content = await file.text();
            if (pathInput) {
                pathInput.value = file.name;
            }
            await applyLoad({ content, startLine: getStartLine() });
        } catch (error) {
            setStatus(error.message || 'ファイルを読めませんでした', 'error');
        }
        fileInput.value = '';
    });

    socket.on('team-names', (data) => {
        if (Array.isArray(data.setNames)) {
            const start = getStartLine();
            renderPreview(data.setNames, start);
        }
    });

    refreshFromServer();
})();