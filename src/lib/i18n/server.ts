import 'server-only'
import { type Locale } from './config'

const dictionaries = {
  'pt-BR': () => import('./dictionaries/pt-BR.json').then((m) => m.default),
  en: () => import('./dictionaries/en.json').then((m) => m.default),
} as const

export type Dictionary = Awaited<ReturnType<typeof getDictionary>>

export async function getDictionary(locale: Locale) {
  return dictionaries[locale]()
}
