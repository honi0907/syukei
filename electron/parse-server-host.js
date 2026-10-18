/**
 * 子機接続欄の入力をホスト名/IP に正規化する。
 * 例: "http://localhost:5555/client" → "localhost"
 * @param {string} input
 * @returns {string}
 */
function parseServerHost(input) {
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

module.exports = { parseServerHost };
