import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const mine = await prisma.mine.findUnique({
    where: { id: 'default-mine' }
  })
  console.log('MINE_SETTINGS:')
  console.log(JSON.stringify(mine, null, 2))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
