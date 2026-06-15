'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function saveMineBoundary(mineId: string, coordinatesJson: string) {
  try {
    const coords = JSON.parse(coordinatesJson)
    
    await prisma.mine.update({
      where: { id: mineId },
      data: { 
        boundaryCoordinates: coords,
        version: { increment: 1 } // Increment version for offline sync reconciliation
      }
    })

    revalidatePath('/', 'layout')
    return { success: true }
  } catch (error) {
    console.error('Failed to save boundary:', error)
    return { success: false, error: 'Falha ao salvar limite operacional da mina.' }
  }
}

export async function getMineBoundary(mineId: string) {
  try {
    const mine = await prisma.mine.findUnique({
      where: { id: mineId },
      select: { boundaryCoordinates: true }
    })
    
    if (!mine || !mine.boundaryCoordinates) return null
    
    return {
      id: 'boundary-' + mineId,
      coordinates: mine.boundaryCoordinates as [number, number][]
    }
  } catch (error) {
    console.error('Failed to get boundary:', error)
    return null
  }
}
