import path from 'node:path'
import fs from 'node:fs'
import initSqlJs from 'sql.js'
import { getFophHome } from './home.js'

let _db = null
let _dbPromise = null
let _sqlJs = null
const DB_PATH = () => path.join(getFophHome(), 'state', 'sessions.db')
const USE_MEMORY_DB = () => process.env.FOPH_TEST_DB === 'memory'

async function initSqlJsModule() {
    if (_sqlJs) return _sqlJs
    _sqlJs = await initSqlJs()
    return _sqlJs
}

export async function db() {
    if (_db) return _db
    if (_dbPromise) return await _dbPromise

    _dbPromise = (async () => {
        const SQL = await initSqlJsModule()
        let database
        let dbPath = null

        if (USE_MEMORY_DB()) {
            // In-memory mode for tests: no file persistence
            database = new SQL.Database()
        } else {
            const dir = path.join(getFophHome(), 'state')
            fs.mkdirSync(dir, { recursive: true })
            dbPath = DB_PATH()

            if (fs.existsSync(dbPath)) {
                const filebuffer = fs.readFileSync(dbPath)
                database = new SQL.Database(filebuffer)
            } else {
                database = new SQL.Database()
            }
        }

        _db = new DbAdapter(database, dbPath)
        _dbPromise = null
        return _db
    })()

    return await _dbPromise
}

class DbAdapter {
    constructor(database, dbPath) {
        this.database = database
        this.dbPath = dbPath
        this._fts5_unavailable = false
        this._tryInitFts5()
    }

    _tryInitFts5() {
        try {
            this.database.run('CREATE VIRTUAL TABLE IF NOT EXISTS _fts5_test USING fts5(content);')
            this.database.run('DROP TABLE _fts5_test;')
        } catch (e) {
            this._fts5_unavailable = true
        }
    }

    prepare(sql) {
        return new PreparedStatement(this.database, sql)
    }

    exec(sql) {
        try {
            return this.database.exec(sql)
        } catch (e) {
            if (e.message && e.message.includes('VIRTUAL TABLE')) {
                this._fts5_unavailable = true
                return []
            }
            throw e
        }
    }

    run(...args) {
        const [sql, ...params] = args
        return this.database.run(sql, params)
    }

    transaction(fn) {
        return (...args) => {
            try {
                this.database.run('BEGIN TRANSACTION')
                const result = fn(...args)
                this.database.run('COMMIT')
                return result
            } catch (e) {
                this.database.run('ROLLBACK')
                throw e
            }
        }
    }

    close() {
        if (this.database) {
            this._persist()
            this.database.close()
            this.database = null
        }
    }

    _persist() {
        if (!this.database || !this.dbPath) return
        try {
            const data = this.database.export()
            const buffer = Buffer.from(data)
            fs.writeFileSync(this.dbPath, buffer)
        } catch (e) {
            console.error('Failed to persist database:', e)
        }
    }

    clearAll() {
        try {
            const tables = this.database.exec("SELECT name FROM sqlite_master WHERE type='table'")
            if (tables.length > 0 && tables[0].values.length > 0) {
                tables[0].values.forEach(([tableName]) => {
                    try {
                        this.database.run(`DROP TABLE IF EXISTS ${tableName}`)
                    } catch (e) {
                        // Ignore drop errors
                    }
                })
            }
        } catch (e) {
            // Ignore errors
        }
    }
}

class PreparedStatement {
    constructor(database, sql) {
        this.database = database
        this.sql = sql
        this.stmt = database.prepare(sql)
    }

    bind(params = []) {
        this.stmt.bind(params)
        return this
    }

    run(...params) {
        const p = Array.isArray(params[0]) ? params[0] : params
        this.stmt.bind(p)
        this.stmt.step()
        const result = { changes: this.database.getRowsModified(), lastInsertRowid: this.database.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] || 0 }
        this.stmt.reset()
        return result
    }

    get(...params) {
        const p = Array.isArray(params[0]) ? params[0] : params
        this.stmt.bind(p)
        let result = null
        if (this.stmt.step()) {
            result = this.stmt.getAsObject()
        }
        this.stmt.reset()
        return result
    }

    all(...params) {
        const p = Array.isArray(params[0]) ? params[0] : params
        this.stmt.bind(p)
        const results = []
        while (this.stmt.step()) {
            results.push(this.stmt.getAsObject())
        }
        this.stmt.reset()
        return results
    }
}

export async function closeDb() {
    if (_db) {
        _db.close()
        _db = null
    }
    _dbPromise = null
}

export async function resetForTests() {
    // Clear all tables from current db (if open) to clean state
    if (_db) {
        _db.clearAll()
    }
    await closeDb()

    // Reset module state for fresh in-memory init
    _db = null
    _dbPromise = null
}
