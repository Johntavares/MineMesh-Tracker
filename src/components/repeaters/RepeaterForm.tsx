'use client'

import { saveRepeater } from '@/app/actions/saveRepeater'
import { useState } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/client'

type Repeater = {
  id?: string
  mineId?: string
  name: string
  code: string
  model: string
  status: string
  notes?: string | null
  range: number
  latitude?: number | null
  longitude?: number | null
}

export function RepeaterForm({ initialData, lang }: { initialData?: Repeater; lang: string }) {
  const [loading, setLoading] = useState(false)
  const { t } = useTranslation()

  const isRoot = initialData?.code.toUpperCase().startsWith('ROOT') || initialData?.name.toUpperCase().startsWith('ROOT')
  const is320 = initialData?.code.toLowerCase().includes('320') || initialData?.name.toLowerCase().includes('320')
  const isFixed = !!(isRoot || is320)

  return (
    <form 
      action={async (formData) => {
        setLoading(true)
        await saveRepeater(formData)
      }} 
      className="bg-white p-4 sm:p-8 rounded-xl shadow-sm border border-slate-100 max-w-2xl"
    >
      {initialData?.id && <input type="hidden" name="id" value={initialData.id} />}
      <input type="hidden" name="mineId" value={initialData?.mineId || 'default-mine'} />
      
      {isFixed && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-semibold flex items-center gap-2">
          <span>⚠️</span>
          <span>Este ponto está fixado como referência de calibração. Apenas o Status pode ser alterado.</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700">{t('repeaters.form.nameLabel')}</label>
          <input 
            type="text" 
            name="name" 
            required
            defaultValue={initialData?.name}
            readOnly={isFixed}
            className={`mt-1 block w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
              isFixed ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed select-none' : 'text-slate-900 border-slate-300 focus:border-blue-500'
            }`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">{t('repeaters.form.codeLabel')}</label>
          <input 
            type="text" 
            name="code" 
            required
            defaultValue={initialData?.code}
            readOnly={isFixed}
            className={`mt-1 block w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
              isFixed ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed select-none' : 'text-slate-900 border-slate-300 focus:border-blue-500'
            }`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">{t('repeaters.form.modelLabel')}</label>
          <input 
            type="text" 
            name="model" 
            required
            defaultValue={initialData?.model}
            readOnly={isFixed}
            className={`mt-1 block w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
              isFixed ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed select-none' : 'text-slate-900 border-slate-300 focus:border-blue-500'
            }`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">{t('repeaters.form.statusLabel')}</label>
          <select 
            name="status" 
            defaultValue={initialData?.status || 'OFFLINE'}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ONLINE">{t('repeaters.form.optionOnline')}</option>
            <option value="OFFLINE">{t('repeaters.form.optionOffline')}</option>
            <option value="MAINTENANCE">{t('repeaters.form.optionMaintenance')}</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">{t('repeaters.form.rangeLabel')}</label>
          <input 
            type="number" 
            name="range" 
            required
            min="1"
            defaultValue={initialData?.range || 100}
            readOnly={isFixed}
            className={`mt-1 block w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
              isFixed ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed select-none' : 'text-slate-900 border-slate-300 focus:border-blue-500'
            }`}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700">{t('repeaters.form.notesLabel')}</label>
          <textarea 
            name="notes" 
            rows={3}
            defaultValue={initialData?.notes || ''}
            readOnly={isFixed}
            className={`mt-1 block w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
              isFixed ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed select-none' : 'text-slate-900 border-slate-300 focus:border-blue-500'
            }`}
          />
        </div>
        
        {initialData?.latitude && <input type="hidden" name="latitude" value={initialData.latitude} />}
        {initialData?.longitude && <input type="hidden" name="longitude" value={initialData.longitude} />}
      </div>

      <div className="mt-8 flex flex-col-reverse sm:flex-row gap-3 sm:gap-0 sm:space-x-3 justify-end">
        <Link 
          href={`/${lang}/repeaters`}
          className="inline-flex justify-center items-center px-5 py-3 sm:px-4 sm:py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors w-full sm:w-auto text-center"
        >
          {t('common.cancel')}
        </Link>
        <button 
          type="submit"
          disabled={loading}
          className="inline-flex justify-center items-center px-5 py-3 sm:px-4 sm:py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 w-full sm:w-auto text-center"
        >
          {loading ? t('repeaters.form.saving') : t('repeaters.form.save')}
        </button>
      </div>
    </form>
  )
}
