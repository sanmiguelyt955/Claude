'use strict'

// Runs Video Analyzer from the self-contained runtime/ folder built by
// scripts/prepare-runtime.mjs: its own Node, Python (for Whisper) and FFmpeg,
// the compiled web app and the bundled worker. Used by the Electron window
// (main.js) and by the CI smoke test (scripts/smoke.mjs), so both run the
// exact same thing.

const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')
const { spawn } = require('node:child_process')

const isWin = process.platform === 'win32'

function runtimePaths(runtimeDir) {
  const exe = (name) => (isWin ? `${name}.exe` : name)
  return {
    node: isWin ? path.join(runtimeDir, 'node', 'node.exe') : path.join(runtimeDir, 'node', 'bin', 'node'),
    python: isWin ? path.join(runtimeDir, 'python', 'python.exe') : path.join(runtimeDir, 'python', 'bin', 'python3'),
    ffmpeg: path.join(runtimeDir, 'ffmpeg', exe('ffmpeg')),
    ffprobe: path.join(runtimeDir, 'ffmpeg', exe('ffprobe')),
    webServer: path.join(runtimeDir, 'app', 'web', 'apps', 'web', 'server.js'),
    worker: path.join(runtimeDir, 'app', 'worker', 'worker.mjs'),
    migrate: path.join(runtimeDir, 'app', 'worker', 'migrate.mjs'),
    guard: path.join(runtimeDir, 'app', 'child-guard.mjs'),
  }
}

/** Parses a KEY=VALUE file (the user's configuration); # starts a comment. */
function readEnvFile(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && m[2] !== '') out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

function waitForPort(port, timeoutMs, isDead) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      if (isDead()) return reject(new Error('El servidor web se cerró al arrancar.'))
      const socket = net.connect(port, '127.0.0.1')
      socket.once('connect', () => { socket.end(); resolve() })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() - started > timeoutMs) reject(new Error(`El servidor web no respondió en ${timeoutMs / 1000} s.`))
        else setTimeout(tryOnce, 300)
      })
    }
    tryOnce()
  })
}

/**
 * Starts the app. `dataDir` holds the user's videos, database and logs;
 * `settings` are the user's own variables (API keys, models), which win over
 * the defaults set here. Returns { url, stop }.
 */
async function startApp({ runtimeDir, dataDir, settings = {}, port, log = () => {} }) {
  const p = runtimePaths(runtimeDir)
  for (const [name, file] of Object.entries(p)) {
    if (!fs.existsSync(file)) throw new Error(`Falta ${name} en la app instalada: ${file}`)
  }
  const logsDir = path.join(dataDir, 'logs')
  fs.mkdirSync(path.join(dataDir, 'db'), { recursive: true })
  fs.mkdirSync(logsDir, { recursive: true })
  const webPort = port || (await freePort())

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    DATA_DIR: dataDir,
    SQLITE_PATH: path.join(dataDir, 'db', 'app.sqlite'),
    FFMPEG_PATH: p.ffmpeg,
    FFPROBE_PATH: p.ffprobe,
    PYTHON_BIN: p.python,
    PYTHONNOUSERSITE: '1',
    HF_HOME: path.join(dataDir, 'modelos'), // Whisper weights, downloaded once
    ANALYSIS_ENGINE: 'perception',
    ...settings,
    PORT: String(webPort),
    HOSTNAME: '127.0.0.1',
  }
  delete env.ELECTRON_RUN_AS_NODE
  // ffmpeg/ffprobe also on PATH, for any code that calls them by name.
  env.PATH = `${path.dirname(p.ffmpeg)}${path.delimiter}${env.PATH || env.Path || ''}`

  const children = []
  // Long-running children go through child-guard.mjs, which ends them when
  // this process dies even without a clean quit (crash, Task Manager).
  const run = (name, script, cwd, { guarded = true } = {}) => {
    const out = fs.createWriteStream(path.join(logsDir, `${name}.log`), { flags: 'a' })
    out.write(`\n--- ${new Date().toISOString()} ---\n`)
    const args = guarded ? [p.guard, script] : [script]
    const child = spawn(p.node, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    child.stdout.pipe(out)
    child.stderr.pipe(out)
    child.on('exit', (code) => log(`${name} terminó (código ${code})`))
    children.push(child)
    return child
  }

  log('aplicando migraciones')
  await new Promise((resolve, reject) => {
    const m = run('migrate', p.migrate, path.dirname(p.migrate), { guarded: false })
    m.on('error', reject)
    m.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`La base de datos no se pudo preparar (código ${code}). Revisa ${path.join(logsDir, 'migrate.log')}`)),
    )
  })

  log('arrancando worker y web')
  const worker = run('worker', p.worker, path.dirname(p.worker))
  const web = run('web', p.webServer, path.dirname(p.webServer))
  let webDead = false
  web.on('exit', () => { webDead = true })
  worker.on('error', (e) => log(`worker: ${e.message}`))

  const stop = () => {
    for (const child of children) {
      if (child.exitCode === null && !child.killed) child.kill()
    }
  }
  try {
    await waitForPort(webPort, 90_000, () => webDead)
  } catch (error) {
    stop()
    throw new Error(`${error.message} Revisa ${path.join(logsDir, 'web.log')}`)
  }
  return { url: `http://127.0.0.1:${webPort}`, stop, logsDir, pids: { worker: worker.pid, web: web.pid } }
}

module.exports = { startApp, runtimePaths, readEnvFile }
