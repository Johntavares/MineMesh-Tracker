import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Mesh Monitor',
  description: 'Mesh repeater monitoring system',
  icons: {
    icon: '/icon-192.png?v=2',
    shortcut: '/icon-192.png?v=2',
    apple: '/icon-192.png?v=2',
  }
}

import { PwaRegistration } from '@/components/PwaRegistration'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className="h-full bg-slate-50">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1e293b" />
        <link rel="icon" href="/icon-192.png?v=2" type="image/png" />
        <link rel="apple-touch-icon" href="/icon-192.png?v=2" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={`${inter.className} h-full antialiased`}>
        <PwaRegistration />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
