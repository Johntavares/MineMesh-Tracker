'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function saveObstacle(data: FormData) {
  const id = data.get('id') as string | null
  const name = (data.get('name') as string) || 'Obstáculo'
  const type = (data.get('type') as string) || 'SLOPE'
  const coordinatesStr = data.get('coordinates') as string
  const attenuation = Number(data.get('attenuation')) || 0.5
  const mineId = (data.get('mineId') as string) || 'default-mine'

  try {
    const coordinates = JSON.parse(coordinatesStr)

    const payload = {
      name,
      type,
      coordinates,
      attenuation,
      mineId,
    }

    if (id) {
      await prisma.obstacle.update({
        where: { id },
        data: {
          ...payload,
          version: { increment: 1 }
        },
      })
    } else {
      await prisma.obstacle.create({
        data: {
          ...payload,
          version: 1
        },
      })
    }

    revalidatePath('/', 'layout')
    return { success: true }
  } catch (error) {
    console.error('Failed to save obstacle:', error)
    return { success: false, error: 'Falha ao salvar obstáculo.' }
  }
}

export async function deleteObstacle(id: string) {
  try {
    // Implement Soft Delete
    await prisma.obstacle.update({
      where: { id },
      data: { 
        deletedAt: new Date(),
        version: { increment: 1 }
      },
    })

    revalidatePath('/', 'layout')
    return { success: true }
  } catch (error) {
    console.error('Failed to delete obstacle:', error)
    return { success: false, error: 'Falha ao excluir obstáculo.' }
  }
}
