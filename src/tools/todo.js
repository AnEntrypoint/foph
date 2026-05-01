import { db } from '../sessions.js'
import { registry } from './registry.js'

function init() {
    const d = db()
    d.exec(`CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, content TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created INTEGER NOT NULL, updated INTEGER NOT NULL)`)
    return d
}

const ACTIONS = {
    add: ({ session_id = null, content }) => {
        if (!content) return { error: 'content required' }
        const d = init(); const now = Date.now()
        const info = d.prepare(`INSERT INTO todos (session_id, content, status, created, updated) VALUES (?, ?, 'pending', ?, ?)`).run(session_id, content, now, now)
        return { id: info.lastInsertRowid, content, status: 'pending' }
    },
    list: ({ session_id = null }) => {
        const d = init()
        const rows = session_id ? d.prepare(`SELECT * FROM todos WHERE session_id = ? ORDER BY id DESC`).all(session_id) : d.prepare(`SELECT * FROM todos ORDER BY id DESC`).all()
        return { todos: rows }
    },
    update: ({ id, status }) => {
        if (!id) return { error: 'id required' }
        init().prepare(`UPDATE todos SET status = ?, updated = ? WHERE id = ?`).run(status, Date.now(), id)
        return { id, status }
    },
    complete: ({ id }) => ACTIONS.update({ id, status: 'completed' }),
    delete: ({ id }) => { init().prepare(`DELETE FROM todos WHERE id = ?`).run(id); return { id, deleted: true } },
}

registry.register({
    name: 'todo',
    toolset: 'core',
    schema: {
        name: 'todo',
        description: 'Manage per-session todos. Actions: add, list, update, complete, delete.',
        parameters: {
            type: 'object',
            properties: {
                action: { type: 'string', enum: Object.keys(ACTIONS) },
                content: { type: 'string' },
                id: { type: 'number' },
                status: { type: 'string' },
                session_id: { type: 'string' },
            },
            required: ['action'],
        },
    },
    handler: async (args) => {
        const fn = ACTIONS[args.action]
        if (!fn) return { error: 'unknown action: ' + args.action }
        return fn(args)
    },
})
