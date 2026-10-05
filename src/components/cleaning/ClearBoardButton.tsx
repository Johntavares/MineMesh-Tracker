'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { clearCleaningBoard } from '@/app/actions/cleaning'

export function ClearBoardButton() {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleClear = async () => {
    if (!confirm('Tem certeza que deseja zerar o quadro de limpeza? Todos os registros da semana atual serão apagados.')) {
      return
    }

    setIsLoading(true)
    try {
      const res = await clearCleaningBoard()
      if (res.success) {
        router.refresh()
      } else {
        alert(res.error || 'Erro ao zerar o quadro.')
      }
    } catch (e) {
      alert('Erro ao zerar o quadro.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <button
      onClick={handleClear}
      disabled={isLoading}
      className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-orange-500 hover:bg-orange-600 transition-colors text-white text-xs sm:text-sm font-semibold disabled:opacity-50"
      title="Zerar Quadro de Limpeza"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">Zerar</span>
    </button>
  )
}
