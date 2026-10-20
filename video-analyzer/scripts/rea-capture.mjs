#!/usr/bin/env node
// Runs a command under REA capture-process and prints only what matters: how
// it ended, the processes it started and the last lines it printed. The full
// capture (40 KB to 1.3 MB of YAML, mostly per-frame terminal snapshots) goes
// to a file whose path is printed, so nothing is lost but it stays out of a
// Claude Code conversation unless asked for.
//
//   node scripts/rea-capture.mjs [--timeout 600] [--lines 60] -- <command> [args...]
//   node scripts/rea-capture.mjs --from <saved capture file> [--lines 60]
//
// REA lives where it was installed (REA_DIR, default /tmp/claude-0/rea).
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const argv = process.argv.slice(2)
// Options go before "--"; everything after it is the command.
const own = argv.includes('--') ? argv.slice(0, argv.indexOf('--')) : argv
const opt = (name, fallback) => (own.includes(name) ? own[own.indexOf(name) + 1] : fallback)
const lines = opt('--lines', '60')
const from = opt('--from')

let raw
let saved = from
if (from) {
  raw = readFileSync(from, 'utf8')
} else {
  const sep = argv.indexOf('--')
  const cmd = sep >= 0 ? argv.slice(sep + 1) : []
  if (!cmd.length) {
    console.error('uso: node scripts/rea-capture.mjs [--timeout s] [--lines n] -- <comando> [args...]')
    process.exit(2)
  }
  const timeoutMs = Number(opt('--timeout', '600')) * 1000
  const dir = mkdtempSync(path.join(tmpdir(), 'rea-capture-'))
  const scenario = path.join(dir, 'scenario.json')
  // REA wants an executable path: resolve bare names through PATH.
  const exe = cmd[0].includes('/') ? path.resolve(cmd[0]) : execFileSync('sh', ['-c', `command -v "${cmd[0]}"`], { encoding: 'utf8' }).trim()
  writeFileSync(
    scenario,
    JSON.stringify({
      executable: exe,
      arguments: cmd.slice(1),
      working_directory: process.cwd(),
      environment: { PATH: process.env.PATH, HOME: process.env.HOME, ...(process.env.PYTHONPATH ? { PYTHONPATH: process.env.PYTHONPATH } : {}) },
      timeout_ms: timeoutMs,
      idle_timeout_ms: timeoutMs,
    }),
  )
  const reaDir = process.env.REA_DIR || '/tmp/claude-0/rea'
  // stderr carries REA's progress lines (the elapsed time is read from them).
  const r = spawnSync('npx', ['rea', 'capture-process', scenario], { cwd: reaDir, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
  raw = String(r.stdout ?? '') + String(r.stderr ?? '')
  saved = path.join(dir, 'capture.txt')
  writeFileSync(saved, raw)
}

const exit = /\n\s+exit:\n\s+code: (\S+)\n\s+signal: (\S+)\n\s+reason: (\S+)/.exec(raw)
const elapsed = [...raw.matchAll(/"message":"elapsed_ms=(\d+)/g)].at(-1)?.[1]
console.log(`fin: ${exit ? `código ${exit[1]}, señal ${exit[2]} (${exit[3]})` : 'desconocido (¿falló REA?)'}${elapsed ? `, ${(Number(elapsed) / 1000).toFixed(1)} s` : ''}`)

// process_samples rows: at_ms,pid,parent_pid,command,process_group_id,session_id
const block = /process_samples\[\d+\]\{[^}]*\}:\n((?:\s+\d+,\d+,\d+,.*\n)+)/.exec(raw)?.[1] ?? ''
const commands = [
  ...new Set(
    block
      .split('\n')
      .map((l) => l.trim().replace(/^\d+,\d+,\d+,/, '').replace(/,\d+,\d+$/, '').replace(/^"(.*)"$/, '$1'))
      .filter(Boolean),
  ),
]
if (commands.length) {
  console.log(`procesos (${commands.length}):`)
  for (const c of commands.slice(0, 30)) console.log(`  ${c.slice(0, 160)}`)
  if (commands.length > 30) console.log(`  … y ${commands.length - 30} más`)
}

const states = [...raw.matchAll(/serialized_state: ("(?:[^"\\]|\\.)*")/g)]
const text = states.length ? JSON.parse(states.at(-1)[1]).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '') : ''
const out = text.split('\n')
const shown = lines === 'all' ? out : out.slice(-Number(lines))
console.log(`salida${shown.length < out.length ? ` (últimas ${shown.length} de ${out.length} líneas)` : ''}:`)
console.log(shown.join('\n'))
console.log(`captura completa: ${saved}`)
