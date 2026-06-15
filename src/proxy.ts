import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { locales, defaultLocale, isLocale } from '@/lib/i18n/config'

function getLocale(request: NextRequest): string {
  const acceptLanguage = request.headers.get('accept-language') || ''
  const parsed = acceptLanguage
    .split(',')
    .map((l) => l.split(';')[0].trim().toLowerCase())

  for (const locale of parsed) {
    const exact = locales.find((l) => l.toLowerCase() === locale)
    if (exact) return exact
    const lang = locale.split('-')[0]
    const match = locales.find((l) => l.toLowerCase().startsWith(lang))
    if (match) return match
  }

  return defaultLocale
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const pathnameHasLocale = locales.some(
    (locale) =>
      pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  )

  if (pathnameHasLocale) {
    const raw = pathname.split('/')[1]
    const locale = isLocale(raw) ? raw : defaultLocale
    const response = NextResponse.next()
    response.cookies.set('NEXT_LOCALE', locale, { path: '/' })

    const isLoginPage = pathname === `/${locale}/login` || pathname.startsWith(`/${locale}/login/`)
    const isApiAuth = pathname.startsWith('/api/auth')
    const isStatic = pathname.startsWith('/_next/') || pathname === '/favicon.ico'

    if (!isLoginPage && !isApiAuth && !isStatic) {
      const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
      if (!token) {
        const loginUrl = new URL(`/${locale}/login`, request.url)
        return NextResponse.redirect(loginUrl)
      }
    }

    return response
  }

  const locale = getLocale(request)
  request.nextUrl.pathname = `/${locale}${pathname}`
  const response = NextResponse.redirect(request.nextUrl)
  response.cookies.set('NEXT_LOCALE', locale, { path: '/' })
  return response
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|uploads|.*\\.png$).*)',
  ],
}
