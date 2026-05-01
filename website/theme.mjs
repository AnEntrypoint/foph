const NAV = [
    { href: '/', label: 'Home', slug: 'home' },
    { href: '/architecture/', label: 'Architecture', slug: 'architecture' },
    { href: '/cli/', label: 'CLI', slug: 'cli' },
    { href: '/tools/', label: 'Tools', slug: 'tools' },
    { href: '/platforms/', label: 'Platforms', slug: 'platforms' },
    { href: '/skills/', label: 'Skills', slug: 'skills' },
    { href: '/development/', label: 'Development', slug: 'development' },
]

function shell(title, body, activeSlug) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
:root { color-scheme: dark; }
body { font: 15px/1.6 ui-sans-serif, system-ui, Segoe UI, Inter, sans-serif; margin: 0; background: #0e1014; color: #e6e8eb; }
header { background: #15181f; border-bottom: 1px solid #262a33; padding: 14px 24px; }
header a { color: #FFD700; text-decoration: none; margin-right: 16px; }
header a.active { text-decoration: underline; }
main { max-width: 920px; margin: 0 auto; padding: 28px 20px; }
h1 { color: #FFD700; margin-top: 0; }
h2 { color: #FFA500; border-bottom: 1px solid #262a33; padding-bottom: 4px; }
code { background: #1a1d24; padding: 1px 6px; border-radius: 4px; }
pre { background: #1a1d24; padding: 12px; border-left: 3px solid #FFD700; overflow-x: auto; }
a { color: #76b6ff; }
nav { display: flex; flex-wrap: wrap; gap: 4px 12px; }
footer { padding: 24px; text-align: center; color: #6b7280; }
</style>
</head>
<body>
<header><nav>${NAV.map(n => `<a class="${n.slug === activeSlug ? 'active' : ''}" href="${n.href}">${n.label}</a>`).join('')}</nav></header>
<main>${body}</main>
<footer>Foph — built on pi-mono, flatspace, xstate, anentrypoint-design.</footer>
</body>
</html>`
}

function mdToHtml(md) {
    const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const lines = md.split('\n')
    const out = []
    let inCode = false, inList = false
    for (const line of lines) {
        if (line.startsWith('```')) { if (inCode) { out.push('</pre>'); inCode = false } else { out.push('<pre>'); inCode = true } continue }
        if (inCode) { out.push(escape(line)); continue }
        if (line.startsWith('# ')) out.push(`<h1>${escape(line.slice(2))}</h1>`)
        else if (line.startsWith('## ')) out.push(`<h2>${escape(line.slice(3))}</h2>`)
        else if (line.startsWith('### ')) out.push(`<h3>${escape(line.slice(4))}</h3>`)
        else if (line.startsWith('- ')) { if (!inList) { out.push('<ul>'); inList = true } out.push(`<li>${inlineMd(escape(line.slice(2)))}</li>`) }
        else { if (inList) { out.push('</ul>'); inList = false } if (line.trim()) out.push(`<p>${inlineMd(escape(line))}</p>`) }
    }
    if (inList) out.push('</ul>')
    if (inCode) out.push('</pre>')
    return out.join('\n')
}

function inlineMd(s) {
    return s
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
}

function pageHtml(page, activeSlug) {
    return shell(page.title || 'Foph', mdToHtml(page.body || ''), activeSlug)
}

export default {
    assets: {},
    async render({ read }) {
        const result = await read('pages')
        const pages = Array.isArray(result) ? result : (result?.docs || [])
        const outputs = []
        for (const page of pages) {
            const slug = page.slug || page.id || 'index'
            const path = (slug === 'home' || slug === 'index') ? 'index.html' : `${slug}/index.html`
            outputs.push({ path, html: pageHtml(page, slug) })
        }
        return outputs
    },
}
