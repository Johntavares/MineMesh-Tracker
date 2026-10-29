'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n/client'
import { saveCleaning } from '@/app/actions/cleaning'
import { Camera, Upload, CheckCircle2, Loader2, MapPin, ShieldCheck, Navigation } from 'lucide-react'

export function CleaningUploadForm({
  repeaterId,
  userRole = 'OPERATOR',
  onDone,
}: {
  repeaterId: string
  userRole?: string
  onDone?: () => void
}) {
  const router = useRouter()
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [deviceCoords, setDeviceCoords] = useState<{ lat: number; lng: number } | null>(null)

  const isAdmin = userRole === 'ADMIN'

  const requestLocation = () => {
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setDeviceCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          })
        },
        (err) => {
          console.warn('[CLEANING] Geolocation error:', err.message)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      )
    }
  }

  useEffect(() => {
    requestLocation()
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (preview) URL.revokeObjectURL(preview)
      setPreview(URL.createObjectURL(file))
      setError('')
      setSuccess(false)
      requestLocation()
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const file = fileRef.current?.files?.[0]

    if (!file) {
      setError(t('cleaning.photoRequired'))
      return
    }

    setLoading(true)
    setError('')

    const formData = new FormData(form)
    formData.set('repeaterId', repeaterId)
    if (deviceCoords) {
      formData.set('browserLat', deviceCoords.lat.toString())
      formData.set('browserLng', deviceCoords.lng.toString())
    }

    const result = await saveCleaning(formData)

    setLoading(false)
    if (result.success) {
      setSuccess(true)
      setPreview(null)
      if (fileRef.current) fileRef.current.value = ''
      form.reset()
      router.refresh()
      onDone?.()
    } else {
      setError(result.error || t('cleaning.error'))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input type="hidden" name="repeaterId" value={repeaterId} />
      {deviceCoords && (
        <>
          <input type="hidden" name="browserLat" value={deviceCoords.lat} />
          <input type="hidden" name="browserLng" value={deviceCoords.lng} />
        </>
      )}

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed text-sm font-medium transition-colors ${
          preview
            ? 'border-emerald-400 text-emerald-600 bg-emerald-50'
            : isAdmin
            ? 'border-blue-300 text-blue-600 hover:border-blue-500 hover:bg-blue-50/50 bg-slate-50'
            : 'border-emerald-300 text-emerald-700 hover:border-emerald-500 hover:bg-emerald-50/50 bg-slate-50'
        }`}
      >
        <Camera className="w-4 h-4" />
        {preview
          ? t('cleaning.changePhoto')
          : isAdmin
          ? 'Selecionar ou Tirar Foto (Admin)'
          : 'Tirar Foto ou Escolher da Galeria'}
      </button>

      {/* Input de arquivo sem restrição forçada de capture, permitindo câmera ou galeria */}
      <input
        ref={fileRef}
        type="file"
        name="photo"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {preview && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={preview}
          alt="Pré-visualização da evidência"
          className="w-full h-40 object-cover rounded-lg border border-slate-200"
        />
      )}

      <textarea
        name="notes"
        rows={2}
        placeholder={t('cleaning.notesPlaceholder')}
        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />

      <input
        type="text"
        name="team"
        placeholder="Nome da Equipe (opcional)"
        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {isAdmin ? (
        <div className="flex items-start gap-2 text-xs text-blue-800 bg-blue-50/80 p-2.5 rounded-lg border border-blue-200">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold text-blue-900">Modo Administrador Habilitado</p>
            <p className="text-[11px] text-blue-700">
              Você pode realizar uploads retroativos a qualquer momento, incluindo imagens da galeria ou fotos sem restrição de data/horário. A localização da repetidora no mapa não será alterada.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 text-xs text-emerald-900 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
          <Navigation className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold text-emerald-950">Registro de Evidência de Campo</p>
            <p className="text-[11px] text-emerald-800">
              Tire a foto no local ou selecione da galeria. {deviceCoords ? '✓ Localização GPS do dispositivo detectada.' : 'A localização será registrada automaticamente com os dados da foto ou do dispositivo.'}
            </p>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('cleaning.sending')}
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            {t('cleaning.send')}
          </>
        )}
      </button>

      {success && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {t('cleaning.success')}
        </p>
      )}
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </form>
  )
}