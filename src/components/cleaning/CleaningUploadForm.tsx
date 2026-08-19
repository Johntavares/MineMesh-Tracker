'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n/client'
import { saveCleaning } from '@/app/actions/cleaning'
import { Camera, Upload, CheckCircle2, Loader2, MapPin } from 'lucide-react'

function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 30000 }
    )
  })
}

export function CleaningUploadForm({
  repeaterId,
  onDone,
}: {
  repeaterId: string
  onDone?: () => void
}) {
  const router = useRouter()
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'found' | 'unavailable'>('idle')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (preview) URL.revokeObjectURL(preview)
      setPreview(URL.createObjectURL(file))
      setError('')
      setSuccess(false)
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

    const position = await getPosition()
    setLocationStatus(position ? 'found' : 'unavailable')

    const formData = new FormData(form)
    formData.set('repeaterId', repeaterId)
    if (position) {
      formData.set('latitude', String(position.lat))
      formData.set('longitude', String(position.lng))
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

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed text-sm font-medium transition-colors ${
          preview
            ? 'border-emerald-400 text-emerald-600 bg-emerald-50'
            : 'border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 bg-slate-50'
        }`}
      >
        <Camera className="w-4 h-4" />
        {preview ? t('cleaning.changePhoto') : t('cleaning.uploadPhoto')}
      </button>

      <input
        ref={fileRef}
        type="file"
        name="photo"
        accept="image/jpeg,image/png,image/webp,image/heic"
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

      <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <MapPin className="w-3 h-3 shrink-0" />
        {locationStatus === 'found'
          ? t('cleaning.locationSaved')
          : locationStatus === 'unavailable'
            ? t('cleaning.locationUnavailable')
            : t('cleaning.locationHint')}
      </p>

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