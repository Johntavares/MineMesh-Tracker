import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
try {
  const repeaters = await prisma.repeater.findMany({ where: { mineId: 'default-mine', deletedAt: null } })
  console.log(JSON.stringify(repeaters.map(r => ({
    id: r.id,
    name: r.name,
    code: r.code,
    model: r.model,
    status: r.status,
    latitude: r.latitude,
    longitude: r.longitude,
    range: r.range,
  })), null, 2))
} catch (e) { console.error(e) }
finally { await prisma.$disconnect() }
