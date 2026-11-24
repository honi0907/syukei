const fs = require('fs');
const path = require('path');
const rcedit = require('rcedit');

function moduleDir(nodeModulesDir, name) {
    return path.join(nodeModulesDir, ...name.split('/'));
}

function readDeps(pkgPath) {
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        return Object.keys(pkg.dependencies || {});
    } catch {
        return [];
    }
}

/**
 * electron-builder の依存収集が取りこぼす本番モジュールを unpacked に補う。
 * @param {string} projectDir
 * @param {string} appOutDir
 */
function copyMissingProductionModules(projectDir, appOutDir) {
    const unpacked = path.join(appOutDir, 'resources', 'app.asar.unpacked', 'node_modules');
    if (!fs.existsSync(unpacked)) {
        return;
    }

    const sourceRoot = path.join(projectDir, 'node_modules');
    const rootDeps = readDeps(path.join(projectDir, 'package.json'));
    const queue = [...rootDeps];
    const seen = new Set();
    const copied = [];

    while (queue.length) {
        const name = queue.shift();
        if (!name || seen.has(name)) {
            continue;
        }
        seen.add(name);
        const source = moduleDir(sourceRoot, name);
        const pkgJson = path.join(source, 'package.json');
        if (!fs.existsSync(pkgJson)) {
            continue;
        }
        readDeps(pkgJson).forEach((dep) => queue.push(dep));
        const dest = moduleDir(unpacked, name);
        if (fs.existsSync(path.join(dest, 'package.json'))) {
            continue;
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.cpSync(source, dest, { recursive: true, dereference: true });
        copied.push(name);
    }

    if (copied.length) {
        console.log(`[afterPack] 不足モジュールを同梱: ${copied.join(', ')}`);
    }
}

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
    copyMissingProductionModules(projectDir, context.appOutDir);
};

module.exports.copyMissingProductionModules = copyMissingProductionModules;
