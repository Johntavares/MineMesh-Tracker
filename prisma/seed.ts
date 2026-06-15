import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // 0. Clean up existing data to ensure fresh seeding
  await prisma.auditLog.deleteMany({})
  await prisma.repeater.deleteMany({})
  await prisma.obstacle.deleteMany({})
  await prisma.mine.deleteMany({})

  // 1. Create admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@mesh.local' },
    update: {},
    create: {
      email: 'admin@mesh.local',
      name: 'Administrador',
      password: 'admin',
      role: 'ADMIN',
    },
  })

  // 2. Create default Mine with georeferenced fields as native JSON
  const mine = await prisma.mine.upsert({
    where: { id: 'default-mine' },
    update: {},
    create: {
      id: 'default-mine',
      name: 'Mina do Salobo',
      description: 'Operação de extração de cobre e ouro - Mina do Salobo',
      imageUrl: '/uploads/1781013925413-WhatsApp_Image_2026_06_09_at_11.00.27.jpeg',
      opacity: 0.85,
      centerLat: -5.789570417860321,
      centerLng: -50.535004099999995,
      defaultZoom: 14,
      imageBounds: undefined,
      boundaryCoordinates: [],
      gridResolution: 40,
      isCalibrated: false,
      calibrationAccuracy: null,
      terrainEnabled: false,
      terrainSource: null,
      terrainResolution: null,
    },
  })

  // 3. Create default Obstacles (coordinates as native JSON)
  // Obstacle 1: Paredão Central (100% Shadow / Attenuation)
  const wallCoords = [
    [-5.7875, -50.5340],
    [-5.7875, -50.5320],
    [-5.7865, -50.5320],
    [-5.7865, -50.5340]
  ]
  await prisma.obstacle.upsert({
    where: { id: 'default-obstacle-wall' },
    update: {},
    create: {
      id: 'default-obstacle-wall',
      name: 'Paredão Central (Sombra Total)',
      type: 'WALL',
      coordinates: wallCoords,
      attenuation: 1.0,
      mineId: mine.id,
    }
  })

  // Obstacle 2: Talude Leste (50% Attenuation)
  const slopeCoords = [
    [-5.7930, -50.5380],
    [-5.7930, -50.5360],
    [-5.7910, -50.5360],
    [-5.7910, -50.5380]
  ]
  await prisma.obstacle.upsert({
    where: { id: 'default-obstacle-slope' },
    update: {},
    create: {
      id: 'default-obstacle-slope',
      name: 'Talude Leste (50% Perda)',
      type: 'SLOPE',
      coordinates: slopeCoords,
      attenuation: 0.5,
      mineId: mine.id,
    }
  })

  // 4. Create default Repeaters
  const r1 = await prisma.repeater.upsert({
    where: { code: 'RPT-001' },
    update: {},
    create: {
      name: 'Repetidora Central',
      code: 'RPT-001',
      model: 'Rajante',
      status: 'ONLINE',
      latitude: -5.789570417860321,
      longitude: -50.535004099999995,
      altitude: 850.0,
      range: 250,
      mineId: mine.id,
      updatedById: admin.id,
    },
  })

  const r2 = await prisma.repeater.upsert({
    where: { code: 'RPT-002' },
    update: {},
    create: {
      name: 'Repetidora Norte',
      code: 'RPT-002',
      model: 'JR3',
      status: 'MAINTENANCE',
      latitude: -5.783000,
      longitude: -50.530000,
      altitude: 875.0,
      range: 120,
      mineId: mine.id,
      updatedById: admin.id,
    },
  })

  console.log('Seeding completed successfully:', { admin, mine, r1, r2 })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
