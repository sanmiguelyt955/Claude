import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Video Analyzer',
  description: 'Memoria audiovisual local: analiza videos, guardalos y conviertelos en Skills.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh">
        <header className="sticky top-0 z-20 border-b border-(--color-line) bg-(--color-canvas)/75 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="grid size-8 place-items-center rounded-xl text-white shadow-md"
                style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-2))' }}
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
                  <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
                </svg>
              </span>
              <span className="whitespace-nowrap text-[15px] font-semibold tracking-tight">Video Analyzer</span>
            </Link>
            <nav className="flex items-center gap-2 text-sm">
              <Link href="/" className="hidden rounded-full px-3 py-1.5 text-(--color-ink-soft) hover:bg-(--color-surface-2) hover:text-(--color-ink) sm:inline-flex">
                Biblioteca
              </Link>
              <Link href="/musica" className="hidden rounded-full px-3 py-1.5 text-(--color-ink-soft) hover:bg-(--color-surface-2) hover:text-(--color-ink) sm:inline-flex">
                Música
              </Link>
              <Link href="/cargar" className="btn-primary whitespace-nowrap !py-1.5">
                <span aria-hidden>+</span>
                <span>
                  Cargar<span className="hidden sm:inline"> video</span>
                </span>
              </Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  )
}
