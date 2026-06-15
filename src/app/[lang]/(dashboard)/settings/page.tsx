import { prisma } from '@/lib/prisma'
import { GeoreferenceWizard } from '@/components/settings/GeoreferenceWizard'
import { getDictionary } from '@/lib/i18n/server'
import { isLocale } from '@/lib/i18n/config'
import { notFound } from 'next/navigation'

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  const dict = await getDictionary(lang)

  const currentMine = await prisma.mine.findUnique({
    where: { id: 'default-mine' }
  })

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-slate-900 mb-8">{dict.settings.title}</h1>
      
      <div className="space-y-8">
        <GeoreferenceWizard
          mineId="default-mine"
          currentName={currentMine?.name}
          currentDescription={currentMine?.description || ''}
          currentImageUrl={currentMine?.imageUrl || ''}
          currentOpacity={currentMine?.opacity}
          currentGridResolution={currentMine?.gridResolution}
          currentCenterLat={currentMine?.centerLat}
          currentCenterLng={currentMine?.centerLng}
          currentTerrainEnabled={currentMine?.terrainEnabled}
          currentTerrainSource={currentMine?.terrainSource}
          currentTerrainResolution={currentMine?.terrainResolution}
          currentHeatRadius={currentMine?.heatRadius}
          currentHeatBlur={currentMine?.heatBlur}
          currentHeatIntensity={currentMine?.heatIntensity}
          lang={lang}
        />
      </div>
    </div>
  )
}

