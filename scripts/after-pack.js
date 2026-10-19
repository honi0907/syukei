const path = require('path');
const rcedit = require('rcedit');

/**
 * Windows: signAndEditExecutable=false だと exe にアイコンが付かないため rcedit で埋め込む。
 * @param {import('app-builder-lib').AfterPackContext} context
 */
module.exports = async function afterPack(context) {
    if (context.electronPlatformName !== 'win32') {
        return;
    }

    const projectDir = context.packager.projectDir;
    const iconPath = path.join(projectDir, 'build', 'icon.ico');
    const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);

    await rcedit(exePath, {
        icon: iconPath
    });

    console.log(`[afterPack] アイコンを埋め込みました: ${exePath}`);
};
