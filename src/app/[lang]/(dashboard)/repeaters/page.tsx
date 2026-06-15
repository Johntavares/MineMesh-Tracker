import { prisma } from '@/lib/prisma'
import { Plus, Edit2 } from 'lucide-react'
import Link from 'next/link'
import { DeleteRepeaterButton } from './DeleteRepeaterButton'
import { getDictionary } from '@/lib/i18n/server'
import { isLocale } from '@/lib/i18n/config'
import { notFound } from 'next/navigation'

export default async function RepeatersPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  const dict = await getDictionary(lang)

  const repeaters = await prisma.repeater.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: { updatedBy: true }
  })

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-slate-900">{dict.repeaters.title}</h1>
        <Link 
          href={`/${lang}/repeaters/new`}
          className="flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          {dict.repeaters.newRepeater}
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-sm uppercase tracking-wider">
                <th className="px-6 py-4 font-medium">{dict.repeaters.name}</th>
                <th className="px-6 py-4 font-medium">{dict.repeaters.code}</th>
                <th className="px-6 py-4 font-medium">{dict.repeaters.status}</th>
                <th className="px-6 py-4 font-medium">{dict.repeaters.model}</th>
                <th className="px-6 py-4 font-medium">{dict.repeaters.range}</th>
                <th className="px-6 py-4 font-medium">Último Operador</th>
                <th className="px-6 py-4 font-medium text-right">{dict.repeaters.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {repeaters.map((repeater) => (
                <tr key={repeater.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-800">{repeater.name}</td>
                  <td className="px-6 py-4 text-slate-500 font-mono text-sm">{repeater.code}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      repeater.status === 'ONLINE' ? 'bg-emerald-100 text-emerald-800' :
                      repeater.status === 'OFFLINE' ? 'bg-red-100 text-red-800' :
                      'bg-amber-100 text-amber-800'
                    }`}>
                      {repeater.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{repeater.model}</td>
                  <td className="px-6 py-4 text-slate-500">{repeater.range}</td>
                  <td className="px-6 py-4 text-slate-500 font-medium">{repeater.updatedBy?.name || 'Sistema'}</td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <Link 
                      href={`/${lang}/repeaters/${repeater.id}/edit`}
                      className="inline-flex p-2 text-slate-400 hover:text-blue-600 transition-colors"
                      title={dict.common.edit}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Link>
                    <DeleteRepeaterButton id={repeater.id} lang={lang} />
                  </td>
                </tr>
              ))}
              {repeaters.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    {dict.repeaters.noRepeaters}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
