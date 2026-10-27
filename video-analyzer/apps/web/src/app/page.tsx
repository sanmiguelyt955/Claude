import { getDb, inspectSchema, SQLITE_PATH, getQuotaWindowCounts, quotaModels, resolveModelDailyLimit } from '@cva/memory-engine'
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

    // Daily capacity is per model, so what matters is the sum across every
    // configured model, not the 20 of whichever one happens to be first.
    // Same models and limits as /api/quota: the ones the analysis engine uses.
    const models = quotaModels()
    const quota = models.reduce(
      (acc, model) => {
        const { limit, source } = status.ok ? resolveModelDailyLimit(model, db) : { limit: Number(process.env.GEMINI_MAX_RPD ?? 20), source: 'assumed' }
        const used = status.ok ? getQuotaWindowCounts(db, model).requestsToday : 0
        acc.total += limit
        acc.remaining += Math.max(0, limit - used)
        if (source === 'google') acc.confirmed += 1
        return acc
      },
      { models: models.length, total: 0, remaining: 0, confirmed: 0 },
    )

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
          label: 'Peticiones a Gemini disponibles hoy',
          value: `${quota.remaining} de ${quota.total} · ${quota.models} modelos, ${quota.confirmed} con límite confirmado por Google`,
          ok: quota.remaining > 0,
        },
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
    <main className="mx-auto flex max-w-6xl flex-col gap-7 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Biblioteca</h1>
        <p className="text-(--color-ink-soft)">Lo que se ve y se escucha en tus videos, guardado y listo para buscar.</p>
      </header>

      <LibrarySearch />

      <BibliotecaGrid />

      <details className="card mt-6 text-sm">
        <summary className="cursor-pointer select-none px-5 py-3 font-medium text-(--color-ink-soft)">
          Estado del sistema
        </summary>
        <dl className="divide-y divide-(--color-line) border-t border-(--color-line)">
          {checks.map((check) => (
            <div key={check.label} className="flex items-center justify-between gap-4 px-5 py-2.5">
              <dt className="shrink-0 text-(--color-ink-soft)">{check.label}</dt>
              <dd className="flex min-w-0 items-center gap-2 text-right font-mono text-xs">
                {/* Long paths wrap instead of pushing the page sideways on a phone. */}
                <span className="min-w-0 [overflow-wrap:anywhere]">{check.value}</span>
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
