import { Sidebar } from '@/components/layout/Sidebar'
import { OfflineRouteWarmer } from '@/components/OfflineRouteWarmer'

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar lang={lang} />
      <OfflineRouteWarmer lang={lang} />
      <main className="flex-1 overflow-hidden pb-16 md:pb-0">
        {children}
      </main>
    </div>
  )
}

