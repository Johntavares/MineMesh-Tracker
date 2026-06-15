'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { Dictionary } from './server'

const TranslationContext = createContext<Dictionary | null>(null)

export function TranslationProvider({
  dictionary,
  children,
}: {
  dictionary: Dictionary
  children: ReactNode
}) {
  return (
    <TranslationContext.Provider value={dictionary}>
      {children}
    </TranslationContext.Provider>
  )
}

export function useT() {
  const dict = useContext(TranslationContext)
  if (!dict) throw new Error('useT must be used within TranslationProvider')
  return dict
}

type PathImpl<T, K extends keyof T> = K extends string
  ? T[K] extends Record<string, unknown>
    ? `${K}.${PathImpl<T[K], keyof T[K]>}`
    : `${K}`
  : never

type DictPath = PathImpl<Dictionary, keyof Dictionary>

export function useTranslation() {
  const dict = useT()

  function t(path: DictPath): string {
    const keys = path.split('.')
    let result: unknown = dict
    for (const key of keys) {
      if (result && typeof result === 'object' && key in result) {
        result = (result as Record<string, unknown>)[key]
      } else {
        return path
      }
    }
    return typeof result === 'string' ? result : path
  }

  return { t, dict }
}
