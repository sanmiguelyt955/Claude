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
        <header className="sticky top-0 z-10 border-b border-(--color-line) bg-(--color-surface)/80 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Video Analyzer
            </Link>
            <nav className="flex items-center gap-4 text-sm text-(--color-ink-soft)">
              <Link href="/" className="hover:text-(--color-ink)">
                Biblioteca
              </Link>
              <Link
                href="/cargar"
                className="rounded-full bg-(--color-accent) px-3.5 py-1.5 font-medium text-white hover:opacity-90"
              >
                + Cargar video
              </Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  )
}
