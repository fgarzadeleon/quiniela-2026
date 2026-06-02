import type { Metadata } from 'next'
import { Inter, Bebas_Neue } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const bebas = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-bebas', display: 'swap' })

export const metadata: Metadata = {
  title: 'Quiniela 2026 · World Cup',
  description: 'Pick your 5 teams, track the scores, win the glory.',
  openGraph: {
    title: 'Quiniela 2026 · World Cup',
    description: 'Pick your 5 teams, track the scores, win the glory.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${bebas.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="text-center py-6 text-xs text-white/30 border-t border-white/5">
          Quiniela 2026 · Hecho con ❤️ para la Santa Closera
        </footer>
      </body>
    </html>
  )
}
