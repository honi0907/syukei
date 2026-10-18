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
const pkg = require('./package.json');
const GITHUB_RELEASES_URL = 'https://github.com/honi0907/syukei/releases/latest';

// チーム名をファイルから読み込み
let teamNames = ['A', 'B', 'C', 'D', 'E']; // デフォルト
try {
    const teamnameFile = path.join(__dirname, 'teamname.txt');
    if (fs.existsSync(teamnameFile)) {
        const content = fs.readFileSync(teamnameFile, 'utf8');
        const lines = content.split('\n').map(line => line.trim()).filter(line => line);
        if (lines.length >= 5) {
            teamNames = lines.slice(0, 5);
            console.log('チーム名を読み込みました:', teamNames);
        }
    }
} catch (error) {
    console.error('チーム名ファイル読み込みエラー:', error);
}

// 静的ファイル配信
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

app.get('/api/version', (_req, res) => {
    res.json({
        name: pkg.name,
        version: pkg.version,
        releasesUrl: GITHUB_RELEASES_URL
    });
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
        const { clientName } = data;
        socket.clientName = clientName;
        connectedClients.add(socket.id);
        
        // 既存データがあれば復元、なければ新規作成
        if (!scores[clientName]) {
            scores[clientName] = {
                name: clientName,
                locked: false,
                unlockRequested: false,
                lastUpdate: new Date().toISOString()
            };
        }
        
        console.log(`子機登録: ${clientName}`);
        
        // 親機に接続状態を通知（現在のラウンドのスコアを送信）
        const clientList = Object.keys(scores).map(name => {
            const roundScore = roundScores[currentRound]?.[name]?.score || 0;
            return {
                name,
                score: roundScore,
                locked: scores[name].locked,
                unlockRequested: scores[name].unlockRequested || false,
                lastUpdate: scores[name].lastUpdate
            };
        });
        
        io.emit('client-connected', {
            clientName,
            clients: clientList
        });
        
        // 子機にロック状態を送信
        socket.emit('lock-status', { locked: scores[clientName].locked });
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
        
        // 全員に更新を通知（現在のラウンドのスコアを送信）
        const clientList = Object.keys(scores).map(name => {
            const roundScore = roundScores[currentRound][name]?.score || 0;
            return {
                name,
                score: roundScore,
                locked: scores[name].locked,
                unlockRequested: scores[name].unlockRequested || false,
                lastUpdate: scores[name].lastUpdate
            };
        });
        
        io.emit('score-updated', {
            clients: clientList,
            history: history.slice(-10)
        });
        
        // ランキングウィンドウ用にも現在のラウンドデータを送信
        const rankingClientList = Object.keys(scores).map(name => {
            let roundScore = 0;
            if (currentRound === 'total') {
                for (let r = 1; r <= 5; r++) {
                    if (roundScores[r] && roundScores[r][name]) {
                        roundScore += roundScores[r][name].score || 0;
                    }
                }
            } else {
                if (roundScores[currentRound] && roundScores[currentRound][name]) {
                    roundScore = roundScores[currentRound][name].score || 0;
                }
            }
            return {
                name,
                score: roundScore
            };
        }).sort((a, b) => b.score - a.score);
        
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
            scores[name].unlockRequested = false;
        });
        
        console.log('全子機ロック解除');
        
        // 全子機にロック解除を通知
        io.emit('lock-status', { locked: false });
        
        // 親機に更新を通知(現在のラウンドのスコアを含める)
        io.emit('score-updated', {
            clients: Object.keys(scores).map(name => {
                const roundScore = currentRound === 'total' 
                    ? Object.keys(roundScores).reduce((sum, r) => sum + (roundScores[r][name]?.score || 0), 0)
                    : (roundScores[currentRound][name]?.score || 0);
                return {
                    name,
                    score: roundScore,
                    unlockRequested: false,
                    ...scores[name]
                };
            }),
            history: history.slice(-10)
        });
    });
    
    // 子機からの解除申請
    socket.on('request-unlock', (data) => {
        const { clientName } = data;
        if (scores[clientName]) {
            scores[clientName].unlockRequested = true;
            console.log(`解除申請: ${clientName}`);
            
            // 親機に更新を通知
            const clientList = Object.keys(scores).map(name => {
                const roundScore = roundScores[currentRound][name]?.score || 0;
                return {
                    name,
                    score: roundScore,
                    locked: scores[name].locked,
                    unlockRequested: scores[name].unlockRequested || false,
                    lastUpdate: scores[name].lastUpdate
                };
            });
            
            io.emit('score-updated', {
                clients: clientList,
                history: history.slice(-10)
            });
        }
    });
    
    // 親機からの個別ロック解除
    socket.on('unlock-client', (data) => {
        const { clientName } = data;
        if (scores[clientName]) {
            scores[clientName].locked = false;
            scores[clientName].unlockRequested = false;
            
            console.log(`個別ロック解除: ${clientName}`);
            
            // 該当子機全てにロック解除を通知
            io.sockets.sockets.forEach(s => {
                if (s.clientName === clientName) {
                    s.emit('lock-status', { locked: false });
                }
            });
            
            // 親機に更新を通知
            const clientList = Object.keys(scores).map(name => {
                const roundScore = roundScores[currentRound][name]?.score || 0;
                return {
                    name,
                    score: roundScore,
                    locked: scores[name].locked,
                    unlockRequested: scores[name].unlockRequested || false,
                    lastUpdate: scores[name].lastUpdate
                };
            });
            
            io.emit('score-updated', {
                clients: clientList,
                history: history.slice(-10)
            });
        }
    });
    
    // 親機からの全ロック
    socket.on('lock-all', () => {
        Object.keys(scores).forEach(name => {
            scores[name].locked = true;
        });
        
        console.log('全子機ロック');
        
        // 全子機にロックを通知
        io.emit('lock-status', { locked: true });
        
        // 親機に更新を通知(現在のラウンドのスコアを含める)
        io.emit('score-updated', {
            clients: Object.keys(scores).map(name => {
                const roundScore = currentRound === 'total' 
                    ? Object.keys(roundScores).reduce((sum, r) => sum + (roundScores[r][name]?.score || 0), 0)
                    : (roundScores[currentRound][name]?.score || 0);
                return {
                    name,
                    score: roundScore,
                    ...scores[name]
                };
            }),
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
        
        // ロック解除
        Object.keys(scores).forEach(name => {
            scores[name].locked = false;
        });
        
        console.log(`チーム${teamNames[round - 1]}をリセット`);
        
        // 現在のラウンドデータを再送信
        const clientList = Object.keys(scores).map(name => {
            const roundScore = roundScores[round][name]?.score || 0;
            return {
                name,
                score: roundScore,
                locked: scores[name].locked,
                lastUpdate: scores[name].lastUpdate
            };
        });
        
        io.emit('score-updated', {
            clients: clientList,
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
        
        // メタデータをリセット
        Object.keys(scores).forEach(name => {
            scores[name].locked = false;
        });
        
        history.length = 0;
        
        console.log('全チームリセット');
        
        // 現在のラウンドデータを再送信
        io.emit('round-data', {
            clients: Object.keys(scores).map(name => ({
                name,
                score: 0,
                locked: false,
                lastUpdate: scores[name].lastUpdate
            })),
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
        // 現在のラウンドの得点を計算（scoresに存在する子機のみ）
        const clientList = Object.keys(scores)
            .filter(name => !scores[name].isTest) // テストデータを除外
            .map(name => {
                let roundScore = 0;
                if (currentRound === 'total') {
                    // 総合表示の場合は全ラウンドの合計
                    for (let r = 1; r <= 5; r++) {
                        if (roundScores[r] && roundScores[r][name]) {
                            roundScore += roundScores[r][name].score || 0;
                        }
                    }
                } else {
                    // 個別ラウンドの場合は現在のラウンドのみ
                    if (roundScores[currentRound] && roundScores[currentRound][name]) {
                        roundScore = roundScores[currentRound][name].score || 0;
                    }
                }
                return {
                    name,
                    score: roundScore
                };
            })
            .sort((a, b) => b.score - a.score);
        
        // 全体の総合得点
        const total = clientList.reduce((sum, client) => sum + (client.score || 0), 0);
        
        const roundLabel = currentRound === 'total' ? '総合' : `第${currentRound}ラウンド`;
        console.log(`得点発表データ送信: ${roundLabel} 合計 ${total}点`);
        io.emit('ranking-data', { total, clients: clientList, round: currentRound });
    });
    
    // 得点GOトリガー
    socket.on('trigger-go', () => {
        console.log('得点GO! トリガー受信');
        
        // 最新のランキングデータを送信してからアニメーション開始
        const clientList = Object.keys(scores)
            .filter(name => !scores[name].isTest) // テストデータを除外
            .map(name => {
                let roundScore = 0;
                if (currentRound === 'total') {
                    // 総合表示の場合は全ラウンドの合計
                    for (let r = 1; r <= 5; r++) {
                        if (roundScores[r] && roundScores[r][name]) {
                            roundScore += roundScores[r][name].score || 0;
                        }
                    }
                } else {
                    // 個別ラウンドの場合は現在のラウンドのみ
                    if (roundScores[currentRound] && roundScores[currentRound][name]) {
                        roundScore = roundScores[currentRound][name].score || 0;
                    }
                }
                return {
                    name,
                    score: roundScore
                };
            })
            .sort((a, b) => b.score - a.score);
        
        // 全体の総合得点
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
        // 現在のラウンドの得点を計算（scoresに存在する子機のみ）
        const clientList = Object.keys(scores)
            .filter(name => !scores[name].isTest) // テストデータを除外
            .map(name => {
                let roundScore = 0;
                if (currentRound === 'total') {
                    // 総合表示の場合は全ラウンドの合計
                    for (let r = 1; r <= 5; r++) {
                        if (roundScores[r] && roundScores[r][name]) {
                            roundScore += roundScores[r][name].score || 0;
                        }
                    }
                } else {
                    // 個別ラウンドの場合は現在のラウンドのみ
                    if (roundScores[currentRound] && roundScores[currentRound][name]) {
                        roundScore = roundScores[currentRound][name].score || 0;
                    }
                }
                return {
                    name,
                    score: roundScore
                };
            })
            .sort((a, b) => b.score - a.score);
        
        // 全体の総合得点
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
        let clientList;
        
        if (round === 'total') {
            // 総合得点（全ラウンドの合計）
            const totalScores = {};
            Object.keys(scores).forEach(name => {
                totalScores[name] = { name, score: 0, locked: scores[name].locked };
                for (let r = 1; r <= 5; r++) {
                    if (roundScores[r][name]) {
                        totalScores[name].score += roundScores[r][name].score;
                    }
                }
            });
            clientList = Object.values(totalScores);
        } else {
            // 特定ラウンドのスコア
            if (!roundScores[round]) {
                roundScores[round] = {};
            }
            
            // 登録済みの全クライアントに対してラウンド別スコアを返す
            clientList = Object.keys(scores).map(name => {
                const roundScore = roundScores[round][name]?.score || 0;
                return {
                    name,
                    score: roundScore, // このラウンドのスコアのみ
                    locked: scores[name].locked,
                    lastUpdate: scores[name].lastUpdate
                };
            });
        }
        
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
        const clientList = Object.keys(scores).map(name => {
            const roundScore = roundScores[currentRound]?.[name]?.score || 0;
            return {
                name,
                score: roundScore,
                locked: scores[name].locked,
                unlockRequested: scores[name].unlockRequested || false,
                lastUpdate: scores[name].lastUpdate
            };
        });
        
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
        
        // 親機に更新を通知
        const clientList = Object.keys(scores)
            .filter(name => !scores[name].isTest)
            .map(name => {
                const roundScore = roundScores[currentRound][name]?.score || 0;
                return {
                    name,
                    score: roundScore,
                    locked: scores[name].locked,
                    unlockRequested: scores[name].unlockRequested || false,
                    lastUpdate: scores[name].lastUpdate
                };
            });
        
        io.emit('score-updated', {
            clients: clientList,
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
        
        // 親機に更新を通知（テストデータは除外）
        const clientList = Object.keys(scores)
            .filter(name => !scores[name].isTest) // テストモードのデータは除外
            .map(name => {
                const roundScore = roundScores[round][name]?.score || 0;
                return {
                    name,
                    score: roundScore,
                    locked: scores[name].locked,
                    unlockRequested: scores[name].unlockRequested || false,
                    lastUpdate: scores[name].lastUpdate
                };
            });
        
        io.emit('score-updated', {
            clients: clientList,
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
            ? Object.keys(scores)
                .filter(name => name === '__TEST__')
                .map(name => {
                    const roundScore = roundScores[round][name]?.score || 0;
                    return { name: teamNames[0], score: roundScore }; // ランキング表示は元のチーム名で
                })
            : Object.keys(scores).map(name => {
            const roundScore = roundScores[round][name]?.score || 0;
            return {
                name,
                score: roundScore
            };
        }).sort((a, b) => b.score - a.score);
        
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
        const clientList = Object.keys(scores).map(name => {
            const roundScore = roundScores[currentRound]?.[name]?.score || 0;
            return {
                name,
                score: roundScore,
                locked: scores[name].locked,
                unlockRequested: scores[name].unlockRequested || false,
                lastUpdate: scores[name].lastUpdate
            };
        });
        
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
