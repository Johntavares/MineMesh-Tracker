import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // 0. Clean up existing data to ensure fresh seeding
  await prisma.auditLog.deleteMany({})
  await prisma.repeater.deleteMany({})
  await prisma.obstacle.deleteMany({})
  await prisma.mine.deleteMany({})

  const hashedAdminPassword = await bcrypt.hash('admin', 10)

  // 1. Create admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@mesh.local' },
    update: {
      password: hashedAdminPassword,
    },
    create: {
      email: 'admin@mesh.local',
      name: 'Administrador',
      password: hashedAdminPassword,
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
      imageBounds: [
        [-5.79582, -50.543774],
        [-5.78332, -50.526234]
      ],
      boundaryCoordinates: [
        [-5.79582, -50.543774],
        [-5.79582, -50.526234],
        [-5.78332, -50.526234],
        [-5.78332, -50.543774]
      ],
      gridResolution: 40,
      isCalibrated: true,
      calibrationAccuracy: 0.0,
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
  const repeatersData = [
    {
      name: 'Repetidora Central',
      code: 'RPT-001',
      model: 'Rajante',
      status: 'ONLINE',
      latitude: -5.78957,
      longitude: -50.535004,
      altitude: 850.0,
      range: 250,
    },
    {
      name: 'Repetidora Norte',
      code: 'RPT-002',
      model: 'JR3',
      status: 'ONLINE',
      latitude: -5.788379,
      longitude: -50.532210,
      altitude: 875.0,
      range: 180,
    },
    {
      name: 'Repetidora Sul',
      code: 'RPT-003',
      model: 'JR3',
      status: 'ONLINE',
      latitude: -5.791508,
      longitude: -50.536575,
      altitude: 860.0,
      range: 150,
    },
    {
      name: 'Repetidora Leste',
      code: 'RPT-004',
      model: 'Rajante',
      status: 'ONLINE',
      latitude: -5.788732,
      longitude: -50.528174,
      altitude: 865.0,
      range: 160,
    },
    {
      name: 'Repetidora Oeste',
      code: 'RPT-005',
      model: 'Rajante',
      status: 'ONLINE',
      latitude: -5.790284,
      longitude: -50.541168,
      altitude: 855.0,
      range: 170,
    },
    {
      name: 'Repetidora Nordeste',
      code: 'RPT-006',
      model: 'JR3',
      status: 'MAINTENANCE',
      latitude: -5.785767,
      longitude: -50.533242,
      altitude: 870.0,
      range: 140,
    },
    {
      name: 'Repetidora Noroeste',
      code: 'RPT-007',
      model: 'JR3',
      status: 'ONLINE',
      latitude: -5.787521,
      longitude: -50.538646,
      altitude: 868.0,
      range: 130,
    },
    {
      name: 'Repetidora Sudeste',
      code: 'RPT-008',
      model: 'Rajante',
      status: 'ONLINE',
      latitude: -5.793338,
      longitude: -50.529651,
      altitude: 848.0,
      range: 190,
    },
    {
      name: 'Repetidora Sudoeste',
      code: 'RPT-009',
      model: 'Rajante',
      status: 'OFFLINE',
      latitude: -5.792871,
      longitude: -50.527846,
      altitude: 845.0,
      range: 120,
    },
    {
      name: 'Repetidora Centro-Leste',
      code: 'RPT-010',
      model: 'JR3',
      status: 'ONLINE',
      latitude: -5.790978,
      longitude: -50.529557,
      altitude: 858.0,
      range: 150,
    },
    {
      name: 'Root Fibra Noroeste',
      code: 'ROOT-001',
      model: 'Rajante',
      status: 'ONLINE',
      latitude: -5.786521,
      longitude: -50.540646,
      altitude: 880.0,
      range: 300,
      notes: 'Conectado diretamente à Fibra Óptica',
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
      notes: 'Conectado diretamente à Fibra Óptica',
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
      notes: 'Conectado diretamente à Fibra Óptica',
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
      notes: 'Conectado diretamente à Fibra Óptica',
    }
  ]

  const createdRepeaters = []
  for (const rep of repeatersData) {
    const created = await prisma.repeater.upsert({
      where: { code: rep.code },
      update: {},
      create: {
        ...rep,
        mineId: mine.id,
        updatedById: admin.id,
      }
    })
    createdRepeaters.push(created)
  }

  console.log('Seeding completed successfully:', { admin, mine, createdRepeaters })
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
