import { RepeaterForm } from '@/components/repeaters/RepeaterForm'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { getDictionary } from '@/lib/i18n/server'
import { isLocale } from '@/lib/i18n/config'

export default async function EditRepeaterPage({ params }: { params: Promise<{ id: string; lang: string }> }) {
  const { id, lang } = await params
  if (!isLocale(lang)) notFound()
  const dict = await getDictionary(lang)
  
  const repeater = await prisma.repeater.findUnique({
    where: { id }
  })

  if (!repeater) {
    notFound()
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-slate-900 mb-8">{dict.repeaters.editRepeater}</h1>
      <RepeaterForm initialData={repeater} lang={lang} />
    </div>
  )
}
