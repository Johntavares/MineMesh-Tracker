import { prisma } from '@/lib/prisma'
import { Radio, Signal, AlertTriangle, PowerOff } from 'lucide-react'
import { DashboardCharts } from '@/components/dashboard/DashboardCharts'
import { getDictionary } from '@/lib/i18n/server'
import { isLocale } from '@/lib/i18n/config'
import { notFound } from 'next/navigation'

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  const dict = await getDictionary(lang)

  const [total, online, offline, maintenance] = await Promise.all([
    prisma.repeater.count({ where: { deletedAt: null } }),
    prisma.repeater.count({ where: { status: 'ONLINE', deletedAt: null } }),
    prisma.repeater.count({ where: { status: 'OFFLINE', deletedAt: null } }),
    prisma.repeater.count({ where: { status: 'MAINTENANCE', deletedAt: null } }),
  ])

  const activityData = [
    { name: 'Administrador', movs: 12 },
    { name: 'João Silva', movs: 8 },
    { name: 'Maria Souza', movs: 3 },
  ]

  const statusData = [
    { name: dict.common.online, value: online, color: '#10B981' },
    { name: dict.common.offline, value: offline, color: '#EF4444' },
    { name: dict.common.maintenance, value: maintenance, color: '#F59E0B' },
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-slate-900 mb-8">{dict.dashboard.title}</h1>
      
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center">
          <div className="p-4 bg-blue-100 rounded-lg text-blue-600 mr-4">
            <Radio className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">{dict.dashboard.totalRepeaters}</p>
            <p className="text-3xl font-bold text-slate-800">{total}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center">
          <div className="p-4 bg-emerald-100 rounded-lg text-emerald-600 mr-4">
            <Signal className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">{dict.dashboard.online}</p>
            <p className="text-3xl font-bold text-slate-800">{online}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center">
          <div className="p-4 bg-red-100 rounded-lg text-red-600 mr-4">
            <PowerOff className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">{dict.dashboard.offline}</p>
            <p className="text-3xl font-bold text-slate-800">{offline}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center">
          <div className="p-4 bg-amber-100 rounded-lg text-amber-600 mr-4">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">{dict.dashboard.maintenance}</p>
            <p className="text-3xl font-bold text-slate-800">{maintenance}</p>
          </div>
        </div>
      </div>

      <DashboardCharts statusData={statusData} activityData={activityData} />
    </div>
  )
}
