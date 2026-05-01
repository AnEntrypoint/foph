export const TIPS = [
    'Use /skill <name> to inject a skill body as a user message — preserves prompt cache.',
    'Profiles isolate state: foph profile create <name>; FOPH_PROFILE=<name> foph ...',
    'foph doctor checks env, deps, config — run when something feels off.',
    'foph dump exports your config + sessions to JSON for backup.',
    'Set FOPH_DEBUG=1 to see verbose logs.',
    'foph dashboard runs a webjsx UI on a local port.',
    '/cron add "*/15 * * * *" "your prompt" schedules a recurring run.',
    'foph batch <file.txt> runs many prompts in parallel.',
    'Skin not for you? foph skin ares|mono|slate.',
    'Memory provider: foph memory-setup.',
]
export function randomTip() { return TIPS[Math.floor(Math.random() * TIPS.length)] }
export function listTips() { return TIPS }
