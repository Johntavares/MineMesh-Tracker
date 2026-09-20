import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { PwaRegistration } from '@/components/PwaRegistration'

const inter = Inter({ subsets: ['latin'] })

export const viewport: Viewport = {
  themeColor: '#1e293b',
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  title: 'Mesh Monitor',
  description: 'Mesh repeater monitoring system',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Mesh Monitor',
  },
  icons: {
    icon: '/icon-192.png',
    shortcut: '/icon-192.png',
    apple: '/icon-192.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className="h-full bg-slate-50">
      <body className={`${inter.className} h-full antialiased`}>
        <PwaRegistration />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
