/* 設定スナップショットの JSON エクスポート / インポート */
(function () {
    const exportBtn = document.getElementById('exportSettingsJsonBtn');
    const importInput = document.getElementById('importSettingsJsonInput');
    const statusEl = document.getElementById('settingsJsonStatus');

    function setStatus(message, kind) {
        if (!statusEl) {
            return;
        }
        statusEl.textContent = message;
        statusEl.className = 'settings-load-status' + (kind ? ` ${kind}` : '');
    }

    function downloadFilename() {
        const d = new Date();
        const stamp = d.toISOString().slice(0, 10);
        return `syukei-settings-${stamp}.json`;
    }

    exportBtn?.addEventListener('click', async () => {
        setStatus('書き出し中…', 'info');
        try {
            const res = await fetch('/api/settings/export', { cache: 'no-store' });
            if (!res.ok) {
                throw new Error('書き出しに失敗しました');
            }
            const data = await res.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = downloadFilename();
            a.click();
            URL.revokeObjectURL(url);
            setStatus('JSONをダウンロードしました', 'success');
        } catch (error) {
            setStatus(error.message || '書き出しに失敗しました', 'error');
        }
    });

    importInput?.addEventListener('change', async () => {
        const file = importInput.files?.[0];
        if (!file) {
            return;
        }
        setStatus('読み込み中…', 'info');
        try {
            const text = await file.text();
            const body = JSON.parse(text);
            const res = await fetch('/api/settings/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                throw new Error(data.error || '読み込みに失敗しました');
            }
            setStatus('設定を反映しました（画面を開き直すとプレビューが更新されます）', 'success');
        } catch (error) {
            setStatus(error.message || 'JSONの読み込みに失敗しました', 'error');
        }
        importInput.value = '';
    });
})();