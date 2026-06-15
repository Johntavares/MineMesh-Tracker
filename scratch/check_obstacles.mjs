import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
try {
  const obstacles = await prisma.obstacle.findMany({ where: { mineId: 'default-mine', deletedAt: null } })
  console.log(JSON.stringify(obstacles.map(o => ({
    id: o.id,
    name: o.name,
    type: o.type,
    coordinates: o.coordinates,
    attenuation: o.attenuation,
  })), null, 2))
} catch (e) { console.error(e) }
finally { await prisma.$disconnect() }
