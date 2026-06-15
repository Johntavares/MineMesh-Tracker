import { prisma } from '@/lib/prisma'
import { getDictionary } from '@/lib/i18n/server'
import { isLocale } from '@/lib/i18n/config'
import { notFound } from 'next/navigation'

export default async function LogsPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  const dict = await getDictionary(lang)

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    include: { user: true },
    take: 100
  })

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-slate-900 mb-8">{dict.logs.title}</h1>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-sm uppercase tracking-wider">
                <th className="px-6 py-4 font-medium">{dict.logs.dateTime}</th>
                <th className="px-6 py-4 font-medium">{dict.logs.user}</th>
                <th className="px-6 py-4 font-medium">{dict.logs.action}</th>
                <th className="px-6 py-4 font-medium">{dict.logs.details}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors text-sm">
                  <td className="px-6 py-4 text-slate-500">
                    {log.createdAt.toLocaleString(lang === 'en' ? 'en-US' : 'pt-BR')}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-800">
                    {log.user?.name || dict.auth.system}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-mono">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{log.details || '-'}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                    {dict.logs.noLogs}
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
