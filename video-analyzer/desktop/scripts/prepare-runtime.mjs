// Builds desktop/runtime/: everything the installed app needs, for the
// platform this script runs on (CI runs it once on Windows and once on Mac):
//
//   runtime/node/      official Node.js (runs the web server and the worker)
//   runtime/python/    portable CPython with NumPy (our Whisper)
//   runtime/ffmpeg/    ffmpeg + ffprobe
//   runtime/app/web/   the Next.js standalone server
//   runtime/app/worker/worker.mjs, migrate.mjs   the worker, bundled
//   runtime/app/migrations, scripts, node_modules  what the bundle loads
//
// Prerequisite: in video-analyzer/, `npm ci` and `NEXT_OUTPUT=standalone npm run build`.
// The native modules (better-sqlite3, sqlite-vec) come from that `npm ci`, built
// for Node 22, which is why the Node shipped here is also 22.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = path.resolve(DESKTOP, '..') // video-analyzer/
const RUNTIME = path.join(DESKTOP, 'runtime')
const CACHE = path.join(DESKTOP, '.cache')
const require = createRequire(import.meta.url)
const rootRequire = createRequire(path.join(ROOT, 'package.json'))

const NODE_VERSION = '22.22.0'
const PYTHON = { release: '20241206', version: '3.12.8' }

const platform = process.platform
const arch = process.arch
const isWin = platform === 'win32'

const NODE_DIST = {
  'win32-x64': `node-v${NODE_VERSION}-win-x64.zip`,
  'darwin-arm64': `node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
  'darwin-x64': `node-v${NODE_VERSION}-darwin-x64.tar.gz`,
  'linux-x64': `node-v${NODE_VERSION}-linux-x64.tar.xz`,
}
const PYTHON_TRIPLE = {
  'win32-x64': 'x86_64-pc-windows-msvc',
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
}
const key = `${platform}-${arch}`
if (!NODE_DIST[key]) throw new Error(`Plataforma no soportada: ${key}`)

const step = (msg) => console.log(`\n> ${msg}`)
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts })

async function download(url) {
  fs.mkdirSync(CACHE, { recursive: true })
  const file = path.join(CACHE, decodeURIComponent(path.basename(new URL(url).pathname)))
  if (fs.existsSync(file)) return file
  console.log(`  descargando ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Descarga fallida (${res.status}): ${url}`)
  fs.writeFileSync(`${file}.part`, Buffer.from(await res.arrayBuffer()))
  fs.renameSync(`${file}.part`, file)
  return file
}

// bsdtar (Windows 10+, Mac) and GNU tar (Linux) both extract these archives.
// On Windows the system tar.exe is used by full path: the GNU tar that Git
// puts on PATH cannot open .zip files and reads "C:" as a remote host.
function extract(archive, dest) {
  fs.mkdirSync(dest, { recursive: true })
  const tar = isWin ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
  sh(tar, ['-xf', archive, '-C', dest])
}

const copy = (from, to, filter) => fs.cpSync(from, to, { recursive: true, dereference: true, filter })

async function prepareNode() {
  step(`Node ${NODE_VERSION}`)
  const archive = await download(`https://nodejs.org/dist/v${NODE_VERSION}/${NODE_DIST[key]}`)
  const tmp = path.join(CACHE, 'node-extract')
  fs.rmSync(tmp, { recursive: true, force: true })
  extract(archive, tmp)
  const top = path.join(tmp, fs.readdirSync(tmp)[0])
  const dest = path.join(RUNTIME, 'node')
  if (isWin) {
    fs.mkdirSync(dest, { recursive: true })
    fs.copyFileSync(path.join(top, 'node.exe'), path.join(dest, 'node.exe'))
  } else {
    fs.mkdirSync(path.join(dest, 'bin'), { recursive: true })
    fs.copyFileSync(path.join(top, 'bin', 'node'), path.join(dest, 'bin', 'node'))
    fs.chmodSync(path.join(dest, 'bin', 'node'), 0o755)
  }
}

async function preparePython() {
  step(`Python ${PYTHON.version} portátil + dependencias de Whisper`)
  const name = `cpython-${PYTHON.version}+${PYTHON.release}-${PYTHON_TRIPLE[key]}-install_only.tar.gz`
  const archive = await download(
    `https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON.release}/${encodeURIComponent(name)}`,
  )
  extract(archive, RUNTIME) // the archive's top folder is "python/"
  const python = isWin ? path.join(RUNTIME, 'python', 'python.exe') : path.join(RUNTIME, 'python', 'bin', 'python3')
  const requirements = path.join(ROOT, 'packages', 'perception', 'scripts', 'requirements.txt')
  sh(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-cache-dir', '-q', '-r', requirements])
  sh(python, ['-c', 'import numpy, huggingface_hub; print("  numpy", numpy.__version__)'])
  trimPython()
}

// Parts of the standard distribution the app never uses at run time (pip is
// only needed above, to install the dependencies).
function trimPython() {
  const base = path.join(RUNTIME, 'python')
  const stdlib = isWin ? path.join(base, 'Lib') : path.join(base, 'lib', `python${PYTHON.version.split('.').slice(0, 2).join('.')}`)
  const drop = [
    ...['test', 'idlelib', 'tkinter', 'turtledemo', 'ensurepip'].map((d) => path.join(stdlib, d)),
    path.join(stdlib, 'site-packages', 'pip'),
    ...(isWin ? [path.join(base, 'tcl')] : ['tcl8.6', 'tk8.6', 'Tix8.4.3', 'itcl4.2.2'].map((d) => path.join(base, 'lib', d))),
  ]
  for (const dir of drop) fs.rmSync(dir, { recursive: true, force: true })
  const sitePackages = path.join(stdlib, 'site-packages')
  for (const entry of fs.existsSync(sitePackages) ? fs.readdirSync(sitePackages) : []) {
    if (/^pip-.*\.dist-info$/.test(entry)) fs.rmSync(path.join(sitePackages, entry), { recursive: true, force: true })
  }
}

function prepareFfmpeg() {
  step('FFmpeg')
  const dest = path.join(RUNTIME, 'ffmpeg')
  fs.mkdirSync(dest, { recursive: true })
  const exe = (n) => (isWin ? `${n}.exe` : n)
  fs.copyFileSync(require('ffmpeg-static'), path.join(dest, exe('ffmpeg')))
  fs.copyFileSync(require('ffprobe-static').path, path.join(dest, exe('ffprobe')))
  if (!isWin) {
    fs.chmodSync(path.join(dest, 'ffmpeg'), 0o755)
    fs.chmodSync(path.join(dest, 'ffprobe'), 0o755)
  }
}

function prepareWeb() {
  step('Servidor web (Next.js standalone)')
  const built = path.join(ROOT, 'apps', 'web', '.next')
  if (!fs.existsSync(path.join(built, 'standalone', 'apps', 'web', 'server.js'))) {
    throw new Error('Falta la compilación standalone: corre NEXT_OUTPUT=standalone npm run build en video-analyzer/')
  }
  const dest = path.join(RUNTIME, 'app', 'web')
  copy(path.join(built, 'standalone'), dest)
  copy(path.join(built, 'static'), path.join(dest, 'apps', 'web', '.next', 'static'))
  const pub = path.join(ROOT, 'apps', 'web', 'public')
  if (fs.existsSync(pub)) copy(pub, path.join(dest, 'apps', 'web', 'public'))
  // sqlite-vec loads its per-platform binary package by name at runtime, so
  // Next's file tracing misses it: copy it next to sqlite-vec.
  copyNativePackages(path.join(dest, 'node_modules'))
}

function sqliteVecPlatformPackage() {
  const os = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[platform]
  return `sqlite-vec-${os}-${arch}`
}

function copyNativePackages(nodeModules) {
  for (const pkg of ['better-sqlite3', 'sqlite-vec', sqliteVecPlatformPackage()]) {
    // Read from node_modules directly: sqlite-vec's "exports" hides its package.json.
    const from = path.join(ROOT, 'node_modules', pkg)
    if (!fs.existsSync(path.join(from, 'package.json'))) throw new Error(`Falta ${pkg} en ${ROOT}/node_modules (corre npm ci)`)
    // C/C++ sources and tests are only needed to compile; the built binary is enough.
    copy(from, path.join(nodeModules, pkg), (src) => !['deps', 'src', 'test'].includes(path.relative(from, src).split(path.sep)[0]))
  }
}

async function prepareWorker() {
  step('Worker (bundle con esbuild)')
  const esbuild = rootRequire('esbuild')
  const app = path.join(RUNTIME, 'app')
  const out = path.join(app, 'worker')
  fs.mkdirSync(out, { recursive: true })
  await esbuild.build({
    entryPoints: {
      worker: path.join(ROOT, 'apps', 'worker', 'src', 'main.ts'),
      migrate: path.join(ROOT, 'packages', 'memory-engine', 'src', 'cli', 'migrate.ts'),
    },
    outdir: out,
    outExtension: { '.js': '.mjs' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    external: ['better-sqlite3', 'sqlite-vec'],
    // ffprobe-static computes its path from __dirname, which is wrong inside a
    // bundle; the runtime passes the shipped ffprobe as FFPROBE_PATH instead.
    alias: { 'ffprobe-static': path.join(DESKTOP, 'scripts', 'ffprobe-stub.mjs') },
    // CommonJS dependencies inside an ESM bundle still expect these.
    banner: {
      js: [
        "import { createRequire as __cva_cr } from 'node:module';",
        "import { fileURLToPath as __cva_fu } from 'node:url';",
        "import { dirname as __cva_dn } from 'node:path';",
        'const require = __cva_cr(import.meta.url);',
        'const __filename = __cva_fu(import.meta.url);',
        'const __dirname = __cva_dn(__filename);',
      ].join('\n'),
    },
    logLevel: 'warning',
  })
  // Files the bundled code reads relative to itself (see each source file):
  //   memory-engine/migrate.ts  -> <bundle>/../migrations
  //   perception/transcribe.ts  -> <bundle>/../scripts/transcribe.py
  //   ai-router/protocol-v6.ts  -> <bundle>/protocol-v6.md
  copy(path.join(ROOT, 'packages', 'memory-engine', 'migrations'), path.join(app, 'migrations'))
  const scripts = path.join(ROOT, 'packages', 'perception', 'scripts')
  copy(scripts, path.join(app, 'scripts'), (src) => !/__pycache__|[\\/]tests([\\/]|$)/.test(src))
  fs.copyFileSync(path.join(ROOT, 'packages', 'ai-router', 'src', 'protocol-v6.md'), path.join(out, 'protocol-v6.md'))
  copyNativePackages(path.join(app, 'node_modules'))
  fs.copyFileSync(path.join(DESKTOP, 'child-guard.mjs'), path.join(app, 'child-guard.mjs'))
}

const started = Date.now()
fs.rmSync(RUNTIME, { recursive: true, force: true })
fs.mkdirSync(RUNTIME, { recursive: true })
await prepareNode()
await preparePython()
prepareFfmpeg()
prepareWeb()
await prepareWorker()
fs.writeFileSync(
  path.join(RUNTIME, 'manifest.json'),
  JSON.stringify({ platform: key, node: NODE_VERSION, python: PYTHON.version, builtAt: new Date().toISOString() }, null, 2),
)
console.log(`\nRuntime listo en ${RUNTIME} (${Math.round((Date.now() - started) / 1000)} s)`)
