const path = require('path');
const fs = require('fs');

function getAppIconPath() {
    const candidates = [
        path.join(__dirname, 'icon.png'),
        path.join(__dirname, '..', 'build', 'icon.png')
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

function getBrowserWindowIcon() {
    const iconPath = getAppIconPath();
    if (!iconPath) {
        return undefined;
    }
    const { nativeImage } = require('electron');
    const image = nativeImage.createFromPath(iconPath);
    return image.isEmpty() ? undefined : image;
}

module.exports = { getAppIconPath, getBrowserWindowIcon };
