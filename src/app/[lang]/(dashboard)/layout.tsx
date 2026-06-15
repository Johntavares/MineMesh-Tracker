import { Sidebar } from '@/components/layout/Sidebar'

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
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  )
}
