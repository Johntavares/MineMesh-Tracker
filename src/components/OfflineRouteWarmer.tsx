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

    let interval: ReturnType<typeof setInterval> | null = null

    const timer = setTimeout(() => {
      interval = setInterval(() => {
        if (index >= routes.length) {
          if (interval) clearInterval(interval)
          return
        }
        const route = routes[index++]
        fetch(route, {
          method: 'GET',
          credentials: 'same-origin',
          headers: { Accept: 'text/html' },
        })
          .then(async (res) => {
            if (res.ok && 'caches' in window) {
              const text = await res.text()
              const cache = await caches.open('mesh-monitor-v14')
              const clean = new Response(text, {
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
                status: 200,
              })
              await cache.put(route, clean.clone())
              if (route.includes('/map')) {
                await cache.put('/pt-BR/map', clean.clone())
                await cache.put('/__offline_shell__', clean.clone())
              }
            }
          })
          .catch(() => {})
      }, 3000)
    }, 4000)

    return () => {
      clearTimeout(timer)
      if (interval) clearInterval(interval)
    }
  }, [lang])

  return null
}
