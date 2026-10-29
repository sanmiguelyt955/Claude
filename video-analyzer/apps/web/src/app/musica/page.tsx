import { MusicaClient } from '@/components/MusicaClient'

export const metadata = { title: 'Música libre · Video Analyzer' }

export default function MusicaPage() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Música libre</h1>
        <p className="mt-1 text-sm text-(--color-ink-soft)">
          Solo música con licencia que permite uso comercial (CC0, dominio público, BY). Cada pieza trae su
          crédito listo para copiar. Las de uso no comercial no aparecen.
        </p>
      </div>
      <MusicaClient />
    </main>
  )
}
