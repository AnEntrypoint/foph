import { db } from '../sessions.js'

function init() {
    const d = db()
    d.exec(`CREATE TABLE IF NOT EXISTS account_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, model TEXT, prompt_tokens INTEGER, completion_tokens INTEGER, cost_usd REAL, ts INTEGER NOT NULL)`)
    return d
}
export function record({ sessionId = null, model, promptTokens = 0, completionTokens = 0, costUsd = 0 } = {}) {
    init().prepare(`INSERT INTO account_usage (session_id, model, prompt_tokens, completion_tokens, cost_usd, ts) VALUES (?, ?, ?, ?, ?, ?)`).run(sessionId, model, promptTokens, completionTokens, costUsd, Date.now())
}
export function totalForSession(sessionId) {
    return init().prepare(`SELECT SUM(prompt_tokens) AS prompt, SUM(completion_tokens) AS completion, SUM(cost_usd) AS cost FROM account_usage WHERE session_id = ?`).get(sessionId) || { prompt: 0, completion: 0, cost: 0 }
}
export function totalLifetime() {
    return init().prepare(`SELECT SUM(prompt_tokens) AS prompt, SUM(completion_tokens) AS completion, SUM(cost_usd) AS cost FROM account_usage`).get() || { prompt: 0, completion: 0, cost: 0 }
}
export function listRecent(limit = 50) {
    return init().prepare(`SELECT * FROM account_usage ORDER BY id DESC LIMIT ?`).all(limit)
}
