'use client'

import { useEffect } from 'react'

export function OfflineRouteWarmer({ lang }: { lang: string }) {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !navigator.onLine) {
      return
    }

    // Warm routes sequentially with 3s interval so it never bogs down the active page
    const routes = [
      `/${lang}/map`,
      `/${lang}/dashboard`,
      `/${lang}/repeaters`,
      `/${lang}/cleaning`,
    ]
    let index = 0

    const timer = setTimeout(() => {
      const interval = setInterval(() => {
        if (index >= routes.length) {
          clearInterval(interval)
          return
        }
        const route = routes[index++]
        fetch(route, {
          method: 'GET',
          credentials: 'same-origin',
          headers: { Accept: 'text/html' },
        }).catch(() => {})
      }, 3000)
    }, 4000)

    return () => clearTimeout(timer)
  }, [lang])

  return null
}
