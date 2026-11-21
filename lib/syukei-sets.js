const fs = require('fs');
const path = require('path');

const TEAM_COUNT = 6;
const SET_COUNT = 6;

const DEFAULT_TEAM_SET_START_LINES = [1, 7, 13, 19, 25, 31];

function defaultTeamNames() {
    return ['A', 'B', 'C', 'D', 'E', 'F'];
}

const DEFAULT_SET_NAME_LABELS = ['セット１', 'セット２', 'セット３', 'セット４', 'セット５', 'セット６'];

function defaultSetNames() {
    return [...DEFAULT_SET_NAME_LABELS];
}

/** @param {number} setNum 1始まり */
function defaultSetNameLabel(setNum) {
    const index = Math.max(1, Math.min(SET_COUNT, setNum)) - 1;
    return DEFAULT_SET_NAME_LABELS[index] || `セット${setNum}`;
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

function readStartLinesFile(filePath, count, fallbackList) {
    try {
        if (!fs.existsSync(filePath)) {
            return [...fallbackList];
        }
        const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
        const result = [];
        for (let i = 0; i < count; i += 1) {
            const n = Number.parseInt((lines[i] ?? '').trim(), 10);
            result.push(Number.isFinite(n) && n >= 1 ? n : fallbackList[i] ?? 1);
        }
        return result;
    } catch {
        return [...fallbackList];
    }
}

function saveStartLinesFile(filePath, lines) {
    fs.writeFileSync(filePath, lines.map((n) => String(n)).join('\n'), 'utf8');
}

function createEmptyRoundScores() {
    /** @type {Record<number, Record<number, Record<string, { name: string, score: number, lastUpdate?: string }>>>} */
    const store = {};
    for (let s = 1; s <= SET_COUNT; s += 1) {
        store[s] = {};
        for (let t = 1; t <= TEAM_COUNT; t += 1) {
            store[s][t] = {};
        }
    }
    return store;
}

function isLegacyRoundScores(store) {
    if (!store || typeof store !== 'object') {
        return false;
    }
    for (let t = 1; t <= TEAM_COUNT; t += 1) {
        const bucket = store[t];
        if (!bucket || typeof bucket !== 'object') {
            continue;
        }
        const sample = Object.values(bucket)[0];
        if (sample && typeof sample === 'object' && typeof sample.score === 'number') {
            return true;
        }
    }
    return false;
}

function migrateLegacyRoundScores(store) {
    if (!isLegacyRoundScores(store)) {
        return store;
    }
    const next = createEmptyRoundScores();
    for (let t = 1; t <= TEAM_COUNT; t += 1) {
        if (store[t]) {
            next[1][t] = { ...store[t] };
        }
    }
    return next;
}

function ensureTeamBucket(store, set, team) {
    if (!store[set]) {
        store[set] = {};
    }
    if (!store[set][team]) {
        store[set][team] = {};
    }
    return store[set][team];
}

/**
 * @param {ReturnType<typeof createEmptyRoundScores>} store
 * @param {number} set
 * @param {number} team
 * @param {string} clientName
 */
function getClientScore(store, set, team, clientName) {
    return store[set]?.[team]?.[clientName]?.score || 0;
}

/**
 * @param {ReturnType<typeof createEmptyRoundScores>} store
 * @param {number} set
 * @param {number} team
 * @param {string} clientName
 * @param {number} score
 */
function setClientScore(store, set, team, clientName, score) {
    const bucket = ensureTeamBucket(store, set, team);
    if (!bucket[clientName]) {
        bucket[clientName] = { name: clientName, score: 0 };
    }
    bucket[clientName].score = score;
    bucket[clientName].lastUpdate = new Date().toISOString();
}

/**
 * @param {ReturnType<typeof createEmptyRoundScores>} store
 * @param {number} set
 * @param {string} clientName
 * @param {number | string} round 'total' | 1-5
 */
function scoreForClientInSet(store, set, clientName, round) {
    if (round === 'total') {
        let total = 0;
        for (let t = 1; t <= TEAM_COUNT; t += 1) {
            total += getClientScore(store, set, t, clientName);
        }
        return total;
    }
    return getClientScore(store, set, round, clientName);
}

/**
 * @param {ReturnType<typeof createEmptyRoundScores>} store
 * @param {string} clientName
 */
function grandTotalForClient(store, clientName) {
    let total = 0;
    for (let s = 1; s <= SET_COUNT; s += 1) {
        total += scoreForClientInSet(store, s, clientName, 'total');
    }
    return total;
}

module.exports = {
    TEAM_COUNT,
    SET_COUNT,
    DEFAULT_TEAM_SET_START_LINES,
    defaultTeamNames,
    DEFAULT_SET_NAME_LABELS,
    defaultSetNames,
    defaultSetNameLabel,
    extractNamesFromFileLines,
    readStartLinesFile,
    saveStartLinesFile,
    createEmptyRoundScores,
    migrateLegacyRoundScores,
    ensureTeamBucket,
    getClientScore,
    setClientScore,
    scoreForClientInSet,
    grandTotalForClient,
    isLegacyRoundScores
};