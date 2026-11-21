/* チーム名（6セット×6チーム）のファイル読込 */
(function () {
    const socket = io();
    const SET_COUNT = 6;
    const TEAM_COUNT = 6;

    const pathInput = document.getElementById('teamNameFilePath');
    const browseBtn = document.getElementById('browseTeamNameFileBtn');
    const reloadBtn = document.getElementById('reloadTeamNameFileBtn');
    const fileInput = document.getElementById('teamNameFileInput');
    const previewList = document.getElementById('teamNamePreviewList');
    const statusEl = document.getElementById('teamNameLoadStatus');
    const previewLabel = document.getElementById('teamNamePreviewLabel');
    let currentSet = 1;
    let teamNamesBySet = null;

    function getSetStartLines() {
        const lines = [];
        for (let i = 1; i <= SET_COUNT; i += 1) {
            const input = document.getElementById(`teamSetStartLine${i}`);
            const n = Number.parseInt(input?.value || '1', 10);
            lines.push(Number.isFinite(n) && n >= 1 ? n : 1);
        }
        return lines;
    }

    function setSetStartLineInputs(setStartLines) {
        if (!Array.isArray(setStartLines)) {
            return;
        }
        for (let i = 0; i < SET_COUNT; i += 1) {
            const input = document.getElementById(`teamSetStartLine${i + 1}`);
            if (input && setStartLines[i]) {
                input.value = String(setStartLines[i]);
            }
        }
    }

    function setStatus(message, kind) {
        if (!statusEl) {
            return;
        }
        statusEl.textContent = message;
        statusEl.className = 'settings-load-status' + (kind ? ` ${kind}` : '');
    }

    function renderPreview(names, startLine, setIndex) {
        if (!previewList || !Array.isArray(names)) {
            return;
        }
        const setNum = setIndex ?? currentSet;
        const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
        if (previewLabel) {
            previewLabel.textContent = `プレビュー（セット${setNum}・${startLine}行目＝チームA）`;
        }
        previewList.innerHTML = names
            .slice(0, TEAM_COUNT)
            .map((name, index) => {
                const fileLine = startLine + index;
                const fallback = labels[index] || String(index + 1);
                const label = name || fallback;
                return `<li><span class="client-name-preview-id">行${fileLine}・${fallback}</span> ${label}</li>`;
            })
            .join('');
    }

    function previewForCurrentSet() {
        const lines = getSetStartLines();
        const names =
            (teamNamesBySet && teamNamesBySet[currentSet - 1]) ||
            (Array.isArray(teamNamesBySet?.[0]) ? teamNamesBySet[0] : null);
        if (names) {
            renderPreview(names, lines[currentSet - 1] || 1, currentSet);
        }
    }

    async function refreshFromServer() {
        try {
            const res = await fetch('/api/team-names', { cache: 'no-store' });
            if (!res.ok) {
                throw new Error('取得に失敗しました');
            }
            const data = await res.json();
            if (pathInput) {
                pathInput.value = data.path || '';
            }
            if (Array.isArray(data.setStartLines)) {
                setSetStartLineInputs(data.setStartLines);
            }
            if (Array.isArray(data.teamNamesBySet)) {
                teamNamesBySet = data.teamNamesBySet;
            }
            if (typeof data.currentSet === 'number') {
                currentSet = data.currentSet;
            }
            previewForCurrentSet();
        } catch (error) {
            setStatus(error.message || 'サーバーから読み込めませんでした', 'error');
        }
    }

    async function applyLoad(body) {
        setStatus('読み込み中...', 'info');
        try {
            const res = await fetch('/api/team-names/load', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...body,
                    setStartLines: body.setStartLines ?? getSetStartLines()
                })
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                throw new Error(data.error || '読み込みに失敗しました');
            }
            if (pathInput && data.path) {
                pathInput.value = data.path;
            }
            if (Array.isArray(data.setStartLines)) {
                setSetStartLineInputs(data.setStartLines);
            }
            if (Array.isArray(data.teamNamesBySet)) {
                teamNamesBySet = data.teamNamesBySet;
            }
            previewForCurrentSet();
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

    for (let i = 1; i <= SET_COUNT; i += 1) {
        document.getElementById(`teamSetStartLine${i}`)?.addEventListener('change', () => {
            const path = pathInput?.value?.trim();
            if (path) {
                applyLoad({ path, setStartLines: getSetStartLines() });
            } else {
                applyLoad({ setStartLines: getSetStartLines() });
            }
        });
    }

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
            await applyLoad({ content, setStartLines: getSetStartLines() });
        } catch (error) {
            setStatus(error.message || 'ファイルを読めませんでした', 'error');
        }
        fileInput.value = '';
    });

    socket.on('team-names', (data) => {
        if (Array.isArray(data.teamNamesBySet)) {
            teamNamesBySet = data.teamNamesBySet;
        }
        if (typeof data.currentSet === 'number') {
            currentSet = data.currentSet;
        }
        if (Array.isArray(data.teamSetStartLines)) {
            setSetStartLineInputs(data.teamSetStartLines);
        }
        previewForCurrentSet();
    });

    refreshFromServer();
})();