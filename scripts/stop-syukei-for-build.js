/**
 * ビルド前に親機・子機の実行中プロセスを終了する（dist がロックされるのを防ぐ）
 */
const { execSync } = require('child_process');

if (process.platform !== 'win32') {
    process.exit(0);
}

const imageNames = ['集計システム 親機.exe', '集計システム 子機.exe'];

for (const image of imageNames) {
    try {
        execSync(`taskkill /F /IM "${image}" /T`, { stdio: 'ignore', shell: true });
        console.log(`[stop] ${image} を終了しました`);
    } catch {
        /* 未起動 */
    }
}

try {
    const ps = String.raw`
Get-Process electron -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like '*\syukei\*' } |
  Stop-Process -Force -ErrorAction SilentlyContinue
`;
    execSync(`powershell -NoProfile -Command "${ps.replace(/\r?\n/g, ' ').trim()}"`, {
        stdio: 'ignore'
    });
} catch {
    /* ignore */
}