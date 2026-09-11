import { getDb, inspectSchema, SQLITE_PATH } from '@cva/memory-engine'
import { BibliotecaGrid } from '@/components/BibliotecaGrid'
import { LibrarySearch } from '@/components/LibrarySearch'

// The storage layer is read at request time, never at build time.
export const dynamic = 'force-dynamic'

type Check = { label: string; value: string; ok: boolean }

function readSystemStatus(): { checks: Check[]; problems: string[] } {
  try {
    const db = getDb()
    const status = inspectSchema(db)
    const videos = status.ok
      ? (db.prepare('SELECT COUNT(*) AS n FROM videos').get() as { n: number }).n
      : 0
    const jobs = status.ok
      ? (db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','running')").get() as {
          n: number
        }).n
      : 0

    return {
      checks: [
        { label: 'Base de datos', value: SQLITE_PATH, ok: true },
        { label: 'sqlite-vec', value: status.vecVersion ?? 'no cargado', ok: !!status.vecVersion },
        { label: 'Esquema', value: `v${status.schemaVersion}`, ok: status.schemaVersion > 0 },
        {
          label: 'Embeddings',
          value: `${status.embeddingDimensions ?? '?'} dimensiones`,
          ok: status.embeddingDimensions !== null,
        },
        { label: 'Videos en memoria', value: String(videos), ok: true },
        { label: 'Jobs pendientes', value: String(jobs), ok: true },
        {
          label: 'GEMINI_API_KEY',
          value: process.env.GEMINI_API_KEY ? 'configurada' : 'sin configurar',
          ok: !!process.env.GEMINI_API_KEY,
        },
      ],
      problems: status.problems,
    }
  } catch (error) {
    return {
      checks: [{ label: 'Base de datos', value: 'no se pudo abrir', ok: false }],
      problems: [(error as Error).message],
    }
  }
}

export default function HomePage() {
  const { checks, problems } = readSystemStatus()

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Biblioteca</h1>
        <p className="text-sm text-(--color-ink-soft)">Tus videos analizados y su memoria buscable.</p>
      </header>

      <LibrarySearch />

      <BibliotecaGrid />

      <details className="mt-6 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) text-sm">
        <summary className="cursor-pointer select-none px-5 py-3 font-medium text-(--color-ink-soft)">
          Estado del sistema
        </summary>
        <dl className="divide-y divide-(--color-line) border-t border-(--color-line)">
          {checks.map((check) => (
            <div key={check.label} className="flex items-center justify-between gap-4 px-5 py-2.5">
              <dt className="text-(--color-ink-soft)">{check.label}</dt>
              <dd className="flex items-center gap-2 text-right font-mono text-xs">
                <span className="truncate">{check.value}</span>
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: check.ok ? 'var(--color-ok)' : 'var(--color-warn)' }}
                />
              </dd>
            </div>
          ))}
        </dl>
        {problems.length > 0 && (
          <ul className="list-disc space-y-1 border-t border-(--color-line) px-5 py-3 pl-8 text-(--color-warn)">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
      </details>
    </main>
  )
}
