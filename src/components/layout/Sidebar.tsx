'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Map, Radio, History, Settings, LogOut, Users } from 'lucide-react'
import { signOut, useSession } from 'next-auth/react'
import { useTranslation } from '@/lib/i18n/client'

interface SidebarProps {
  lang: string
}

export function Sidebar({ lang }: SidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'
  const { t } = useTranslation()

  const navigation = [
    { name: t('nav.dashboard'), href: `/${lang}/dashboard`, icon: Home },
    { name: t('nav.map'), href: `/${lang}/map`, icon: Map },
    { name: t('nav.repeaters'), href: `/${lang}/repeaters`, icon: Radio },
    { name: t('nav.logs'), href: `/${lang}/logs`, icon: History },
    { name: 'Usuários', href: `/${lang}/users`, icon: Users, adminOnly: true },
    { name: t('nav.settings'), href: `/${lang}/settings`, icon: Settings, adminOnly: true },
  ]

  const filteredNav = navigation.filter((item) => !(item.adminOnly && !isAdmin))

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-col md:w-64 bg-slate-900 text-white">
        <div className="flex h-16 items-center px-6 font-bold text-xl tracking-wider text-blue-400">
          <Radio className="mr-2" />
          {t('brand.name')}
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {filteredNav.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center px-3 py-3 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="mb-4 px-2">
            <p className="text-sm font-medium text-white truncate">{session?.user?.name}</p>
            <p className="text-xs text-slate-400 truncate">{session?.user?.email}</p>
            <p className="text-xs text-blue-400 mt-1 uppercase font-bold tracking-wider">{session?.user?.role}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: `/${lang}/login` })}
            className="flex w-full items-center px-3 py-2 text-sm font-medium text-slate-300 rounded-md hover:bg-red-900/50 hover:text-red-300 transition-colors"
          >
            <LogOut className="mr-3 h-5 w-5" />
            {t('auth.signOut')}
          </button>
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-slate-900 border-t border-slate-800" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <nav className="flex items-center justify-around h-14 px-1">
          {filteredNav
            .filter((item) => !item.adminOnly)
            .map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[52px] min-w-[56px] px-2 py-1 rounded-lg transition-colors relative ${
                  isActive ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium leading-tight">{item.name}</span>
                {isActive && (
                  <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-400" />
                )}
              </Link>
            )
          })}
        </nav>
      </div>
    </>
  )
}
