import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
try {
  const mine = await prisma.mine.findUnique({ where: { id: 'default-mine' } })
  console.log(JSON.stringify({
    id: mine.id,
    name: mine.name,
    centerLat: mine.centerLat,
    centerLng: mine.centerLng,
    defaultZoom: mine.defaultZoom,
    isCalibrated: mine.isCalibrated,
    boundaryCoordinates: mine.boundaryCoordinates,
    imageBounds: mine.imageBounds,
    imageUrl: mine.imageUrl,
    gridResolution: mine.gridResolution,
  }, null, 2))
} catch (e) { console.error(e) }
finally { await prisma.$disconnect() }
