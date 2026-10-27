// Markdown → a tree of plain objects { t: tag, a: attrs, c: children } that
// app.js turns into DOM with createElement/textContent: note text can never
// become HTML or script. Covers what Obsidian notes use: headings, emphasis,
// ==highlight==, ~~strike~~, code, quotes and > [!callouts], lists and
// - [ ] tasks, tables, rules, [links](url), [[wikilinks]], ![[embeds]],
// #tags, images, %%comments%% and frontmatter (hidden; shown as properties).

const SAFE_URL = /^(https?:|mailto:)/i

/** @typedef {{ t: string, a?: Record<string, string>, c?: Array<Node|string> }} Node */

/** @param {string} t @param {Record<string,string>} [a] @param {Array<Node|string>} [c] @returns {Node} */
const h = (t, a = {}, c = []) => ({ t, a, c })

/** Splits off the frontmatter block. */
export function stripFrontmatter(text) {
  const m = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  return m ? text.slice(m[0].length) : text
}

/** "Nota#Título|texto" → its parts (same rules as the server). */
export function parseLinkInner(inner) {
  const pipe = inner.indexOf('|')
  const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() || null : null
  const ref = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim()
  const hash = ref.indexOf('#')
  const target = (hash >= 0 ? ref.slice(0, hash) : ref).trim().replace(/\.md$/i, '')
  const subpath = hash >= 0 ? ref.slice(hash).trim() || null : null
  return { target, subpath, alias }
}

export function slug(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i
const AUDIO_EXT = /\.(mp3|wav|m4a|ogg|flac|aac)$/i

/**
 * Inline markdown of one line or paragraph.
 * @returns {Array<Node|string>}
 */
export function inline(text) {
  /** @type {Array<Node|string>} */
  const out = []
  let i = 0
  let plain = ''
  const flush = () => {
    if (plain) out.push(plain)
    plain = ''
  }
  const rules = [
    // `code`
    [/^(`+)([\s\S]*?[^`])\1(?!`)/, (m) => h('code', {}, [m[2]])],
    // ![[embed]]
    [/^!\[\[([^\[\]\n]+?)\]\]/, (m) => embedNode(m[1])],
    // [[wikilink]]
    [/^\[\[([^\[\]\n]+?)\]\]/, (m) => {
      const l = parseLinkInner(m[1])
      const label = l.alias ?? (l.target ? `${l.target}${l.subpath ? ` › ${l.subpath.replace(/^#\^?/, '')}` : ''}` : l.subpath?.replace(/^#\^?/, '') ?? '')
      return h('a', { class: 'internal-link', 'data-target': l.target, 'data-subpath': l.subpath ?? '', href: '#' }, [label])
    }],
    // ![alt](url)
    [/^!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/, (m) => {
      const url = m[2]
      if (SAFE_URL.test(url)) return h('img', { src: url, alt: m[1], loading: 'lazy', referrerpolicy: 'no-referrer' })
      return embedNode(decodeURIComponent(url))
    }],
    // [text](url)
    [/^\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/, (m) => {
      const url = m[2]
      if (SAFE_URL.test(url)) return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', class: 'external-link' }, inline(m[1]))
      // Any other scheme (javascript:, data:…) is shown as its text only.
      if (/^[a-z][\w+.-]*:/i.test(url)) return h('span', {}, inline(m[1]))
      // A relative link to a note, as Obsidian writes them with "Use [[Wikilinks]]" off.
      const l = parseLinkInner(decodeURIComponent(url))
      return h('a', { class: 'internal-link', 'data-target': l.target, 'data-subpath': l.subpath ?? '', href: '#' }, inline(m[1]))
    }],
    // <https://autolink>
    [/^<(https?:\/\/[^>\s]+)>/, (m) => h('a', { href: m[1], target: '_blank', rel: 'noopener noreferrer', class: 'external-link' }, [m[1]])],
    // bare https://url
    [/^https?:\/\/[^\s<>()\]]+[^\s<>()\].,;:!?'"]/, (m) => h('a', { href: m[0], target: '_blank', rel: 'noopener noreferrer', class: 'external-link' }, [m[0]])],
    // **bold** / __bold__
    [/^(\*\*|__)(?=\S)([\s\S]*?\S)\1/, (m) => h('strong', {}, inline(m[2]))],
    // *italic* / _italic_
    [/^(\*|_)(?=\S)([\s\S]*?\S)\1(?![\p{L}\p{N}])/u, (m) => h('em', {}, inline(m[2]))],
    // ~~strike~~
    [/^~~(?=\S)([\s\S]*?\S)~~/, (m) => h('del', {}, inline(m[1]))],
    // ==highlight==
    [/^==(?=\S)([\s\S]*?\S)==/, (m) => h('mark', {}, inline(m[1]))],
    // %%comment%% (hidden)
    [/^%%[\s\S]*?%%/, () => null],
    // ^block-id at the end of a paragraph (hidden, as in Obsidian)
    [/^\s\^[A-Za-z0-9-]+$/, () => null],
  ]
  while (i < text.length) {
    const rest = text.slice(i)
    const prev = i ? text[i - 1] : ' '
    // #tag: after a space or at the start, not "#1" alone.
    if (rest[0] === '#' && /[\s(,;]/.test(prev)) {
      const m = /^#([\p{L}\p{N}_\-/]+)/u.exec(rest)
      if (m && !/^[\d/]+$/.test(m[1])) {
        flush()
        out.push(h('a', { class: 'tag', 'data-tag': m[1].toLowerCase(), href: '#' }, [`#${m[1]}`]))
        i += m[0].length
        continue
      }
    }
    if (rest[0] === '\\' && /[\\`*_{}\[\]()#+\-.!|~=%<>]/.test(rest[1] ?? '')) {
      plain += rest[1]
      i += 2
      continue
    }
    let matched = false
    if ('`![<h*_~=%^ '.includes(rest[0])) {
      for (const [re, make] of rules) {
        const m = re.exec(rest)
        if (!m) continue
        // Emphasis inside a word ("snake_case") is not emphasis.
        if ((m[1] === '_' || m[1] === '__') && /[\p{L}\p{N}]/u.test(prev)) continue
        flush()
        const node = make(m)
        if (node) out.push(node)
        i += m[0].length
        matched = true
        break
      }
    }
    if (!matched) {
      plain += rest[0]
      i++
    }
  }
  flush()
  return out
}

/** ![[x]]: a note embed, an image, a video, audio, a PDF or a link to the file. */
function embedNode(inner) {
  const l = parseLinkInner(inner)
  const kind = IMAGE_EXT.test(l.target) ? 'image' : VIDEO_EXT.test(l.target) ? 'video' : AUDIO_EXT.test(l.target) ? 'audio' : /\.pdf$/i.test(l.target) ? 'pdf' : /\.[a-z0-9]{2,5}$/i.test(l.target) && !/\.md$/i.test(l.target) ? 'file' : 'note'
  const a = { class: `embed embed-${kind}`, 'data-target': l.target, 'data-subpath': l.subpath ?? '', 'data-kind': kind }
  // "foto.png|300" sets the width, as in Obsidian.
  if (l.alias && /^\d+(x\d+)?$/.test(l.alias)) a['data-width'] = l.alias.split('x')[0]
  else if (l.alias) a['data-alt'] = l.alias
  return h('span', a, [l.target])
}

const CALLOUT_ICONS = { note: '✎', info: 'ℹ', tip: '💡', hint: '💡', important: '❗', success: '✓', check: '✓', done: '✓', question: '?', help: '?', faq: '?', warning: '⚠', caution: '⚠', attention: '⚠', failure: '✗', fail: '✗', missing: '✗', danger: '⚡', error: '⚡', bug: '🐞', example: '◆', quote: '❝', cite: '❝', abstract: '☰', summary: '☰', tldr: '☰', todo: '☐' }

/**
 * Block markdown. `lineOffset` maps each task checkbox to its line in the
 * whole note, so ticking it in the preview edits the right line.
 * @returns {Node[]}
 */
export function render(markdown, lineOffset = 0) {
  const body = stripFrontmatter(markdown)
  const offset = lineOffset + (markdown.length - body.length ? markdown.slice(0, markdown.length - body.length).split('\n').length - 1 : 0)
  const lines = body.replace(/\r\n?/g, '\n').split('\n')
  return blocks(lines, 0, lines.length, offset)
}

function blocks(lines, from, to, offset) {
  /** @type {Node[]} */
  const out = []
  let i = from
  const isBlank = (l) => !l || !l.trim()
  while (i < to) {
    const line = lines[i]
    if (isBlank(line)) {
      i++
      continue
    }
    // %% multi-line comment %%
    if (/^\s*%%.*%%\s*$/.test(line) && line.trim().length > 3) {
      i++
      continue
    }
    if (/^\s*%%/.test(line) && !/%%/.test(line.trim().slice(2))) {
      let j = i + 1
      while (j < to && !/%%\s*$/.test(lines[j])) j++
      i = j + 1
      continue
    }
    // Fenced code
    const fence = /^(\s*)(```+|~~~+)\s*([\w+-]*)/.exec(line)
    if (fence) {
      let j = i + 1
      while (j < to && !lines[j].trim().startsWith(fence[2])) j++
      const code = lines.slice(i + 1, j).join('\n')
      out.push(h('pre', fence[3] ? { 'data-lang': fence[3] } : {}, [h('code', {}, [code])]))
      i = j + 1
      continue
    }
    // Heading
    const hd = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (hd) {
      out.push(h(`h${hd[1].length}`, { id: slug(hd[2]), 'data-line': String(offset + i) }, inline(hd[2])))
      i++
      continue
    }
    // Rule
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push(h('hr'))
      i++
      continue
    }
    // Quote / callout
    if (/^\s*>/.test(line)) {
      let j = i
      const inner = []
      while (j < to && /^\s*>/.test(lines[j])) {
        inner.push(lines[j].replace(/^\s*>\s?/, ''))
        j++
      }
      const call = /^\[!(\w+)\]([+-]?)\s*(.*)$/.exec(inner[0] ?? '')
      if (call) {
        const type = call[1].toLowerCase()
        const title = call[3] || type.charAt(0).toUpperCase() + type.slice(1)
        const content = blocks(inner, 1, inner.length, offset + i + 1)
        const head = h('div', { class: 'callout-title' }, [h('span', { class: 'callout-icon' }, [CALLOUT_ICONS[type] ?? '✎']), ...inline(title)])
        if (call[2]) out.push(h('details', { class: `callout callout-${type}`, ...(call[2] === '+' ? { open: '' } : {}) }, [h('summary', {}, [head]), ...content]))
        else out.push(h('div', { class: `callout callout-${type}` }, [head, ...content]))
      } else {
        out.push(h('blockquote', {}, blocks(inner, 0, inner.length, offset + i)))
      }
      i = j
      continue
    }
    // Table: header row, then a |---| row
    if (/\|/.test(line) && i + 1 < to && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'))
      const aligns = cells(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''))
      const head = h('tr', {}, cells(line).map((c, k) => h('th', aligns[k] ? { style: `text-align:${aligns[k]}` } : {}, inline(c))))
      const rows = []
      let j = i + 2
      while (j < to && /\|/.test(lines[j]) && !isBlank(lines[j])) {
        rows.push(h('tr', {}, cells(lines[j]).map((c, k) => h('td', aligns[k] ? { style: `text-align:${aligns[k]}` } : {}, inline(c)))))
        j++
      }
      out.push(h('div', { class: 'table-wrap' }, [h('table', {}, [h('thead', {}, [head]), h('tbody', {}, rows)])]))
      i = j
      continue
    }
    // List
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const { node, next } = list(lines, i, to, offset)
      out.push(node)
      i = next
      continue
    }
    // Paragraph: until a blank line or another block starts
    let j = i + 1
    while (j < to && !isBlank(lines[j]) && !/^(#{1,6}\s|\s*>|\s*([-*+]|\d+[.)])\s+|\s*(```|~~~)|\s*([-*_])(\s*\4){2,}\s*$)/.test(lines[j])) j++
    const para = lines.slice(i, j)
    const children = []
    para.forEach((l, k) => {
      if (k) children.push(h('br'))
      children.push(...inline(l.replace(/\s+$/, '')))
    })
    out.push(h('p', { 'data-line': String(offset + i) }, children))
    i = j
  }
  return out
}

function list(lines, from, to, offset) {
  const indentOf = (l) => /^(\s*)/.exec(l)[1].replace(/\t/g, '    ').length
  const base = indentOf(lines[from])
  const ordered = /^\s*\d+[.)]/.test(lines[from])
  const items = []
  let i = from
  while (i < to) {
    const line = lines[i]
    const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (!m || indentOf(line) !== base) break
    // The item's own continuation lines and nested lists (more indented).
    let j = i + 1
    while (j < to && (lines[j].trim() === '' ? j + 1 < to && indentOf(lines[j + 1]) > base && lines[j + 1].trim() !== '' : indentOf(lines[j]) > base)) j++
    const task = /^\[([ xX\-/])\]\s+(.*)$/.exec(m[3])
    const children = []
    if (task) {
      const checked = task[1] !== ' '
      children.push(h('input', { type: 'checkbox', class: 'task', 'data-line': String(offset + i), ...(checked ? { checked: '' } : {}) }))
      children.push(h('span', checked ? { class: 'task-done' } : {}, inline(task[2])))
    } else {
      children.push(...inline(m[3]))
    }
    if (j > i + 1) {
      // Dedent the nested part to its own indentation.
      const nested = lines.slice(i + 1, j)
      const cut = Math.min(...nested.filter((l) => l.trim()).map(indentOf))
      const dedented = nested.map((l) => l.replace(/\t/g, '    ').slice(Math.min(cut, indentOf(l))))
      children.push(...blocks(dedented, 0, dedented.length, offset + i + 1))
    }
    items.push(h('li', task ? { class: 'task-item' } : {}, children))
    i = j
  }
  const start = ordered ? /^\s*(\d+)/.exec(lines[from])[1] : null
  return { node: h(ordered ? 'ol' : 'ul', start && start !== '1' ? { start } : {}, items), next: i }
}

/** Plain text of a rendered tree (for tests and titles). */
export function textOf(nodes) {
  return nodes.map((n) => (typeof n === 'string' ? n : textOf(n.c ?? []))).join('')
}
