export const dynamic = 'force-dynamic'

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

  // Auto-seed root repeaters if they don't exist yet
  const rootCount = await prisma.repeater.count({
    where: { code: { startsWith: 'ROOT-' }, deletedAt: null }
  })
  if (rootCount === 0) {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
    const adminId = admin?.id || null
    const roots = [
      {
        name: 'Root Fibra Noroeste',
        code: 'ROOT-001',
        model: 'Rajante',
        status: 'ONLINE',
        latitude: -5.786521,
        longitude: -50.540646,
        altitude: 880.0,
        range: 300,
        mineId: 'default-mine',
        updatedById: adminId,
        notes: 'Conectado diretamente à Fibra Óptica'
      },
      {
        name: 'Root Fibra Nordeste',
        code: 'ROOT-002',
        model: 'Rajante',
        status: 'ONLINE',
        latitude: -5.784767,
        longitude: -50.530242,
        altitude: 870.0,
        range: 300,
        mineId: 'default-mine',
        updatedById: adminId,
        notes: 'Conectado diretamente à Fibra Óptica'
      },
      {
        name: 'Root Fibra Sudeste',
        code: 'ROOT-003',
        model: 'Rajante',
        status: 'ONLINE',
        latitude: -5.792338,
        longitude: -50.526651,
        altitude: 850.0,
        range: 300,
        mineId: 'default-mine',
        updatedById: adminId,
        notes: 'Conectado diretamente à Fibra Óptica'
      },
      {
        name: 'Root Fibra Sul-Oeste',
        code: 'ROOT-004',
        model: 'Rajante',
        status: 'ONLINE',
        latitude: -5.793508,
        longitude: -50.539575,
        altitude: 845.0,
        range: 300,
        mineId: 'default-mine',
        updatedById: adminId,
        notes: 'Conectado diretamente à Fibra Óptica'
      }
    ]
    for (const r of roots) {
      await prisma.repeater.upsert({
        where: { code: r.code },
        update: {
          deletedAt: null
        },
        create: r
      })
    }
  }

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

