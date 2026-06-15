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
    <div>
      <h1 className="text-3xl font-bold text-slate-900 mb-8">{dict.repeaters.newRepeater}</h1>
      <RepeaterForm lang={lang} />
    </div>
  )
}
