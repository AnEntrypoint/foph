import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

let _cached = null

export function getFophHome() {
    if (_cached) return _cached
    const env = process.env.FOPH_HOME
    if (env) { _cached = env; ensure(env); return env }
    const profile = process.env.FOPH_PROFILE
    const root = path.join(os.homedir(), '.foph')
    const home = profile ? path.join(root, 'profiles', profile) : root
    _cached = home
    ensure(home)
    return home
}

export function displayFophHome() {
    const profile = process.env.FOPH_PROFILE
    return profile ? `~/.foph/profiles/${profile}` : '~/.foph'
}

export function applyProfileOverride(name) {
    if (!name || name === 'default') { delete process.env.FOPH_PROFILE; _cached = null; return }
    process.env.FOPH_PROFILE = name
    _cached = null
}

export function getProfilesRoot() {
    if (process.env.FOPH_PROFILES_ROOT) return process.env.FOPH_PROFILES_ROOT
    if (process.env.FOPH_HOME) return path.join(process.env.FOPH_HOME, 'profiles')
    return path.join(os.homedir(), '.foph', 'profiles')
}

export function listProfiles() {
    const root = getProfilesRoot()
    if (!fs.existsSync(root)) return []
    return fs.readdirSync(root).filter(n => fs.statSync(path.join(root, n)).isDirectory())
}

export function resetCacheForTests() { _cached = null }

function ensure(p) { try { fs.mkdirSync(p, { recursive: true }) } catch {} }
