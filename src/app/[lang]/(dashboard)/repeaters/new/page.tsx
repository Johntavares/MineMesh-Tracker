import { RepeaterForm } from '@/components/repeaters/RepeaterForm'
import { getDictionary } from '@/lib/i18n/server'
import { isLocale } from '@/lib/i18n/config'
import { notFound } from 'next/navigation'

export default async function NewRepeaterPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  const dict = await getDictionary(lang)

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-6 sm:mb-8">{dict.repeaters.newRepeater}</h1>
      <RepeaterForm lang={lang} />
    </div>
  )
}
