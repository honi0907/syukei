/**
 * サーバー接続用ホスト名を正規化（URL 貼り付け対応）
 * @param {string} input
 * @returns {string}
 */
function normalizeServerHost(input) {
    let raw = String(input || '').trim();
    if (!raw) {
        return '';
    }

    if (/^https?:\/\//i.test(raw)) {
        try {
            const url = new URL(raw);
            raw = url.hostname || '';
        } catch {
            raw = raw.replace(/^https?:\/\//i, '');
        }
    }

    raw = raw.split('/')[0].split('?')[0].split('#')[0].trim();

    if (raw.startsWith('[')) {
        const end = raw.indexOf(']');
        if (end !== -1) {
            return raw.slice(1, end);
        }
    }

    const colon = raw.lastIndexOf(':');
    if (colon > 0 && /^\d+$/.test(raw.slice(colon + 1))) {
        raw = raw.slice(0, colon);
    }

    return raw.trim();
}
