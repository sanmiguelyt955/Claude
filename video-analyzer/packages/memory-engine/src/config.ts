import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Resolves the monorepo root by walking up from this file until the workspace
 * package.json is found. Beats process.cwd(), which differs between the Next
 * dev server, the worker and the migration CLI.
 */
function findRepoRoot(): string {
  // fileURLToPath (not a manual pathname replace) is what correctly decodes
  // spaces and other %XX-escaped characters in the path — this repo lives
  // under "...\Apps de Claude\...", and a raw pathname keeps the "%20".
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 10; i++) {
    const pkg = path.join(dir, 'package.json')
    if (fs.existsSync(pkg)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(pkg, 'utf8')) as { workspaces?: unknown }
        if (parsed.workspaces) return dir
      } catch {
        // Unparseable package.json: keep walking rather than guessing.
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

export const REPO_ROOT = findRepoRoot()

function resolveFromRoot(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(REPO_ROOT, value)
}

export const DATA_DIR = resolveFromRoot(process.env.DATA_DIR ?? './data')
export const SQLITE_PATH = resolveFromRoot(process.env.SQLITE_PATH ?? './data/db/app.sqlite')
export const VIDEOS_DIR = path.join(DATA_DIR, 'videos')
export const SKILLS_OUT_DIR = path.join(DATA_DIR, 'skills-generadas')

/**
 * Dimension of the vector index. Baked into the vec0 table at creation time,
 * so it is also persisted in the `meta` table and checked on every startup.
 */
export const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS ?? 768)

export const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001'
