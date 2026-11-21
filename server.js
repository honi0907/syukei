const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const os = require('os');
const fs = require('fs');

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

const TEAM_COUNT = 5;
const CLIENT_ID_COUNT = 10;

const TEAM_NAME_PATH_FILE = path.join(__dirname, 'teamname-path.txt');
const DEFAULT_TEAM_NAME_FILE = path.join(__dirname, 'teamname.txt');
const TEAM_NAME_START_FILE = path.join(__dirname, 'teamname-startline.txt');

const CLIENT_NAME_PATH_FILE = path.join(__dirname, 'clientname-path.txt');
const DEFAULT_CLIENT_NAME_FILE = path.join(__dirname, 'clientname.txt');
const CLIENT_NAME_START_FILE = path.join(__dirname, 'clientname-startline.txt');

/** @type {string[]} */
let teamNames = ['A', 'B', 'C', 'D', 'E'];
/** @type {string} */
let teamNameSourcePath = DEFAULT_TEAM_NAME_FILE;
/** @type {number} */
let teamNameStartLine = 1;

/** @type {string[]} */
let clientDisplayNames = Array.from({ length: CLIENT_ID_COUNT }, (_, i) => `ID${i + 1}`);
/** @type {string} */
let clientNameSourcePath = DEFAULT_CLIENT_NAME_FILE;
/** @type {number} */
let clientNameStartLine = 1;

function defaultTeamNames() {
    return ['A', 'B', 'C', 'D', 'E'];
}

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

function applyTeamNamesFromContent(content, startLine = teamNameStartLine) {
    const safeStart = Math.max(1, Math.floor(startLine));
    teamNameStartLine = safeStart;
    saveStartLine(TEAM_NAME_START_FILE, safeStart);
    teamNames = extractNamesFromFileLines(
        content.split(/\r?\n/),
        safeStart,
        TEAM_COUNT,
        defaultTeamNames
    );
}

function loadTeamNamesFromDisk() {
    teamNameStartLine = readStartLine(TEAM_NAME_START_FILE, 1);
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
            applyTeamNamesFromContent(content, teamNameStartLine);
            console.log('チーム名を読み込みました:', teamNameSourcePath, '開始行:', teamNameStartLine);
        }
    } catch (error) {
        console.error('チーム名ファイル読み込みエラー:', error);
    }
}

function saveTeamNameSourcePath(filePath) {
    teamNameSourcePath = filePath;
    fs.writeFileSync(TEAM_NAME_PATH_FILE, filePath, 'utf8');
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
    io.emit('team-names', { teamNames });
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
loadClientNamesFromDisk();

// 静的ファイル配信
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// データ管理
const scores = {}; // {clientId: {name, score, locked, unlockRequested}}
const roundScores = {
    1: {},
    2: {},
    3: {},
    4: {},
    5: {}
}; // ラウンド別スコア
let currentRound = 1;
const history = [];
let connectedClients = new Set();

/**
 * 親機向けの子機一覧（得点・ロック・入力中）
 * @param {number | string} [round]
 */
function scoreForClientRound(name, round) {
    if (round === 'total') {
        let total = 0;
        for (let r = 1; r <= 5; r += 1) {
            total += roundScores[r]?.[name]?.score || 0;
        }
        return total;
    }
    return roundScores[round]?.[name]?.score || 0;
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
        const currentCommitted = roundScores[currentRound]?.[name]?.score || 0;
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
        path: teamNameSourcePath,
        startLine: teamNameStartLine
    });
});

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
        const { path: filePath, content, startLine } = req.body || {};
        const requestedStart = startLine !== undefined
            ? Math.max(1, Math.floor(Number(startLine)))
            : teamNameStartLine;

        if (typeof content === 'string') {
            applyTeamNamesFromContent(content, requestedStart);
            if (!filePath) {
                fs.writeFileSync(DEFAULT_TEAM_NAME_FILE, content, 'utf8');
                teamNameSourcePath = DEFAULT_TEAM_NAME_FILE;
            }
        } else if (filePath) {
            if (!fs.existsSync(filePath)) {
                res.status(400).json({ ok: false, error: 'ファイルが見つかりません' });
                return;
            }
            saveTeamNameSourcePath(filePath);
            const fileContent = fs.readFileSync(filePath, 'utf8');
            applyTeamNamesFromContent(fileContent, requestedStart);
        } else {
            if (startLine !== undefined) {
                teamNameStartLine = requestedStart;
                saveStartLine(TEAM_NAME_START_FILE, requestedStart);
            }
            loadTeamNamesFromDisk();
        }

        broadcastTeamNames();

        res.json({
            ok: true,
            names: teamNames,
            path: teamNameSourcePath,
            startLine: teamNameStartLine
        });
    } catch (error) {
        console.error('チーム名読込エラー:', error);
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
        
        // スコア更新（現在のラウンドに保存）
        if (!roundScores[currentRound]) {
            roundScores[currentRound] = {};
        }
        if (!roundScores[currentRound][clientName]) {
            roundScores[currentRound][clientName] = { name: clientName, score: 0 };
        }
        
        // 同じラウンド内では上書き（加算ではなく）
        roundScores[currentRound][clientName].score = score;
        
        // メタデータのみ更新（総合スコアは計算時に算出）
        scores[clientName].lastUpdate = new Date().toISOString();
        scores[clientName].locked = true; // 送信後自動ロック
        scores[clientName].entering = false;
        scores[clientName].draftScore = null;
        
        // 現在のラウンドの合計を計算
        const currentRoundTotal = roundScores[currentRound][clientName].score;
        
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
        
        // チーム別の合計を送信
        const teamTotals = [];
        for (let r = 1; r <= 5; r++) {
            let teamTotal = 0;
            if (roundScores[r]) {
                Object.values(roundScores[r]).forEach(client => {
                    teamTotal += client.score || 0;
                });
            }
            teamTotals.push({
                team: teamNames[r - 1],
                score: teamTotal
            });
        }
        io.emit('team-totals', { teams: teamTotals });
        
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
        
        // 指定ラウンドのスコアをリセット
        if (roundScores[round]) {
            Object.keys(roundScores[round]).forEach(name => {
                roundScores[round][name].score = 0;
            });
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
        // 全ラウンドのスコアをリセット
        for (let r = 1; r <= 5; r++) {
            if (roundScores[r]) {
                Object.keys(roundScores[r]).forEach(name => {
                    roundScores[r][name].score = 0;
                });
            }
        }
        
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
        io.emit('all-rounds-total', {
            roundTotals: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        });
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
        
        for (let r = 1; r <= 5; r++) {
            // このラウンドの全子機の合計点を計算
            let roundTotal = 0;
            Object.keys(roundScores[r] || {}).forEach(name => {
                roundTotal += roundScores[r][name]?.score || 0;
            });
            
            roundRankings.push({
                rank: 0,
                name: `R${r}`,
                score: roundTotal
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
    
    // ラウンド別データリクエスト
    socket.on('request-round-data', (round) => {
        if (round !== 'total' && !roundScores[round]) {
            roundScores[round] = {};
        }
        const clientList = buildClientList(round === 'total' ? 'total' : round);
        socket.emit('round-data', { round, clients: clientList });
    });
    
    // 現在のラウンドリクエスト
    socket.on('request-current-round', () => {
        socket.emit('current-round', currentRound);
    });
    
    // チーム名をリクエスト
    socket.on('request-team-names', () => {
        socket.emit('team-names', { teamNames });
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
        Object.keys(scores).forEach(name => {
            totals[name] = 0;
            for (let r = 1; r <= 5; r++) {
                if (roundScores[r] && roundScores[r][name]) {
                    totals[name] += roundScores[r][name].score || 0;
                }
            }
        });
        
        console.log('各子機の総合得点を送信:', totals);
        socket.emit('all-rounds-total', { totals });
    });
    
    // チーム別の合計をリクエスト（各チームA~Fの合計）
    socket.on('request-team-totals', () => {
        const teamTotals = [];
        
        for (let r = 1; r <= 5; r++) {
            let teamTotal = 0;
            if (roundScores[r]) {
                Object.values(roundScores[r]).forEach(client => {
                    teamTotal += client.score || 0;
                });
            }
            teamTotals.push({
                team: teamNames[r - 1],
                score: teamTotal
            });
        }
        
        console.log('チーム別合計を送信:', teamTotals);
        socket.emit('team-totals', { teams: teamTotals });
    });
    
    // 子機情報をリクエスト
    socket.on('request-clients', () => {
        const clientList = buildClientList();

        console.log('子機情報を送信:', clientList);
        socket.emit('clients-data', { clients: clientList });
    });
    
    // 全ラウンドの全子機データをリクエスト
    socket.on('request-all-rounds-data', () => {
        const allRoundsData = {};
        
        for (let r = 1; r <= 5; r++) {
            allRoundsData[r] = Object.keys(scores).map(name => {
                const roundScore = roundScores[r]?.[name]?.score;
                return {
                    name,
                    score: roundScore !== undefined ? roundScore : null,
                    locked: scores[name].locked,
                    lastUpdate: roundScores[r]?.[name]?.lastUpdate || scores[name].lastUpdate
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
        
        // 全ラウンドから削除
        for (let r = 1; r <= 5; r++) {
            if (roundScores[r]) {
                if (roundScores[r]['__TEST__']) {
                    delete roundScores[r]['__TEST__'];
                }
                if (roundScores[r][regularTestName]) {
                    delete roundScores[r][regularTestName];
                }
            }
        }
        
        io.emit('score-updated', {
            clients: buildClientList(),
            history: history.slice(-10)
        });
        
        // チーム合計も更新
        const teamTotals = {};
        for (let r = 1; r <= 5; r++) {
            teamTotals[r] = 0;
            if (roundScores[r]) {
                Object.keys(roundScores[r]).forEach(name => {
                    if (!scores[name] || !scores[name].isTest) {
                        teamTotals[r] += roundScores[r][name].score || 0;
                    }
                });
            }
        }
        io.emit('team-totals', teamTotals);
    });
    
    // テスト用点数設定
    socket.on('set-test-score', (data) => {
        const { round, score, testMode } = data;
        console.log(`テスト点数設定: ラウンド${round} - ${score}点 (テストモード: ${testMode ? 'ON' : 'OFF'})`);
        
        // テスト用の仮想クライアント名
        const testClientName = testMode ? '__TEST__' : teamNames[0];
        
        // ラウンドデータを初期化
        if (!roundScores[round]) {
            roundScores[round] = {};
        }
        if (!roundScores[round][testClientName]) {
            roundScores[round][testClientName] = { name: testClientName, score: 0 };
        }
        
        // スコアを設定
        roundScores[round][testClientName].score = score;
        
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
        
        // チーム合計も更新
        const teamTotals = {};
        for (let r = 1; r <= 5; r++) {
            teamTotals[r] = 0;
            if (roundScores[r]) {
                Object.keys(roundScores[r]).forEach(name => {
                    if (!scores[name] || !scores[name].isTest) {
                        teamTotals[r] += roundScores[r][name].score || 0;
                    }
                });
            }
        }
        io.emit('team-totals', teamTotals);
        
        // ランキングデータも更新（テストモードOFFの場合のみランキング表示用データを送る）
        const rankingClientList = testMode
            ? [{ name: teamNames[0], score: roundScores[round]?.['__TEST__']?.score || 0 }]
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
    
    socket.on('update-company-name-position', (data) => {
        console.log('会社名位置変更:', data.position);
        io.emit('company-name-position-changed', { position: data.position });
    });
    
    socket.on('update-score-position', (data) => {
        console.log('点数位置変更:', data);
        io.emit('score-position-changed', data);
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
            
            // 全ラウンドのスコアを削除
            for (let r = 1; r <= 5; r++) {
                if (roundScores[r] && roundScores[r][disconnectedClient]) {
                    delete roundScores[r][disconnectedClient];
                }
            }
            
            console.log(`子機データ削除: ${disconnectedClient}`);
        }
        
        // 現在のラウンドのスコアを送信（削除後の状態）
        const clientList = buildClientList();

        io.emit('client-disconnected', {
            clientName: disconnectedClient,
            clients: clientList
        });
        
        // チーム別の合計も更新
        const teamTotals = [];
        for (let r = 1; r <= 5; r++) {
            let teamTotal = 0;
            if (roundScores[r]) {
                Object.values(roundScores[r]).forEach(client => {
                    teamTotal += client.score || 0;
                });
            }
            teamTotals.push({
                team: teamNames[r - 1],
                score: teamTotal
            });
        }
        io.emit('team-totals', { teams: teamTotals });
    });
});

// ローカルIPアドレスを取得
function getLocalIPAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // IPv4で、内部アドレスでないものを探す
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

function startServer() {
    server.listen(PORT, () => {
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

【別のPC・タブレット・スマホ】
親機: http://${localIP}:${PORT}
子機: http://${localIP}:${PORT}/client
ランキング: http://${localIP}:${PORT}/ranking
観覧用: http://${localIP}:${PORT}/viewer.html

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
