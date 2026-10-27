import { test } from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error plain JS module shared with the browser
import { render, inline, textOf, parseLinkInner, slug } from '../public/js/render.js'

const json = (x: unknown) => JSON.parse(JSON.stringify(x))

test('headings, paragraphs with line breaks, emphasis, highlight, strike, code', () => {
  const out = render('# Título *uno*\nLínea **negrita** y ==marca== ~~no~~ `[[código]]`\nsegunda\n\nOtro párrafo')
  assert.equal(out[0].t, 'h1')
  assert.equal(out[0].a.id, 'titulo-uno')
  assert.equal(out[1].t, 'p')
  assert.deepEqual(out[1].c.map((c: any) => (typeof c === 'string' ? c : c.t)), ['Línea ', 'strong', ' y ', 'mark', ' ', 'del', ' ', 'code', 'br', 'segunda'])
  assert.equal(textOf([out[1].c[7]]), '[[código]]', 'links inside code stay text')
  assert.equal(out[2].t, 'p')
})

test('frontmatter is hidden and lines still map to the note for tasks', () => {
  const md = '---\ntags: [a]\n---\n- [ ] uno\n- [x] dos\n  - [ ] anidada\n'
  const [ul] = render(md)
  assert.equal(ul.t, 'ul')
  const boxes = JSON.stringify(ul).match(/"data-line":"(\d+)"/g)
  assert.deepEqual(boxes, ['"data-line":"3"', '"data-line":"4"', '"data-line":"5"'])
  assert.ok('checked' in ul.c[1].c[0].a)
})

test('wikilinks, aliases, headings, embeds with size, tags, external links only http(s)/mailto', () => {
  const nodes = json(inline('[[Nota#Parte|ver]] ![[foto.png|300]] ![[Otra nota]] #proyecto/app #12 [x](javascript:alert(1)) [y](https://a.b) https://c.d/e. snake_case_name'))
  const a = nodes[0]
  assert.deepEqual([a.t, a.a['data-target'], a.a['data-subpath'], a.c[0]], ['a', 'Nota', '#Parte', 'ver'])
  assert.deepEqual([nodes[2].a['data-kind'], nodes[2].a['data-width']], ['image', '300'])
  assert.equal(nodes[4].a['data-kind'], 'note')
  assert.equal(nodes[6].a['data-tag'], 'proyecto/app')
  assert.ok(!JSON.stringify(nodes).includes('javascript:'), 'no javascript: link')
  assert.ok(JSON.stringify(nodes).includes('"href":"https://a.b"'))
  assert.ok(JSON.stringify(nodes).includes('"href":"https://c.d/e"'), 'trailing dot not in the link')
  assert.ok(JSON.stringify(nodes).includes('snake_case_name'), 'no emphasis inside words')
  assert.ok(!JSON.stringify(nodes).includes('"data-tag":"12"'))
})

test('callouts (foldable too), quotes, tables with alignment, ordered lists, rules, comments', () => {
  const out = json(render('> [!warning]- Cuidado\n> texto\n\n> cita\n\n| a | b |\n|:-|-:|\n| 1 | 2 |\n\n3. tres\n4. cuatro\n\n---\n%% oculto %%\nvisible'))
  assert.deepEqual([out[0].t, out[0].a.class], ['details', 'callout callout-warning'])
  assert.equal(out[1].t, 'blockquote')
  assert.equal(out[2].c[0].t, 'table')
  assert.equal(out[2].c[0].c[0].c[0].c[1].a.style, 'text-align:right')
  assert.deepEqual([out[3].t, out[3].a.start], ['ol', '3'])
  assert.equal(out[4].t, 'hr')
  assert.equal(textOf(out.slice(5)), 'visible')
})

test('code blocks keep their text and language', () => {
  const [pre] = render('```js\nconst a = "<b>"\n```')
  assert.deepEqual([pre.t, pre.a['data-lang'], pre.c[0].c[0]], ['pre', 'js', 'const a = "<b>"'])
})

test('helpers', () => {
  assert.deepEqual(parseLinkInner('A/B.md#^x|t'), { target: 'A/B', subpath: '#^x', alias: 't' })
  assert.equal(slug('¿Qué tal? Año 2026'), 'que-tal-ano-2026')
})
