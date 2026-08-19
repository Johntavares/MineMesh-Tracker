'use client'

import { useState } from 'react'
import { useTranslation } from '@/lib/i18n/client'
import { CleaningUploadForm } from './CleaningUploadForm'
import {
  CheckCircle2,
  XCircle,
  X,
  ExternalLink,
  Users,
  ImageOff,
  MapPin,
  CalendarClock,
} from 'lucide-react'

export type CleaningRepeaterRow = {
  id: string
  name: string
  code: string
  model: string
  status: string
  currentCleaning: {
    photoUrl: string
    notes: string | null
    createdAt: string
    cleanedBy: string | null
    latitude: number | null
    longitude: number | null
  } | null
}

export function CleaningTable({ repeaters }: { repeaters: CleaningRepeaterRow[] }) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<CleaningRepeaterRow | null>(null)
  const [justCleaned, setJustCleaned] = useState<Record<string, boolean>>({})

  const isCleaned = (id: string, currentCleaning: CleaningRepeaterRow['currentCleaning']) =>
    Boolean(justCleaned[id] || currentCleaning)

  const handleUploaded = (repeaterId: string) => {
    setJustCleaned((prev) => ({ ...prev, [repeaterId]: true }))
    setSelected(null)
  }

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7 gap-1 sm:gap-2">
        {repeaters.map((repeater) => {
          const cleaned = isCleaned(repeater.id, repeater.currentCleaning)
          return (
            <button
              key={repeater.id}
              onClick={() => setSelected(repeater)}
              className="text-left bg-white rounded-md sm:rounded-lg overflow-hidden border border-slate-200 shadow-sm transition-transform hover:scale-[1.02] active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <div className="relative h-14 sm:h-20 bg-slate-100">
                {repeater.currentCleaning ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={repeater.currentCleaning.photoUrl}
                    alt={repeater.code}
                    className="w-full h-full object-cover hidden sm:block"
                  />
                ) : (
                  <div className="w-full h-full hidden sm:flex flex-col items-center justify-center gap-1 text-slate-400">
                    <ImageOff className="w-4 h-4" />
                    <span className="text-[9px] font-medium">{t('cleaning.noEvidence')}</span>
                  </div>
                )}
                <div
                  className={`absolute inset-x-0 top-0 bottom-0 flex items-center justify-center text-[9px] sm:hidden font-bold uppercase tracking-wide text-white ${
                    cleaned ? 'bg-emerald-600/90' : 'bg-red-600/90'
                  }`}
                >
                  {cleaned ? t('cleaning.cleaned') : t('cleaning.pending')}
                </div>
              </div>
              <div
                className={`px-1 sm:px-2 py-0.5 sm:py-1 text-center text-[9px] sm:text-[10px] font-bold uppercase tracking-wide text-white ${
                  cleaned ? 'bg-emerald-600' : 'bg-red-600'
                }`}
              >
                {cleaned ? t('cleaning.cleaned') : t('cleaning.pending')}
              </div>
              <div className="px-1 sm:px-2 py-1">
                <p className="font-mono text-[9px] sm:text-[11px] font-bold text-slate-800 leading-tight truncate">
                  {repeater.code}
                </p>
                <p className="hidden sm:block text-[9px] text-slate-400 truncate">
                  {repeater.name}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {repeaters.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 px-6 py-12 text-center text-slate-500">
          {t('cleaning.noRepeaters')}
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-6"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{selected.name}</p>
                  <p className="text-xs text-slate-400 font-mono truncate">
                    {selected.code} · {selected.model}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="p-2 text-slate-400 hover:text-slate-700 transition-colors rounded-lg"
                aria-label={t('common.close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              {selected.currentCleaning ? (
                <>
                  <a
                    href={selected.currentCleaning.photoUrl}
                    target="_blank"
                    rel="noopener"
                    className="relative block group"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selected.currentCleaning.photoUrl}
                      alt={`Evidência - ${selected.code}`}
                      className="w-full h-56 object-cover rounded-lg border border-slate-200 group-hover:opacity-90 transition-opacity"
                    />
                    <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 bg-slate-900/80 text-white text-xs px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                      <ExternalLink className="w-3 h-3" />
                      {t('cleaning.viewEvidence')}
                    </span>
                  </a>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t('cleaning.cleaned')}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {new Date(selected.currentCleaning.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 uppercase tracking-wide">
                        <MapPin className="w-3.5 h-3.5" />
                        {t('cleaning.location')}
                      </p>
                      {selected.currentCleaning.latitude != null &&
                      selected.currentCleaning.longitude != null ? (
                        <a
                          href={`https://www.google.com/maps?q=${selected.currentCleaning.latitude},${selected.currentCleaning.longitude}`}
                          target="_blank"
                          rel="noopener"
                          className="mt-1 text-xs text-blue-600 hover:underline font-mono"
                        >
                          {selected.currentCleaning.latitude.toFixed(6)},{' '}
                          {selected.currentCleaning.longitude.toFixed(6)}
                        </a>
                      ) : (
                        <p className="mt-1 text-xs text-slate-500">
                          {t('cleaning.noLocation')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-sm text-slate-600 space-y-1.5">
                    <p className="flex items-center gap-2">
                      <CalendarClock className="w-4 h-4 text-slate-400" />
                      {t('cleaning.updatedAt')}:{' '}
                      {new Date(selected.currentCleaning.createdAt).toLocaleString('pt-BR')}
                    </p>
                    <p className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-400" />
                      {selected.currentCleaning.cleanedBy || t('auth.system')}
                    </p>
                    {selected.currentCleaning.notes && (
                      <p className="text-slate-500 italic bg-slate-50 rounded-lg px-3 py-2">
                        &ldquo;{selected.currentCleaning.notes}&rdquo;
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col items-center justify-center gap-2 py-6 text-slate-400">
                    <XCircle className="w-10 h-10 text-red-400" />
                    <p className="text-sm text-center">{t('cleaning.pendingDescription')}</p>
                  </div>
                  <CleaningUploadForm
                    repeaterId={selected.id}
                    onDone={() => handleUploaded(selected.id)}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}