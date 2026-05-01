import fs from 'node:fs'
import { getFophHome } from '../home.js'
export function uninstall({ keepData = true } = {}) {
    const home = getFophHome()
    const removed = []
    if (!keepData && fs.existsSync(home)) { fs.rmSync(home, { recursive: true, force: true }); removed.push(home) }
    return { removed, keepData, hint: 'npm uninstall -g foph (or remove your local checkout)' }
}
