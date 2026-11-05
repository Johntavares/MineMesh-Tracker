'use client'

import { useMemo, useState } from 'react'
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
  Wrench,
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
    team: string | null
    photoDate: string | null
    latitude: number | null
    longitude: number | null
  } | null
}

export function CleaningTable({
  repeaters,
  userRole = 'OPERATOR',
}: {
  repeaters: CleaningRepeaterRow[]
  userRole?: string
}) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<CleaningRepeaterRow | null>(null)
  const [justCleaned, setJustCleaned] = useState<Record<string, boolean>>({})
  const [isEditing, setIsEditing] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'CLEANED' | 'MAINTENANCE'>('ALL')
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)

  const isCleaned = (id: string, currentCleaning: CleaningRepeaterRow['currentCleaning']) =>
    Boolean(justCleaned[id] || currentCleaning)

  const handleUploaded = (repeaterId: string) => {
    setJustCleaned((prev) => ({ ...prev, [repeaterId]: true }))
    setIsEditing(false)
    setSelected(null)
  }

  // Estatísticas de equipes
  const teamsStats = useMemo(() => {
    const map = new Map<string, number>()
    repeaters.forEach((r) => {
      const cleaned = isCleaned(r.id, r.currentCleaning)
      if (cleaned && r.currentCleaning) {
        const teamName = r.currentCleaning.team?.trim() || (r.currentCleaning.cleanedBy ? `Op. ${r.currentCleaning.cleanedBy}` : 'Sem equipe')
        map.set(teamName, (map.get(teamName) || 0) + 1)
      }
    })
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [repeaters, justCleaned])

  // Repetidoras em manutenção
  const maintenanceRepeaters = useMemo(() => {
    return repeaters.filter((r) => r.status === 'MAINTENANCE')
  }, [repeaters])

  // Contagens para os filtros
  const totalCount = repeaters.length
  const cleanedCount = repeaters.filter((r) => isCleaned(r.id, r.currentCleaning)).length
  const pendingCount = totalCount - cleanedCount
  const maintenanceCount = maintenanceRepeaters.length

  // Lista filtrada
  const filteredRepeaters = useMemo(() => {
    return repeaters.filter((r) => {
      const cleaned = isCleaned(r.id, r.currentCleaning)

      if (statusFilter === 'CLEANED' && !cleaned) return false
      if (statusFilter === 'PENDING' && cleaned) return false
      if (statusFilter === 'MAINTENANCE' && r.status !== 'MAINTENANCE') return false

      if (selectedTeam) {
        if (!cleaned || !r.currentCleaning) return false
        const teamName = r.currentCleaning.team?.trim() || (r.currentCleaning.cleanedBy ? `Op. ${r.currentCleaning.cleanedBy}` : 'Sem equipe')
        if (teamName !== selectedTeam) return false
      }

      return true
    })
  }, [repeaters, justCleaned, statusFilter, selectedTeam])

  return (
    <div className="space-y-3">
      {/* BARRA DE CONTROLE E INFORMAÇÕES (Equilibrada, nítida e legível para print) */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs space-y-2.5">
        {/* Linha 1: Filtros de status e aviso de manutenção */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Abas de filtro */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => { setStatusFilter('ALL'); setSelectedTeam(null); }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === 'ALL' && !selectedTeam
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Todas ({totalCount})
            </button>
            <button
              onClick={() => setStatusFilter('PENDING')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === 'PENDING'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Pendentes ({pendingCount})
            </button>
            <button
              onClick={() => setStatusFilter('CLEANED')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === 'CLEANED'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Limpas ({cleanedCount})
            </button>
            {maintenanceCount > 0 && (
              <button
                onClick={() => setStatusFilter(statusFilter === 'MAINTENANCE' ? 'ALL' : 'MAINTENANCE')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors border ${
                  statusFilter === 'MAINTENANCE'
                    ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-300'
                }`}
                title="Filtrar repetidoras em manutenção"
              >
                <Wrench className="w-3.5 h-3.5" />
                Manutenção ({maintenanceCount})
              </button>
            )}
          </div>

          {/* Destaque das RPTs em Manutenção */}
          {maintenanceRepeaters.length > 0 && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
              <Wrench className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="font-bold">Em Manutenção:</span>
              <span className="font-mono font-semibold">
                {maintenanceRepeaters.map((r) => r.code).join(', ')}
              </span>
            </div>
          )}
        </div>

        {/* Linha 2: Resumo das equipes que atuaram na limpeza */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 text-xs">
          <span className="text-slate-500 font-semibold flex items-center gap-1 shrink-0">
            <Users className="w-3.5 h-3.5 text-blue-600" />
            Equipes na Limpeza:
          </span>

          {teamsStats.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {teamsStats.map(({ name, count }) => {
                const isSelected = selectedTeam === name
                return (
                  <button
                    key={name}
                    onClick={() => setSelectedTeam(isSelected ? null : name)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all border ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-blue-50/70 hover:bg-blue-100 text-blue-900 border-blue-200'
                    }`}
                    title={`Filtrar por ${name}`}
                  >
                    <span>{name}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[11px] font-bold ${
                        isSelected ? 'bg-blue-800 text-white' : 'bg-white text-blue-800 border border-blue-200'
                      }`}
                    >
                      {count} {count === 1 ? 'RPT' : 'RPTs'}
                    </span>
                  </button>
                )
              })}

              {selectedTeam && (
                <button
                  onClick={() => setSelectedTeam(null)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-500 hover:text-slate-800 underline ml-1"
                >
                  <X className="w-3 h-3" />
                  Limpar filtro
                </button>
              )}
            </div>
          ) : (
            <span className="text-slate-400 text-xs italic">
              Nenhuma equipe registrou limpeza neste quadro ainda.
            </span>
          )}
        </div>
      </div>

      {/* GRADE DE REPETIDORAS (Responsiva, preenchendo a tela inteira em todos os monitores) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 min-[1800px]:grid-cols-8 min-[2200px]:grid-cols-10 gap-2 sm:gap-2.5">
        {filteredRepeaters.map((repeater) => {
          const cleaned = isCleaned(repeater.id, repeater.currentCleaning)
          const isMaintenance = repeater.status === 'MAINTENANCE'

          return (
            <button
              key={repeater.id}
              onClick={() => setSelected(repeater)}
              className={`text-left bg-white rounded-lg overflow-hidden border shadow-xs transition-transform hover:scale-[1.02] active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 flex flex-col ${
                isMaintenance ? 'border-amber-400 ring-2 ring-amber-300' : 'border-slate-200'
              }`}
            >
              {/* Foto ou Thumbnail */}
              <div className="relative h-20 sm:h-24 bg-slate-100 w-full">
                {repeater.currentCleaning ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={repeater.currentCleaning.photoUrl}
                    alt={repeater.code}
                    className="w-full h-full object-cover hidden sm:block"
                  />
                ) : (
                  <div className="w-full h-full hidden sm:flex flex-col items-center justify-center gap-1 text-slate-400">
                    <ImageOff className="w-5 h-5" />
                    <span className="text-[10px] font-medium">{t('cleaning.noEvidence')}</span>
                  </div>
                )}

                {/* Badge visível de manutenção */}
                {isMaintenance && (
                  <span
                    className="absolute top-1.5 left-1.5 z-10 hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 text-white font-bold text-[10px] uppercase tracking-wide shadow-xs"
                    title="Em Manutenção"
                  >
                    <Wrench className="w-3 h-3" />
                    Manutenção
                  </span>
                )}

                {/* Status mobile */}
                <div
                  className={`absolute inset-x-0 top-0 bottom-0 flex flex-col items-center justify-center text-xs sm:hidden font-bold uppercase tracking-wide text-white ${
                    cleaned ? 'bg-emerald-600/90' : 'bg-red-600/90'
                  }`}
                >
                  <span>{cleaned ? t('cleaning.cleaned') : t('cleaning.pending')}</span>
                  {isMaintenance && (
                    <span className="text-[9px] bg-amber-500 px-1.5 py-0.5 rounded mt-1 font-bold">
                      MANUTENÇÃO
                    </span>
                  )}
                </div>
              </div>

              {/* Faixa única de status Desktop */}
              <div
                className={`px-2 py-1 text-center text-xs font-bold uppercase tracking-wide text-white flex items-center justify-center gap-1.5 ${
                  cleaned ? 'bg-emerald-600' : 'bg-red-600'
                }`}
              >
                <span>{cleaned ? t('cleaning.cleaned') : t('cleaning.pending')}</span>
                {isMaintenance && (
                  <span className="text-[9px] bg-amber-500 text-white px-1.5 py-0.2 rounded font-extrabold ml-1">
                    MANUT
                  </span>
                )}
              </div>

              {/* Informações da repetidora */}
              <div className="p-2 space-y-1 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <p className="font-mono text-xs sm:text-sm font-bold text-slate-900 truncate">
                      {repeater.code}
                    </p>
                    {isMaintenance && (
                      <span className="sm:hidden text-amber-600 font-bold text-[10px]">
                        🔧 Manut.
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">{repeater.name}</p>
                </div>

                {cleaned && repeater.currentCleaning ? (
                  <div className="space-y-1 pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded truncate">
                      <Users className="w-3 h-3 text-blue-600 shrink-0" />
                      <span className="truncate">
                        {repeater.currentCleaning.team || repeater.currentCleaning.cleanedBy || 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 truncate">
                      <CalendarClock className="w-3 h-3 shrink-0" />
                      <span>
                        {repeater.currentCleaning.photoDate
                          ? new Date(repeater.currentCleaning.photoDate).toLocaleDateString('pt-BR')
                          : new Date(repeater.currentCleaning.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 font-medium pt-1 border-t border-slate-100 truncate">
                    Limpeza pendente
                  </p>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {filteredRepeaters.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 px-6 py-10 text-center text-slate-500 text-sm space-y-2">
          <p className="font-semibold text-slate-700">
            Nenhuma repetidora encontrada com os filtros selecionados.
          </p>
          {(statusFilter !== 'ALL' || selectedTeam) && (
            <button
              onClick={() => {
                setStatusFilter('ALL')
                setSelectedTeam(null)
              }}
              className="text-xs text-blue-600 hover:underline font-medium"
            >
              Limpar todos os filtros
            </button>
          )}
        </div>
      )}

      {/* MODAL DE DETALHES E EVIDÊNCIA */}
      {selected && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-6"
          onClick={() => { setSelected(null); setIsEditing(false); }}
        >
          <div
            className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900 truncate">{selected.name}</p>
                    {selected.status === 'MAINTENANCE' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                        <Wrench className="w-3 h-3" />
                        Em Manutenção
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 font-mono truncate">
                    {selected.code} · {selected.model}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setSelected(null); setIsEditing(false); }}
                className="p-2 text-slate-400 hover:text-slate-700 transition-colors rounded-lg"
                aria-label={t('common.close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              {/* Alerta de Manutenção no Modal */}
              {selected.status === 'MAINTENANCE' && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2.5">
                  <Wrench className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Equipamento em Manutenção</p>
                    <p className="text-amber-800 text-[11px] mt-0.5">
                      Esta repetidora está registrada com status de manutenção no sistema.
                    </p>
                  </div>
                </div>
              )}

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
                        {selected.currentCleaning.photoDate
                          ? new Date(selected.currentCleaning.photoDate).toLocaleString('pt-BR')
                          : new Date(selected.currentCleaning.createdAt).toLocaleString('pt-BR')}
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

                  {/* Informações da Equipe e Detalhes da Limpeza */}
                  <div className="text-sm text-slate-600 space-y-2 bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                    <div className="flex items-center justify-between text-xs pb-1.5 border-b border-slate-200">
                      <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-blue-600" />
                        Equipe Responsável:
                      </span>
                      <span className="font-bold text-blue-700 bg-blue-100/70 px-2.5 py-0.5 rounded text-xs">
                        {selected.currentCleaning.team || 'Não informada'}
                      </span>
                    </div>

                    <p className="flex items-center gap-2 text-xs">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      Enviado por: {selected.currentCleaning.cleanedBy || t('auth.system')}
                    </p>

                    <p className="flex items-center gap-2 text-xs">
                      <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
                      {t('cleaning.updatedAt')}:{' '}
                      {new Date(selected.currentCleaning.createdAt).toLocaleString('pt-BR')}
                    </p>

                    {selected.currentCleaning.notes && (
                      <div className="pt-1">
                        <p className="text-xs text-slate-400 mb-0.5">Observações:</p>
                        <p className="text-xs text-slate-600 italic bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                          &ldquo;{selected.currentCleaning.notes}&rdquo;
                        </p>
                      </div>
                    )}
                  </div>

                  {userRole === 'ADMIN' && !isEditing && (
                    <div className="pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="w-full py-2 px-3 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200 flex items-center justify-center gap-1.5"
                      >
                        Substituir / Atualizar Evidência (Admin)
                      </button>
                    </div>
                  )}

                  {userRole === 'ADMIN' && isEditing && (
                    <div className="pt-3 border-t border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 uppercase">
                          Atualizar Foto de Limpeza
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsEditing(false)}
                          className="text-xs text-slate-500 hover:text-slate-700 underline"
                        >
                          Cancelar
                        </button>
                      </div>
                      <CleaningUploadForm
                        repeaterId={selected.id}
                        userRole={userRole}
                        onDone={() => handleUploaded(selected.id)}
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex flex-col items-center justify-center gap-2 py-6 text-slate-400">
                    <XCircle className="w-10 h-10 text-red-400" />
                    <p className="text-sm text-center">{t('cleaning.pendingDescription')}</p>
                  </div>
                  <CleaningUploadForm
                    repeaterId={selected.id}
                    userRole={userRole}
                    onDone={() => handleUploaded(selected.id)}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
