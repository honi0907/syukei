/* 子機表示名（ID1〜ID10）のファイル読込 */
(function () {
    const socket = io();

    const pathInput = document.getElementById('clientNameFilePath');
    const startLineInput = document.getElementById('clientNameStartLine');
    const browseBtn = document.getElementById('browseClientNameFileBtn');
    const reloadBtn = document.getElementById('reloadClientNameFileBtn');
    const fileInput = document.getElementById('clientNameFileInput');
    const previewList = document.getElementById('clientNamePreviewList');
    const statusEl = document.getElementById('clientNameLoadStatus');
    const previewLabel = document.getElementById('clientNamePreviewLabel');

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

    function updatePreviewLabel(startLine) {
        if (previewLabel) {
            previewLabel.textContent =
                `プレビュー（${startLine}行目＝ID1。最大10台）`;
        }
    }

    function renderPreview(names, startLine) {
        if (!previewList || !Array.isArray(names)) {
            return;
        }
        updatePreviewLabel(startLine);
        previewList.innerHTML = names
            .map((name, index) => {
                const id = `ID${index + 1}`;
                const fileLine = startLine + index;
                const label = name || id;
                return `<li><span class="client-name-preview-id">行${fileLine}・${id}</span> ${label}</li>`;
            })
            .join('');
    }

    async function refreshFromServer() {
        try {
            const res = await fetch('/api/client-names', { cache: 'no-store' });
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
            const res = await fetch('/api/client-names/load', {
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

    socket.on('client-display-names', (data) => {
        if (data.path && pathInput) {
            pathInput.value = data.path;
        }
        if (data.startLine && startLineInput) {
            startLineInput.value = data.startLine;
        }
        renderPreview(data.names, data.startLine || getStartLine());
    });

    refreshFromServer();
    socket.emit('request-client-display-names');
})();