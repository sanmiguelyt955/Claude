import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Video Analyzer',
  description: 'Memoria audiovisual local: analiza videos, guardalos y conviertelos en Skills.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
