'use client'

import { useEffect } from 'react'

export function OfflineRouteWarmer({ lang }: { lang: string }) {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !navigator.onLine) {
      return
    }

    // Warm core offline routes in background after the dashboard mounts
    const timer = setTimeout(() => {
      const coreRoutes = [
        `/${lang}/map`,
        `/${lang}/dashboard`,
        `/${lang}/repeaters`,
        `/${lang}/cleaning`,
      ]

      coreRoutes.forEach((route) => {
        fetch(route, {
          method: 'GET',
          credentials: 'same-origin',
          headers: { Accept: 'text/html' },
        }).catch(() => {})
      })
    }, 1500)

    return () => clearTimeout(timer)
  }, [lang])

  return null
}
