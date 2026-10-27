// Memoria's web app: an Obsidian-like vault in the browser, backed by /api.
import { render, slug, stripFrontmatter } from './render.js'
import { drawGraph } from './graph.js'

// ── Small helpers ────────────────────────────────────────────────────────

/** createElement with attributes, listeners (onClick…) and children (strings are text, never HTML). */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v)
    else if (k === 'class') node.className = v
    else if (k === 'dataset') Object.assign(node.dataset, v)
    else if (k in node && typeof v !== 'string') node[k] = v
    else node.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : String(c))
  return node
}

const $root = () => document.getElementById('root')

function toast(message, kind = '') {
  const t = el('div', { class: `toast ${kind}` }, message)
  document.getElementById('toasts').append(t)
  setTimeout(() => t.remove(), kind === 'error' ? 6000 : 3000)
}

class ApiError extends Error {
  constructor(status, message, body) {
    super(message)
    this.status = status
    this.body = body
  }
}

async function api(method, path, body, opts = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined && !(body instanceof Blob) && !(body instanceof ArrayBuffer) ? { 'content-type': 'application/json' } : opts.headers ?? {},
    body: body === undefined ? undefined : body instanceof Blob || body instanceof ArrayBuffer ? body : JSON.stringify(body),
  })
  const data = (res.headers.get('content-type') ?? '').includes('json') ? await res.json() : null
  if (res.status === 401 && path !== '/api/login') {
    state.signedIn = false
    renderLogin()
    throw new ApiError(401, 'Inicia sesión.', data)
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Error ${res.status}`, data)
  return data
}

const enc = (s) => encodeURIComponent(s)
const titleOf = (p) => (p.split('/').pop() ?? p).replace(/\.md$/i, '')
const folderOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
const fmtDate = (iso) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(`memoria:${k}`)
      return v === null ? d : JSON.parse(v)
    } catch {
      return d
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`memoria:${k}`, JSON.stringify(v))
    } catch {
      /* private mode: fine */
    }
  },
}

/** Resolves a link target the way the server does (shortest path wins). */
function resolveIn(target, paths) {
  const t = target.trim().replace(/\.md$/i, '').toLowerCase()
  if (!t) return null
  const c = paths.filter((p) => {
    const bare = p.replace(/\.md$/i, '').toLowerCase()
    return bare === t || bare.endsWith(`/${t}`)
  })
  return c.sort((a, b) => a.split('/').length - b.split('/').length || a.length - b.length)[0] ?? null
}
function resolveFileIn(target, files) {
  const t = target.toLowerCase()
  return files.find((f) => f.toLowerCase() === t) ?? files.find((f) => f.toLowerCase().endsWith(`/${t}`)) ?? null
}

// ── State ────────────────────────────────────────────────────────────────

const state = {
  signedIn: false,
  tree: { notes: [], folders: [], files: [], tags: [], settings: { bookmarks: [], daily: { folder: 'Diario', template: null } } },
  tab: store.get('tab', 'files'),
  open: new Set(store.get('openFolders', [])),
  note: null, // { path, content, updated_at, ... }
  info: null, // backlinks, outgoing, mentions, headings, properties, versions
  mode: store.get('mode', 'read'),
  dirty: false,
  saving: false,
  saveTimer: 0,
  saveError: '',
  conflict: null,
  panelOpen: store.get('panel', window.innerWidth > 1100),
  searchQuery: '',
}

const notePaths = () => state.tree.notes.map((n) => n.path)
const filePaths = () => state.tree.files.map((f) => f.path)

// ── Login ────────────────────────────────────────────────────────────────

function renderLogin(message = '') {
  const error = el('p', { class: 'error', role: 'alert', hidden: !message }, message)
  const input = el('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true, autofocus: true })
  const form = el(
    'form',
    {
      class: 'card login',
      onSubmit: async (ev) => {
        ev.preventDefault()
        error.hidden = true
        try {
          await api('POST', '/api/login', { password: input.value })
          state.signedIn = true
          await start()
        } catch (err) {
          error.textContent = err.message
          error.hidden = false
          input.select()
        }
      },
    },
    el('h1', {}, el('span', { class: 'brand-dot' }), ' Memoria'),
    el('p', { class: 'hint' }, 'Tus notas y archivos en la nube, conectados a Claude.'),
    el('label', {}, 'Contraseña', input),
    error,
    el('button', { type: 'submit', class: 'primary' }, 'Entrar'),
  )
  $root().replaceChildren(el('div', { class: 'center-page' }, form))
  input.focus()
}

// ── Boot ─────────────────────────────────────────────────────────────────

async function boot() {
  applyTheme()
  try {
    const status = await (await fetch('/api/status', { credentials: 'same-origin' })).json()
    if (!status.configured) {
      $root().replaceChildren(
        el('div', { class: 'center-page' }, el('div', { class: 'card login' }, el('h1', {}, 'Falta la contraseña'), el('p', {}, 'Configura el secreto MEMORIA_PASSWORD (mínimo 8 caracteres) en Cloudflare y recarga.'))),
      )
      return
    }
    state.signedIn = status.signedIn
  } catch {
    $root().replaceChildren(el('div', { class: 'center-page' }, el('p', {}, 'No hay conexión con Memoria. Revisa tu internet y recarga.')))
    return
  }
  if (!state.signedIn) return renderLogin()
  await start()
}

async function start() {
  renderShell()
  await refreshTree()
  const path = pathFromUrl()
  if (path) await openNote(path, { push: false })
  else renderMain()
}

function pathFromUrl() {
  const m = /^\/n\/(.+)$/.exec(location.pathname)
  return m ? decodeURIComponent(m[1]) : null
}

window.addEventListener('popstate', () => {
  const p = pathFromUrl()
  if (p) openNote(p, { push: false })
  else {
    state.note = null
    renderMain()
  }
})

window.addEventListener('beforeunload', (ev) => {
  if (state.dirty) {
    saveNow()
    ev.preventDefault()
  }
})

async function refreshTree() {
  state.tree = await api('GET', '/api/tree')
  renderSidebar()
}

// ── Shell ────────────────────────────────────────────────────────────────

const refs = {}

function renderShell() {
  refs.sidebar = el('aside', { class: 'sidebar', 'aria-label': 'Explorador' })
  refs.main = el('main', { class: 'main' })
  refs.panel = el('aside', { class: 'panel', 'aria-label': 'Conexiones de la nota' })
  refs.app = el('div', { class: `app${state.panelOpen ? '' : ' panel-closed'}` }, refs.sidebar, refs.main, refs.panel)
  $root().replaceChildren(refs.app)
  renderSidebar()
  renderMain()
}

function closeSidebarOnMobile() {
  refs.app.classList.remove('sidebar-open')
  document.querySelector('.scrim')?.remove()
}

function toggleSidebar() {
  const open = !refs.app.classList.contains('sidebar-open')
  refs.app.classList.toggle('sidebar-open', open)
  document.querySelector('.scrim')?.remove()
  if (open) document.body.append(el('div', { class: 'scrim', onClick: closeSidebarOnMobile }))
}

function togglePanel() {
  state.panelOpen = !state.panelOpen
  store.set('panel', state.panelOpen)
  refs.app.classList.toggle('panel-closed', !state.panelOpen)
  renderPanel()
}

// ── Sidebar ──────────────────────────────────────────────────────────────

const TABS = [
  ['files', 'Archivos'],
  ['search', 'Buscar'],
  ['tags', 'Etiquetas'],
  ['bookmarks', 'Marcadores'],
  ['trash', 'Papelera'],
]

function renderSidebar() {
  if (!refs.sidebar) return
  const top = el(
    'div',
    { class: 'sidebar-top' },
    el('span', { class: 'brand' }, el('span', { class: 'brand-dot', 'aria-hidden': 'true' }), 'Memoria'),
    el('button', { class: 'icon-btn', title: 'Nueva nota (Alt+N)', 'aria-label': 'Nueva nota', onClick: () => newNote(currentFolder()) }, '✚'),
    el('button', { class: 'icon-btn', title: 'Nueva carpeta', 'aria-label': 'Nueva carpeta', onClick: () => newFolder(currentFolder()) }, '🗀'),
    el('button', { class: 'icon-btn', title: 'Nota del día (Alt+D)', 'aria-label': 'Nota del día', onClick: openDaily }, '📅'),
    el('button', { class: 'icon-btn', title: 'Mapa de conexiones (Alt+G)', 'aria-label': 'Mapa de conexiones', onClick: openGraph }, '◎'),
    el('button', { class: 'icon-btn only-mobile', 'aria-label': 'Cerrar', onClick: closeSidebarOnMobile }, '✕'),
  )
  const tabs = el(
    'div',
    { class: 'tabs', role: 'tablist' },
    TABS.map(([id, label]) =>
      el(
        'button',
        {
          role: 'tab',
          'aria-selected': String(state.tab === id),
          onClick: () => {
            state.tab = id
            store.set('tab', id)
            renderSidebar()
            if (id === 'search') setTimeout(() => refs.sidebar.querySelector('input[type=search]')?.focus())
          },
        },
        label,
      ),
    ),
  )
  const body = el('div', { class: 'side-body' })
  if (state.tab === 'files') body.append(fileTree())
  if (state.tab === 'search') body.append(searchPane())
  if (state.tab === 'tags') body.append(tagsPane())
  if (state.tab === 'bookmarks') body.append(bookmarksPane())
  if (state.tab === 'trash') trashPane().then((n) => body.append(n))
  const upload = el('input', { type: 'file', multiple: true, hidden: true, onChange: (ev) => uploadFiles([...ev.target.files], currentFolder()) })
  const uploadDir = el('input', { type: 'file', multiple: true, hidden: true, webkitdirectory: true, onChange: (ev) => uploadFiles([...ev.target.files], '', { keepPaths: true }) })
  const foot = el(
    'div',
    { class: 'side-foot' },
    el('button', { class: 'btn', title: 'Subir archivos o notas .md', onClick: () => upload.click() }, '⇪ Subir'),
    el('button', { class: 'btn', title: 'Subir una carpeta entera (por ejemplo una bóveda de Obsidian)', onClick: () => uploadDir.click() }, '🗁 Carpeta'),
    el('a', { class: 'btn', href: '/api/export', title: 'Descargar todo como .zip (se abre en Obsidian)' }, '⇩ Exportar'),
    el('button', { class: 'icon-btn', title: 'Ajustes', 'aria-label': 'Ajustes', onClick: openSettings }, '⚙'),
    upload,
    uploadDir,
  )
  refs.sidebar.replaceChildren(top, tabs, body, foot)
}

function currentFolder() {
  return state.note ? folderOf(state.note.path) : ''
}

/** Folders → nested nodes with their notes and files. */
function buildTree() {
  const root = { name: '', path: '', folders: new Map(), notes: [], files: [] }
  const folderNode = (path) => {
    let node = root
    if (!path) return node
    let acc = ''
    for (const part of path.split('/')) {
      acc = acc ? `${acc}/${part}` : part
      if (!node.folders.has(part)) node.folders.set(part, { name: part, path: acc, folders: new Map(), notes: [], files: [] })
      node = node.folders.get(part)
    }
    return node
  }
  for (const f of state.tree.folders) folderNode(f)
  for (const n of state.tree.notes) folderNode(folderOf(n.path)).notes.push(n)
  for (const f of state.tree.files) folderNode(folderOf(f.path)).files.push(f)
  return root
}

function fileTree() {
  const tree = buildTree()
  if (!state.tree.notes.length && !state.tree.files.length && !state.tree.folders.length) {
    return el('div', { class: 'muted', style: 'padding:12px' }, 'Todavía no hay notas. Crea una con ✚ o sube una carpeta de Obsidian.')
  }
  const wrap = el('div', { role: 'tree' })
  const renderFolder = (node, into) => {
    const folders = [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
    for (const f of folders) {
      const isOpen = state.open.has(f.path)
      const children = el('div', { class: 'tree-children', role: 'group', hidden: !isOpen })
      const row = el(
        'div',
        { class: 'tree-row' },
        el(
          'button',
          {
            class: 'tree-item',
            role: 'treeitem',
            'aria-expanded': String(isOpen),
            onClick: () => {
              if (state.open.has(f.path)) state.open.delete(f.path)
              else state.open.add(f.path)
              store.set('openFolders', [...state.open])
              renderSidebar()
            },
          },
          el('span', { class: `chev${isOpen ? ' open' : ''}`, 'aria-hidden': 'true' }, '›'),
          el('span', { class: 'name' }, f.name),
        ),
        el(
          'span',
          { class: 'row-actions' },
          el('button', { class: 'icon-btn', title: 'Nueva nota aquí', 'aria-label': `Nueva nota en ${f.name}`, onClick: () => newNote(f.path) }, '✚'),
          el('button', { class: 'icon-btn', title: 'Más', 'aria-label': `Opciones de ${f.name}`, onClick: () => folderMenu(f.path) }, '⋯'),
        ),
      )
      into.append(row, children)
      if (isOpen) renderFolder(f, children)
    }
    for (const n of node.notes.sort((a, b) => a.title.localeCompare(b.title, 'es'))) {
      const active = state.note?.path === n.path
      into.append(
        el(
          'div',
          { class: 'tree-row' },
          el(
            'button',
            { class: `tree-item${active ? ' active' : ''}`, role: 'treeitem', 'aria-current': active ? 'page' : null, title: n.path, onClick: () => openNote(n.path) },
            el('span', { class: 'kind', 'aria-hidden': 'true' }, '▤'),
            el('span', { class: 'name' }, n.title),
          ),
          el('span', { class: 'row-actions' }, el('button', { class: 'icon-btn', title: 'Más', 'aria-label': `Opciones de ${n.title}`, onClick: () => noteMenu(n.path) }, '⋯')),
        ),
      )
    }
    for (const f of node.files.sort((a, b) => a.path.localeCompare(b.path, 'es'))) {
      into.append(
        el(
          'div',
          { class: 'tree-row' },
          el(
            'a',
            { class: 'tree-item', role: 'treeitem', href: `/api/file?path=${enc(f.path)}`, target: '_blank', rel: 'noopener', title: `${f.path} · ${(f.size / 1024).toFixed(0)} KB` },
            el('span', { class: 'kind', 'aria-hidden': 'true' }, '◫'),
            el('span', { class: 'name' }, f.path.split('/').pop()),
          ),
          el('span', { class: 'row-actions' }, el('button', { class: 'icon-btn', title: 'Más', 'aria-label': `Opciones de ${f.path}`, onClick: () => fileMenu(f.path) }, '⋯')),
        ),
      )
    }
  }
  renderFolder(tree, wrap)
  return wrap
}

let searchTimer = 0
function searchPane() {
  const results = el('div')
  const input = el('input', {
    type: 'search',
    placeholder: 'Buscar… (tag:x, path:carpeta, "frase", -palabra)',
    'aria-label': 'Buscar en las notas',
    value: state.searchQuery,
    onInput: (ev) => {
      state.searchQuery = ev.target.value
      clearTimeout(searchTimer)
      searchTimer = setTimeout(() => runSearch(state.searchQuery, results), 250)
    },
  })
  if (state.searchQuery) runSearch(state.searchQuery, results)
  return el('div', {}, input, results)
}

async function runSearch(q, into) {
  if (!q.trim()) return into.replaceChildren()
  try {
    const { results } = await api('GET', `/api/search?q=${enc(q)}`)
    into.replaceChildren(
      el('div', { class: 'section-title' }, `${results.length} resultado${results.length === 1 ? '' : 's'}`),
      ...results.map((r) =>
        el(
          'button',
          {
            class: 'result',
            onClick: () => {
              openNote(r.path)
              closeSidebarOnMobile()
            },
          },
          el('div', { class: 'r-title' }, r.title),
          el('div', { class: 'r-path' }, folderOf(r.path) || '/'),
          el('div', { class: 'r-snip' }, r.snippet),
        ),
      ),
    )
  } catch (err) {
    into.replaceChildren(el('p', { class: 'error' }, err.message))
  }
}

function searchFor(q) {
  state.tab = 'search'
  state.searchQuery = q
  store.set('tab', 'search')
  renderSidebar()
  refs.app.classList.add('sidebar-open')
}

function tagsPane() {
  if (!state.tree.tags.length) return el('p', { class: 'muted', style: 'padding:12px' }, 'Aún no hay etiquetas. Escribe #algo en una nota.')
  return el(
    'div',
    {},
    state.tree.tags.map((t) => {
      const depth = t.tag.split('/').length - 1
      return el('button', { class: 'tree-item', style: `padding-left:${8 + depth * 14}px`, onClick: () => searchFor(`tag:${t.tag}`) }, el('span', { class: 'name' }, `#${t.tag}`), el('span', { class: 'count' }, t.count))
    }),
  )
}

function bookmarksPane() {
  const list = state.tree.settings.bookmarks
  if (!list.length) return el('p', { class: 'muted', style: 'padding:12px' }, 'Marca notas con ☆ para tenerlas aquí.')
  return el(
    'div',
    {},
    list.map((p) => el('button', { class: 'tree-item', onClick: () => openNote(p) }, el('span', { class: 'kind' }, '★'), el('span', { class: 'name' }, titleOf(p)))),
  )
}

async function trashPane() {
  const { notes, files } = await api('GET', '/api/trash')
  if (!notes.length && !files.length) return el('p', { class: 'muted', style: 'padding:12px' }, 'La papelera está vacía.')
  return el(
    'div',
    {},
    el('p', { class: 'hint', style: 'padding:4px 8px' }, 'Nada se borra del todo: restaura lo que quieras.'),
    notes.map((n) =>
      el(
        'div',
        { class: 'tree-row' },
        el('span', { class: 'tree-item' }, el('span', { class: 'kind' }, '▤'), el('span', { class: 'name', title: n.path }, n.title)),
        el(
          'button',
          {
            class: 'btn',
            onClick: async () => {
              await api('POST', '/api/note/restore', { path: n.path })
              toast(`«${n.title}» restaurada`)
              await refreshTree()
            },
          },
          'Restaurar',
        ),
      ),
    ),
    files.map((f) =>
      el(
        'div',
        { class: 'tree-row' },
        el('span', { class: 'tree-item' }, el('span', { class: 'kind' }, '◫'), el('span', { class: 'name', title: f.path }, f.path.split('/').pop())),
        el(
          'button',
          {
            class: 'btn',
            onClick: async () => {
              await api('POST', '/api/file/restore', { path: f.path })
              toast('Archivo restaurado')
              await refreshTree()
            },
          },
          'Restaurar',
        ),
      ),
    ),
  )
}

// ── Menus and prompts ────────────────────────────────────────────────────

function dialog({ title, body, actions, onClose, className = '' }) {
  const d = el('dialog', { class: className })
  const close = () => {
    d.close()
    d.remove()
    onClose?.()
  }
  d.append(
    el(
      'div',
      { class: 'dlg' },
      el('div', { class: 'dlg-head' }, el('h2', {}, title), el('button', { class: 'icon-btn', 'aria-label': 'Cerrar', onClick: close }, '✕')),
      el('div', { class: 'dlg-body' }, body),
      actions?.length ? el('div', { class: 'dlg-foot' }, actions.map((a) => el('button', { class: `btn ${a.kind ?? ''}`, onClick: () => a.run(close) }, a.label))) : null,
    ),
  )
  d.addEventListener('cancel', (ev) => {
    ev.preventDefault()
    close()
  })
  document.body.append(d)
  d.showModal()
  return { d, close }
}

function ask(title, label, value = '') {
  return new Promise((resolve) => {
    const input = el('input', { type: 'text', value, 'aria-label': label })
    let done = false
    const { close } = dialog({
      title,
      body: el(
        'form',
        {
          onSubmit: (ev) => {
            ev.preventDefault()
            done = true
            close()
            resolve(input.value.trim() || null)
          },
        },
        el('label', { style: 'display:flex;flex-direction:column;gap:6px' }, label, input),
      ),
      actions: [
        { label: 'Cancelar', run: (c) => c() },
        {
          label: 'Aceptar',
          kind: 'primary',
          run: (c) => {
            done = true
            c()
            resolve(input.value.trim() || null)
          },
        },
      ],
      onClose: () => {
        if (!done) resolve(null)
      },
    })
    setTimeout(() => {
      input.focus()
      input.select()
    })
  })
}

function confirmBox(title, message, okLabel = 'Aceptar') {
  return new Promise((resolve) => {
    let done = false
    dialog({
      title,
      body: el('p', {}, message),
      actions: [
        { label: 'Cancelar', run: (c) => c() },
        {
          label: okLabel,
          kind: 'primary',
          run: (c) => {
            done = true
            c()
            resolve(true)
          },
        },
      ],
      onClose: () => {
        if (!done) resolve(false)
      },
    })
  })
}

function menu(title, items) {
  const { close } = dialog({
    title,
    body: el(
      'div',
      { style: 'display:flex;flex-direction:column;gap:4px' },
      items.map((i) =>
        el(
          'button',
          {
            class: `btn ${i.kind ?? ''}`,
            style: 'justify-content:flex-start',
            onClick: () => {
              close()
              i.run()
            },
          },
          i.label,
        ),
      ),
    ),
  })
}

function noteMenu(path) {
  const marked = state.tree.settings.bookmarks.includes(path)
  menu(titleOf(path), [
    { label: 'Abrir', run: () => openNote(path) },
    { label: 'Renombrar o mover…', run: () => renamePrompt(path) },
    { label: marked ? '★ Quitar de marcadores' : '☆ Añadir a marcadores', run: () => toggleBookmark(path) },
    { label: 'Duplicar', run: () => duplicate(path) },
    { label: 'Historial de versiones', run: () => openHistory(path) },
    { label: 'Mandar a la papelera', kind: 'danger', run: () => trash(path) },
  ])
}

function folderMenu(path) {
  menu(path, [
    { label: 'Nueva nota aquí', run: () => newNote(path) },
    { label: 'Nueva subcarpeta', run: () => newFolder(path) },
    { label: 'Renombrar o mover…', run: () => renameFolderPrompt(path) },
    { label: 'Mandar su contenido a la papelera', kind: 'danger', run: () => trashFolder(path) },
  ])
}

function fileMenu(path) {
  menu(path.split('/').pop(), [
    { label: 'Abrir', run: () => window.open(`/api/file?path=${enc(path)}`, '_blank', 'noopener') },
    { label: 'Descargar', run: () => (location.href = `/api/file?path=${enc(path)}&download=1`) },
    { label: 'Copiar enlace para una nota', run: () => copy(`![[${path.split('/').pop()}]]`) },
    {
      label: 'Renombrar o mover…',
      run: async () => {
        const to = await ask('Renombrar archivo', 'Nueva ruta', path)
        if (!to || to === path) return
        await act(() => api('POST', '/api/file/rename', { from: path, to }), 'Archivo movido')
        await refreshTree()
      },
    },
    {
      label: 'Mandar a la papelera',
      kind: 'danger',
      run: async () => {
        await act(() => api('DELETE', `/api/file?path=${enc(path)}`), 'Archivo en la papelera')
        await refreshTree()
      },
    },
  ])
}

async function act(fn, ok) {
  try {
    const r = await fn()
    if (ok) toast(ok)
    return r
  } catch (err) {
    toast(err.message, 'error')
    throw err
  }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    toast('Copiado')
  } catch {
    toast('No se pudo copiar', 'error')
  }
}

// ── Note actions ─────────────────────────────────────────────────────────

async function newNote(folder = '', title = '') {
  const name = title || (await ask('Nueva nota', `Nombre${folder ? ` (en ${folder})` : ''}`, 'Sin título'))
  if (!name) return
  const parts = name.split('/')
  const finalTitle = parts.pop()
  const finalFolder = [folder, ...parts].filter(Boolean).join('/')
  const { note } = await act(() => api('POST', '/api/note', { folder: finalFolder, title: finalTitle }))
  await refreshTree()
  await openNote(note.path, { mode: 'edit' })
}

async function newFolder(parent = '') {
  const name = await ask('Nueva carpeta', parent ? `Nombre (dentro de ${parent})` : 'Nombre')
  if (!name) return
  const path = [parent, name].filter(Boolean).join('/')
  await act(() => api('POST', '/api/folder', { path }), 'Carpeta creada')
  state.open.add(path)
  store.set('openFolders', [...state.open])
  await refreshTree()
}

async function renamePrompt(path) {
  const to = await ask('Renombrar o mover', 'Nueva ruta (carpeta/nombre)', path.replace(/\.md$/, ''))
  if (!to || `${to}.md` === path || to === path) return
  await saveNow()
  const r = await act(() => api('POST', '/api/note/rename', { from: path, to }))
  toast(r.updatedLinks.length ? `Renombrada; enlaces actualizados en ${r.updatedLinks.length} nota${r.updatedLinks.length === 1 ? '' : 's'}` : 'Renombrada')
  await refreshTree()
  if (state.note?.path === path) await openNote(r.path, { replace: true })
}

async function renameFolderPrompt(path) {
  const to = await ask('Renombrar o mover carpeta', 'Nueva ruta', path)
  if (!to || to === path) return
  await saveNow()
  const r = await act(() => api('POST', '/api/folder/rename', { from: path, to }))
  toast(`${r.moved} elementos movidos`)
  const wasHere = state.note?.path.startsWith(`${path}/`)
  await refreshTree()
  if (wasHere) await openNote(`${to}/${state.note.path.slice(path.length + 1)}`, { replace: true })
}

async function trash(path) {
  if (!(await confirmBox('Mandar a la papelera', `«${titleOf(path)}» irá a la papelera. Puedes restaurarla cuando quieras.`, 'Mandar'))) return
  await act(() => api('DELETE', `/api/note?path=${enc(path)}`), 'En la papelera')
  if (state.note?.path === path) {
    state.note = null
    history.pushState(null, '', '/')
    renderMain()
  }
  await refreshTree()
}

async function trashFolder(path) {
  if (!(await confirmBox('Mandar carpeta a la papelera', `Todas las notas de «${path}» irán a la papelera.`, 'Mandar'))) return
  const r = await act(() => api('DELETE', `/api/folder?path=${enc(path)}`))
  toast(`${r.trashed} notas en la papelera`)
  await refreshTree()
}

async function duplicate(path) {
  const { note } = await api('GET', `/api/note?path=${enc(path)}`)
  const { note: copyNote } = await act(() => api('POST', '/api/note', { folder: folderOf(path), title: `${titleOf(path)} (copia)`, content: note.content }))
  await refreshTree()
  await openNote(copyNote.path)
}

async function toggleBookmark(path) {
  const list = state.tree.settings.bookmarks
  const next = list.includes(path) ? list.filter((p) => p !== path) : [...list, path]
  const { settings } = await act(() => api('PUT', '/api/settings', { bookmarks: next }))
  state.tree.settings = settings
  renderSidebar()
  renderMain()
}

async function openDaily() {
  const { note } = await act(() => api('POST', '/api/daily', {}))
  await refreshTree()
  await openNote(note.path)
}

// ── Opening and saving ───────────────────────────────────────────────────

async function openNote(path, opts = {}) {
  if (state.dirty) await saveNow()
  try {
    const data = await api('GET', `/api/note?path=${enc(path)}`)
    state.note = data.note
    state.info = data
    state.dirty = false
    state.conflict = null
    state.saveError = ''
    if (opts.mode) setMode(opts.mode, false)
    const url = `/n/${enc(data.note.path)}`
    if (opts.push !== false && location.pathname !== url) history[opts.replace ? 'replaceState' : 'pushState'](null, '', url)
    document.title = `${titleOf(data.note.path)} · Memoria`
    // Open the folders above the note.
    let f = folderOf(data.note.path)
    while (f) {
      state.open.add(f)
      f = folderOf(f)
    }
    store.set('openFolders', [...state.open])
    renderSidebar()
    renderMain()
    closeSidebarOnMobile()
    if (opts.heading) scrollToHeading(opts.heading)
  } catch (err) {
    if (err.status === 404) {
      toast(`No existe «${titleOf(path)}»`, 'error')
      history.replaceState(null, '', '/')
      state.note = null
      renderMain()
    } else toast(err.message, 'error')
  }
}

async function reloadInfo() {
  if (!state.note) return
  try {
    state.info = await api('GET', `/api/note?path=${enc(state.note.path)}`)
    renderPanel()
  } catch {
    /* keeps the panel as it was */
  }
}

function scheduleSave() {
  state.dirty = true
  setSaveState('Sin guardar…')
  clearTimeout(state.saveTimer)
  state.saveTimer = setTimeout(saveNow, 1200)
}

async function saveNow() {
  clearTimeout(state.saveTimer)
  if (!state.note || !state.dirty || state.saving || state.conflict) return
  state.saving = true
  const sent = state.note.content
  setSaveState('Guardando…')
  try {
    const { note } = await api('PUT', '/api/note', { path: state.note.path, content: sent, base_updated_at: state.note.updated_at })
    state.note.updated_at = note.updated_at
    state.dirty = state.note.content !== sent
    state.saveError = ''
    setSaveState(state.dirty ? 'Sin guardar…' : 'Guardado')
    if (state.dirty) scheduleSave()
    else {
      reloadInfo()
      refreshTree()
    }
  } catch (err) {
    if (err.status === 409 && err.body?.current) {
      state.conflict = err.body.current
      renderMain()
    } else {
      state.saveError = err.message
      setSaveState('No se pudo guardar: reintentando', true)
      state.saveTimer = setTimeout(saveNow, 5000)
    }
  } finally {
    state.saving = false
  }
}

function setSaveState(text, error = false) {
  const s = document.getElementById('save-state')
  if (!s) return
  s.textContent = text
  s.classList.toggle('error', error)
}

window.addEventListener('online', () => state.dirty && saveNow())

// ── Main area ────────────────────────────────────────────────────────────

function setMode(mode, rerender = true) {
  state.mode = mode
  store.set('mode', mode)
  if (rerender) renderMain()
}

function renderMain() {
  if (!refs.main) return
  if (!state.note) {
    refs.main.replaceChildren(
      el('div', { class: 'note-bar' }, el('button', { class: 'icon-btn only-mobile', 'aria-label': 'Menú', onClick: toggleSidebar }, '☰'), el('strong', {}, 'Memoria')),
      el(
        'div',
        { class: 'empty-state' },
        el(
          'div',
          {},
          el('h2', {}, 'Tu memoria'),
          el('p', {}, 'Abre una nota a la izquierda, o:'),
          el(
            'div',
            { style: 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center' },
            el('button', { class: 'btn primary', onClick: () => newNote() }, '✚ Nueva nota'),
            el('button', { class: 'btn', onClick: openDaily }, '📅 Nota de hoy'),
            el('button', { class: 'btn', onClick: openSwitcher }, '⌕ Abrir rápido (Ctrl+O)'),
            el('button', { class: 'btn', onClick: openGraph }, '◎ Mapa'),
          ),
          el('p', { class: 'hint', style: 'margin-top:16px' }, `${state.tree.notes.length} notas · ${state.tree.files.length} archivos`),
        ),
      ),
    )
    renderPanel()
    return
  }
  const note = state.note
  const marked = state.tree.settings.bookmarks.includes(note.path)
  const titleInput = el('input', {
    class: 'title-input',
    type: 'text',
    value: titleOf(note.path),
    'aria-label': 'Nombre de la nota',
    onKeydown: (ev) => {
      if (ev.key === 'Enter') ev.target.blur()
      if (ev.key === 'Escape') {
        ev.target.value = titleOf(note.path)
        ev.target.blur()
      }
    },
    onBlur: async (ev) => {
      const name = ev.target.value.trim().replace(/[\\/]/g, ' ')
      if (!name || name === titleOf(note.path)) return (ev.target.value = titleOf(note.path))
      const folder = folderOf(note.path)
      await saveNow()
      try {
        const r = await api('POST', '/api/note/rename', { from: note.path, to: folder ? `${folder}/${name}` : name })
        if (r.updatedLinks.length) toast(`Enlaces actualizados en ${r.updatedLinks.length} nota${r.updatedLinks.length === 1 ? '' : 's'}`)
        await refreshTree()
        await openNote(r.path, { replace: true })
      } catch (err) {
        toast(err.message, 'error')
        ev.target.value = titleOf(note.path)
      }
    },
  })
  const modes = el(
    'div',
    { class: 'mode-switch', role: 'group', 'aria-label': 'Modo' },
    [
      ['read', 'Leer'],
      ['split', 'Ambos'],
      ['edit', 'Editar'],
    ].map(([m, label]) => el('button', { 'aria-pressed': String(state.mode === m), onClick: () => setMode(m) }, label)),
  )
  const bar = el(
    'div',
    { class: 'note-bar' },
    el('button', { class: 'icon-btn only-mobile', 'aria-label': 'Menú', onClick: toggleSidebar }, '☰'),
    el('span', { class: 'crumbs', title: note.path }, folderOf(note.path) ? `${folderOf(note.path)} /` : ''),
    titleInput,
    el('span', { class: 'save-state', id: 'save-state' }, state.saveError ? 'No se pudo guardar' : 'Guardado'),
    modes,
    el('button', { class: `icon-btn${marked ? ' pressed' : ''}`, title: marked ? 'Quitar de marcadores' : 'Añadir a marcadores', 'aria-label': 'Marcador', onClick: () => toggleBookmark(note.path) }, marked ? '★' : '☆'),
    el('button', { class: 'icon-btn', title: 'Más opciones', 'aria-label': 'Más opciones', onClick: () => noteMenu(note.path) }, '⋯'),
    el('button', { class: `icon-btn${state.panelOpen ? ' pressed' : ''}`, title: 'Conexiones (Alt+B)', 'aria-label': 'Panel de conexiones', onClick: togglePanel }, '⧉'),
  )
  const editor = el('textarea', {
    class: 'editor',
    spellcheck: true,
    'aria-label': 'Texto de la nota',
    value: note.content,
    onInput: (ev) => {
      state.note.content = ev.target.value
      scheduleSave()
      updatePreview()
      linkSuggest(ev.target)
    },
    onKeydown: (ev) => editorKeys(ev),
    onBlur: () => setTimeout(hideSuggest, 150),
  })
  editor.value = note.content
  const editorWrap = el('div', { class: 'editor-wrap' }, editor)
  attachDrop(editorWrap, editor)
  editor.addEventListener('paste', (ev) => {
    const files = [...(ev.clipboardData?.files ?? [])]
    if (files.length) {
      ev.preventDefault()
      uploadAndEmbed(files, editor)
    }
  })
  const preview = el('div', { class: 'preview' }, el('article', { class: 'md', id: 'preview' }))
  refs.editor = editor
  refs.preview = preview.firstChild
  const children = [bar]
  if (state.conflict) children.push(conflictBanner())
  children.push(el('div', { class: `workspace mode-${state.mode}` }, editorWrap, preview))
  refs.main.replaceChildren(...children)
  updatePreview()
  renderPanel()
  if (state.mode === 'edit') editor.focus()
}

function conflictBanner() {
  const theirs = state.conflict
  return el(
    'div',
    { class: 'banner', role: 'alert' },
    el('span', {}, `Esta nota cambió en otro sitio (${fmtDate(theirs.updated_at)}) mientras la editabas. No se perdió nada:`),
    el(
      'button',
      {
        class: 'btn',
        onClick: async () => {
          // Keep mine as a copy, then show theirs.
          const mine = state.note.content
          const { note } = await act(() => api('POST', '/api/note', { folder: folderOf(state.note.path), title: `${titleOf(state.note.path)} (mi versión)`, content: mine }))
          toast(`Tu versión quedó en «${titleOf(note.path)}»`)
          state.conflict = null
          state.dirty = false
          await refreshTree()
          await openNote(state.note.path)
        },
      },
      'Ver la otra y guardar la mía como copia',
    ),
    el(
      'button',
      {
        class: 'btn',
        onClick: async () => {
          // Mine wins; theirs stays in the history.
          state.note.updated_at = theirs.updated_at
          state.conflict = null
          state.dirty = true
          await saveNow()
          renderMain()
          toast('Guardada la tuya; la otra quedó en el historial')
        },
      },
      'Quedarme con la mía',
    ),
  )
}

// ── Preview rendering ────────────────────────────────────────────────────

let previewTimer = 0
function updatePreview() {
  if (!refs.preview || state.mode === 'edit') return
  clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    const scroll = refs.preview.parentElement.scrollTop
    refs.preview.replaceChildren(...toDom(render(state.note.content), { depth: 0, sourcePath: state.note.path }))
    refs.preview.parentElement.scrollTop = scroll
  }, 60)
}

/** The render tree as DOM, wiring links, tags, tasks and embeds. */
function toDom(nodes, ctx) {
  return nodes.map((n) => {
    if (typeof n === 'string') return document.createTextNode(n)
    const attrs = { ...(n.a ?? {}) }
    const node = document.createElement(n.t)
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
    if (n.t === 'a' && attrs.class === 'internal-link') {
      const target = attrs['data-target']
      const resolved = target ? resolveIn(target, notePaths()) : ctx.sourcePath
      if (!resolved) node.classList.add('unresolved')
      node.title = resolved ?? `«${target}» no existe: clic para crearla`
      node.addEventListener('click', (ev) => {
        ev.preventDefault()
        followLink(target, attrs['data-subpath'])
      })
    } else if (n.t === 'a' && attrs.class === 'tag') {
      node.addEventListener('click', (ev) => {
        ev.preventDefault()
        searchFor(`tag:${attrs['data-tag']}`)
      })
    } else if (n.t === 'input' && attrs.class === 'task') {
      node.addEventListener('change', () => toggleTask(Number(attrs['data-line'])))
      if (ctx.depth > 0) node.disabled = true
    } else if (n.t === 'span' && attrs['data-kind']) {
      return embed(attrs, ctx)
    }
    node.append(...toDom(n.c ?? [], ctx))
    return node
  })
}

function embed(attrs, ctx) {
  const target = attrs['data-target']
  const kind = attrs['data-kind']
  if (kind === 'note') {
    const box = el('div', { class: 'embed embed-note' })
    const path = resolveIn(target, notePaths())
    if (!path || ctx.depth >= 2 || path === ctx.sourcePath) {
      box.append(el('a', { href: '#', class: 'internal-link', onClick: (ev) => (ev.preventDefault(), followLink(target, attrs['data-subpath'])) }, `↪ ${target}`))
      return box
    }
    box.append(el('div', { class: 'embed-title' }, el('a', { href: `/n/${enc(path)}`, onClick: (ev) => (ev.preventDefault(), openNote(path)) }, `↪ ${titleOf(path)}`)))
    api('GET', `/api/note?path=${enc(path)}`)
      .then(({ note }) => {
        let text = stripFrontmatter(note.content)
        const sub = attrs['data-subpath']
        if (sub && !sub.startsWith('#^')) text = sectionOf(text, sub.slice(1))
        box.append(...toDom(render(text), { depth: ctx.depth + 1, sourcePath: path }))
      })
      .catch(() => box.append(el('p', { class: 'muted' }, 'No se pudo cargar.')))
    return box
  }
  const file = resolveFileIn(target, filePaths())
  if (!file) return el('span', { class: 'muted' }, `⚠ Falta el archivo «${target}»`)
  const src = `/api/file?path=${enc(file)}`
  const width = attrs['data-width'] ? `${attrs['data-width']}px` : null
  if (kind === 'image') return el('img', { src, alt: attrs['data-alt'] ?? target, loading: 'lazy', style: width ? `width:${width}` : null })
  if (kind === 'video') return el('video', { src, controls: true, preload: 'metadata', style: width ? `width:${width}` : null })
  if (kind === 'audio') return el('audio', { src, controls: true, preload: 'metadata' })
  return el('span', { class: 'embed embed-file' }, el('a', { href: src, target: '_blank', rel: 'noopener' }, `📎 ${target}`))
}

/** The text under a heading, up to the next heading of the same or higher level. */
function sectionOf(text, heading) {
  const lines = text.split('\n')
  const want = slug(heading)
  const at = lines.findIndex((l) => /^#{1,6}\s/.test(l) && slug(l.replace(/^#{1,6}\s+/, '')) === want)
  if (at < 0) return text
  const level = /^(#+)/.exec(lines[at])[1].length
  let end = lines.findIndex((l, i) => i > at && /^(#+)\s/.test(l) && /^(#+)/.exec(l)[1].length <= level)
  if (end < 0) end = lines.length
  return lines.slice(at, end).join('\n')
}

async function followLink(target, subpath) {
  const heading = subpath && !subpath.startsWith('#^') ? subpath.slice(1) : null
  if (!target) return heading && scrollToHeading(heading)
  const path = resolveIn(target, notePaths())
  if (path) return openNote(path, { heading })
  if (/\.[a-z0-9]{2,5}$/i.test(target) && !/\.md$/i.test(target)) {
    const f = resolveFileIn(target, filePaths())
    if (f) return window.open(`/api/file?path=${enc(f)}`, '_blank', 'noopener')
  }
  // Clicking a link to a note that does not exist creates it, as in Obsidian.
  const parts = target.split('/')
  const title = parts.pop()
  const folder = parts.join('/')
  const { note } = await act(() => api('POST', '/api/note', { folder, title }))
  await refreshTree()
  await openNote(note.path, { mode: 'edit' })
}

function scrollToHeading(heading) {
  setTimeout(() => {
    const id = slug(heading)
    const h = refs.preview?.querySelector(`[id="${CSS.escape(id)}"]`)
    if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else if (refs.editor && state.note) {
      const i = state.note.content.split('\n').findIndex((l) => /^#{1,6}\s/.test(l) && slug(l.replace(/^#{1,6}\s+/, '')) === id)
      if (i >= 0) {
        const pos = state.note.content.split('\n').slice(0, i).join('\n').length
        refs.editor.focus()
        refs.editor.setSelectionRange(pos, pos)
      }
    }
  }, 80)
}

function toggleTask(line) {
  const lines = state.note.content.split('\n')
  const l = lines[line]
  if (l === undefined) return
  lines[line] = l.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX\-/])\]/, (_, pre, mark) => `${pre}[${mark === ' ' ? 'x' : ' '}]`)
  state.note.content = lines.join('\n')
  if (refs.editor) refs.editor.value = state.note.content
  scheduleSave()
  updatePreview()
}

// ── Editor: keys, [[ suggestions, files ──────────────────────────────────

function editorKeys(ev) {
  if (refs.suggest && !refs.suggest.hidden && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(ev.key)) {
    ev.preventDefault()
    const items = [...refs.suggest.querySelectorAll('.result')]
    let i = items.findIndex((x) => x.getAttribute('aria-selected') === 'true')
    if (ev.key === 'Escape') return hideSuggest()
    if (ev.key === 'ArrowDown') i = (i + 1) % items.length
    else if (ev.key === 'ArrowUp') i = (i - 1 + items.length) % items.length
    else return items[Math.max(0, i)]?.click()
    items.forEach((x, k) => x.setAttribute('aria-selected', String(k === i)))
    items[i]?.scrollIntoView({ block: 'nearest' })
    return
  }
  if (ev.key === 'Tab') {
    ev.preventDefault()
    insertAtCursor(ev.target, '  ')
  }
  // Enter in a list continues the list.
  if (ev.key === 'Enter' && !ev.shiftKey) {
    const t = ev.target
    const before = t.value.slice(0, t.selectionStart)
    const line = before.slice(before.lastIndexOf('\n') + 1)
    const m = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?(.*)$/.exec(line)
    if (m) {
      ev.preventDefault()
      if (!m[5].trim() && !m[4]?.trim()) {
        // An empty item ends the list.
        t.setSelectionRange(t.selectionStart - line.length, t.selectionStart)
        insertAtCursor(t, '')
        return
      }
      const bullet = /\d/.test(m[2]) ? `${Number.parseInt(m[2], 10) + 1}${m[2].slice(-1)}` : m[2]
      insertAtCursor(t, `\n${m[1]}${bullet}${m[3]}${m[4] ? '[ ] ' : ''}`)
    }
  }
}

function insertAtCursor(t, text) {
  t.setRangeText(text, t.selectionStart, t.selectionEnd, 'end')
  t.dispatchEvent(new Event('input'))
}

let suggestSeq = 0
async function linkSuggest(t) {
  const before = t.value.slice(0, t.selectionStart)
  const m = /(!?)\[\[([^\[\]\n|#]*)$/.exec(before)
  if (!m) return hideSuggest()
  const q = m[2]
  const seq = ++suggestSeq
  const local = state.tree.notes
    .filter((n) => n.title.toLowerCase().includes(q.toLowerCase()) || n.path.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(!a.title.toLowerCase().startsWith(q.toLowerCase())) - Number(!b.title.toLowerCase().startsWith(q.toLowerCase())) || b.updated_at.localeCompare(a.updated_at))
    .slice(0, 12)
  const files = m[1] ? state.tree.files.filter((f) => f.path.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : []
  if (seq !== suggestSeq) return
  if (!refs.suggest) {
    refs.suggest = el('div', { class: 'suggest', role: 'listbox' })
  }
  const box = refs.suggest
  t.parentElement.append(box)
  const pick = (text) => {
    const start = t.selectionStart - q.length
    t.setRangeText(`${text}]]`, start, t.selectionStart, 'end')
    // A "]]" already after the cursor is not doubled.
    if (t.value.slice(t.selectionStart, t.selectionStart + 2) === ']]') t.setRangeText('', t.selectionStart, t.selectionStart + 2, 'end')
    t.dispatchEvent(new Event('input'))
    hideSuggest()
    t.focus()
  }
  const unique = (n) => state.tree.notes.filter((x) => x.title.toLowerCase() === n.title.toLowerCase()).length === 1
  const items = [
    ...local.map((n) => el('button', { class: 'result', type: 'button', onMousedown: (ev) => ev.preventDefault(), onClick: () => pick(unique(n) ? n.title : n.path.replace(/\.md$/, '')) }, el('div', { class: 'r-title' }, n.title), el('div', { class: 'r-path' }, folderOf(n.path) || '/'))),
    ...files.map((f) => el('button', { class: 'result', type: 'button', onMousedown: (ev) => ev.preventDefault(), onClick: () => pick(f.path.split('/').pop()) }, el('div', { class: 'r-title' }, `📎 ${f.path.split('/').pop()}`), el('div', { class: 'r-path' }, folderOf(f.path) || '/'))),
  ]
  if (q && !local.some((n) => n.title.toLowerCase() === q.toLowerCase()) && !m[1]) {
    items.push(el('button', { class: 'result', type: 'button', onMousedown: (ev) => ev.preventDefault(), onClick: () => pick(q) }, el('div', { class: 'r-title' }, `✚ «${q}» (nota nueva)`)))
  }
  if (!items.length) return hideSuggest()
  items[0].setAttribute('aria-selected', 'true')
  box.replaceChildren(...items)
  box.hidden = false
  // Under the line being typed.
  const lineNo = before.split('\n').length
  const lh = parseFloat(getComputedStyle(t).lineHeight) || 24
  box.style.left = '24px'
  box.style.top = `${Math.min(t.clientHeight - 60, 24 + lineNo * lh - t.scrollTop + 4)}px`
}

function hideSuggest() {
  if (refs.suggest) refs.suggest.hidden = true
}

function attachDrop(zone, editor) {
  let hint = null
  zone.addEventListener('dragover', (ev) => {
    if (![...(ev.dataTransfer?.types ?? [])].includes('Files')) return
    ev.preventDefault()
    if (!hint) zone.append((hint = el('div', { class: 'drop-hint' }, 'Suelta para subir y enlazar')))
  })
  zone.addEventListener('dragleave', () => {
    hint?.remove()
    hint = null
  })
  zone.addEventListener('drop', (ev) => {
    hint?.remove()
    hint = null
    const files = [...(ev.dataTransfer?.files ?? [])]
    if (!files.length) return
    ev.preventDefault()
    uploadAndEmbed(files, editor)
  })
}

async function uploadAndEmbed(files, editor) {
  const folder = 'Adjuntos'
  const links = []
  for (const f of files) {
    const name = f.name || `pegado-${Date.now()}.${(f.type.split('/')[1] ?? 'bin').replace('jpeg', 'jpg')}`
    try {
      await uploadOne(f, `${folder}/${name}`)
      links.push(`![[${name}]]`)
    } catch (err) {
      toast(`${name}: ${err.message}`, 'error')
    }
  }
  await refreshTree()
  if (links.length) insertAtCursor(editor, links.join('\n'))
}

async function uploadOne(file, path) {
  const res = await fetch(`/api/file?path=${enc(path)}`, { method: 'POST', body: file, headers: { 'content-type': file.type || 'application/octet-stream' }, credentials: 'same-origin' })
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Error ${res.status}`)
}

/** Uploads from the file pickers: .md become notes, anything else a file. */
async function uploadFiles(files, folder, opts = {}) {
  if (!files.length) return
  // A zipped vault: its notes and files come in, keeping their folders.
  if (files.length === 1 && /\.zip$/i.test(files[0].name) && (await confirmBox('Importar .zip', `¿Importar las notas y archivos de «${files[0].name}»? (Si solo quieres guardar el .zip como archivo, elige Cancelar.)`, 'Importar'))) {
    toast('Importando el .zip…')
    try {
      const res = await fetch(`/api/import/zip?prefix=${enc(folder)}`, { method: 'POST', body: files[0], credentials: 'same-origin', headers: { 'content-type': 'application/zip' } })
      const r = await res.json()
      if (!res.ok) throw new Error(r.error ?? `Error ${res.status}`)
      toast(`Listo: ${r.created} notas nuevas, ${r.updated} actualizadas, ${r.unchanged} iguales, ${r.files} archivos${r.failed.length ? `, ${r.failed.length} con error` : ''}`)
    } catch (err) {
      toast(err.message, 'error')
    }
    return refreshTree()
  }
  const notes = []
  let uploaded = 0
  let failed = 0
  toast(`Subiendo ${files.length} archivo${files.length === 1 ? '' : 's'}…`)
  for (const f of files) {
    const rel = opts.keepPaths && f.webkitRelativePath ? f.webkitRelativePath : f.name
    // An Obsidian vault's own settings and the trash stay behind.
    if (/(^|\/)\.(obsidian|trash|git)(\/|$)/.test(rel) || rel.split('/').some((p) => p.startsWith('.'))) continue
    const path = [folder, rel].filter(Boolean).join('/')
    if (/\.md$/i.test(f.name)) notes.push({ path, content: await f.text() })
    else {
      try {
        await uploadOne(f, path)
        uploaded++
      } catch (err) {
        failed++
        toast(`${rel}: ${err.message}`, 'error')
      }
    }
  }
  let created = 0
  let updated = 0
  for (let i = 0; i < notes.length; i += 200) {
    const r = await act(() => api('POST', '/api/import', { notes: notes.slice(i, i + 200) }))
    created += r.created
    updated += r.updated
    failed += r.failed.length
  }
  toast(`Listo: ${created} notas nuevas, ${updated} actualizadas, ${uploaded} archivos${failed ? `, ${failed} con error` : ''}`)
  await refreshTree()
}

// ── Right panel ──────────────────────────────────────────────────────────

let localGraph = null
function renderPanel() {
  if (!refs.panel) return
  localGraph?.destroy()
  localGraph = null
  if (!state.panelOpen || !state.note || !state.info) return refs.panel.replaceChildren()
  const info = state.info
  const section = (title, count, open, ...content) => el('details', { open: store.get(`sec:${title}`, open), onToggle: (ev) => store.set(`sec:${title}`, ev.target.open) }, el('summary', {}, title, count !== null ? el('span', { class: 'count' }, count) : null), ...content)
  const item = (label, ctxText, onClick) => el('button', { class: 'item', onClick }, label, ctxText ? el('span', { class: 'ctx' }, ctxText) : null)
  const words = stripFrontmatter(state.note.content).split(/\s+/).filter(Boolean).length
  const props = Object.entries(info.properties ?? {})
  const canvas = el('canvas', { class: 'local-graph', 'aria-label': 'Grafo local' })
  refs.panel.replaceChildren(
    el('div', { style: 'display:flex;justify-content:flex-end;padding:6px' }, el('button', { class: 'icon-btn', 'aria-label': 'Cerrar panel', onClick: togglePanel }, '✕')),
    section('Enlazan aquí', info.backlinks.length, true, info.backlinks.length ? info.backlinks.map((b) => item(b.title, b.context, () => openNote(b.path))) : el('p', { class: 'muted' }, 'Ninguna nota enlaza a esta todavía.')),
    section(
      'Menciones sin enlace',
      info.mentions.length,
      false,
      info.mentions.length ? info.mentions.map((m) => item(m.title, m.context, () => openNote(m.path))) : el('p', { class: 'muted' }, 'Ninguna.'),
    ),
    section(
      'Enlaces de esta nota',
      info.outgoing.length,
      true,
      info.outgoing.length
        ? info.outgoing.map((o) => item(o.path ? titleOf(o.path) : `${o.target} (no existe)`, o.path && o.path !== `${o.target}.md` ? o.path : null, () => followLink(o.target)))
        : el('p', { class: 'muted' }, 'Escribe [[ para enlazar otra nota.'),
    ),
    section('Esquema', info.headings.length, true, info.headings.length ? info.headings.map((h) => el('button', { class: 'item', style: `padding-left:${8 + (h.level - 1) * 12}px`, onClick: () => scrollToHeading(h.text) }, h.text)) : el('p', { class: 'muted' }, 'Sin encabezados.')),
    section('Propiedades', props.length, false, props.length ? el('table', { class: 'props' }, props.map(([k, v]) => el('tr', {}, el('td', {}, k), el('td', {}, Array.isArray(v) ? v.join(', ') : String(v ?? ''))))) : el('p', { class: 'muted' }, 'Ninguna (van entre --- al inicio).')),
    section('Grafo local', null, true, canvas),
    section(
      'Información',
      null,
      false,
      el('p', { class: 'hint' }, `Creada: ${fmtDate(state.note.created_at)}`),
      el('p', { class: 'hint' }, `Cambiada: ${fmtDate(state.note.updated_at)}`),
      el('p', { class: 'hint' }, `${words} palabras · ${state.note.content.length} caracteres`),
      el('button', { class: 'btn', style: 'margin-top:8px', onClick: () => openHistory(state.note.path) }, `Historial (${info.versions})`),
    ),
  )
  // Local graph: this note, what it links to and what links to it.
  const me = state.note.path
  const ids = new Set([me, ...info.backlinks.map((b) => b.path), ...info.outgoing.filter((o) => o.path && /\.md$/.test(o.path)).map((o) => o.path)])
  const nodes = [...ids].map((id) => ({ id, title: titleOf(id), links: id === me ? ids.size : 1 }))
  const edges = [...info.backlinks.map((b) => ({ source: b.path, target: me })), ...info.outgoing.filter((o) => o.path && /\.md$/.test(o.path)).map((o) => ({ source: me, target: o.path }))]
  requestAnimationFrame(() => {
    if (canvas.isConnected) localGraph = drawGraph(canvas, { nodes, edges }, { onOpen: (id) => id !== me && openNote(id), focus: me, labels: 'always' })
  })
}

// ── Dialogs: switcher, graph, history, settings, commands ────────────────

function openSwitcher() {
  const input = el('input', { type: 'text', placeholder: 'Escribe el nombre de una nota…', 'aria-label': 'Buscar nota' })
  const list = el('div', { class: 'list', role: 'listbox' })
  let current = []
  let sel = 0
  const { close } = dialog({ title: 'Abrir nota', body: el('div', { class: 'switcher' }, input, list) })
  const score = (n, q) => {
    const t = n.title.toLowerCase()
    if (!q) return 1
    if (t === q) return 100
    if (t.startsWith(q)) return 50
    if (t.includes(q)) return 30
    if (n.path.toLowerCase().includes(q)) return 10
    // Letters in order ("vdan" → "Video Analyzer").
    let i = 0
    for (const ch of t) if (ch === q[i]) i++
    return i === q.length ? 5 : 0
  }
  const draw = () => {
    const q = input.value.trim().toLowerCase()
    current = state.tree.notes
      .map((n) => ({ n, s: score(n, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || b.n.updated_at.localeCompare(a.n.updated_at))
      .slice(0, 50)
      .map((x) => x.n)
    sel = Math.min(sel, Math.max(0, current.length - 1))
    const rows = current.map((n, i) =>
      el(
        'button',
        {
          class: 'result',
          'aria-selected': String(i === sel),
          onClick: () => {
            close()
            openNote(n.path)
          },
        },
        el('div', { class: 'r-title' }, n.title),
        el('div', { class: 'r-path' }, folderOf(n.path) || '/'),
      ),
    )
    if (q && !current.some((n) => n.title.toLowerCase() === q)) {
      rows.push(
        el(
          'button',
          {
            class: 'result',
            'aria-selected': String(sel === current.length),
            onClick: () => {
              close()
              newNote('', input.value.trim())
            },
          },
          el('div', { class: 'r-title' }, `✚ Crear «${input.value.trim()}»`),
        ),
      )
    }
    list.replaceChildren(...rows)
  }
  input.addEventListener('input', () => {
    sel = 0
    draw()
  })
  input.addEventListener('keydown', (ev) => {
    const rows = list.querySelectorAll('.result')
    if (ev.key === 'ArrowDown') sel = Math.min(rows.length - 1, sel + 1)
    else if (ev.key === 'ArrowUp') sel = Math.max(0, sel - 1)
    else if (ev.key === 'Enter') return rows[sel]?.click()
    else return
    ev.preventDefault()
    rows.forEach((r, i) => r.setAttribute('aria-selected', String(i === sel)))
    rows[sel]?.scrollIntoView({ block: 'nearest' })
  })
  draw()
  setTimeout(() => input.focus())
}

async function openGraph() {
  closeSidebarOnMobile()
  const data = await act(() => api('GET', '/api/graph'))
  const canvas = el('canvas', { class: 'graph-canvas', 'aria-label': 'Mapa de conexiones' })
  const filter = el('input', { type: 'search', placeholder: 'Filtrar…', 'aria-label': 'Filtrar notas del mapa', style: 'max-width:220px' })
  const ghosts = el('input', { type: 'checkbox', id: 'ghosts' })
  let g = null
  const draw = () => {
    g?.destroy()
    const nodes = [...data.nodes]
    const edges = [...data.edges]
    if (ghosts.checked) {
      for (const u of data.unresolved) {
        const id = `ghost:${u.target}`
        nodes.push({ id, title: u.target, links: u.from.length, ghost: true })
        for (const f of u.from) edges.push({ source: f, target: id })
      }
    }
    g = drawGraph(canvas, { nodes, edges }, {
      onOpen: (id) => {
        close()
        if (id.startsWith('ghost:')) followLink(id.slice(6))
        else openNote(id)
      },
      focus: state.note?.path,
    })
    if (filter.value) g.filter(filter.value)
  }
  filter.addEventListener('input', () => g?.filter(filter.value))
  ghosts.addEventListener('change', draw)
  const { d, close } = dialog({
    title: `Mapa de conexiones · ${data.nodes.length} notas, ${data.edges.length} enlaces`,
    className: 'graph-dlg',
    body: el('div', { style: 'display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:8px' }, filter, el('label', { style: 'display:flex;gap:6px;align-items:center' }, ghosts, `Mostrar notas que aún no existen (${data.unresolved.length})`)),
    onClose: () => g?.destroy(),
  })
  d.querySelector('.dlg').append(canvas)
  requestAnimationFrame(draw)
}

async function openHistory(path) {
  const { versions } = await act(() => api('GET', `/api/versions?path=${enc(path)}`))
  const view = el('div', { class: 'view md' }, el('p', { class: 'muted' }, versions.length ? 'Elige una versión.' : 'Esta nota aún no tiene versiones anteriores.'))
  let chosen = null
  const restoreBtn = el('button', { class: 'btn primary', disabled: true }, 'Restaurar esta versión')
  const list = el(
    'div',
    { class: 'list' },
    versions.map((v) =>
      el(
        'button',
        {
          class: 'result',
          onClick: async (ev) => {
            list.querySelectorAll('.result').forEach((r) => r.setAttribute('aria-selected', 'false'))
            ev.currentTarget.setAttribute('aria-selected', 'true')
            const { version } = await api('GET', `/api/version?id=${v.id}`)
            chosen = version
            view.replaceChildren(...toDom(render(version.content), { depth: 1, sourcePath: path }))
            restoreBtn.disabled = false
          },
        },
        el('div', { class: 'r-title' }, fmtDate(v.saved_at)),
        el('div', { class: 'r-path' }, `${{ web: 'desde la app', mcp: 'por Claude', api: 'por un script', import: 'importada', rename: 'al renombrar' }[v.source] ?? v.source} · ${v.size} caracteres`),
      ),
    ),
  )
  restoreBtn.addEventListener('click', async () => {
    if (!chosen) return
    // The current content becomes a version too: restoring never loses anything.
    const { note } = await api('GET', `/api/note?path=${enc(path)}`)
    await act(() => api('PUT', '/api/note', { path, content: chosen.content, base_updated_at: note.updated_at }), 'Versión restaurada (la anterior quedó en el historial)')
    close()
    await openNote(path)
  })
  const { close } = dialog({ title: `Historial · ${titleOf(path)}`, body: el('div', { class: 'versions' }, list, view) })
  close && list.parentElement.parentElement.after(el('div', { class: 'dlg-foot' }, restoreBtn))
}

function openSettings() {
  const s = state.tree.settings
  const folder = el('input', { type: 'text', value: s.daily.folder, 'aria-label': 'Carpeta de las notas del día' })
  const templates = state.tree.notes.filter((n) => n.path.startsWith('Plantillas/'))
  const tpl = el('select', { 'aria-label': 'Plantilla de la nota del día' }, el('option', { value: '' }, '(ninguna)'), templates.map((t) => el('option', { value: t.path, selected: s.daily.template === t.path }, t.title)))
  const theme = el(
    'select',
    { 'aria-label': 'Tema' },
    [
      ['', 'Como el sistema'],
      ['light', 'Claro'],
      ['dark', 'Oscuro'],
    ].map(([v, l]) => el('option', { value: v, selected: store.get('theme', '') === v }, l)),
  )
  const mcpUrl = `${location.origin}/mcp`
  dialog({
    title: 'Ajustes',
    body: el(
      'div',
      { style: 'display:flex;flex-direction:column;gap:14px' },
      el('label', { style: 'display:flex;flex-direction:column;gap:6px' }, 'Carpeta de las notas del día', folder),
      el('label', { style: 'display:flex;flex-direction:column;gap:6px' }, 'Plantilla de la nota del día (notas de la carpeta «Plantillas»)', tpl),
      el('label', { style: 'display:flex;flex-direction:column;gap:6px' }, 'Tema', theme),
      el(
        'div',
        {},
        el('strong', {}, 'Conectar con Claude'),
        el('p', { class: 'hint' }, 'En claude.ai → Ajustes → Conectores → Añadir conector personalizado, pega esta dirección. Te pedirá esta misma contraseña.'),
        el('div', { style: 'display:flex;gap:6px' }, el('input', { type: 'text', readonly: true, value: mcpUrl, 'aria-label': 'Dirección del conector' }), el('button', { class: 'btn', onClick: () => copy(mcpUrl) }, 'Copiar')),
      ),
      keysSection(),
      githubSection(),
    ),
    actions: [
      {
        label: 'Cerrar sesión',
        kind: 'danger',
        run: async (c) => {
          c()
          await api('POST', '/api/logout', {})
          location.href = '/'
        },
      },
      {
        label: 'Guardar',
        kind: 'primary',
        run: async (c) => {
          store.set('theme', theme.value)
          applyTheme()
          const { settings } = await act(() => api('PUT', '/api/settings', { daily: { folder: folder.value.trim() || 'Diario', template: tpl.value || null } }), 'Ajustes guardados')
          state.tree.settings = settings
          c()
        },
      },
    ],
  })
}

/** Access keys for scripts and other apps, such as Video Analyzer. */
function keysSection() {
  const list = el('div', {}, el('p', { class: 'muted' }, 'Cargando…'))
  const shown = el('div')
  const load = async () => {
    const { keys } = await api('GET', '/api/keys')
    list.replaceChildren(
      ...(keys.length
        ? keys.map((k) =>
            el(
              'div',
              { class: 'tree-row' },
              el('span', { class: 'tree-item' }, el('span', { class: 'name' }, `${k.name} · …${k.hint}`), el('span', { class: 'count' }, new Date(k.created_at).toLocaleDateString('es-MX'))),
              el(
                'button',
                {
                  class: 'btn danger',
                  onClick: async () => {
                    if (!(await confirmBox('Borrar clave', `Lo que use «${k.name}» dejará de poder entrar.`, 'Borrar'))) return
                    await act(() => api('DELETE', `/api/keys?id=${enc(k.id)}`), 'Clave borrada')
                    load()
                  },
                },
                'Borrar',
              ),
            ),
          )
        : [el('p', { class: 'muted' }, 'Ninguna todavía.')]),
    )
  }
  load().catch((err) => list.replaceChildren(el('p', { class: 'error' }, err.message)))
  return el(
    'div',
    {},
    el('strong', {}, 'Claves de acceso'),
    el('p', { class: 'hint' }, 'Para que otras apps (por ejemplo Video Analyzer) guarden notas aquí. Cada clave se muestra completa una sola vez.'),
    list,
    shown,
    el(
      'button',
      {
        class: 'btn',
        style: 'margin-top:6px',
        onClick: async () => {
          const name = await ask('Nueva clave', '¿Para qué es? (por ejemplo «Video Analyzer»)', 'Video Analyzer')
          if (!name) return
          const { key } = await act(() => api('POST', '/api/keys', { name }))
          shown.replaceChildren(
            el('p', { class: 'hint', style: 'margin-top:8px' }, 'Cópiala ahora; después solo se verán sus últimas letras:'),
            el('div', { style: 'display:flex;gap:6px' }, el('input', { type: 'text', readonly: true, value: key, 'aria-label': 'Clave nueva' }), el('button', { class: 'btn primary', onClick: () => copy(key) }, 'Copiar')),
          )
          load()
        },
      },
      '✚ Crear clave',
    ),
  )
}

/** Brings a public GitHub repository (an Obsidian vault) into Memoria. */
function githubSection() {
  const repo = el('input', { type: 'text', placeholder: 'usuario/repositorio', 'aria-label': 'Repositorio de GitHub', value: 'sanmiguelyt955/memoria-claude' })
  const out = el('p', { class: 'hint' })
  const btn = el(
    'button',
    {
      class: 'btn',
      onClick: async () => {
        btn.disabled = true
        out.textContent = 'Importando… puede tardar un minuto.'
        try {
          const r = await api('POST', '/api/import/github', { repo: repo.value })
          out.textContent = `Listo: ${r.created} notas nuevas, ${r.updated} actualizadas, ${r.unchanged} iguales, ${r.files} archivos${r.failed.length ? `, ${r.failed.length} con error` : ''}.`
          await refreshTree()
        } catch (err) {
          out.textContent = err.message
        } finally {
          btn.disabled = false
        }
      },
    },
    'Importar',
  )
  return el(
    'div',
    {},
    el('strong', {}, 'Importar desde GitHub'),
    el('p', { class: 'hint' }, 'Trae las notas y archivos de un repositorio público (por ejemplo una bóveda de Obsidian). Las notas iguales se saltan; las distintas reemplazan a las de aquí, que quedan en el historial.'),
    el('div', { style: 'display:flex;gap:6px' }, repo, btn),
    out,
  )
}

function applyTheme() {
  const t = store.get('theme', '')
  if (t) document.documentElement.dataset.theme = t
  else delete document.documentElement.dataset.theme
}

function openCommands() {
  const commands = [
    ['Nueva nota', () => newNote(currentFolder())],
    ['Nueva carpeta', () => newFolder(currentFolder())],
    ['Nota del día', openDaily],
    ['Abrir nota rápidamente', openSwitcher],
    ['Buscar en todas las notas', () => searchFor('')],
    ['Mapa de conexiones', openGraph],
    ['Cambiar a Leer', () => setMode('read')],
    ['Cambiar a Editar', () => setMode('edit')],
    ['Cambiar a Ambos', () => setMode('split')],
    ['Mostrar u ocultar conexiones', togglePanel],
    ['Historial de esta nota', () => state.note && openHistory(state.note.path)],
    ['Renombrar esta nota', () => state.note && renamePrompt(state.note.path)],
    ['Marcar o desmarcar esta nota', () => state.note && toggleBookmark(state.note.path)],
    ['Mandar esta nota a la papelera', () => state.note && trash(state.note.path)],
    ['Exportar todo (.zip)', () => (location.href = '/api/export')],
    ['Ajustes', openSettings],
  ]
  menu('Comandos', commands.map(([label, run]) => ({ label, run })))
}

// ── Keyboard ─────────────────────────────────────────────────────────────

document.addEventListener('keydown', (ev) => {
  if (!state.signedIn || !refs.app?.isConnected) return
  const mod = ev.ctrlKey || ev.metaKey
  const k = ev.key.toLowerCase()
  if (mod && k === 's') {
    ev.preventDefault()
    saveNow()
  } else if (mod && k === 'o') {
    ev.preventDefault()
    openSwitcher()
  } else if (mod && k === 'p') {
    ev.preventDefault()
    openCommands()
  } else if (mod && k === 'e') {
    ev.preventDefault()
    setMode(state.mode === 'edit' ? 'read' : 'edit')
  } else if (mod && ev.shiftKey && k === 'f') {
    ev.preventDefault()
    searchFor(state.searchQuery)
  } else if (ev.altKey && k === 'n') {
    ev.preventDefault()
    newNote(currentFolder())
  } else if (ev.altKey && k === 'd') {
    ev.preventDefault()
    openDaily()
  } else if (ev.altKey && k === 'g') {
    ev.preventDefault()
    openGraph()
  } else if (ev.altKey && k === 'b') {
    ev.preventDefault()
    togglePanel()
  }
})

// Another tab or Claude may have changed things: refresh when coming back.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !state.signedIn || !refs.app?.isConnected) return
  try {
    await refreshTree()
    if (state.note && !state.dirty) {
      const { note } = await api('GET', `/api/note?path=${enc(state.note.path)}`)
      if (note.updated_at !== state.note.updated_at) await openNote(note.path, { push: false })
    }
  } catch {
    /* offline: keep what is on screen */
  }
})

boot()
