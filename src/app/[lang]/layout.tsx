import type { Metadata } from 'next'
import { locales, isLocale } from '@/lib/i18n/config'
import { notFound } from 'next/navigation'
import { getDictionary } from '@/lib/i18n/server'
import { TranslationProvider } from '@/lib/i18n/client'

export const dynamic = 'force-dynamic'

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  if (!isLocale(lang)) return {}
  const dict = await getDictionary(lang)
  return {
    title: dict.brand.title,
    description: dict.brand.description,
    icons: {
      icon: '/icon-192.png',
      shortcut: '/icon-192.png',
      apple: '/icon-192.png',
    }
  }
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  const dict = await getDictionary(lang)

  return (
    <TranslationProvider dictionary={dict}>
      {children}
    </TranslationProvider>
  )
}
