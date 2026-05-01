import ds, { mount, installStyles, h, components, renderMarkdown } from 'anentrypoint-design'
const { AppShell, Topbar, Crumb, Side, Status, Panel, Row, Btn, Chip, Chat, ChatComposer, ChatMessage, AICat,
    Brand, EmptyState, RowLink, Receipt, Changelog, Hero, ConfirmDialog } = components

await installStyles()

if (!window.__debug) { try { window.__debug = {} } catch { Object.defineProperty(window, '__debug', { value: {}, writable: true, configurable: true }) } }
window.__debug.dashboard = () => ({ booted: true, ts: Date.now(), framework: 'anentrypoint-design+webjsx', route: location.hash || '#/sessions' })

const j = async (u, opts) => { try { const r = await fetch(u, opts); if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return await r.json() } catch (e) { return { __error: String(e) } } }

const ROUTES = [
    { path: '#/home',      label: 'Home',          glyph: '⌂' },
    { path: '#/chat',      label: 'Chat',          glyph: '⌨' },
    { path: '#/sessions',  label: 'Sessions',      glyph: '✉' },
    { path: '#/analytics', label: 'Analytics',     glyph: '◉' },
    { path: '#/models',    label: 'Models',        glyph: '◎' },
    { path: '#/logs',      label: 'Logs',          glyph: '☰' },
    { path: '#/cron',      label: 'Cron',          glyph: '◷' },
    { path: '#/skills',    label: 'Skills',        glyph: '◈' },
    { path: '#/config',    label: 'Config',        glyph: '⚙' },
    { path: '#/env',       label: 'Keys',          glyph: '⚿' },
    { path: '#/docs',      label: 'Documentation', glyph: '✎' },
    { path: '#/tools',    label: 'Tools',         glyph: '⚒' },
    { path: '#/batch',    label: 'Batch',         glyph: '⊞' },
    { path: '#/gateway',  label: 'Gateway',       glyph: '⇌' },
]
window.__debug.routes = () => ROUTES.map(r => r.path)

const AppState = {
    hash: location.hash || '#/home',
    body: null,
    ts: new Date().toLocaleTimeString(),
    theme: localStorage.getItem('foph-theme') || 'dark',
    search: { query: '', results: [] },
    sessionsFilter: '',
    chat: { messages: [], draft: '', streaming: false },
}
function applyTheme() { document.documentElement.setAttribute('data-theme', AppState.theme) }
applyTheme()
window.__debug.state = () => AppState

function table(headers, rows, opts = {}) {
    if (!rows || rows.length === 0) return EmptyState({ text: 'no rows' })
    return h('table', {},
        h('thead', {}, h('tr', {}, ...headers.map(hd => h('th', {}, hd)))),
        h('tbody', {}, ...rows.map((row, i) => h('tr', {
            class: opts.onRowClick ? 'clickable' : '',
            onclick: opts.onRowClick ? () => opts.onRowClick(i) : null
        }, ...row.map(c => h('td', {}, c == null ? '' : String(c)))))))
}
function kpi(items) {
    return h('div', { class: 'kpi' }, ...items.map(([n, l]) =>
        h('div', { class: 'kpi-card' }, h('div', { class: 'num' }, String(n)), h('div', { class: 'lbl' }, l))))
}
function pre(obj) { return h('pre', {}, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2)) }

function timeNow() {
    const d = new Date()
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

// Map an internal {role, content, tool_calls, tool_call_id} message to SDK ChatMessage props.
function toChatMsg(m, key) {
    const time = m.time || ''
    if (m.role === 'user') {
        return { who: 'you', avatar: 'u', time, receipt: 'delivered', key,
            parts: [{ kind: 'text', text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }] }
    }
    if (m.role === 'tool') {
        const body = typeof m.content === 'string' ? m.content : JSON.stringify(m.content, null, 2)
        return { who: 'them', avatar: '⚒', name: 'tool' + (m.tool_call_id ? ' · ' + String(m.tool_call_id).slice(0, 8) : ''), time, key,
            parts: [{ kind: 'code', lang: 'json', filename: 'tool result', code: body }] }
    }
    // assistant
    const parts = []
    const text = typeof m.content === 'string' ? m.content : ''
    if (text) parts.push({ kind: 'md', text })
    if (Array.isArray(m.tool_calls) && m.tool_calls.length) {
        for (const c of m.tool_calls) {
            parts.push({ kind: 'code', lang: 'json', filename: 'call · ' + (c.name || c.function?.name || '?'),
                code: JSON.stringify(c.arguments || c.function?.arguments || {}, null, 2) })
        }
    }
    if (parts.length === 0) parts.push({ kind: 'text', text: '' })
    return { who: 'them', avatar: '◉', name: 'foph', time, key, parts }
}

const PAGES = {
    '#/chat': async () => {
        const messages = AppState.chat.messages.map((m, i) => toChatMsg(m, 'm' + i))
        return AICat({
            name: 'foph',
            status: AppState.chat.streaming ? 'thinking…' : 'online · live runTurn via SSE',
            messages,
            thinking: AppState.chat.streaming,
            composer: ChatComposer({
                value: AppState.chat.draft,
                placeholder: 'Ask foph — runs through registered tools and the configured LLM…',
                disabled: AppState.chat.streaming,
                onInput: (v) => { AppState.chat.draft = v; rerender() },
                onSend: (text) => { AppState.chat.draft = ''; sendChat(text) },
            }),
        })
    },

    '#/home': async () => {
        const [sessions, tools, skills] = await Promise.all([j('/api/sessions'), j('/api/tools'), j('/api/skills')])
        const sessionCount = Array.isArray(sessions) ? sessions.length : 0
        const toolCount = Array.isArray(tools) ? tools.length : 0
        const skillCount = ((skills.home || []).length + (skills.bundled || []).length)
        return [
            Hero({ title: 'foph', body: 'Open JS agent harness built on pi-mono, xstate, floosie, and anentrypoint-design.', accent: 'v0.0.1' }),
            kpi([[sessionCount, 'Sessions'], [toolCount, 'Tools'], [skillCount, 'Skills']]),
            Panel({ title: 'Quick start', children: Receipt({ rows: [
                ['Run interactive REPL', 'foph run'],
                ['Start dashboard', 'foph dashboard --port 3000'],
                ['List tools', 'foph tools'],
                ['List skills', 'foph skills'],
                ['Start gateway', 'foph gateway --port 4000'],
            ]}) }),
        ]
    },

    '#/sessions': async () => {
        const sessions = await j('/api/sessions')
        const all = sessions.__error ? [] : sessions
        const q = AppState.sessionsFilter.toLowerCase()
        const filtered = q ? all.filter(s => JSON.stringify(s).toLowerCase().includes(q)) : all
        return [
            kpi([[all.length || 0, 'Total sessions'], [filtered.length, 'After filter']]),
            Panel({ title: 'Filter', children: h('div', { class: 'row-form' },
                h('input', { type: 'text', placeholder: 'filter by platform/title/model/id…', value: AppState.sessionsFilter,
                    oninput: (ev) => { AppState.sessionsFilter = ev.target.value; rerender() } })) }),
            Panel({ title: 'Recent sessions (click row → detail)', count: filtered.length,
                children: filtered.length === 0
                    ? EmptyState({ text: 'no sessions yet — start a chat', glyph: '✉' })
                    : h('div', {}, ...filtered.map(s =>
                        RowLink({ key: s.id, href: '#/session/' + s.id,
                            code: s.id?.slice(0, 8), title: s.title || s.platform || 'untitled',
                            sub: s.model || '', meta: new Date(s.updated_at || 0).toLocaleString() }))) }),
        ]
    },

    '#/analytics': async () => {
        const [sessions, tools, debug] = await Promise.all([j('/api/sessions'), j('/api/tools'), j('/api/debug')])
        const all = Array.isArray(sessions) ? sessions : []
        const ts = Array.isArray(tools) ? tools : []
        return [
            kpi([
                [all.length || 0, 'Sessions'],
                [ts.length || 0, 'Tools'],
                [Array.isArray(debug) ? debug.length : 0, 'Debug subsystems'],
            ]),
            Panel({ title: 'Tool distribution by toolset', children: table(['toolset', 'tools'],
                Object.entries(ts.reduce((acc, t) => { (acc[t.toolset] = acc[t.toolset] || []).push(t.name); return acc }, {})).map(([k, v]) => [k, v.join(', ')])) }),
        ]
    },

    '#/models': async () => {
        const config = await j('/api/config')
        return Panel({ title: 'Active model', children: pre({ provider: config.agent?.provider, model: config.agent?.model, max_iterations: config.agent?.max_iterations }) })
    },

    '#/logs': async () => {
        const subs = await j('/api/logs')
        const list = Array.isArray(subs) ? subs : []
        const first = list[0]
        const recent = first ? await j(`/api/logs/${first}?max=50`) : []
        return [
            kpi([[list.length, 'Log subsystems']]),
            Panel({ title: 'Subsystems', children: table(['name'], list.map(s => [s])) }),
            first
                ? Panel({ title: `Latest entries (${first})`, children: pre(recent) })
                : Panel({ title: 'Latest entries', children: EmptyState({ text: 'no logs yet — run foph and observe', glyph: '☰' }) }),
        ]
    },

    '#/cron': async () => {
        const jobs = await j('/api/cron')
        const list = Array.isArray(jobs) ? jobs : []
        return [
            kpi([[list.length, 'Cron jobs']]),
            Panel({ title: 'Add job', children: h('form', { class: 'row-form', onsubmit: async (ev) => {
                ev.preventDefault()
                const f = ev.target.elements
                await j('/api/cron', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cron: f.cron.value, prompt: f.prompt.value }) })
                f.cron.value = ''; f.prompt.value = ''; rerender()
            } },
                h('input', { name: 'cron', placeholder: 'cron expr (* * * * *)' }),
                h('input', { name: 'prompt', placeholder: 'prompt' }),
                h('button', { type: 'submit', class: 'primary' }, 'Create')) }),
            Panel({ title: 'Scheduled jobs', count: list.length, children: list.length === 0
                ? EmptyState({ text: 'no cron jobs — add one above', glyph: '◷' })
                : h('table', {},
                    h('thead', {}, h('tr', {}, ...['id', 'cron', 'prompt', 'enabled', ''].map(c => h('th', {}, c)))),
                    h('tbody', {}, ...list.map(job => h('tr', {},
                        h('td', {}, String(job.id)),
                        h('td', {}, job.cron),
                        h('td', {}, (job.prompt || '').slice(0, 60)),
                        h('td', {}, job.enabled ? 'yes' : 'no'),
                        h('td', {}, h('button', {
                            class: 'danger',
                            onclick: async () => { await fetch('/api/cron/' + job.id, { method: 'DELETE' }); rerender() }
                        }, 'delete')))))) }),
        ]
    },

    '#/skills': async () => {
        const data = await j('/api/skills')
        const home = data.home || []
        const bundled = data.bundled || []
        return [
            kpi([[home.length, 'User skills'], [bundled.length, 'Bundled skills']]),
            Panel({ title: 'User skills (~/.foph/skills)', count: home.length,
                children: table(['name', 'description'], home.map(s => [s.name, s.description || ''])) }),
            Panel({ title: 'Bundled skills', count: bundled.length,
                children: table(['name', 'description'], bundled.map(s => [s.name, s.description || ''])) }),
        ]
    },

    '#/config': async () => {
        const config = await j('/api/config')
        const profiles = await j('/api/profiles')
        const commands = await j('/api/commands')
        return [
            kpi([
                [(profiles || []).length, 'Profiles'],
                [(commands || []).length, 'Commands'],
                [config._config_version || 0, 'Config version'],
            ]),
            Panel({ title: 'Set config value', children: h('form', { class: 'row-form', onsubmit: async (ev) => {
                ev.preventDefault()
                const f = ev.target.elements
                await j('/api/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: f.key.value, value: f.value.value }) })
                f.value.value = ''; rerender()
            } },
                h('input', { name: 'key', placeholder: 'dotted.key (e.g. display.skin)' }),
                h('input', { name: 'value', placeholder: 'value' }),
                h('button', { type: 'submit', class: 'primary' }, 'Save')) }),
            Panel({ title: 'Profiles', count: (profiles || []).length,
                children: (profiles || []).length === 0 ? EmptyState({ text: 'no profiles — using HOME', glyph: '◎' }) : table(['name'], profiles.map(p => [p])) }),
            Panel({ title: 'Slash commands', count: (commands || []).length,
                children: table(['name', 'category', 'description'], (commands || []).map(c => [c.name, c.category || '', c.description || ''])) }),
            Panel({ title: 'Active config', children: pre(config) }),
        ]
    },

    '#/env': async () => {
        const keys = await j('/api/env')
        const list = Array.isArray(keys) ? keys : []
        const set = list.filter(k => k.set).length
        return [
            kpi([[set, 'keys set'], [list.length - set, 'keys missing']]),
            Panel({ title: 'Environment variables', children: h('div', { style: 'padding:8px 4px;display:flex;flex-wrap:wrap;gap:6px' },
                ...list.map(k => Chip({ tone: k.set ? 'ok' : 'miss', children: k.key + (k.set ? ' ✓' : ' ·') }))) }),
        ]
    },

    '#/tools': async () => {
        const tools = await j('/api/tools')
        const list = Array.isArray(tools) ? tools : []
        const byToolset = list.reduce((acc, t) => { (acc[t.toolset] = acc[t.toolset] || []).push(t); return acc }, {})
        return [
            kpi([[list.length, 'Total tools'], [Object.keys(byToolset).length, 'Toolsets']]),
            ...Object.entries(byToolset).map(([ts, ts_tools]) =>
                Panel({ title: 'Toolset · ' + ts, count: ts_tools.length,
                    children: table(['name', 'description'], ts_tools.map(t => [t.name, (t.schema?.description || '').slice(0, 80)])) }))
        ]
    },

    '#/batch': async () => {
        return [
            Panel({ title: 'Batch runner', children: h('div', {},
                h('p', {}, 'Run prompts in parallel against the configured LLM. POST /api/batch with { prompts: string[], concurrency?: number, model?: string }.'),
                h('form', { class: 'row-form', onsubmit: async (ev) => {
                    ev.preventDefault()
                    const f = ev.target.elements
                    const prompts = f.prompts.value.split('\n').map(l => l.trim()).filter(Boolean)
                    const res = await j('/api/batch', { method: 'POST', headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ prompts, concurrency: Number(f.concurrency.value) || 4 }) })
                    alert(res.__error ? 'Error: ' + res.__error : 'Batch ' + (res.id || '?') + ' — ' + (res.results?.length || 0) + ' results')
                } },
                    h('textarea', { name: 'prompts', rows: 5, placeholder: 'One prompt per line…', style: 'width:100%;font-family:monospace' }),
                    h('input', { name: 'concurrency', type: 'number', value: '4', style: 'width:80px', placeholder: 'concurrency' }),
                    h('button', { type: 'submit', class: 'primary' }, 'Run batch'))) }),
        ]
    },

    '#/gateway': async () => {
        const data = await j('/api/gateway')
        const platforms = Array.isArray(data?.platforms) ? data.platforms : []
        return [
            kpi([[platforms.length, 'Platforms'], [platforms.filter(p => p.enabled).length, 'Active']]),
            Panel({ title: 'Platforms', children: table(['platform', 'enabled', 'note'],
                platforms.map(p => [p.name, p.enabled ? 'yes' : 'no', p.note || ''])) }),
            Panel({ title: 'Start gateway', children: h('p', {}, 'Run: ', h('code', {}, 'foph gateway --port 3000'), ' to start webhook + api_server adapters.') }),
        ]
    },

    '#/docs': async () => [
        Panel({ title: 'Documentation', children: h('div', {},
            h('p', {}, 'Foph — open JS agent harness. Full docs:'),
            h('ul', {},
                h('li', {}, h('a', { href: 'https://github.com/AnEntrypoint/foph', target: '_blank' }, 'GitHub: AnEntrypoint/foph')),
                h('li', {}, h('a', { href: '/api/health', target: '_blank' }, '/api/health')),
                h('li', {}, h('a', { href: '/api/debug-all', target: '_blank' }, '/api/debug-all'))),
            EmptyState({ text: 'Static doc site lives under website/ — built with flatspace', glyph: '✎' })) }),
        Panel({ title: 'Recent changelog', children: Changelog({ entries: [
            { date: '2026-05-01', ver: 'v0.0.1', msg: 'Initial release — 70 tools, 18 gateway platforms, 12 bundled skills' },
            { date: '2026-05-01', ver: 'v0.1.0', msg: 'Dashboard routes: #/tools #/batch #/gateway, anentrypoint-design pro-rata upgrade' },
        ]}) }),
    ],
}

async function pageSessionDetail(id) {
    const messages = await j('/api/sessions/' + id + '/messages')
    const list = Array.isArray(messages) ? messages : []
    return [
        Panel({ title: 'Session ' + id.slice(0, 8), children: kpi([[list.length, 'messages']]) }),
        list.length === 0
            ? Panel({ title: 'Messages', children: EmptyState({ text: 'no messages in this session', glyph: '✉' }) })
            : Chat({ title: 'session ' + id.slice(0, 8), sub: 'replay', messages: list.map((m, i) => toChatMsg(m, 's' + i)) }),
        Panel({ title: 'Back', children: h('a', { href: '#/sessions' }, '← all sessions') }),
    ]
}

async function sendChat(prompt) {
    if (!prompt || !prompt.trim() || AppState.chat.streaming) return
    AppState.chat.messages.push({ role: 'user', content: prompt, time: timeNow() })
    AppState.chat.streaming = true
    rerender()
    try {
        const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) })
        const reader = r.body.getReader(), dec = new TextDecoder()
        let buf = ''
        while (true) {
            const { value, done } = await reader.read()
            if (done) break
            buf += dec.decode(value, { stream: true })
            let idx
            while ((idx = buf.indexOf('\n\n')) >= 0) {
                const block = buf.slice(0, idx); buf = buf.slice(idx + 2)
                const ev = (block.match(/^event: (.+)$/m) || [, ''])[1]
                const data = (block.match(/^data: (.+)$/m) || [, '{}'])[1]
                let parsed; try { parsed = JSON.parse(data) } catch { parsed = { raw: data } }
                if (ev === 'message') {
                    if (parsed.role !== 'user') AppState.chat.messages.push({ ...parsed, time: timeNow() })
                } else if (ev === 'error') {
                    AppState.chat.messages.push({ role: 'assistant', content: '**[error]** ' + parsed.error, time: timeNow() })
                }
            }
        }
    } catch (e) {
        AppState.chat.messages.push({ role: 'assistant', content: '**[network error]** ' + e.message, time: timeNow() })
    }
    AppState.chat.streaming = false
    rerender()
}

async function doSearch(q) {
    AppState.search.query = q
    if (!q.trim()) { AppState.search.results = []; rerender(); return }
    const r = await j('/api/search?q=' + encodeURIComponent(q))
    AppState.search.results = Array.isArray(r) ? r : []
    rerender()
}

function buildSide(state) {
    const sections = [{
        group: 'NAVIGATION',
        items: ROUTES.map(r => ({
            glyph: r.glyph,
            label: r.label,
            href: r.path,
            active: !state.hash.startsWith('#/session/') && r.path === state.hash,
            onClick: (ev) => { ev.preventDefault(); location.hash = r.path },
        })),
    }]
    return Side({ sections })
}

function render(state) {
    let route = ROUTES.find(r => r.path === state.hash)
    const isSessionDetail = state.hash.startsWith('#/session/')
    if (!route && !isSessionDetail) route = ROUTES[0]
    const themeLabel = state.theme === 'dark' ? '☀ light' : '☾ dark'
    const themeBtn = h('button', {
        class: 'ghost',
        onclick: () => {
            AppState.theme = AppState.theme === 'dark' ? 'light' : 'dark'
            localStorage.setItem('foph-theme', AppState.theme)
            applyTheme(); rerender()
        },
        style: 'font-size:12px;padding:4px 12px',
    }, themeLabel)
    const searchInput = h('input', {
        type: 'search',
        placeholder: 'search messages…',
        value: state.search.query,
        onkeydown: (ev) => { if (ev.key === 'Enter') doSearch(ev.target.value) },
        style: 'min-width:240px',
    })
    const topbarWithControls = h('header', { class: 'app-topbar' },
        Brand({ name: 'foph', leaf: 'dashboard' }),
        h('div', { style: 'flex:1' }),
        searchInput,
        themeBtn,
    )
    const crumbRight = state.search.results.length > 0
        ? h('span', { class: 'meta' }, state.search.results.length + ' hits')
        : null
    const crumb = Crumb({ trail: ['foph'], leaf: isSessionDetail ? state.hash.replace('#/', '') : route.path.replace('#/', ''), right: crumbRight })
    const searchResults = state.search.results.length > 0
        ? Panel({ title: `search results · ${state.search.results.length}`, children: state.search.results.slice(0, 8).map((r, i) =>
            Row({ key: i, code: (r.session_id || '?').slice(0, 8), title: (r.content || '').slice(0, 80),
                meta: 'open', onClick: () => { location.hash = '#/session/' + r.session_id } })) })
        : null
    const main = [searchResults, state.body || EmptyState({ text: 'loading…' })].filter(Boolean)
    const status = Status({
        left: ['ds-247420 · webjsx · ' + ROUTES.length + ' routes', 'theme=' + state.theme],
        right: [state.ts],
    })
    return AppShell({ topbar: topbarWithControls, crumb, side: buildSide(state), main, status })
}

let _mount

async function go() {
    AppState.hash = location.hash || '#/home'
    AppState.ts = new Date().toLocaleTimeString()
    AppState.body = EmptyState({ text: 'loading…', glyph: '◌' })
    if (_mount) _mount()
    let body
    if (AppState.hash.startsWith('#/session/')) {
        body = await pageSessionDetail(AppState.hash.slice('#/session/'.length))
    } else {
        const page = PAGES[AppState.hash] || PAGES['#/home']
        body = await page()
    }
    AppState.body = body
    AppState.ts = new Date().toLocaleTimeString()
    if (_mount) _mount()
    window.__debug.lastRoute = AppState.hash
}

function rerender() {
    AppState.ts = new Date().toLocaleTimeString()
    // Live pages whose body depends on AppState (not just on /api/* fetches) must
    // be recomputed on every rerender — otherwise the saved body is stale.
    if (AppState.hash === '#/chat') {
        Promise.resolve(PAGES['#/chat']()).then(b => { AppState.body = b; if (_mount) _mount() })
        return
    }
    if (_mount) _mount()
}

window.addEventListener('hashchange', go)
_mount = mount(document.getElementById('app'), () => render(AppState))
go()

window.__debug.go = go
window.__debug.sendChat = sendChat
window.__debug.doSearch = doSearch
window.__debug.chat = () => ({ messages: AppState.chat.messages.length, streaming: AppState.chat.streaming, draft: AppState.chat.draft })
