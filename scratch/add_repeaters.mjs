import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const mineId = 'default-mine'

// Find any admin user to set as updater
const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
const adminId = admin?.id || undefined

const newRepeaters = [
  { code: 'RPT-003', name: 'Repetidora Sul',     model: 'Rajante',  lat: -5.7792, lng: -50.5198, range: 250, status: 'ONLINE' },
  { code: 'RPT-004', name: 'Repetidora Leste',    model: 'JR3',      lat: -5.7748, lng: -50.5158, range: 120, status: 'ONLINE' },
  { code: 'RPT-005', name: 'Repetidora Oeste',    model: 'Rajante',  lat: -5.7742, lng: -50.5242, range: 250, status: 'ONLINE' },
  { code: 'RPT-006', name: 'Repetidora Nordeste', model: 'JR3',      lat: -5.7718, lng: -50.5172, range: 120, status: 'ONLINE' },
  { code: 'RPT-007', name: 'Repetidora Noroeste', model: 'JR3',      lat: -5.7722, lng: -50.5230, range: 120, status: 'ONLINE' },
  { code: 'RPT-008', name: 'Repetidora Sudeste',  model: 'Rajante',  lat: -5.7785, lng: -50.5165, range: 250, status: 'ONLINE' },
  { code: 'RPT-009', name: 'Repetidora Sudoeste', model: 'Rajante',  lat: -5.7788, lng: -50.5235, range: 250, status: 'MAINTENANCE' },
  { code: 'RPT-010', name: 'Repetidora Central 2',model: 'JR3',      lat: -5.7745, lng: -50.5195, range: 120, status: 'ONLINE' },
]

try {
  for (const r of newRepeaters) {
    await prisma.repeater.create({
      data: {
        mineId,
        code: r.code,
        name: r.name,
        model: r.model,
        status: r.status,
        latitude: r.lat,
        longitude: r.lng,
        range: r.range,
        altitude: 900,
        ...(adminId ? { updatedById: adminId } : {}),
      }
    })
    console.log(`✓ ${r.code} - ${r.name} (${r.model}, ${r.range}m, ${r.status})`)
  }

  const total = await prisma.repeater.count({ where: { mineId, deletedAt: null } })
  console.log(`\nTotal de repetidoras: ${total}`)
} catch (e) { console.error(e) }
finally { await prisma.$disconnect() }
