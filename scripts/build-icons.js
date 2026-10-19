const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const pngToIco = require('png-to-ico');

const root = path.join(__dirname, '..');
const buildDir = path.join(root, 'build');
const icoPath = path.join(buildDir, 'icon.ico');
const sizes = [16, 32, 48, 64, 128, 256];

async function main() {
    const psScript = path.join(__dirname, 'generate-icon.ps1');
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psScript}"`, {
        cwd: root,
        stdio: 'inherit'
    });

    const pngPaths = sizes.map((size) => path.join(buildDir, `icon-${size}.png`));
    for (const pngPath of pngPaths) {
        if (!fs.existsSync(pngPath)) {
            throw new Error(`missing ${pngPath}`);
        }
    }

    const buf = await pngToIco(pngPaths);
    fs.writeFileSync(icoPath, buf);
    fs.copyFileSync(path.join(buildDir, 'icon.png'), path.join(root, 'electron', 'icon.png'));
    fs.copyFileSync(icoPath, path.join(root, 'electron', 'icon.ico'));
    console.log('build/icon.ico と electron/icon.* を更新しました（複数解像度）。');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
