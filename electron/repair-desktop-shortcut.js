const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * サイレント更新後など、デスクトップ .lnk の IconLocation が古い Electron のままになるのを直す。
 * 既にあるショートカットだけ更新（勝手に新規作成はしない）。
 * @param {import('electron').App} electronApp
 */
function repairDesktopShortcutIfPresent(electronApp) {
    if (!electronApp.isPackaged || process.platform !== 'win32') {
        return;
    }

    const version = electronApp.getVersion();
    const marker = path.join(electronApp.getPath('userData'), `desktop-shortcut-repaired-${version}`);
    if (fs.existsSync(marker)) {
        return;
    }

    const exePath = process.execPath;
    const workDir = path.dirname(exePath);
    const desktopDir = electronApp.getPath('desktop');
    const appName = electronApp.getName();

    /** @type {string[]} */
    const candidateNames = [
        `${appName}.lnk`,
        '集計システム 親機.lnk',
        '集計システム 子機.lnk'
    ];

    const seen = new Set();
    /** @type {string[]} */
    const linkPaths = [];
    for (const name of candidateNames) {
        const full = path.join(desktopDir, name);
        if (seen.has(full) || !fs.existsSync(full)) {
            continue;
        }
        seen.add(full);
        linkPaths.push(full);
    }

    if (linkPaths.length === 0) {
        fs.writeFileSync(marker, 'no-desktop-link', 'utf8');
        return;
    }

    const scriptPath = path.join(electronApp.getPath('temp'), `syukei-repair-shortcut-${Date.now()}.ps1`);
    const escaped = (value) => String(value).replace(/'/g, "''");

    const psLines = linkPaths.map((lnk) => {
        return `
$sc = $shell.CreateShortcut('${escaped(lnk)}')
$sc.TargetPath = '${escaped(exePath)}'
$sc.WorkingDirectory = '${escaped(workDir)}'
$sc.IconLocation = '${escaped(exePath)},0'
$sc.Save()`;
    });

    const psScript = `
$ErrorActionPreference = 'Stop'
$shell = New-Object -ComObject WScript.Shell
${psLines.join('\n')}
`;

    try {
        fs.writeFileSync(scriptPath, psScript, 'utf8');
        execFileSync(
            'powershell.exe',
            ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
            { windowsHide: true, stdio: 'ignore' }
        );
        fs.writeFileSync(marker, new Date().toISOString(), 'utf8');
    } catch {
        /* 失敗しても起動は続行 */
    } finally {
        try {
            fs.unlinkSync(scriptPath);
        } catch {
            /* ignore */
        }
    }
}

module.exports = { repairDesktopShortcutIfPresent };
