import fs from 'node:fs'
import path from 'node:path'
import { getFophHome } from '../home.js'
import { listSessions, getMessages } from '../sessions.js'
import { loadConfig } from '../config.js'
export async function dumpAll(outFile = null) {
    const out = { ts: Date.now(), foph_home: getFophHome(), config: loadConfig(), sessions: listSessions(1000).map(s => ({ ...s, messages: getMessages(s.id) })) }
    const json = JSON.stringify(out, null, 2)
    if (outFile) { fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, json, 'utf8'); return { written: outFile, bytes: json.length } }
    return out
}
