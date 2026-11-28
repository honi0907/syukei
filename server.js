const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const ExcelJS = require('exceljs');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 5555;
let pkg = { name: 'syukei-system', version: '0.0.0' };
try {
    pkg = require('./package.json');
} catch {
    pkg.version = process.env.SYUKEI_APP_VERSION || pkg.version;
}
const GITHUB_RELEASES_URL = 'https://github.com/honi0907/syukei/releases/latest';

const {
    SET_COUNT,
    TEAM_COUNT: SETS_TEAM_COUNT,
    DEFAULT_TEAM_SET_START_LINES,
    defaultTeamNames,
    defaultSetNames,
    defaultSetNameLabel,
    extractNamesFromFileLines: extractTeamLines,
    readStartLinesFile,
    saveStartLinesFile,
    createEmptyRoundScores,
    migrateLegacyRoundScores,
    ensureTeamBucket,
    setClientScore,
    scoreForClientInSet,
    grandTotalForClient,
    getClientScore
} = require('./lib/syukei-sets.js');

const TEAM_COUNT = SETS_TEAM_COUNT;
const CLIENT_ID_COUNT = 10;

/** インストール版は Program Files に書けないため、設定の保存先を分ける */
const DATA_DIR = process.env.SYUKEI_DATA_DIR
    ? path.resolve(process.env.SYUKEI_DATA_DIR)
    : __dirname;

function ensureDataDir() {
    if (DATA_DIR !== __dirname) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

ensureDataDir();

const TEAM_NAME_PATH_FILE = path.join(DATA_DIR, 'teamname-path.txt');
const DEFAULT_TEAM_NAME_FILE = path.join(__dirname, 'teamname.txt');
const TEAM_SET_STARTLINES_FILE = path.join(DATA_DIR, 'team-set-startlines.txt');

const SET_NAME_PATH_FILE = path.join(DATA_DIR, 'setname-path.txt');
const DEFAULT_SET_NAME_FILE = path.join(__dirname, 'setname.txt');
const SET_NAME_START_FILE = path.join(DATA_DIR, 'setname-startline.txt');

const CLIENT_NAME_PATH_FILE = path.join(DATA_DIR, 'clientname-path.txt');
const DEFAULT_CLIENT_NAME_FILE = path.join(__dirname, 'clientname.txt');
const CLIENT_NAME_START_FILE = path.join(DATA_DIR, 'clientname-startline.txt');

/** @type {string[]} 現在セットの5チーム名 */
let teamNames = defaultTeamNames();
/** @type {string[][]} */
let teamNamesBySet = Array.from({ length: SET_COUNT }, () => defaultTeamNames());
/** @type {number[]} 各セットの teamname.txt 読み始め行 */
let teamSetStartLines = [...DEFAULT_TEAM_SET_START_LINES];
/** @type {string} */
let teamNameSourcePath = DEFAULT_TEAM_NAME_FILE;
/** @type {string[]} */
let setNames = defaultSetNames();
/** @type {string} */
let setNameSourcePath = DEFAULT_SET_NAME_FILE;
/** @type {number} */
let setNameStartLine = 1;
let currentSet = 1;

/** @type {string[]} */
let clientDisplayNames = Array.from({ length: CLIENT_ID_COUNT }, (_, i) => `ID${i + 1}`);
/** @type {string} */
let clientNameSourcePath = DEFAULT_CLIENT_NAME_FILE;
/** @type {number} */
let clientNameStartLine = 1;

function defaultClientDisplayNames() {
    return Array.from({ length: CLIENT_ID_COUNT }, (_, i) => `ID${i + 1}`);
}

function readStartLine(filePath, fallback = 1) {
    try {
        if (fs.existsSync(filePath)) {
            const n = Number.parseInt(fs.readFileSync(filePath, 'utf8').trim(), 10);
            if (Number.isFinite(n) && n >= 1) {
                return n;
            }
        }
    } catch (error) {
        console.error('開始行ファイル読み込みエラー:', filePath, error);
    }
    return fallback;
}

function saveStartLine(filePath, startLine) {
    fs.writeFileSync(filePath, String(startLine), 'utf8');
}

/**
 * @param {string[]} fileLines
 * @param {number} startLine 1始まり
 * @param {number} count
 * @param {() => string[]} defaultFactory
 */
function extractNamesFromFileLines(fileLines, startLine, count, defaultFactory) {
    const names = defaultFactory();
    const startIdx = Math.max(0, startLine - 1);
    for (let i = 0; i < count; i += 1) {
        const line = (fileLines[startIdx + i] ?? '').trim();
        if (line) {
            names[i] = line;
        }
    }
    return names;
}

function syncActiveTeamNames() {
    teamNames = teamNamesBySet[currentSet - 1] || defaultTeamNames();
}

function applyAllTeamSetsFromContent(content) {
    const fileLines = content.split(/\r?\n/);
    for (let s = 0; s < SET_COUNT; s += 1) {
        teamNamesBySet[s] = extractTeamLines(
            fileLines,
            teamSetStartLines[s],
            TEAM_COUNT,
            defaultTeamNames
        );
    }
    syncActiveTeamNames();
}

function loadTeamSetStartLinesFromDisk() {
    teamSetStartLines = readStartLinesFile(
        TEAM_SET_STARTLINES_FILE,
        SET_COUNT,
        DEFAULT_TEAM_SET_START_LINES
    );
}

function saveTeamSetStartLinesToDisk() {
    saveStartLinesFile(TEAM_SET_STARTLINES_FILE, teamSetStartLines);
}

function loadTeamNamesFromDisk() {
    loadTeamSetStartLinesFromDisk();
    try {
        if (fs.existsSync(TEAM_NAME_PATH_FILE)) {
            const savedPath = fs.readFileSync(TEAM_NAME_PATH_FILE, 'utf8').trim();
            if (savedPath && fs.existsSync(savedPath)) {
                teamNameSourcePath = savedPath;
            }
        }
    } catch (error) {
        console.error('チーム名パスファイル読み込みエラー:', error);
    }

    try {
        if (fs.existsSync(teamNameSourcePath)) {
            const content = fs.readFileSync(teamNameSourcePath, 'utf8');
            applyAllTeamSetsFromContent(content);
            console.log('チーム名を読み込みました:', teamNameSourcePath, 'セット開始行:', teamSetStartLines.join(','));
        }
    } catch (error) {
        console.error('チーム名ファイル読み込みエラー:', error);
    }
    syncActiveTeamNames();
}

function saveTeamNameSourcePath(filePath) {
    teamNameSourcePath = filePath;
    fs.writeFileSync(TEAM_NAME_PATH_FILE, filePath, 'utf8');
}

function ensureDefaultSetNameFile() {
    try {
        if (!fs.existsSync(DEFAULT_SET_NAME_FILE)) {
            fs.writeFileSync(DEFAULT_SET_NAME_FILE, `${defaultSetNames().join('\n')}\n`, 'utf8');
        }
    } catch (error) {
        console.error('セット名デフォルトファイル作成エラー:', error);
    }
}

function isSameResolvedPath(a, b) {
    try {
        return path.resolve(a) === path.resolve(b);
    } catch {
        return false;
    }
}

function resolveSetNameSourcePath() {
    let candidate = DEFAULT_SET_NAME_FILE;
    try {
        if (fs.existsSync(SET_NAME_PATH_FILE)) {
            const savedPath = fs.readFileSync(SET_NAME_PATH_FILE, 'utf8').trim();
            if (savedPath && fs.existsSync(savedPath)) {
                candidate = savedPath;
            }
        }
    } catch (error) {
        console.error('セット名パス読み込みエラー:', error);
    }
  if (isSameResolvedPath(candidate, teamNameSourcePath)) {
        console.warn(
            'セット名にチーム名と同じファイルが指定されていたため無視し、setname.txt を使います:',
            candidate
        );
        try {
            if (fs.existsSync(SET_NAME_PATH_FILE)) {
                fs.unlinkSync(SET_NAME_PATH_FILE);
            }
        } catch {
            // ignore
        }
        candidate = DEFAULT_SET_NAME_FILE;
    }
    return candidate;
}

function applySetNamesFromContent(content, startLine = setNameStartLine) {
    const safeStart = Math.max(1, Math.floor(startLine));
    setNameStartLine = safeStart;
    saveStartLine(SET_NAME_START_FILE, safeStart);
    setNames = extractTeamLines(
        content.split(/\r?\n/),
        safeStart,
        SET_COUNT,
        defaultSetNames
    );
}

function loadSetNamesFromDisk() {
    ensureDefaultSetNameFile();
    setNameStartLine = readStartLine(SET_NAME_START_FILE, 1);
    setNameSourcePath = resolveSetNameSourcePath();
    try {
        if (fs.existsSync(setNameSourcePath)) {
            const content = fs.readFileSync(setNameSourcePath, 'utf8');
            applySetNamesFromContent(content, setNameStartLine);
        } else {
            setNames = defaultSetNames();
        }
    } catch (error) {
        console.error('セット名ファイル読み込みエラー:', error);
        setNames = defaultSetNames();
    }
}

function saveSetNameSourcePath(filePath) {
    if (isSameResolvedPath(filePath, teamNameSourcePath)) {
        throw new Error('セット名にチーム名と同じファイルは指定できません。setname.txt 用のファイルを選んでください。');
    }
    setNameSourcePath = filePath;
    fs.writeFileSync(SET_NAME_PATH_FILE, filePath, 'utf8');
}

function buildSettingsSnapshot() {
    return {
        schema: 2,
        exportedAt: new Date().toISOString(),
        clientNames: {
            path: clientNameSourcePath,
            startLine: clientNameStartLine
        },
        teamNames: {
            path: teamNameSourcePath,
            setStartLines: [...teamSetStartLines]
        },
        setNames: {
            path: setNameSourcePath,
            startLine: setNameStartLine
        },
        runtime: {
            currentSet,
            currentRound
        }
    };
}

function applyClientNamesFromContent(content, startLine = clientNameStartLine) {
    const safeStart = Math.max(1, Math.floor(startLine));
    clientNameStartLine = safeStart;
    saveStartLine(CLIENT_NAME_START_FILE, safeStart);
    clientDisplayNames = extractNamesFromFileLines(
        content.split(/\r?\n/),
        safeStart,
        CLIENT_ID_COUNT,
        defaultClientDisplayNames
    );
}

function loadClientNamesFromDisk() {
    clientNameStartLine = readStartLine(CLIENT_NAME_START_FILE, 1);
    try {
        if (fs.existsSync(CLIENT_NAME_PATH_FILE)) {
            const savedPath = fs.readFileSync(CLIENT_NAME_PATH_FILE, 'utf8').trim();
            if (savedPath && fs.existsSync(savedPath)) {
                clientNameSourcePath = savedPath;
            }
        }
    } catch (error) {
        console.error('子機名パスファイル読み込みエラー:', error);
    }

    try {
        if (fs.existsSync(clientNameSourcePath)) {
            const content = fs.readFileSync(clientNameSourcePath, 'utf8');
            applyClientNamesFromContent(content, clientNameStartLine);
            console.log('子機表示名を読み込みました:', clientNameSourcePath, '開始行:', clientNameStartLine);
        }
    } catch (error) {
        console.error('子機名ファイル読み込みエラー:', error);
    }
}

function saveClientNameSourcePath(filePath) {
    clientNameSourcePath = filePath;
    fs.writeFileSync(CLIENT_NAME_PATH_FILE, filePath, 'utf8');
}

function broadcastTeamNames() {
    syncActiveTeamNames();
    io.emit('team-names', {
        teamNames,
        currentSet,
        setNames,
        teamNamesBySet,
        teamSetStartLines
    });
    io.emit('set-changed', {
        set: currentSet,
        setName: setNames[currentSet - 1],
        teamNames
    });
}

/**
 * @param {unknown} raw
 * @returns {number | null}
 */
function parseClientIdNumber(raw) {
    const s = String(raw ?? '').trim();
    const match = s.match(/^ID(\d+)$/i);
    if (!match) {
        return null;
    }
    const n = Number(match[1]);
    if (n < 1 || n > CLIENT_ID_COUNT) {
        return null;
    }
    return n;
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
function normalizeClientId(raw) {
    const n = parseClientIdNumber(raw);
    return n ? `ID${n}` : null;
}

/**
 * @param {string} clientId
 */
function getClientDisplayName(clientId) {
    const n = parseClientIdNumber(clientId);
    if (n) {
        return clientDisplayNames[n - 1] || clientId;
    }
    return clientId;
}

loadTeamNamesFromDisk();
loadSetNamesFromDisk();
loadClientNamesFromDisk();

app.use(express.json({ limit: '256kb' }));

const VIEWER_SHARE_TTL_MS = 2 * 60 * 60 * 1000;
/** @type {Map<string, { buffer: Buffer, createdAt: number, scope: string, label: string }>} */
const viewerShares = new Map();

function pruneViewerShares() {
    const now = Date.now();
    for (const [id, entry] of viewerShares) {
        if (now - entry.createdAt > VIEWER_SHARE_TTL_MS) {
            viewerShares.delete(id);
        }
    }
}

function postMultipartPng(targetUrl, fields, fileField, buffer) {
    const boundary = `----syukei${crypto.randomBytes(8).toString('hex')}`;
    const head = Object.entries(fields).map(([key, value]) =>
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
    ).join('');
    const fileHead =
        `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="syukei.png"\r\nContent-Type: image/png\r\n\r\n`;
    const tail = `\r\n--${boundary}--\r\n`;
    const body = Buffer.concat([
        Buffer.from(head + fileHead),
        buffer,
        Buffer.from(tail)
    ]);
    const url = new URL(targetUrl);

    return new Promise((resolve, reject) => {
        const req = https.request({
            method: 'POST',
            hostname: url.hostname,
            path: `${url.pathname}${url.search}`,
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length,
                'User-Agent': 'syukei-share/1.1'
            },
            timeout: 20000
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8').trim();
                const link = (text.match(/https:\/\/\S+/) || [])[0];
                if (link) {
                    resolve(link.replace(/["']$/, ''));
                    return;
                }
                reject(new Error(`${url.hostname} ${res.statusCode}: ${text.slice(0, 120) || 'empty'}`));
            });
        });
        req.on('timeout', () => {
            req.destroy(new Error(`${url.hostname} timeout`));
        });
        req.on('error', reject);
        req.end(body);
    });
}

async function uploadAnonymousPng(buffer) {
    const errors = [];
    const attempts = [
        () => postMultipartPng(
            'https://litterbox.catbox.moe/resources/internals/api.php',
            { reqtype: 'fileupload', time: '24h' },
            'fileToUpload',
            buffer
        ),
        () => postMultipartPng(
            'https://catbox.moe/user/api.php',
            { reqtype: 'fileupload' },
            'fileToUpload',
            buffer
        )
    ];
    for (const attempt of attempts) {
        try {
            return await attempt();
        } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
        }
    }
    throw new Error(`公開用URLの作成に失敗しました。（${errors.join(' / ')}）`);
}

function resolveShareHost(req) {
    const lanIp = getLocalIPAddress();
    const requestHost = req.get('host') || '';
    const requestIp = requestHost.split(':')[0] || '';
    if (lanIp && lanIp !== 'localhost' && !lanIp.startsWith('127.')) {
        return lanIp;
    }
    if (requestIp && requestIp !== 'localhost' && !requestIp.startsWith('127.')) {
        return requestIp;
    }
    return lanIp || requestIp || null;
}

app.get('/api/server-info', (req, res) => {
    const lanIp = getLocalIPAddress();
    const shareHost = resolveShareHost(req);
    res.json({
        port: PORT,
        lanIp: lanIp || null,
        shareHost,
        requestHost: req.get('host') || null,
        shareReady: Boolean(shareHost && shareHost !== 'localhost' && !shareHost.startsWith('127.'))
    });
});

app.post(
    '/api/viewer-share',
    express.raw({ type: ['image/png', 'application/octet-stream'], limit: '12mb' }),
    async (req, res) => {
        try {
            if (!req.body || !(req.body instanceof Buffer) || req.body.length === 0) {
                res.status(400).json({ ok: false, error: 'PNGデータがありません' });
                return;
            }
            const publicUrl = await uploadAnonymousPng(req.body);
            const dataUrl = await QRCode.toDataURL(publicUrl, {
                width: 220,
                margin: 2,
                errorCorrectionLevel: 'M'
            });
            res.json({
                ok: true,
                publicUrl,
                dataUrl,
                expiresHours: 24
            });
        } catch (error) {
            console.error('viewer-share upload:', error);
            res.status(502).json({
                ok: false,
                error: error instanceof Error ? error.message : '公開用URLの作成に失敗しました'
            });
        }
    }
);

app.get('/api/viewer-share/:id', (req, res) => {
    const id = String(req.params.id).replace(/\.png$/i, '');
    const entry = viewerShares.get(id);
    if (!entry) {
        res.status(404).type('text/plain; charset=utf-8').send('共有画像の有効期限が切れたか、見つかりません。');
        return;
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', 'inline; filename="syukei-share.png"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(entry.buffer);
});

app.get('/viewer-share/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'viewer-share.html'));
});

app.post('/api/viewer-share-qr', async (req, res) => {
    try {
        const url = String(req.body?.url || '').trim().slice(0, 2048);
        if (!url) {
            res.status(400).json({ ok: false, error: 'URLがありません' });
            return;
        }
        const dataUrl = await QRCode.toDataURL(url, {
            width: 220,
            margin: 2,
            errorCorrectionLevel: 'M'
        });
        res.json({ ok: true, dataUrl });
    } catch (error) {
        console.error('viewer-share-qr:', error);
        res.status(500).json({ ok: false, error: 'QRコードの作成に失敗しました' });
    }
});

// 静的ファイル配信
app.use(express.static(path.join(__dirname, 'public')));

// データ管理
const scores = {}; // {clientId: {name, score, locked, unlockRequested}}
let roundScores = migrateLegacyRoundScores(createEmptyRoundScores());
let currentRound = 1;
const history = [];
let connectedClients = new Set();

/**
 * 親機向けの子機一覧（得点・ロック・入力中）
 * @param {number | string} [round]
 */
function scoreForClientRound(name, round) {
  return scoreForClientInSet(roundScores, currentSet, name, round);
}

/**
 * 確定得点＋入力中の仮点数（未ロック時のみ）
 * @param {string} name
 * @param {number | string} round
 */
function displayScoreForClient(name, round) {
    const row = scores[name];
    const committed = scoreForClientRound(name, round);
    if (!row || row.locked || !row.entering) {
        return committed;
    }
    const draft = row.draftScore;
    if (typeof draft !== 'number' || draft < 0) {
        return committed;
    }
    if (round === 'total') {
        const currentCommitted = getClientScore(roundScores, currentSet, currentRound, name);
        return committed - currentCommitted + draft;
    }
    if (round === currentRound) {
        return draft;
    }
    return committed;
}

function buildClientRow(name, round) {
    const row = scores[name];
    const roundScore = displayScoreForClient(name, round);
    const entering = Boolean(row.entering) && !row.locked;
    return {
        name,
        displayName: getClientDisplayName(name),
        connected: true,
        score: roundScore,
        committedScore: scoreForClientRound(name, round),
        draftScore: entering && typeof row.draftScore === 'number' ? row.draftScore : null,
        locked: row.locked,
        entering,
        unlockRequested: row.unlockRequested || false,
        lastUpdate: row.lastUpdate,
        isTest: Boolean(row.isTest)
    };
}

function buildClientList(round = currentRound) {
    const list = [];
    for (let n = 1; n <= CLIENT_ID_COUNT; n += 1) {
        const name = `ID${n}`;
        if (scores[name]) {
            list.push(buildClientRow(name, round));
        }
    }

    Object.keys(scores).forEach((name) => {
        if (parseClientIdNumber(name)) {
            return;
        }
        list.push(buildClientRow(name, round));
    });

    return list;
}

function buildRankingClientList(round = currentRound) {
    return buildClientList(round)
        .filter((c) => c.connected && !c.isTest)
        .map((c) => ({
            name: c.displayName,
            score: c.score
        }))
        .sort((a, b) => b.score - a.score);
}

function sumTeamRound(set, round) {
    let teamTotal = 0;
    const bucket = roundScores[set]?.[round] || {};
    Object.values(bucket).forEach((client) => {
        teamTotal += client.score || 0;
    });
    return teamTotal;
}

function buildTeamTotalsPayload() {
    return {
        set: currentSet,
        setName: setNames[currentSet - 1],
        teams: Array.from({ length: TEAM_COUNT }, (_, i) => ({
            team: teamNames[i],
            score: sumTeamRound(currentSet, i + 1)
        }))
    };
}

function clearRoundScoresForSet(set, round) {
    const bucket = ensureTeamBucket(roundScores, set, round);
    Object.keys(bucket).forEach((name) => {
        bucket[name].score = 0;
    });
}

function clearAllRoundScoresForSet(set) {
    for (let r = 1; r <= TEAM_COUNT; r += 1) {
        clearRoundScoresForSet(set, r);
    }
}

function removeClientFromRoundScores(clientName) {
    for (let s = 1; s <= SET_COUNT; s += 1) {
        for (let r = 1; r <= TEAM_COUNT; r += 1) {
            if (roundScores[s]?.[r]?.[clientName]) {
                delete roundScores[s][r][clientName];
            }
        }
    }
}

function deleteTestClientFromCurrentSet(testClientName) {
    for (let r = 1; r <= TEAM_COUNT; r += 1) {
        const bucket = roundScores[currentSet]?.[r];
        if (bucket?.[testClientName]) {
            delete bucket[testClientName];
        }
    }
}

/** 接続中の子機 ID（ID1 昇順 + その他） */
function listConnectedParticipantIds() {
    const standard = [];
    for (let n = 1; n <= CLIENT_ID_COUNT; n += 1) {
        const id = `ID${n}`;
        if (scores[id]) {
            standard.push(id);
        }
    }
    const extra = Object.keys(scores).filter((name) => {
        if (parseClientIdNumber(name)) {
            return false;
        }
        return name !== '__TEST__' && name.toLowerCase() !== 'test';
    });
    return [...standard, ...extra];
}

/**
 * 5チーム×個人の確定点数マトリクス（観覧・CSV用）
 */
function buildScoresMatrix() {
    const participantIds = listConnectedParticipantIds();
    const participants = participantIds.map((id) => {
        const roundScoreList = [];
        let total = 0;
        for (let r = 1; r <= TEAM_COUNT; r += 1) {
            const s = getClientScore(roundScores, currentSet, r, id);
            roundScoreList.push(s);
            total += s;
        }
        return {
            id,
            displayName: getClientDisplayName(id),
            scores: roundScoreList,
            total
        };
    });

    const teamTotals = [];
    for (let r = 1; r <= TEAM_COUNT; r += 1) {
        let roundTotal = 0;
        const bucket = roundScores[currentSet]?.[r] || {};
        Object.values(bucket).forEach((row) => {
            roundTotal += row.score || 0;
        });
        teamTotals.push(roundTotal);
    }

    return {
        currentSet,
        setName: setNames[currentSet - 1],
        teamNames: (teamNamesBySet[currentSet - 1] || defaultTeamNames()).slice(0, TEAM_COUNT),
        participants,
        teamTotals,
        generatedAt: new Date().toISOString()
    };
}

/**
 * 全セット（6×5チーム）の確定点数マトリクス（観覧・CSV用）
 */
function buildScoresMatrixAllSets() {
    const participantIds = listConnectedParticipantIds();
    const sets = [];

    for (let s = 1; s <= SET_COUNT; s += 1) {
        const teamNamesForSet = (teamNamesBySet[s - 1] || defaultTeamNames()).slice(0, TEAM_COUNT);
        const teamTotals = [];
        for (let r = 1; r <= TEAM_COUNT; r += 1) {
            teamTotals.push(sumTeamRound(s, r));
        }
        const setTotal = teamTotals.reduce((a, b) => a + b, 0);
        sets.push({
            set: s,
            setName: setNames[s - 1] || defaultSetNameLabel(s),
            teamNames: teamNamesForSet,
            teamTotals,
            setTotal
        });
    }

    const participants = participantIds.map((id) => {
        const scoresBySet = [];
        const setTotals = [];
        let total = 0;
        for (let s = 1; s <= SET_COUNT; s += 1) {
            const row = [];
            let setSum = 0;
            for (let r = 1; r <= TEAM_COUNT; r += 1) {
                const score = getClientScore(roundScores, s, r, id);
                row.push(score);
                setSum += score;
            }
            scoresBySet.push(row);
            setTotals.push(setSum);
            total += setSum;
        }
        return {
            id,
            displayName: getClientDisplayName(id),
            scoresBySet,
            setTotals,
            total
        };
    });

    const grandTeamTotals = sets.map((setBlock) => setBlock.setTotal);
    const grandTotal = grandTeamTotals.reduce((a, b) => a + b, 0);

    return {
        setCount: SET_COUNT,
        teamCount: TEAM_COUNT,
        currentSet,
        currentRound,
        sets,
        participants,
        grandTeamTotals,
        grandTotal,
        generatedAt: new Date().toISOString()
    };
}

/**
 * @param {ReturnType<typeof buildScoresMatrix>} matrix
 */
function formatScoresMatrixCsv(matrix) {
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const header = ['ID', '表示名', ...matrix.teamNames, '合計'];
    const lines = [header.map(escape).join(',')];
    matrix.participants.forEach((p) => {
        lines.push(
            [p.id, p.displayName, ...p.scores, p.total].map(escape).join(',')
        );
    });
    lines.push(
        ['', 'チーム合計', ...matrix.teamTotals, matrix.teamTotals.reduce((a, b) => a + b, 0)]
            .map(escape)
            .join(',')
    );
    return `\uFEFF${lines.join('\r\n')}`;
}

const VIEWER_EXPORT_SET_ROWS = [
    [0, 1, 2],
    [3, 4, 5]
];

function excelTeamLabel(name, index) {
    const raw = String(name || '').replace(/チーム/g, '').trim();
    if (raw) {
        return raw;
    }
    return ['A', 'B', 'C', 'D', 'E', 'F'][index] || String(index + 1);
}

function excelTextWidthUnits(text) {
    let units = 0;
    for (const ch of String(text || '')) {
        units += ch.codePointAt(0) > 0xff ? 2.2 : 1.15;
    }
    return units;
}

function excelTeamColumnWidth(matrix) {
    let maxUnits = 10;
    matrix.sets.forEach((setBlock) => {
        setBlock.teamNames.forEach((name, teamIdx) => {
            maxUnits = Math.max(maxUnits, excelTextWidthUnits(excelTeamLabel(name, teamIdx)));
        });
    });
    return Math.ceil(maxUnits) + 3;
}

function excelMergedHeaderWidth(colsPerSet, scoreColWidth, teamColWidth) {
    return teamColWidth + Math.max(0, colsPerSet - 1) * scoreColWidth;
}

function estimateExcelWrapLines(text, columnWidth) {
    const value = String(text || '').trim();
    if (!value) {
        return 1;
    }
    const charsPerLine = Math.max(5, columnWidth * 1.05);
    return value
        .split(/\r?\n/)
        .reduce((sum, segment) => sum + Math.max(1, Math.ceil(segment.length / charsPerLine)), 0);
}

function excelRowHeightForLines(lines, { min = 22, max = 132, perLine = 15, pad = 6 } = {}) {
    const safeLines = Math.max(1, lines);
    return Math.min(max, Math.max(min, safeLines * perLine + pad));
}

function applyExcelTeamColumnWidths(ws, colsPerSet, sheetCols, teamColWidth, scoreColWidth) {
    for (let teamCol = 1; teamCol <= sheetCols; teamCol += colsPerSet) {
        ws.getColumn(teamCol).width = teamColWidth;
        for (let offset = 1; offset < colsPerSet; offset += 1) {
            const scoreCol = teamCol + offset;
            if (scoreCol <= sheetCols) {
                ws.getColumn(scoreCol).width = scoreColWidth;
            }
        }
    }
}

function excelClientHeader(participant) {
    const display = String(participant.displayName || '').trim();
    return display || participant.id || '';
}

function excelIdColumnWidth(matrix) {
    let maxUnits = excelTextWidthUnits('100');
    matrix.participants.forEach((participant) => {
        maxUnits = Math.max(maxUnits, excelTextWidthUnits(excelClientHeader(participant)));
    });
    return Math.min(40, Math.ceil(maxUnits) + 2);
}

function applyExcelColumnWidths(ws, colsPerSet, sheetCols, teamColWidth, idColWidth, totalColWidth, partCount, showTotal) {
    for (let start = 1; start <= sheetCols; start += colsPerSet) {
        ws.getColumn(start).width = teamColWidth;
        for (let index = 0; index < partCount; index += 1) {
            const idCol = start + 1 + index;
            if (idCol <= sheetCols) {
                ws.getColumn(idCol).width = idColWidth;
            }
        }
        if (showTotal) {
            const totalCol = start + 1 + partCount;
            if (totalCol <= sheetCols) {
                ws.getColumn(totalCol).width = totalColWidth;
            }
        }
    }
}

const SHEET_BORDER = {
    top: { style: 'thin', color: { argb: 'FF868E96' } },
    left: { style: 'thin', color: { argb: 'FF868E96' } },
    bottom: { style: 'thin', color: { argb: 'FF868E96' } },
    right: { style: 'thin', color: { argb: 'FF868E96' } }
};

function paintSheetCell(cell, { value, fill, bold = false, color = 'FF212529', size = 10, horizontal = 'center', wrap = false }) {
    cell.value = value;
    cell.border = SHEET_BORDER;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    cell.font = { name: 'Meiryo', size, bold, color: { argb: color } };
    cell.alignment = { vertical: 'middle', horizontal, wrapText: wrap };
}

function paintMergedRow(ws, row, colCount, fill) {
    for (let col = 1; col <= colCount; col += 1) {
        const cell = ws.getCell(row, col);
        cell.border = SHEET_BORDER;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    }
}

/**
 * 観覧一覧と同じ縦向き（2段×3セット）の xlsx。選択色（黄・青）は付けない。
 * @param {ReturnType<typeof buildScoresMatrixAllSets>} matrix
 */
async function formatScoresMatrixAllSetsWorkbook(matrix) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('全セット', { views: [{ showGridLines: false }] });
    const partCount = matrix.participants.length;
    const showTotal = partCount > 1;
    const colsPerSet = 1 + partCount + (showTotal ? 1 : 0);
    const sheetCols = colsPerSet * 3;
    const totalColWidth = 11;
    const fittedIdColWidth = excelIdColumnWidth(matrix);
    const idColWidth = fittedIdColWidth;
    const idHeaderWraps = matrix.participants.some(
        (participant) => excelTextWidthUnits(excelClientHeader(participant)) + 2 > idColWidth
    );
    const fittedTeamColWidth = excelTeamColumnWidth(matrix);
    const teamColWidth = Math.min(72, fittedTeamColWidth);
    const teamNameWraps = teamColWidth < fittedTeamColWidth;
    const mergedSetHeaderWidth = teamColWidth + partCount * idColWidth + (showTotal ? totalColWidth : 0);

    applyExcelColumnWidths(
        ws,
        colsPerSet,
        sheetCols,
        teamColWidth,
        idColWidth,
        totalColWidth,
        partCount,
        showTotal
    );

    let row = 1;

    ws.mergeCells(row, 1, row, sheetCols);
    const title = ws.getCell(row, 1);
    title.value = '点数集計（全セット一覧）';
    title.font = { name: 'Meiryo', size: 14, bold: true, color: { argb: 'FF212529' } };
    title.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(row).height = 24;
    row += 1;

    if (matrix.generatedAt) {
        ws.mergeCells(row, 1, row, sheetCols);
        const meta = ws.getCell(row, 1);
        meta.value = `更新: ${new Date(matrix.generatedAt).toLocaleString('ja-JP')}`;
        meta.font = { name: 'Meiryo', size: 9, color: { argb: 'FF495057' } };
        meta.alignment = { vertical: 'middle', horizontal: 'left' };
        ws.getRow(row).height = 18;
        row += 1;
    }

    VIEWER_EXPORT_SET_ROWS.forEach((setIndices) => {
        const setHeaderRow = row;
        let col = 1;
        let setHeaderLines = 1;
        setIndices.forEach((setIdx) => {
            const setBlock = matrix.sets[setIdx];
            if (!setBlock) {
                return;
            }
            const endCol = col + colsPerSet - 1;
            ws.mergeCells(setHeaderRow, col, setHeaderRow, endCol);
            paintSheetCell(ws.getCell(setHeaderRow, col), {
                value: setBlock.setName,
                fill: 'FF343A40',
                bold: true,
                color: 'FFFFFFFF',
                size: 11,
                wrap: true
            });
            setHeaderLines = Math.max(setHeaderLines, estimateExcelWrapLines(setBlock.setName, mergedSetHeaderWidth));
            for (let spanCol = col + 1; spanCol <= endCol; spanCol += 1) {
                const spanned = ws.getCell(setHeaderRow, spanCol);
                spanned.border = SHEET_BORDER;
                spanned.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF343A40' } };
            }
            col = endCol + 1;
        });
        ws.getRow(setHeaderRow).height = excelRowHeightForLines(setHeaderLines);
        row += 1;

        const idHeaderRow = row;
        let idHeaderLines = 1;
        col = 1;
        setIndices.forEach(() => {
            paintSheetCell(ws.getCell(idHeaderRow, col), {
                value: 'チーム',
                fill: 'FFE9ECEF',
                bold: true,
                size: 9
            });
            col += 1;
            matrix.participants.forEach((participant) => {
                const header = excelClientHeader(participant);
                if (idHeaderWraps) {
                    idHeaderLines = Math.max(idHeaderLines, estimateExcelWrapLines(header, idColWidth));
                }
                paintSheetCell(ws.getCell(idHeaderRow, col), {
                    value: header,
                    fill: 'FFE9ECEF',
                    bold: true,
                    size: 9,
                    wrap: idHeaderWraps
                });
                col += 1;
            });
            if (showTotal) {
                paintSheetCell(ws.getCell(idHeaderRow, col), {
                    value: '合計',
                    fill: 'FFDEE2E6',
                    bold: true,
                    size: 9
                });
                col += 1;
            }
        });
        ws.getRow(idHeaderRow).height = idHeaderWraps ? excelRowHeightForLines(idHeaderLines) : 22;
        row += 1;

        for (let teamIdx = 0; teamIdx < TEAM_COUNT; teamIdx += 1) {
            const alt = teamIdx % 2 === 1;
            const scoreFill = alt ? 'FFFAFAFA' : 'FFFFFFFF';
            let teamLineCount = 1;
            col = 1;
            setIndices.forEach((setIdx) => {
                const setBlock = matrix.sets[setIdx];
                if (!setBlock) {
                    return;
                }
                const teamLabel = excelTeamLabel(setBlock.teamNames[teamIdx], teamIdx);
                teamLineCount = Math.max(
                    teamLineCount,
                    teamNameWraps ? estimateExcelWrapLines(teamLabel, teamColWidth) : 1
                );
                paintSheetCell(ws.getCell(row, col), {
                    value: teamLabel,
                    fill: 'FFF8F9FA',
                    bold: true,
                    horizontal: 'left',
                    wrap: teamNameWraps,
                    size: 9
                });
                col += 1;
                matrix.participants.forEach((participant) => {
                    paintSheetCell(ws.getCell(row, col), {
                        value: Number(participant.scoresBySet[setIdx][teamIdx]) || 0,
                        fill: scoreFill,
                        bold: true,
                        size: 11
                    });
                    col += 1;
                });
                if (showTotal) {
                    paintSheetCell(ws.getCell(row, col), {
                        value: Number(setBlock.teamTotals[teamIdx]) || 0,
                        fill: 'FFF1F3F5',
                        bold: true,
                        size: 11
                    });
                    col += 1;
                }
            });
            ws.getRow(row).height = excelRowHeightForLines(teamLineCount);
            row += 1;
        }

        row += 1;
    });

    return wb.xlsx.writeBuffer();
}

function disconnectDuplicateClientSockets(clientId, keepSocketId) {
    io.sockets.sockets.forEach((s) => {
        if (s.clientName === clientId && s.id !== keepSocketId) {
            s.disconnect(true);
        }
    });
}

app.get('/api/version', (_req, res) => {
    res.json({
        name: pkg.name,
        version: pkg.version,
        releasesUrl: GITHUB_RELEASES_URL
    });
});

app.get('/api/client-names', (_req, res) => {
    res.json({
        names: clientDisplayNames,
        path: clientNameSourcePath,
        startLine: clientNameStartLine
    });
});

app.get('/api/team-names', (_req, res) => {
    res.json({
        names: teamNames,
        teamNamesBySet,
        setStartLines: teamSetStartLines,
        path: teamNameSourcePath,
        currentSet,
        setNames
    });
});

app.get('/api/set-names', (_req, res) => {
    res.json({
        names: setNames,
        path: setNameSourcePath,
        startLine: setNameStartLine
    });
});

app.get('/api/settings/export', (_req, res) => {
    res.json(buildSettingsSnapshot());
});

app.post('/api/settings/import', (req, res) => {
    try {
        const body = req.body || {};
        if (body.clientNames?.startLine !== undefined) {
            clientNameStartLine = Math.max(1, Math.floor(Number(body.clientNames.startLine)));
            saveStartLine(CLIENT_NAME_START_FILE, clientNameStartLine);
        }
        if (Array.isArray(body.teamNames?.setStartLines)) {
            teamSetStartLines = body.teamNames.setStartLines.slice(0, SET_COUNT).map((n, i) => {
                const v = Number(n);
                return Number.isFinite(v) && v >= 1 ? v : DEFAULT_TEAM_SET_START_LINES[i];
            });
            while (teamSetStartLines.length < SET_COUNT) {
                teamSetStartLines.push(DEFAULT_TEAM_SET_START_LINES[teamSetStartLines.length] ?? 1);
            }
            saveTeamSetStartLinesToDisk();
        }
        if (body.setNames?.startLine !== undefined) {
            setNameStartLine = Math.max(1, Math.floor(Number(body.setNames.startLine)));
            saveStartLine(SET_NAME_START_FILE, setNameStartLine);
        }
        if (body.clientNames?.path) {
            saveClientNameSourcePath(body.clientNames.path);
        }
        if (body.teamNames?.path) {
            saveTeamNameSourcePath(body.teamNames.path);
        }
        if (body.setNames?.path) {
            saveSetNameSourcePath(body.setNames.path);
        }
        loadClientNamesFromDisk();
        loadTeamNamesFromDisk();
        loadSetNamesFromDisk();
        if (body.runtime?.currentSet) {
            const s = Number(body.runtime.currentSet);
            if (s >= 1 && s <= SET_COUNT) {
                currentSet = s;
            }
        }
        if (body.runtime?.currentRound) {
            const r = Number(body.runtime.currentRound);
            if (r >= 1 && r <= TEAM_COUNT) {
                currentRound = r;
            }
        }
        broadcastTeamNames();
        io.emit('round-changed', currentRound);
        io.emit('score-updated', { clients: buildClientList(), history: history.slice(-10) });
        res.json({ ok: true, snapshot: buildSettingsSnapshot() });
    } catch (error) {
        res.status(500).json({ ok: false, error: String(error.message) });
    }
});

app.get('/api/scores-matrix', (_req, res) => {
    res.json(buildScoresMatrix());
});

app.get('/api/scores-matrix/all', (_req, res) => {
    res.json(buildScoresMatrixAllSets());
});

app.get('/api/scores-matrix.csv', (_req, res) => {
    const matrix = buildScoresMatrix();
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="syukei-scores-${stamp}.csv"`);
    res.send(formatScoresMatrixCsv(matrix));
});

async function sendScoresMatrixAllSetsWorkbook(_req, res) {
    try {
        const matrix = buildScoresMatrixAllSets();
        const stamp = new Date().toISOString().slice(0, 10);
        const buffer = await formatScoresMatrixAllSetsWorkbook(matrix);
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="syukei-scores-all-sets-${stamp}.xlsx"`
        );
        res.send(Buffer.from(buffer));
    } catch (error) {
        console.error('全セットExcel出力エラー:', error);
        res.status(500).send('Excelの作成に失敗しました');
    }
}

app.get('/api/scores-matrix-all.csv', sendScoresMatrixAllSetsWorkbook);
app.get('/api/scores-matrix-all.xls', sendScoresMatrixAllSetsWorkbook);
app.get('/api/scores-matrix-all.xlsx', sendScoresMatrixAllSetsWorkbook);

app.post('/api/client-names/load', (req, res) => {
    try {
        const { path: filePath, content, startLine } = req.body || {};
        const requestedStart = startLine !== undefined
            ? Math.max(1, Math.floor(Number(startLine)))
            : clientNameStartLine;

        if (typeof content === 'string') {
            applyClientNamesFromContent(content, requestedStart);
            if (!filePath) {
                fs.writeFileSync(DEFAULT_CLIENT_NAME_FILE, content, 'utf8');
                clientNameSourcePath = DEFAULT_CLIENT_NAME_FILE;
            }
        } else if (filePath) {
            if (!fs.existsSync(filePath)) {
                res.status(400).json({ ok: false, error: 'ファイルが見つかりません' });
                return;
            }
            saveClientNameSourcePath(filePath);
            const fileContent = fs.readFileSync(filePath, 'utf8');
            applyClientNamesFromContent(fileContent, requestedStart);
        } else {
            if (startLine !== undefined) {
                clientNameStartLine = requestedStart;
                saveStartLine(CLIENT_NAME_START_FILE, requestedStart);
            }
            loadClientNamesFromDisk();
        }

        io.emit('client-display-names', {
            names: clientDisplayNames,
            path: clientNameSourcePath,
            startLine: clientNameStartLine
        });
        io.emit('score-updated', {
            clients: buildClientList(),
            history: history.slice(-10)
        });

        res.json({
            ok: true,
            names: clientDisplayNames,
            path: clientNameSourcePath,
            startLine: clientNameStartLine
        });
    } catch (error) {
        console.error('子機名読込エラー:', error);
        res.status(500).json({ ok: false, error: String(error.message) });
    }
});

app.post('/api/team-names/load', (req, res) => {
    try {
        const { path: filePath, content, setStartLines } = req.body || {};

        if (Array.isArray(setStartLines)) {
            teamSetStartLines = setStartLines.slice(0, SET_COUNT).map((n, i) => {
                const v = Number(n);
                return Number.isFinite(v) && v >= 1 ? v : DEFAULT_TEAM_SET_START_LINES[i];
            });
            while (teamSetStartLines.length < SET_COUNT) {
                teamSetStartLines.push(DEFAULT_TEAM_SET_START_LINES[teamSetStartLines.length] ?? 1);
            }
            saveTeamSetStartLinesToDisk();
        }

        if (typeof content === 'string') {
            if (!filePath) {
                fs.writeFileSync(DEFAULT_TEAM_NAME_FILE, content, 'utf8');
                teamNameSourcePath = DEFAULT_TEAM_NAME_FILE;
            }
            applyAllTeamSetsFromContent(content);
        } else if (filePath) {
            if (!fs.existsSync(filePath)) {
                res.status(400).json({ ok: false, error: 'ファイルが見つかりません' });
                return;
            }
            saveTeamNameSourcePath(filePath);
            const fileContent = fs.readFileSync(filePath, 'utf8');
            applyAllTeamSetsFromContent(fileContent);
        } else {
            loadTeamNamesFromDisk();
        }

        broadcastTeamNames();

        res.json({
            ok: true,
            names: teamNames,
            teamNamesBySet,
            setStartLines: teamSetStartLines,
            path: teamNameSourcePath
        });
    } catch (error) {
        console.error('チーム名読込エラー:', error);
        res.status(500).json({ ok: false, error: String(error.message) });
    }
});

app.post('/api/set-names/load', (req, res) => {
    try {
        const { path: filePath, content, startLine } = req.body || {};
        const requestedStart = startLine !== undefined
            ? Math.max(1, Math.floor(Number(startLine)))
            : setNameStartLine;

        if (typeof content === 'string') {
            applySetNamesFromContent(content, requestedStart);
            if (!filePath) {
                fs.writeFileSync(DEFAULT_SET_NAME_FILE, content, 'utf8');
                setNameSourcePath = DEFAULT_SET_NAME_FILE;
            }
        } else if (filePath) {
            if (!fs.existsSync(filePath)) {
                res.status(400).json({ ok: false, error: 'ファイルが見つかりません' });
                return;
            }
            saveSetNameSourcePath(filePath);
            applySetNamesFromContent(fs.readFileSync(filePath, 'utf8'), requestedStart);
        } else {
            if (startLine !== undefined) {
                setNameStartLine = requestedStart;
                saveStartLine(SET_NAME_START_FILE, requestedStart);
            }
            loadSetNamesFromDisk();
        }
        broadcastTeamNames();
        res.json({
            ok: true,
            names: setNames,
            path: setNameSourcePath,
            startLine: setNameStartLine
        });
    } catch (error) {
        console.error('セット名読込エラー:', error);
        res.status(500).json({ ok: false, error: String(error.message) });
    }
});

// ルート
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'parent.html'));
});

app.get('/client', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'client.html'));
});

app.get('/ranking', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'ranking.html'));
});

app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

// ランキングリスト表示ページ
app.get('/ranking-list', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'ranking-list.html'));
});

// Socket.io接続処理
io.on('connection', (socket) => {
    console.log(`新しい接続: ${socket.id}`);
    
    // 子機からの登録
    socket.on('register', (data) => {
        const rawName = String(data?.clientName ?? '').trim();
        const isTestClient = rawName.toLowerCase() === 'test';
        const clientName = isTestClient ? rawName : normalizeClientId(rawName);

        if (!clientName) {
            socket.emit('error', { message: 'ID1〜ID10 から選択してください' });
            return;
        }

        disconnectDuplicateClientSockets(clientName, socket.id);
        socket.clientName = clientName;
        connectedClients.add(socket.id);
        
        // 既存データがあれば復元、なければ新規作成
        if (!scores[clientName]) {
            scores[clientName] = {
                name: clientName,
                locked: false,
                entering: false,
                draftScore: null,
                unlockRequested: false,
                lastUpdate: new Date().toISOString()
            };
        }
        if (scores[clientName].entering === undefined) {
            scores[clientName].entering = false;
        }
        if (scores[clientName].draftScore === undefined) {
            scores[clientName].draftScore = null;
        }
        
        console.log(`子機登録: ${clientName}`);
        
        const clientList = buildClientList();
        
        io.emit('client-connected', {
            clientName,
            clients: clientList
        });
        
        // 子機にロック状態を送信
        socket.emit('lock-status', { locked: scores[clientName].locked });
        socket.emit('client-display-names', {
            names: clientDisplayNames,
            path: clientNameSourcePath,
            myId: clientName,
            myDisplayName: getClientDisplayName(clientName)
        });
    });

    // 子機: テンキー操作中（決定前）
    socket.on('score-entering', (data) => {
        const clientName = data?.clientName || socket.clientName;
        if (!clientName || !scores[clientName]) {
            return;
        }
        if (scores[clientName].locked) {
            return;
        }
        const active = data?.active !== false;
        scores[clientName].entering = active;
        if (active && typeof data?.score === 'number' && data.score >= 0) {
            scores[clientName].draftScore = data.score;
        } else if (!active) {
            scores[clientName].draftScore = null;
        }
        scores[clientName].lastUpdate = new Date().toISOString();

        io.emit('score-updated', {
            clients: buildClientList(),
            history: history.slice(-10)
        });
    });
    
    // 点数送信
    socket.on('submit-score', (data) => {
        const { clientName, score } = data;
        
        if (!scores[clientName]) {
            socket.emit('error', { message: '未登録の子機です' });
            return;
        }
        
        if (scores[clientName].locked) {
            socket.emit('error', { message: 'ロックされています' });
            return;
        }
        
        setClientScore(roundScores, currentSet, currentRound, clientName, score);

        scores[clientName].lastUpdate = new Date().toISOString();
        scores[clientName].locked = true;
        scores[clientName].entering = false;
        scores[clientName].draftScore = null;

        const currentRoundTotal = getClientScore(roundScores, currentSet, currentRound, clientName);
        
        // 履歴追加
        history.push({
            time: new Date().toLocaleTimeString('ja-JP'),
            clientName,
            score,
            total: currentRoundTotal
        });
        
        console.log(`スコア受信: ${clientName} - ${score}点 (チーム${teamNames[currentRound - 1]}合計: ${currentRoundTotal})`);
        
        io.emit('score-updated', {
            clients: buildClientList(),
            history: history.slice(-10)
        });
        
        // ランキングウィンドウ用にも現在のラウンドデータを送信
        const rankingClientList = buildRankingClientList(currentRound);
        const rankingTotal = rankingClientList.reduce((sum, client) => sum + (client.score || 0), 0);
        io.emit('ranking-data', { total: rankingTotal, clients: rankingClientList, round: currentRound });
        
        io.emit('team-totals', buildTeamTotalsPayload());
        
        // 送信した子機にロック状態と成功通知を送信
        socket.emit('lock-status', { locked: true });
        socket.emit('score-submitted', { 
            score: score,
            total: currentRoundTotal,
            round: currentRound
        });
    });
    
    // 親機からの全ロック解除
    socket.on('unlock-all', () => {
        Object.keys(scores).forEach(name => {
            scores[name].locked = false;
            scores[name].entering = false;
            scores[name].draftScore = null;
            scores[name].unlockRequested = false;
        });
        
        console.log('全子機ロック解除');
        
        io.emit('lock-status', { locked: false });
        
        io.emit('score-updated', {
            clients: buildClientList(),
            history: history.slice(-10)
        });
    });
    
    // 子機からの解除申請
    socket.on('request-unlock', (data) => {
        const { clientName } = data;
        if (scores[clientName]) {
            scores[clientName].unlockRequested = true;
            console.log(`解除申請: ${clientName}`);
            
            io.emit('score-updated', {
                clients: buildClientList(),
                history: history.slice(-10)
            });
        }
    });
    
    // 親機からの催促（該当子機の画面に警告表示）
    socket.on('remind-client', (data) => {
        const clientName = normalizeClientId(String(data?.clientName ?? '').trim());
        const rawMessage = String(data?.message ?? '点数を入力してください！').trim();
        const message = rawMessage || '点数を入力してください！';
        if (!clientName || !scores[clientName]) {
            return;
        }
        io.sockets.sockets.forEach((s) => {
            if (s.clientName === clientName) {
                s.emit('parent-remind', { message });
            }
        });
        io.emit('remind-started', { clientName, durationMs: 5000 });
        console.log(`催促: ${clientName}`);
    });

    socket.on('remind-dismissed', (data) => {
        const raw = data?.clientName || socket.clientName;
        const clientName = normalizeClientId(String(raw ?? '').trim());
        if (!clientName) {
            return;
        }
        io.emit('remind-ended', { clientName });
    });

    // 親機からの個別ロック解除
    socket.on('unlock-client', (data) => {
        const { clientName } = data;
        if (scores[clientName]) {
            scores[clientName].locked = false;
            scores[clientName].entering = false;
            scores[clientName].draftScore = null;
            scores[clientName].unlockRequested = false;
            
            console.log(`個別ロック解除: ${clientName}`);
            
            // 該当子機全てにロック解除を通知
            io.sockets.sockets.forEach(s => {
                if (s.clientName === clientName) {
                    s.emit('lock-status', { locked: false });
                }
            });
            
            io.emit('score-updated', {
                clients: buildClientList(),
                history: history.slice(-10)
            });
        }
    });
    
    // 親機からの全ロック
    socket.on('lock-all', () => {
        Object.keys(scores).forEach(name => {
            scores[name].locked = true;
            scores[name].entering = false;
            scores[name].draftScore = null;
        });
        
        console.log('全子機ロック');
        
        io.emit('lock-status', { locked: true });
        
        io.emit('score-updated', {
            clients: buildClientList(),
            history: history.slice(-10)
        });
    });
    
    // 現在のラウンドをリセット
    socket.on('reset-current-round', (round) => {
        if (round === 'total') {
            // 総合表示の場合は何もしない
            return;
        }
        
        if (typeof round === 'number' && round >= 1 && round <= TEAM_COUNT) {
            clearRoundScoresForSet(currentSet, round);
        }
        
        Object.keys(scores).forEach(name => {
            scores[name].locked = false;
            scores[name].entering = false;
            scores[name].draftScore = null;
        });
        
        console.log(`チーム${teamNames[round - 1]}をリセット`);
        
        io.emit('score-updated', {
            clients: buildClientList(round),
            history: []
        });
        
        io.emit('lock-status', { locked: false });
    });
    
    // 全ラウンドリセット
    socket.on('reset-all-rounds', () => {
        clearAllRoundScoresForSet(currentSet);
        
        Object.keys(scores).forEach(name => {
            scores[name].locked = false;
            scores[name].entering = false;
            scores[name].draftScore = null;
        });
        
        history.length = 0;
        
        console.log('全チームリセット');
        
        // 現在のラウンドデータを再送信
        io.emit('round-data', {
            clients: buildClientList(),
            history: []
        });
        
        io.emit('lock-status', { locked: false });
        
        // 全ラウンド合計も更新
        const roundTotals = {};
        for (let r = 1; r <= TEAM_COUNT; r += 1) {
            roundTotals[r] = 0;
        }
        io.emit('all-rounds-total', { roundTotals });
    });
    
    // 旧リセット（後方互換性のため残す）
    socket.on('reset-all', () => {
        Object.keys(scores).forEach(name => {
            scores[name].locked = false;
        });
        
        io.emit('lock-status', { locked: false });
    });
    
    // 得点発表要求
    socket.on('show-ranking', () => {
        const clientList = buildRankingClientList(currentRound);
        const total = clientList.reduce((sum, client) => sum + (client.score || 0), 0);
        const roundLabel = currentRound === 'total' ? '総合' : `第${currentRound}ラウンド`;
        console.log(`得点発表データ送信: ${roundLabel} 合計 ${total}点`);
        io.emit('ranking-data', { total, clients: clientList, round: currentRound });
    });
    
    // 得点GOトリガー
    socket.on('trigger-go', () => {
        console.log('得点GO! トリガー受信');
        
        const clientList = buildRankingClientList(currentRound);
        const total = clientList.reduce((sum, client) => sum + (client.score || 0), 0);
        
        console.log(`得点GO! 最新データ送信: 合計 ${total}点`);
        
        // 最新データを送信
        io.emit('ranking-data', { total, clients: clientList, round: currentRound });
        
        // その後アニメーション開始
        io.emit('start-animation');
    });
    
    // ランキングリセット（000に戻す）
    socket.on('reset-ranking', () => {
        console.log('ランキングリセット');
        io.emit('reset-ranking-display');
    });
    
    // ランキングページからのデータリクエスト
    // ランキングページからのデータリクエスト
    socket.on('request-ranking-data', () => {
        const clientList = buildRankingClientList(currentRound);
        const total = clientList.reduce((sum, client) => sum + (client.score || 0), 0);
        const roundLabel = currentRound === 'total' ? '総合' : `第${currentRound}ラウンド`;
        console.log(`ランキングデータ送信: ${roundLabel} 合計 ${total}点`);
        socket.emit('ranking-data', { total, clients: clientList, round: currentRound });
    });
    
    // ランキングリスト用のデータリクエスト
    socket.on('request-ranking-list', (round) => {
        console.log(`ランキングリスト要求: チームごとの合計点`);
        
        // 各ラウンドの合計点を計算してランキング作成
        const roundRankings = [];
        
        for (let r = 1; r <= TEAM_COUNT; r += 1) {
            roundRankings.push({
                rank: 0,
                name: teamNames[r - 1] || `R${r}`,
                score: sumTeamRound(currentSet, r)
            });
        }
        
        // 得点順にソート
        roundRankings.sort((a, b) => b.score - a.score);
        
        // 順位を再設定
        roundRankings.forEach((item, index) => {
            item.rank = index + 1;
        });
        
        socket.emit('ranking-list-data', { round: '総合', rankings: roundRankings });
    });
    
    // ランキングGOトリガー
    socket.on('trigger-ranking-go', () => {
        console.log('ランキングGO! トリガー受信');
        io.emit('start-ranking-animation');
    });
    
    // ランキングリストリセット
    socket.on('reset-ranking-list', () => {
        console.log('ランキングリストリセット');
        io.emit('reset-ranking-list');
    });
    
    // 次のランキングを表示
    socket.on('show-next-ranking', () => {
        console.log('次のランキングを表示');
        io.emit('show-next-ranking');
    });
    
    // ラウンド変更
    socket.on('change-round', (round) => {
        currentRound = round;
        console.log(`チーム変更: チーム${teamNames[round - 1]}`);
        io.emit('round-changed', round);
    });

    socket.on('change-set', (set) => {
        const s = Number(set);
        if (!Number.isFinite(s) || s < 1 || s > SET_COUNT) {
            return;
        }
        currentSet = s;
        syncActiveTeamNames();
        console.log(`セット変更: ${setNames[currentSet - 1]}`);
        broadcastTeamNames();
        io.emit('score-updated', {
            clients: buildClientList(),
            history: history.slice(-10)
        });
        io.emit('team-totals', buildTeamTotalsPayload());
    });
    
    // ラウンド別データリクエスト
    socket.on('request-round-data', (round) => {
        if (round !== 'total' && typeof round === 'number') {
            ensureTeamBucket(roundScores, currentSet, round);
        }
        const clientList = buildClientList(round === 'total' ? 'total' : round);
        socket.emit('round-data', { round, set: currentSet, clients: clientList });
    });
    
    // 現在のラウンドリクエスト
    socket.on('request-current-round', () => {
        socket.emit('current-round', currentRound);
    });
    
    socket.on('request-current-set', () => {
        socket.emit('current-set', {
            set: currentSet,
            setName: setNames[currentSet - 1],
            teamNames,
            setNames
        });
    });

    // チーム名をリクエスト
    socket.on('request-team-names', () => {
        socket.emit('team-names', {
            teamNames,
            currentSet,
            setNames,
            teamNamesBySet,
            teamSetStartLines
        });
    });

    socket.on('request-client-display-names', () => {
        socket.emit('client-display-names', {
            names: clientDisplayNames,
            path: clientNameSourcePath
        });
    });
    
    // 全ラウンドの合計をリクエスト（各クライアントの総合得点）
    socket.on('request-all-rounds-total', () => {
        const totals = {};
        
        // 各クライアントの総合得点を計算
        Object.keys(scores).forEach((name) => {
            totals[name] = scoreForClientInSet(roundScores, currentSet, name, 'total');
        });
        
        console.log('各子機の総合得点を送信:', totals);
        socket.emit('all-rounds-total', { totals });
    });
    
    // チーム別の合計をリクエスト（各チームA~Fの合計）
    socket.on('request-team-totals', () => {
        const payload = buildTeamTotalsPayload();
        console.log('チーム別合計を送信:', payload);
        socket.emit('team-totals', payload);
    });
    
    // 子機情報をリクエスト
    socket.on('request-clients', () => {
        const clientList = buildClientList();

        console.log('子機情報を送信:', clientList);
        socket.emit('clients-data', { clients: clientList });
    });
    
    // 全ラウンドの全子機データをリクエスト
    socket.on('request-scores-matrix', () => {
        socket.emit('scores-matrix', buildScoresMatrix());
    });

    socket.on('request-scores-matrix-all', () => {
        socket.emit('scores-matrix-all', buildScoresMatrixAllSets());
    });

    socket.on('request-all-rounds-data', () => {
        const allRoundsData = {};
        
        for (let r = 1; r <= TEAM_COUNT; r += 1) {
            allRoundsData[r] = Object.keys(scores).map((name) => {
                const bucket = roundScores[currentSet]?.[r];
                const roundScore = bucket?.[name]?.score;
                return {
                    name,
                    score: roundScore !== undefined ? roundScore : null,
                    locked: scores[name].locked,
                    lastUpdate: bucket?.[name]?.lastUpdate || scores[name].lastUpdate
                };
            });
        }
        
        console.log('全ラウンドデータを送信');
        socket.emit('all-rounds-data', { rounds: allRoundsData });
    });
    
    // フォント変更
    socket.on('change-font', (fontFamily) => {
        console.log('フォント変更:', fontFamily);
        io.emit('font-changed', { fontFamily });
    });
    
    // テストデータをクリア
    socket.on('clear-test-data', (data) => {
        const { currentRound } = data;
        console.log('テストデータをクリア');
        
        // __TEST__データを削除
        if (scores['__TEST__']) {
            delete scores['__TEST__'];
        }
        
        // 通常のチーム名でのテストデータも削除
        const regularTestName = teamNames[0];
        if (scores[regularTestName] && scores[regularTestName].isTest) {
            delete scores[regularTestName];
        }
        
        deleteTestClientFromCurrentSet('__TEST__');
        deleteTestClientFromCurrentSet(regularTestName);

        io.emit('score-updated', {
            clients: buildClientList(),
            history: history.slice(-10)
        });

        io.emit('team-totals', buildTeamTotalsPayload());
    });
    
    // テスト用点数設定
    socket.on('set-test-score', (data) => {
        const { round, score, testMode } = data;
        console.log(`テスト点数設定: ラウンド${round} - ${score}点 (テストモード: ${testMode ? 'ON' : 'OFF'})`);
        
        // テスト用の仮想クライアント名
        const testClientName = testMode ? '__TEST__' : teamNames[0];
        
        setClientScore(roundScores, currentSet, round, testClientName, score);
        
        // メタデータも作成
        if (!scores[testClientName]) {
            scores[testClientName] = {
                name: testClientName,
                locked: true,
                unlockRequested: false,
                lastUpdate: new Date().toISOString(),
                isTest: testMode
            };
        }
        
        scores[testClientName].lastUpdate = new Date().toISOString();
        scores[testClientName].isTest = testMode;
        
        io.emit('score-updated', {
            clients: buildClientList(round),
            history: history.slice(-10)
        });
        
        io.emit('team-totals', buildTeamTotalsPayload());

        const rankingClientList = testMode
            ? [{ name: teamNames[0], score: getClientScore(roundScores, currentSet, round, '__TEST__') }]
            : buildRankingClientList(round);
        
        const rankingTotal = rankingClientList.reduce((sum, client) => sum + (client.score || 0), 0);
        io.emit('ranking-data', { total: rankingTotal, clients: rankingClientList, round: round });
    });
    
    // 得点発表の調整
    socket.on('update-digit-size', (data) => {
        console.log('点数サイズ変更:', data.size);
        io.emit('digit-size-changed', { size: data.size });
    });
    
    socket.on('update-digit-gap', (data) => {
        console.log('数字間隔変更:', data.gap);
        io.emit('digit-gap-changed', { gap: data.gap });
    });

    socket.on('update-roll-fade-top', (data) => {
        console.log('回転上端フェード変更:', data.percent);
        io.emit('roll-fade-top-changed', { percent: data.percent });
    });
    
    socket.on('update-company-name-size', (data) => {
        console.log('チーム名サイズ変更:', data.size);
        io.emit('company-name-size-changed', { size: data.size });
    });

    socket.on('update-company-name-position', (data) => {
        console.log('会社名位置変更:', data.position);
        io.emit('company-name-position-changed', { position: data.position });
    });
    
    socket.on('update-score-position', (data) => {
        console.log('点数位置変更:', data);
        io.emit('score-position-changed', data);
    });

    socket.on('update-bottom-band-position', (data) => {
        console.log('下帯位置変更:', data.offset);
        io.emit('bottom-band-position-changed', { offset: data.offset });
    });
    
    socket.on('update-stop-timing', (data) => {
        console.log('停止タイミング変更:', data);
        io.emit('stop-timing-changed', data);
    });
    
    socket.on('update-perfect-effect', (data) => {
        console.log('100点演出変更:', data.effect);
        io.emit('perfect-effect-changed', data);
    });
    
    socket.on('update-digit-gradient-colors', (data) => {
        console.log('数字グラデーション色変更:', data);
        io.emit('digit-gradient-colors-changed', data);
    });
    
    socket.on('update-digit-shadow-blur', (data) => {
        console.log('数字影のぼかし変更:', data);
        io.emit('digit-shadow-blur-changed', data);
    });
    
    socket.on('update-digit-shadow-opacity', (data) => {
        console.log('数字影の濃さ変更:', data);
        io.emit('digit-shadow-opacity-changed', data);
    });
    
    socket.on('update-company-gradient-colors', (data) => {
        console.log('チーム名グラデーション色変更:', data);
        io.emit('company-gradient-colors-changed', data);
    });
    
    socket.on('update-company-shadow-blur', (data) => {
        console.log('チーム名影のぼかし変更:', data);
        io.emit('company-shadow-blur-changed', data);
    });
    
    socket.on('update-company-shadow-opacity', (data) => {
        console.log('チーム名影の濃さ変更:', data);
        io.emit('company-shadow-opacity-changed', data);
    });
    
    // 切断処理
    socket.on('disconnect', () => {
        console.log(`切断: ${socket.id} (${socket.clientName || '不明'})`);
        connectedClients.delete(socket.id);
        
        const disconnectedClient = socket.clientName;
        
        // 切断した子機のデータを完全に削除
        if (disconnectedClient && scores[disconnectedClient]) {
            // メタデータを削除
            delete scores[disconnectedClient];
            
            removeClientFromRoundScores(disconnectedClient);
            
            console.log(`子機データ削除: ${disconnectedClient}`);
        }
        
        // 現在のラウンドのスコアを送信（削除後の状態）
        const clientList = buildClientList();

        io.emit('client-disconnected', {
            clientName: disconnectedClient,
            clients: clientList
        });
        
        io.emit('team-totals', buildTeamTotalsPayload());
    });
});

// ローカルIPアドレスを取得
function getLocalIPAddress() {
    const interfaces = os.networkInterfaces();
    const candidates = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                candidates.push(iface.address);
            }
        }
    }
    return (
        candidates.find((ip) => /^192\.168\./.test(ip)) ||
        candidates.find((ip) => /^10\./.test(ip)) ||
        candidates.find((ip) => /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) ||
        candidates[0] ||
        'localhost'
    );
}

function startServer() {
    server.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIPAddress();
    
    console.log(`
========================================
🎯 集計システムサーバー起動
========================================
【このPC】
親機: http://localhost:${PORT}
子機: http://localhost:${PORT}/client
ランキング: http://localhost:${PORT}/ranking
観覧用: http://localhost:${PORT}/viewer.html
点数一覧(CSV): http://localhost:${PORT}/scores-table.html

【別のPC・タブレット・スマホ】
親機: http://${localIP}:${PORT}
子機: http://${localIP}:${PORT}/client
ランキング: http://${localIP}:${PORT}/ranking
観覧用: http://${localIP}:${PORT}/viewer.html
点数一覧(CSV): http://${localIP}:${PORT}/scores-table.html

【子機をキオスクモードで起動】
Chromeキオスクモード（終了はAlt+F4）:
  start chrome --kiosk --app=http://${localIP}:${PORT}/client

フルスクリーンモード（3回クリックで終了可能）:
  start chrome --app=http://${localIP}:${PORT}/client --start-fullscreen
========================================
    `);
    });
}

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`ERROR: ポート ${PORT} は既に使用中です。他の集計サーバーを終了してから再起動してください。`);
    } else {
        console.error('ERROR: サーバー起動失敗:', err.message);
    }
    if (require.main === module) {
        process.exit(1);
    }
});

if (require.main === module) {
    startServer();
}

module.exports = { startServer, server, PORT };
