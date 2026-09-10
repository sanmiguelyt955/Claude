import Link from 'next/link'
import { getDb, inspectSchema, SQLITE_PATH } from '@cva/memory-engine'

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
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-(--color-accent)">Bloque 1 · Scaffolding</p>
        <h1 className="text-3xl font-semibold tracking-tight">Video Analyzer</h1>
        <p className="text-(--color-ink-soft)">
          Memoria audiovisual local. Las pantallas finales de biblioteca, carga y resultados
          llegan en el bloque 5; por ahora esta pagina solo confirma que la capa de almacenamiento
          responde.
        </p>
        <Link
          href="/ingesta"
          className="w-fit rounded-md bg-(--color-accent) px-4 py-2 text-sm font-medium text-white"
        >
          Ir a cargar un video (bloque 2) →
        </Link>
      </header>

      <section className="overflow-hidden rounded-(--radius-card) border border-(--color-line) bg-(--color-surface)">
        <h2 className="border-b border-(--color-line) px-5 py-3 text-sm font-semibold">
          Estado del sistema
        </h2>
        <dl className="divide-y divide-(--color-line)">
          {checks.map((check) => (
            <div key={check.label} className="flex items-center justify-between gap-4 px-5 py-3">
              <dt className="text-sm text-(--color-ink-soft)">{check.label}</dt>
              <dd className="flex items-center gap-2 text-right font-mono text-xs">
                <span className="truncate">{check.value}</span>
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{
                    background: check.ok ? 'var(--color-ok)' : 'var(--color-warn)',
                  }}
                />
                <span className="sr-only">{check.ok ? 'correcto' : 'requiere atencion'}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {problems.length > 0 && (
        <section className="rounded-(--radius-card) border border-(--color-warn) bg-(--color-surface) p-5">
          <h2 className="text-sm font-semibold">Pendiente</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-(--color-ink-soft)">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
