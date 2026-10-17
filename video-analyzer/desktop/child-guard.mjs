// Runs a child script (the worker or the web server) and stops it when the
// desktop app goes away, however it went away: a normal quit, a crash, or
// being killed from the Task Manager. The app keeps a pipe open on our stdin;
// when that process dies the OS closes the pipe and we see end-of-file.
//
// Usage: node child-guard.mjs <script> [args...]

import path from 'node:path'
import { pathToFileURL } from 'node:url'

const target = path.resolve(process.argv[2])
process.argv.splice(2, 1) // the target sees the argv it would see when run directly

const shutdown = () => {
  // SIGTERM lets the worker finish its loop; on Windows it ends the process
  // at once. Either way, never outlive the app by more than a few seconds.
  setTimeout(() => process.exit(0), 5000).unref()
  try { process.kill(process.pid, 'SIGTERM') } catch { process.exit(0) }
}
process.stdin.on('end', shutdown)
process.stdin.on('close', shutdown)
process.stdin.on('error', shutdown)
process.stdin.resume()
process.stdin.unref() // watching the pipe must not by itself keep us alive

await import(pathToFileURL(target).href)
