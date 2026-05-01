import { db } from '../../sessions.js'

function init() { const d = db(); d.exec(`CREATE TABLE IF NOT EXISTS achievements (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ts INTEGER NOT NULL, payload TEXT)`); return d }
export function award(name, payload = null) { init().prepare('INSERT INTO achievements (name, ts, payload) VALUES (?, ?, ?)').run(name, Date.now(), payload ? JSON.stringify(payload) : null) }
export function listAchievements() { return init().prepare('SELECT * FROM achievements ORDER BY id DESC LIMIT 100').all() }
export const plugin = {
    name: 'achievements',
    register: (ctx) => { ctx.registerHook('onSessionStart', async (p) => { award('session-start', { id: p.session?.id }); return p }) },
}
