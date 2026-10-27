import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanPath, extractHeadings, extractLinks, extractTags, notePath, resolveLink, rewriteLinks, snippet, splitFrontmatter, titleOf } from '../src/parse.ts'
import { fillTemplate } from '../src/store.ts'
import { crc32, zip } from '../src/zip.ts'

test('paths are cleaned and cannot leave the vault', () => {
  assert.equal(notePath('\\Proyectos\\ Video Analyzer '), 'Proyectos/Video Analyzer.md')
  assert.equal(notePath('a/./b.md'), 'a/b.md')
  assert.throws(() => cleanPath('../secreto'), /no válida/)
  assert.throws(() => cleanPath('.git/config'), /no válida/)
  assert.throws(() => cleanPath('a/<b>'), /no permitidos/)
  assert.throws(() => cleanPath('  /  '), /vacía/)
  assert.equal(titleOf('Carpeta/Mi nota.md'), 'Mi nota')
})

test('frontmatter: values, inline lists and dash lists', () => {
  const { data, body } = splitFrontmatter('---\ntitle: "Hola: mundo"\ntags:\n  - brain\n  - north-star\naliases: [Goals, "Focus"]\ndraft: true\nn: 3\nempty:\n---\n# Cuerpo\n')
  assert.deepEqual(data, { title: 'Hola: mundo', tags: ['brain', 'north-star'], aliases: ['Goals', 'Focus'], draft: true, n: 3, empty: null })
  assert.equal(body, '# Cuerpo\n')
  assert.deepEqual(splitFrontmatter('sin frontmatter').data, {})
})

test('links and embeds, with heading, block and alias; none inside code', () => {
  const links = extractLinks('Ver [[Nota]], [[Carpeta/Otra#Título|texto]] y ![[foto.png]] o [[#Sección]].\n`[[no]]`\n```\n[[tampoco]]\n```\n[[Bloque#^abc]]')
  assert.deepEqual(links, [
    { target: 'Nota', subpath: null, alias: null, embed: false },
    { target: 'Carpeta/Otra', subpath: '#Título', alias: 'texto', embed: false },
    { target: 'foto.png', subpath: null, alias: null, embed: true },
    { target: '', subpath: '#Sección', alias: null, embed: false },
    { target: 'Bloque', subpath: '#^abc', alias: null, embed: false },
  ])
})

test('tags from frontmatter and text, nested, not numbers, headings or code', () => {
  const tags = extractTags('---\ntags: [Brain, "#index"]\n---\n# Título\nTexto #Proyecto/video y #idea, #123 no.\n`#codigo` url.com/#ancla\n')
  assert.deepEqual(tags.sort(), ['brain', 'idea', 'index', 'proyecto/video'])
})

test('headings with their line, after frontmatter', () => {
  const h = extractHeadings('---\na: 1\n---\n# Uno\ntexto\n## Dos ##\n```\n# no\n```\n')
  assert.deepEqual(h.map((x) => [x.level, x.text]), [[1, 'Uno'], [2, 'Dos']])
})

test('links resolve like Obsidian: path, path suffix, title anywhere (shortest first), case-insensitive', () => {
  const paths = ['Nota.md', 'Archivo/Nota.md', 'Proyectos/Video Analyzer.md', 'a/b/Video Analyzer.md']
  assert.equal(resolveLink('nota', paths), 'Nota.md')
  assert.equal(resolveLink('Archivo/Nota', paths), 'Archivo/Nota.md')
  assert.equal(resolveLink('video analyzer', paths), 'Proyectos/Video Analyzer.md')
  assert.equal(resolveLink('b/Video Analyzer', paths), 'a/b/Video Analyzer.md')
  assert.equal(resolveLink('Nada', paths), null)
  assert.equal(resolveLink('Nota.md', paths), 'Nota.md')
})

test('renaming rewrites only links to that note, keeping heading and alias, and not inside code', () => {
  const content = 'Ver [[Vieja]], [[vieja#Parte|aquí]] y ![[Vieja]].\nNo [[Otra]].\n`[[Vieja]]`\n'
  const after = ['Nueva.md', 'Otra.md']
  assert.equal(rewriteLinks(content, 'Vieja.md', 'Nueva.md', after), 'Ver [[Nueva]], [[Nueva#Parte|aquí]] y ![[Nueva]].\nNo [[Otra]].\n`[[Vieja]]`\n')
  // A title used twice is written as a path.
  assert.equal(rewriteLinks('[[Vieja]]', 'Vieja.md', 'B/Otra.md', ['Otra.md', 'B/Otra.md']), '[[B/Otra]]')
})

test('a snippet is centred on the first word found, accents ignored', () => {
  const s = snippet(`---\na: 1\n---\n${'relleno '.repeat(40)}La impresión 3D cambió todo. ${'más '.repeat(40)}`, 'IMPRESION')
  assert.match(s, /^….*La impresión 3D cambió todo/)
})

test('templates fill title, date, time and formats', () => {
  const at = new Date('2026-10-27T18:05:09Z')
  assert.equal(fillTemplate('# {{title}} {{date}} {{time}} {{date:DD/MM/YYYY HH:mm:ss}}', 'Hoy', at, 'UTC'), '# Hoy 2026-10-27 18:05 27/10/2026 18:05:09')
})

test('the zip has every file intact', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926)
  const z = zip([{ path: 'Carpeta/Ñandú.md', data: new TextEncoder().encode('hola'), modified: new Date('2026-01-02T03:04:06Z') }])
  const v = new DataView(z.buffer)
  assert.equal(v.getUint32(0, true), 0x04034b50)
  assert.equal(v.getUint32(z.length - 22, true), 0x06054b50)
  assert.equal(v.getUint16(z.length - 22 + 10, true), 1)
  const name = new TextDecoder().decode(z.subarray(30, 30 + v.getUint16(26, true)))
  assert.equal(name, 'Carpeta/Ñandú.md')
})

test('unzip reads stored and deflated entries (Python zipfile) and refuses what is not a zip', async () => {
  const { unzip } = await import('../src/zip.ts')
  const { execFileSync } = await import('node:child_process')
  const { mkdtempSync, readFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const path = await import('node:path')
  const dir = mkdtempSync(path.join(tmpdir(), 'unzip-'))
  const file = path.join(dir, 'v.zip')
  execFileSync('python3', ['-I', '-c', `import zipfile
z = zipfile.ZipFile(${JSON.stringify(file)}, 'w')
z.writestr('Bóveda/Nota.md', '# Hola ñ\\n' * 500, compress_type=zipfile.ZIP_DEFLATED)
z.writestr('Bóveda/img.bin', bytes(range(256)) * 10, compress_type=zipfile.ZIP_STORED)
z.writestr('Bóveda/carpeta/', '')
z.close()`])
  const entries = await unzip(new Uint8Array(readFileSync(file)))
  assert.deepEqual(entries.map((e) => e.path), ['Bóveda/Nota.md', 'Bóveda/img.bin'])
  assert.equal(new TextDecoder().decode(entries[0]!.data), '# Hola ñ\n'.repeat(500))
  assert.equal(entries[1]!.data.length, 2560)
  // Our own zip reads back too.
  const again = await unzip(zip([{ path: 'a/b.md', data: new TextEncoder().encode('x') }]))
  assert.deepEqual(again.map((e) => [e.path, new TextDecoder().decode(e.data)]), [['a/b.md', 'x']])
  await assert.rejects(unzip(new TextEncoder().encode('no soy un zip')), /No es un archivo \.zip válido/)
})
