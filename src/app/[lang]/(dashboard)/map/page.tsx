import { prisma } from '@/lib/prisma'
import { MineMapWrapper } from '@/components/map/MineMapWrapper'
import { getDictionary } from '@/lib/i18n/server'
import { isLocale } from '@/lib/i18n/config'
import { notFound } from 'next/navigation'

export default async function MapPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  const dict = await getDictionary(lang)

  // Fetch the default mine and its georeferenced entities
  const mine = await prisma.mine.findUnique({
    where: { id: 'default-mine' },
    include: {
      repeaters: {
        where: { deletedAt: null },
        include: {
          updatedBy: true
        }
      },
      obstacles: {
        where: { deletedAt: null }
      },
    }
  })

  // Fallback map config if no mine is configured yet
  const mapConfig = mine ? {
    imageUrl: mine.imageUrl,
    opacity: mine.opacity,
    bounds: mine.imageBounds as any,
    centerLat: mine.centerLat,
    centerLng: mine.centerLng,
    defaultZoom: mine.defaultZoom,
    gridResolution: mine.gridResolution,
    isCalibrated: mine.isCalibrated,
    calibrationAccuracy: mine.calibrationAccuracy,
  } : null

  const heatConfig = {
    radius: mine?.heatRadius ?? 60,
    blur: mine?.heatBlur ?? 40,
    intensity: mine?.heatIntensity ?? 0.8,
  }

  const boundary = mine && mine.boundaryCoordinates ? {
    id: 'boundary-' + mine.id,
    coordinates: mine.boundaryCoordinates as [number, number][],
  } : null

  const obstacles = mine?.obstacles.map((o: any) => ({
    id: o.id,
    name: o.name,
    type: o.type,
    coordinates: o.coordinates as [number, number][],
    attenuation: o.attenuation,
  })) || []

  const repeaters = mine?.repeaters.map((r: any) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    model: r.model,
    status: r.status,
    range: r.range,
    latitude: r.latitude,
    longitude: r.longitude,
    altitude: r.altitude,
    locationDescription: r.locationDescription,
    updatedAt: r.updatedAt.toISOString(),
    updatedBy: r.updatedBy ? { name: r.updatedBy.name } : null,
  })) || []

  return (
    <MineMapWrapper 
      mineId={mine?.id || 'default-mine'}
      repeaters={repeaters} 
      mapConfig={mapConfig} 
      heatConfig={heatConfig}
      boundary={boundary}
      obstacles={obstacles}
      lang={lang}
    />
  )
}

