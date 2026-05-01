import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { getFophHome } from '../home.js'
const CHECKS = [
    { name: 'foph-home', run: () => fs.existsSync(getFophHome()) ? { ok: true } : { ok: false, fix: 'mkdir -p ' + getFophHome() } },
    { name: 'node-version', run: () => { const v = process.versions.node; const major = Number(v.split('.')[0]); return major >= 20 ? { ok: true, value: v } : { ok: false, fix: 'install node >=20', value: v } } },
    { name: 'better-sqlite3', run: () => { try { require.resolve('better-sqlite3'); return { ok: true } } catch { return { ok: false, fix: 'npm install' } } } },
    { name: 'gh-cli', run: () => { const r = spawnSync('gh', ['--version'], { encoding: 'utf8' }); return r.status === 0 ? { ok: true, value: r.stdout.split('\n')[0] } : { ok: false, fix: 'install gh CLI' } } },
    { name: 'git', run: () => { const r = spawnSync('git', ['--version'], { encoding: 'utf8' }); return r.status === 0 ? { ok: true, value: r.stdout.trim() } : { ok: false, fix: 'install git' } } },
    { name: 'config-file', run: () => { const p = path.join(getFophHome(), 'config.yaml'); return fs.existsSync(p) ? { ok: true } : { ok: false, fix: 'foph setup' } } },
]
export function runDoctor() {
    return CHECKS.map(c => { try { return { name: c.name, ...c.run() } } catch (e) { return { name: c.name, ok: false, error: String(e.message || e) } } })
}
