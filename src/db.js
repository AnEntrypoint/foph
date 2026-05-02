import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { createEmbedded } from 'busybase/embedded'
import { getFophHome } from './home.js'

let _db = null
let _dbPromise = null
const DB_PATH = () => path.join(getFophHome(), 'state', 'sessions.db')
const USE_MEMORY_DB = () => process.env.FOPH_TEST_DB === 'memory'

export async function db() {
    if (_db) return _db
    if (_dbPromise) return await _dbPromise

    _dbPromise = (async () => {
        let busybaseInstance
        let dbPath = null

        if (USE_MEMORY_DB()) {
            // Use a temp directory for test memory DB (busybase always needs a directory)
            const tempDir = path.join(os.tmpdir(), `foph-test-${Date.now()}`)
            fs.mkdirSync(tempDir, { recursive: true })
            busybaseInstance = await createEmbedded({ dir: tempDir })
            dbPath = null
        } else {
            const dir = path.join(getFophHome(), 'state')
            fs.mkdirSync(dir, { recursive: true })
            dbPath = path.join(dir, 'db.sqlite')
            busybaseInstance = await createEmbedded({ dir })
        }

        _db = new DbAdapter(busybaseInstance, dbPath)
        _dbPromise = null
        return _db
    })()

    return await _dbPromise
}

class DbAdapter {
    constructor(busybaseInstance, dbPath) {
        this.bb = busybaseInstance
        this.dbPath = dbPath
        this._fts5_unavailable = false
    }

    prepare(sql) {
        return new PreparedStatement(this.bb, sql)
    }

    async exec(sql) {
        const statements = sql.split(';').filter(s => s.trim())
        const results = []
        for (const stmt of statements) {
            const trimmed = stmt.trim()
            if (!trimmed) continue

            const upper = trimmed.toUpperCase()

            if (upper.startsWith('CREATE TABLE')) {
                const tableMatch = /CREATE\s+(?:VIRTUAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i.exec(stmt)
                if (!tableMatch) {
                    results.push({ ok: false, error: 'Could not parse table name' })
                    continue
                }
                const tableName = tableMatch[1]

                // Check if it's a VIRTUAL TABLE (FTS5)
                if (/VIRTUAL\s+TABLE.*USING\s+fts5/i.test(stmt)) {
                    this._fts5_unavailable = true
                    results.push({ ok: true, warning: 'FTS5 not supported' })
                    continue
                }

                // Parse columns from CREATE TABLE statement
                const colsMatch = /\(([^)]+)\)/.exec(stmt)
                if (!colsMatch) {
                    results.push({ ok: false, error: 'Could not parse columns' })
                    continue
                }

                const colsStr = colsMatch[1]
                const cols = colsStr.split(',').map(c => c.trim())
                const schemaStr = cols.map(col => {
                    // Simple parser: extract column name and type
                    const parts = col.split(/\s+/)
                    const colName = parts[0]
                    const colType = parts[1] || 'text'

                    if (/^(int|integer|primary|key|autoincrement|not|null|default)/i.test(colType)) {
                        // It's a constraint, return just the name with a guess
                        return colName + ':text'
                    }

                    // Map SQL types to busybase types
                    if (/^text/i.test(colType)) return colName + ':text'
                    if (/^int/i.test(colType)) return colName + ':int'
                    if (/^real|double|float/i.test(colType)) return colName + ':real'
                    if (/^blob/i.test(colType)) return colName + ':blob'
                    return colName + ':text'
                }).join(',')

                // Try to create the table
                try {
                    await this.bb.from(tableName).create(schemaStr)
                    results.push({ ok: true })
                } catch (e) {
                    // Table might already exist; continue
                    results.push({ ok: true, warning: e.message })
                }
            } else if (upper.startsWith('CREATE INDEX') || upper.startsWith('CREATE TRIGGER')) {
                // Busybase doesn't support these, skip
                results.push({ ok: true, warning: 'Index/Trigger skipped' })
            } else {
                results.push({ ok: true })
            }
        }
        return results
    }

    async run(...args) {
        const [sql, ...params] = args
        const result = await new PreparedStatement(this.bb, sql).run(...params)
        return result
    }

    transaction(fn) {
        return async (...args) => {
            // Busybase doesn't have built-in transaction support yet
            // Execute without transaction wrapping
            try {
                const result = await fn(...args)
                return result
            } catch (e) {
                throw e
            }
        }
    }

    async close() {
        this.bb = null
    }

    async clearAll() {
        // Busybase doesn't expose table enumeration easily
        // For tests, we rely on resetForTests() to fully reinit
    }
}

class PreparedStatement {
    constructor(busybaseInstance, sql) {
        this.bb = busybaseInstance
        this.sql = sql
    }

    bind(params = []) {
        this.params = params
        return this
    }

    async run(...params) {
        const p = Array.isArray(params[0]) ? params[0] : params
        const result = await this._executeSQL(this.sql, p, 'write')
        return result
    }

    async get(...params) {
        const p = Array.isArray(params[0]) ? params[0] : params
        const result = await this._executeSQL(this.sql, p, 'read')
        if (!result || !Array.isArray(result)) return null
        return result[0] || null
    }

    async all(...params) {
        const p = Array.isArray(params[0]) ? params[0] : params
        const result = await this._executeSQL(this.sql, p, 'read')
        return Array.isArray(result) ? result : []
    }

    async _executeSQL(sql, params, mode) {
        const trimmed = sql.trim().toUpperCase()

        if (trimmed.startsWith('SELECT')) {
            return this._parseSelect(sql, params)
        } else if (trimmed.startsWith('INSERT')) {
            return this._parseInsert(sql, params)
        } else if (trimmed.startsWith('UPDATE')) {
            return this._parseUpdate(sql, params)
        } else if (trimmed.startsWith('DELETE')) {
            return this._parseDelete(sql, params)
        }

        return []
    }

    async _parseSelect(sql, params) {
        const fromMatch = /FROM\s+(\w+)/i.exec(sql)
        if (!fromMatch) throw new Error('Invalid SELECT: no FROM clause')

        const tableName = fromMatch[1]
        const aggregateMatch = /SELECT\s+(.+?)\s+FROM/i.exec(sql)
        const selectClause = aggregateMatch ? aggregateMatch[1].trim() : '*'

        // Detect aggregate functions (SUM, COUNT, AVG, MIN, MAX)
        const hasAggregate = /\b(SUM|COUNT|AVG|MIN|MAX)\s*\(/i.test(selectClause)

        let query = this.bb.from(tableName).select()

        const whereMatch = /WHERE\s+(.+?)(?:ORDER|LIMIT|$)/i.exec(sql)
        if (whereMatch) {
            const whereClause = whereMatch[1].trim()
            query = this._applyWhereClause(query, whereClause, params)
        }

        const orderMatch = /ORDER BY\s+(\w+)(?:\s+(ASC|DESC))?/i.exec(sql)
        if (orderMatch) {
            const col = orderMatch[1]
            const dir = orderMatch[2]?.toUpperCase() === 'DESC' ? 'desc' : 'asc'
            query = query.order(col, { ascending: dir === 'asc' })
        }

        const limitMatch = /LIMIT\s+(\d+)/i.exec(sql)
        if (limitMatch) {
            query = query.limit(parseInt(limitMatch[1], 10))
        }

        return new Promise((resolve, reject) => {
            query.then(res => {
                if (res.error) {
                    reject(new Error(res.error.message))
                } else {
                    const rows = res.data || []

                    // Handle aggregate functions by computing them from rows
                    if (hasAggregate) {
                        const result = {}
                        const aggFuncs = selectClause.match(/(\w+)\s*\(([^)]+)\)\s+(?:AS\s+)?(\w+)?/gi) || []

                        for (const aggFunc of aggFuncs) {
                            const match = /(\w+)\s*\(([^)]+)\)\s+(?:AS\s+)?(\w+)?/i.exec(aggFunc)
                            if (!match) continue

                            const [, funcName, colName, alias] = match
                            const outName = alias || funcName.toLowerCase() + '_' + colName
                            const func = funcName.toUpperCase()
                            const values = rows.map(r => {
                                const v = r[colName.trim()]
                                return v === null || v === undefined ? null : (typeof v === 'string' ? parseFloat(v) : v)
                            }).filter(v => v !== null)

                            if (func === 'SUM') {
                                result[outName] = values.reduce((a, b) => a + b, 0)
                            } else if (func === 'COUNT') {
                                result[outName] = values.length
                            } else if (func === 'AVG') {
                                result[outName] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
                            } else if (func === 'MIN') {
                                result[outName] = values.length > 0 ? Math.min(...values) : null
                            } else if (func === 'MAX') {
                                result[outName] = values.length > 0 ? Math.max(...values) : null
                            }
                        }
                        resolve([result])
                    } else {
                        const normalized = rows.map(row => {
                            const normalized_row = {}
                            for (const [k, v] of Object.entries(row)) {
                                if (typeof v === 'bigint') {
                                    normalized_row[k] = Number(v)
                                } else if (typeof v === 'string' && (k === 'id' || k.endsWith('_id')) && /^[0-9a-f-]{36}$/.test(v)) {
                                    // Convert UUID id fields to numeric form for compatibility
                                    const hex = v.replace(/-/g, '').substring(0, 16)
                                    normalized_row[k] = Number(BigInt('0x' + hex))
                                } else {
                                    normalized_row[k] = v
                                }
                            }
                            return normalized_row
                        })
                        resolve(normalized)
                    }
                }
            }, reject)
        })
    }

    async _parseInsert(sql, params) {
        const intoMatch = /INTO\s+(\w+)/i.exec(sql)
        if (!intoMatch) throw new Error('Invalid INSERT: no table')

        const tableName = intoMatch[1]
        const colMatch = /\(([^)]+)\)\s+VALUES/i.exec(sql)
        const cols = colMatch ? colMatch[1].split(',').map(c => c.trim()) : []

        const row = {}
        cols.forEach((col, i) => {
            row[col] = params[i]
        })

        return new Promise((resolve, reject) => {
            this.bb.from(tableName).insert(row).then(res => {
                if (res.error) {
                    reject(new Error(res.error.message))
                } else {
                    const insertedRow = res.data?.[0]
                    let rowId = insertedRow?.id || row.id || 1
                    if (typeof rowId === 'string') {
                        if (/^[0-9]+$/.test(rowId)) {
                            rowId = BigInt(rowId)
                        } else {
                            const hex = rowId.replace(/-/g, '').substring(0, 16)
                            rowId = BigInt('0x' + hex)
                        }
                    } else if (typeof rowId !== 'bigint') {
                        rowId = BigInt(rowId)
                    }
                    resolve({ changes: 1, lastInsertRowid: rowId })
                }
            }, reject)
        })
    }

    async _parseUpdate(sql, params) {
        const tableMatch = /UPDATE\s+(\w+)/i.exec(sql)
        if (!tableMatch) throw new Error('Invalid UPDATE: no table')

        const tableName = tableMatch[1]
        const setMatch = /SET\s+(.+?)\s+WHERE/i.exec(sql)
        if (!setMatch) throw new Error('Invalid UPDATE: no WHERE clause')

        const setClauses = setMatch[1].split(',').map(c => c.trim())
        const data = {}
        let paramIndex = 0

        setClauses.forEach(clause => {
            const [col] = clause.split('=')
            data[col.trim()] = params[paramIndex++]
        })

        const whereMatch = /WHERE\s+(.+?)$/i.exec(sql)
        const whereClause = whereMatch ? whereMatch[1].trim() : ''

        let query = this.bb.from(tableName).update(data)
        query = this._applyWhereClause(query, whereClause, params.slice(paramIndex))

        return new Promise((resolve, reject) => {
            query.then(res => {
                if (res.error) {
                    reject(new Error(res.error.message))
                } else {
                    resolve({ changes: (res.data || []).length, lastInsertRowid: BigInt(0) })
                }
            }, reject)
        })
    }

    async _parseDelete(sql, params) {
        const fromMatch = /FROM\s+(\w+)/i.exec(sql)
        if (!fromMatch) throw new Error('Invalid DELETE: no FROM clause')

        const tableName = fromMatch[1]
        const whereMatch = /WHERE\s+(.+?)$/i.exec(sql)
        const whereClause = whereMatch ? whereMatch[1].trim() : ''

        let query = this.bb.from(tableName).delete()
        query = this._applyWhereClause(query, whereClause, params)

        return new Promise((resolve, reject) => {
            query.then(res => {
                if (res.error) {
                    reject(new Error(res.error.message))
                } else {
                    resolve({ changes: (res.data || []).length, lastInsertRowid: BigInt(0) })
                }
            }, reject)
        })
    }

    _applyWhereClause(query, whereClause, params) {
        let paramIndex = 0
        const conditions = whereClause.split(/\s+AND\s+/i)

        for (const cond of conditions) {
            if (!cond.trim()) continue

            const eqMatch = /(\w+)\s*=\s*\?/.exec(cond)
            if (eqMatch) {
                query = query.eq(eqMatch[1], params[paramIndex++])
                continue
            }

            const neqMatch = /(\w+)\s*!=\s*\?/.exec(cond)
            if (neqMatch) {
                query = query.neq(neqMatch[1], params[paramIndex++])
                continue
            }

            const gtMatch = /(\w+)\s*>\s*\?/.exec(cond)
            if (gtMatch) {
                query = query.gt(gtMatch[1], params[paramIndex++])
                continue
            }

            const gteMatch = /(\w+)\s*>=\s*\?/.exec(cond)
            if (gteMatch) {
                query = query.gte(gteMatch[1], params[paramIndex++])
                continue
            }

            const ltMatch = /(\w+)\s*<\s*\?/.exec(cond)
            if (ltMatch) {
                query = query.lt(ltMatch[1], params[paramIndex++])
                continue
            }

            const lteMatch = /(\w+)\s*<=\s*\?/.exec(cond)
            if (lteMatch) {
                query = query.lte(lteMatch[1], params[paramIndex++])
                continue
            }

            const likeMatch = /(\w+)\s+LIKE\s+\?/i.exec(cond)
            if (likeMatch) {
                query = query.like(likeMatch[1], params[paramIndex++])
                continue
            }
        }

        return query
    }
}

export async function closeDb() {
    if (_db) {
        await _db.close()
        _db = null
    }
    _dbPromise = null
}

export async function resetForTests() {
    if (_db) {
        await _db.clearAll()
    }
    await closeDb()

    _db = null
    _dbPromise = null
}
