const { screen } = require('electron');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = 'score-output-display.json';

/**
 * @param {import('electron').App} app
 * @returns {string | null} display id
 */
function readSavedDisplayId(app) {
    try {
        const raw = fs.readFileSync(path.join(app.getPath('userData'), CONFIG_FILE), 'utf8');
        const data = JSON.parse(raw);
        return data.displayId != null ? String(data.displayId) : null;
    } catch {
        return null;
    }
}

/**
 * 得点発表の出力先ディスプレイ（2台目など。未設定時はプライマリ以外で最も離れた画面）
 * @param {import('electron').App} [app]
 */
function pickScoreOutputDisplay(app) {
    const displays = screen.getAllDisplays();
    if (displays.length === 0) {
        return screen.getPrimaryDisplay();
    }

    const savedId = app ? readSavedDisplayId(app) : null;
    if (savedId) {
        const saved = displays.find((d) => String(d.id) === savedId);
        if (saved) {
            return saved;
        }
    }

    const primary = screen.getPrimaryDisplay();
    const others = displays.filter((d) => d.id !== primary.id);
    if (others.length === 0) {
        return primary;
    }

    others.sort((a, b) => {
        const distA = Math.hypot(a.bounds.x - primary.bounds.x, a.bounds.y - primary.bounds.y);
        const distB = Math.hypot(b.bounds.x - primary.bounds.x, b.bounds.y - primary.bounds.y);
        return distB - distA;
    });
    return others[0];
}

/**
 * @param {import('electron').BrowserWindow} win
 * @param {{ fullscreen?: boolean; width?: number; height?: number; app?: import('electron').App }} options
 */
function placeScoreWindowOnOutput(win, options = {}) {
    if (!win || win.isDestroyed()) {
        return;
    }

    const fullscreen = Boolean(options.fullscreen);
    const width = options.width ?? 1280;
    const height = options.height ?? 720;
    const display = pickScoreOutputDisplay(options.app);

    const wasFullScreen = win.isFullScreen();
    if (wasFullScreen) {
        win.setFullScreen(false);
    }

    if (fullscreen) {
        win.setBounds({
            x: display.bounds.x,
            y: display.bounds.y,
            width: display.bounds.width,
            height: display.bounds.height
        });
        win.setFullScreen(true);
        return;
    }

    const area = display.workArea;
    const w = Math.min(width, area.width);
    const h = Math.min(height, area.height);
    const x = Math.round(area.x + (area.width - w) / 2);
    const y = Math.round(area.y + (area.height - h) / 2);
    win.setBounds({ x, y, width: w, height: h });
}

/**
 * 新規 BrowserWindow 用の初期位置（プライマリ上に一瞬出ないよう出力先に置く）
 */
function getScoreWindowCreateOptions(app, { width = 1280, height = 720, fullscreen = false } = {}) {
    const display = pickScoreOutputDisplay(app);
    if (fullscreen) {
        return {
            x: display.bounds.x,
            y: display.bounds.y,
            width: display.bounds.width,
            height: display.bounds.height
        };
    }
    const area = display.workArea;
    const w = Math.min(width, area.width);
    const h = Math.min(height, area.height);
    return {
        x: Math.round(area.x + (area.width - w) / 2),
        y: Math.round(area.y + (area.height - h) / 2),
        width: w,
        height: h
    };
}

module.exports = {
    pickScoreOutputDisplay,
    placeScoreWindowOnOutput,
    getScoreWindowCreateOptions,
    readSavedDisplayId
};