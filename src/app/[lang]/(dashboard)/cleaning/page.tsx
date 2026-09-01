export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getDictionary } from '@/lib/i18n/server'
import { isLocale } from '@/lib/i18n/config'
import { notFound } from 'next/navigation'
import { CleaningTable } from '@/components/cleaning/CleaningTable'
import { getWeekStart, isSameWeek } from '@/lib/cleaning'
import { Sparkles, Clock } from 'lucide-react'

export default async function CleaningPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  const dict = await getDictionary(lang)

  const repeaters = await prisma.repeater.findMany({
    where: { deletedAt: null },
    orderBy: { code: 'asc' },
    include: {
      cleaningRecords: {
        orderBy: { weekStart: 'desc' },
        include: { cleanedBy: true },
      },
    },
  })

  const filtered = repeaters.filter((r) => {
    const code = r.code.toLowerCase()
    const name = r.name.toLowerCase()
    const isRoot = code.startsWith('root') || name.startsWith('root')
    const is320 = code.includes('320') || name.includes('320')
    return !isRoot && !is320
  })

  const currentWeek = getWeekStart()
  const rows = filtered.map((r) => {
    const record = r.cleaningRecords.find((c) => isSameWeek(c.weekStart, currentWeek))
    return {
      id: r.id,
      name: r.name,
      code: r.code,
      model: r.model,
      status: r.status,
      currentCleaning: record
        ? {
            photoUrl: record.photoUrl,
            notes: record.notes,
            createdAt: record.createdAt.toISOString(),
            cleanedBy: record.cleanedBy?.name ?? null,
            team: record.team,
            photoDate: record.photoDate ? record.photoDate.toISOString() : null,
            latitude: record.latitude,
            longitude: record.longitude,
          }
        : null,
    }
  })

  const cleanedCount = rows.filter((r) => r.currentCleaning).length
  const total = rows.length

  const weekLabel = currentWeek.toLocaleDateString(lang === 'en' ? 'en-US' : 'pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl px-2 sm:px-6 py-3 sm:py-5">
        <div className="flex items-center justify-between gap-3 mb-3 sm:mb-5">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <h1 className="text-base sm:text-xl font-bold text-slate-900 truncate">
              {dict.cleaning.title}
            </h1>
            <span className="hidden sm:inline-flex text-xs text-slate-500 shrink-0">
              {dict.cleaning.week}: {weekLabel}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-emerald-600 text-white text-xs sm:text-sm font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              {cleanedCount}/{total}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-red-600 text-white text-xs sm:text-sm font-semibold">
              <Clock className="w-3.5 h-3.5" />
              {total - cleanedCount}
            </span>
          </div>
        </div>

        <CleaningTable repeaters={rows} />
      </div>
    </div>
  )
}