import path from 'node:path'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { getFophHome } from './home.js'

let _db = null

export function db() {
    if (_db) return _db
    const dir = path.join(getFophHome(), 'state')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, 'sessions.db')
    _db = new Database(file)
    _db.pragma('journal_mode = WAL')
    init(_db)
    return _db
}

function init(d) {
    d.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            platform TEXT, user_id TEXT, chat_id TEXT, thread_id TEXT,
            title TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, model TEXT
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT,
            tool_calls TEXT, tool_call_id TEXT, ts INTEGER NOT NULL,
            FOREIGN KEY(session_id) REFERENCES sessions(id)
        );
        CREATE INDEX IF NOT EXISTS idx_msg_session ON messages(session_id, ts);
    `)
    try {
        d.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, session_id UNINDEXED, content='messages', content_rowid='id');`)
        d.exec(`CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN INSERT INTO messages_fts(rowid, content, session_id) VALUES (new.id, new.content, new.session_id); END;`)
    } catch (e) {
        d._fts5_unavailable = true
    }
}

export function createSession({ platform = 'cli', userId = null, chatId = null, threadId = null, title = null, model = null } = {}) {
    const d = db()
    const id = randomUUID()
    const now = Date.now()
    d.prepare(`INSERT INTO sessions (id, platform, user_id, chat_id, thread_id, title, created_at, updated_at, model) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, platform, userId, chatId, threadId, title, now, now, model)
    return id
}

export function appendMessage(sessionId, { role, content = '', toolCalls = null, toolCallId = null }) {
    const d = db()
    const now = Date.now()
    const info = d.prepare(`INSERT INTO messages (session_id, role, content, tool_calls, tool_call_id, ts) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(sessionId, role, content, toolCalls ? JSON.stringify(toolCalls) : null, toolCallId, now)
    d.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`).run(now, sessionId)
    return info.lastInsertRowid
}

export function getMessages(sessionId) {
    return db().prepare(`SELECT id, role, content, tool_calls, tool_call_id, ts FROM messages WHERE session_id = ? ORDER BY ts ASC, id ASC`).all(sessionId)
        .map(r => ({ ...r, tool_calls: r.tool_calls ? JSON.parse(r.tool_calls) : null }))
}

export function listSessions(limit = 50) {
    return db().prepare(`SELECT id, platform, title, created_at, updated_at, model FROM sessions ORDER BY updated_at DESC LIMIT ?`).all(limit)
}

export function search(query, limit = 20) {
    const d = db()
    if (d._fts5_unavailable) {
        return d.prepare(`SELECT id, session_id, content FROM messages WHERE content LIKE ? ORDER BY ts DESC LIMIT ?`).all(`%${query}%`, limit)
    }
    return d.prepare(`SELECT m.id, m.session_id, m.content FROM messages_fts f JOIN messages m ON m.id = f.rowid WHERE messages_fts MATCH ? ORDER BY rank LIMIT ?`).all(query, limit)
}

export function closeDb() { if (_db) { _db.close(); _db = null } }
export function resetForTests() { closeDb() }
