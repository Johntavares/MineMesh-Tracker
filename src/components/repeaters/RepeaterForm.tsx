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
      
      <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700">{t('repeaters.form.nameLabel')}</label>
          <input 
            type="text" 
            name="name" 
            required
            defaultValue={initialData?.name}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" 
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">{t('repeaters.form.codeLabel')}</label>
          <input 
            type="text" 
            name="code" 
            required
            defaultValue={initialData?.code}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" 
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">{t('repeaters.form.modelLabel')}</label>
          <input 
            type="text" 
            name="model" 
            required
            defaultValue={initialData?.model}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" 
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
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" 
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700">{t('repeaters.form.notesLabel')}</label>
          <textarea 
            name="notes" 
            rows={3}
            defaultValue={initialData?.notes || ''}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" 
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
