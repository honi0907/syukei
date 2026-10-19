const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');

const root = path.join(__dirname, '..');
const pngPath = path.join(root, 'build', 'icon.png');
const icoPath = path.join(root, 'build', 'icon.ico');

async function main() {
    if (!fs.existsSync(pngPath)) {
        console.error('build/icon.png がありません。先に 512x512 の PNG を build/icon.png に置いてください。');
        process.exit(1);
    }
    const buf = await pngToIco(pngPath);
    fs.writeFileSync(icoPath, buf);
    fs.copyFileSync(pngPath, path.join(root, 'electron', 'icon.png'));
    fs.copyFileSync(icoPath, path.join(root, 'electron', 'icon.ico'));
    console.log('build/icon.ico と electron/icon.* を更新しました。');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
