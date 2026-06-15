'use client'

import { Trash2 } from 'lucide-react'
import { deleteRepeater } from '@/app/actions/repeaters'
import { useState } from 'react'
import { useTranslation } from '@/lib/i18n/client'

export function DeleteRepeaterButton({ id }: { id: string; lang: string }) {
  const [isDeleting, setIsDeleting] = useState(false)
  const { t } = useTranslation()

  const handleDelete = async () => {
    if (!confirm(t('repeaters.deleteConfirm'))) return
    
    setIsDeleting(true)
    await deleteRepeater(id)
    setIsDeleting(false)
  }

  return (
    <button 
      onClick={handleDelete}
      disabled={isDeleting}
      className="inline-flex p-2 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50"
      title={t('common.delete')}
    >
      <Trash2 className="w-4 h-4" />
    </button>
  )
}
