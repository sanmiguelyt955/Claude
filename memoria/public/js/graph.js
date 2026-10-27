// Graph view on a <canvas>: a small force simulation (repulsion between all
// nodes, springs along links, a pull to the centre), with pan, zoom, hover
// labels and click to open. Used full-screen and as the local graph.

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ nodes: Array<{id:string,title:string,links:number,ghost?:boolean}>, edges: Array<{source:string,target:string}> }} data
 * @param {{ onOpen: (id: string) => void, focus?: string, labels?: 'always'|'hover'|'auto' }} opts
 */
export function drawGraph(canvas, data, opts) {
  const ctx = canvas.getContext('2d')
  const css = getComputedStyle(document.documentElement)
  const color = (v) => css.getPropertyValue(v).trim() || '#888'
  const index = new Map()
  const nodes = data.nodes.map((n, i) => {
    const angle = i * 2.399963
    const r = 12 * Math.sqrt(i + 1)
    const node = { ...n, x: Math.cos(angle) * r, y: Math.sin(angle) * r, vx: 0, vy: 0 }
    index.set(n.id, node)
    return node
  })
  const edges = data.edges.map((e) => ({ s: index.get(e.source), t: index.get(e.target) })).filter((e) => e.s && e.t)
  const neighbours = new Map(nodes.map((n) => [n.id, new Set()]))
  for (const e of edges) {
    neighbours.get(e.s.id).add(e.t.id)
    neighbours.get(e.t.id).add(e.s.id)
  }
  let view = { x: 0, y: 0, k: 1 }
  let hover = null
  let alpha = 1
  let raf = 0
  let dragging = null
  let dpr = window.devicePixelRatio || 1

  const radius = (n) => 3.5 + Math.sqrt(n.links || 0) * 2.2

  function resize() {
    dpr = window.devicePixelRatio || 1
    const r = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, r.width * dpr)
    canvas.height = Math.max(1, r.height * dpr)
    draw()
  }

  function step() {
    const n = nodes.length
    const repulse = 900
    for (let i = 0; i < n; i++) {
      const a = nodes[i]
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j]
        let dx = a.x - b.x
        let dy = a.y - b.y
        let d2 = dx * dx + dy * dy
        if (d2 < 0.01) {
          dx = Math.random() - 0.5
          dy = Math.random() - 0.5
          d2 = 0.5
        }
        if (d2 > 250000) continue
        const f = (repulse * alpha) / d2
        const fx = dx * f
        const fy = dy * f
        a.vx += fx
        a.vy += fy
        b.vx -= fx
        b.vy -= fy
      }
    }
    for (const e of edges) {
      const dx = e.t.x - e.s.x
      const dy = e.t.y - e.s.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      const f = ((d - 60) / d) * 0.06 * alpha
      e.s.vx += dx * f
      e.s.vy += dy * f
      e.t.vx -= dx * f
      e.t.vy -= dy * f
    }
    for (const a of nodes) {
      a.vx -= a.x * 0.012 * alpha
      a.vy -= a.y * 0.012 * alpha
      if (a === dragging) continue
      a.vx *= 0.6
      a.vy *= 0.6
      a.x += a.vx
      a.y += a.vy
    }
    alpha *= 0.985
  }

  function toScreen(x, y) {
    return [(x * view.k + view.x) * dpr + canvas.width / 2, (y * view.k + view.y) * dpr + canvas.height / 2]
  }
  function toWorld(sx, sy) {
    return [((sx * dpr - canvas.width / 2) / dpr - view.x) / view.k, ((sy * dpr - canvas.height / 2) / dpr - view.y) / view.k]
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const near = hover ? neighbours.get(hover.id) : null
    ctx.lineWidth = 1 * dpr
    for (const e of edges) {
      if (e.s.hidden || e.t.hidden) continue
      const lit = hover && (e.s === hover || e.t === hover)
      ctx.strokeStyle = lit ? color('--accent') : color('--line')
      ctx.globalAlpha = hover && !lit ? 0.35 : 1
      const [x1, y1] = toScreen(e.s.x, e.s.y)
      const [x2, y2] = toScreen(e.t.x, e.t.y)
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
    const showAll = opts.labels === 'always' || (opts.labels !== 'hover' && view.k > 1.4) || nodes.length < 25
    ctx.font = `${12 * dpr}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    for (const n of nodes) {
      if (n.hidden) continue
      const [x, y] = toScreen(n.x, n.y)
      const dim = hover && n !== hover && !near.has(n.id)
      ctx.globalAlpha = dim ? 0.3 : 1
      ctx.fillStyle = n.id === opts.focus || n === hover ? color('--accent') : n.ghost ? color('--ink-soft') : color('--ink')
      ctx.beginPath()
      ctx.arc(x, y, radius(n) * dpr * Math.max(0.6, Math.min(view.k, 2)), 0, Math.PI * 2)
      ctx.fill()
      if (showAll || n === hover || n.id === opts.focus || (near && near.has(n.id))) {
        ctx.fillStyle = color('--ink-soft')
        ctx.fillText(n.title, x, y + (radius(n) + 13) * dpr)
      }
    }
    ctx.globalAlpha = 1
  }

  function loop() {
    if (alpha > 0.02 || dragging) {
      step()
      step()
    }
    draw()
    raf = alpha > 0.02 || dragging ? requestAnimationFrame(loop) : 0
  }
  const kick = (a = 0.3) => {
    alpha = Math.max(alpha, a)
    if (!raf) raf = requestAnimationFrame(loop)
  }

  function pick(ev) {
    const r = canvas.getBoundingClientRect()
    const [wx, wy] = toWorld(ev.clientX - r.left, ev.clientY - r.top)
    let best = null
    let bestD = Infinity
    for (const n of nodes) {
      if (n.hidden) continue
      const d = (n.x - wx) ** 2 + (n.y - wy) ** 2
      const hit = (radius(n) + 6 / view.k) ** 2
      if (d < hit && d < bestD) {
        best = n
        bestD = d
      }
    }
    return best
  }

  let panStart = null
  let moved = false
  canvas.addEventListener('pointerdown', (ev) => {
    canvas.setPointerCapture(ev.pointerId)
    moved = false
    const n = pick(ev)
    if (n) {
      dragging = n
      kick(0.25)
    } else panStart = { x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y }
  })
  canvas.addEventListener('pointermove', (ev) => {
    if (dragging) {
      const r = canvas.getBoundingClientRect()
      const [wx, wy] = toWorld(ev.clientX - r.left, ev.clientY - r.top)
      dragging.x = wx
      dragging.y = wy
      moved = true
      return
    }
    if (panStart) {
      view.x = panStart.vx + (ev.clientX - panStart.x) / 1
      view.y = panStart.vy + (ev.clientY - panStart.y) / 1
      moved = moved || Math.abs(ev.clientX - panStart.x) + Math.abs(ev.clientY - panStart.y) > 3
      draw()
      return
    }
    const n = pick(ev)
    if (n !== hover) {
      hover = n
      canvas.style.cursor = n ? 'pointer' : 'grab'
      canvas.title = n ? n.title : ''
      draw()
    }
  })
  canvas.addEventListener('pointerup', (ev) => {
    const n = dragging
    dragging = null
    panStart = null
    if (n && !moved) opts.onOpen(n.id)
    else if (!n && !moved) {
      const hit = pick(ev)
      if (hit) opts.onOpen(hit.id)
    }
  })
  canvas.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault()
      const r = canvas.getBoundingClientRect()
      const mx = ev.clientX - r.left - r.width / 2
      const my = ev.clientY - r.top - r.height / 2
      const factor = Math.exp(-ev.deltaY * 0.0015)
      const k = Math.min(6, Math.max(0.15, view.k * factor))
      view.x = mx - ((mx - view.x) * k) / view.k
      view.y = my - ((my - view.y) * k) / view.k
      view.k = k
      draw()
    },
    { passive: false },
  )
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  resize()
  kick(1)
  return {
    destroy() {
      cancelAnimationFrame(raf)
      ro.disconnect()
    },
    /** Shows only the nodes whose title contains `q` (and their links). */
    filter(q) {
      const term = q.trim().toLowerCase()
      for (const n of nodes) n.hidden = term && !n.title.toLowerCase().includes(term)
      draw()
    },
  }
}
