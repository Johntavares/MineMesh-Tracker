'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { isLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function deleteRepeater(id: string) {
  try {
    // Implement Soft Delete
    await prisma.repeater.update({
      where: { id },
      data: { 
        deletedAt: new Date(),
        version: { increment: 1 }
      }
    })
    
    revalidatePath('/', 'layout')
    return { success: true }
  } catch (error) {
    console.error(error)
    const cookieStore = await cookies()
    const lang = cookieStore.get('NEXT_LOCALE')?.value || 'pt-BR'
    const locale = isLocale(lang) ? lang : 'pt-BR'
    const dict = await getDictionary(locale)
    return { success: false, error: dict.errors.deleteRepeater }
  }
}

export async function updateRepeaterLocation(
  id: string,
  latitude: number,
  longitude: number,
  locationDescription?: string
) {
  try {
    const session = await getServerSession(authOptions)

    // Fetch old coordinates and check if repeater is fixed (ROOT or 320)
    const oldRepeater = await prisma.repeater.findUnique({
      where: { id },
      select: { code: true, name: true, latitude: true, longitude: true, locationDescription: true }
    })

    if (oldRepeater) {
      const codeUpper = (oldRepeater.code || '').toUpperCase()
      const nameUpper = (oldRepeater.name || '').toUpperCase()
      const is320 = codeUpper.includes('320') || nameUpper.includes('320')

      // ROOT repeaters (except 320 which is allowed for field georeferencing) require Admin
      const isRoot = (codeUpper.startsWith('ROOT') || nameUpper.startsWith('ROOT')) && !is320
      if (isRoot && session?.user?.role !== 'ADMIN') {
        return { 
          success: false, 
          error: 'Apenas Administradores podem ajustar a localização de repetidoras ROOT.' 
        }
      }
    }

    // Perform update
    const updated = await prisma.repeater.update({
      where: { id },
      data: { 
        latitude, 
        longitude, 
        locationDescription,
        updatedById: session?.user?.id || null,
        version: { increment: 1 }
      },
      include: {
        mine: true
      }
    })

    // Log old vs new values in AuditLog
    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_LOCATION',
        details: `Localização da repetidora ${updated.code} atualizada por ${session?.user?.name || 'Sistema'}.`,
        oldValues: oldRepeater ? {
          latitude: oldRepeater.latitude,
          longitude: oldRepeater.longitude,
          locationDescription: oldRepeater.locationDescription
        } as any : undefined,
        newValues: {
          latitude,
          longitude,
          locationDescription
        } as any,
        userId: session?.user?.id || null,
        mineId: updated.mineId
      }
    })

    revalidatePath('/[lang]/map', 'page')

    return { success: true }
  } catch (error) {
    console.error(error)
    const cookieStore = await cookies()
    const lang = cookieStore.get('NEXT_LOCALE')?.value || 'pt-BR'
    const locale = isLocale(lang) ? lang : 'pt-BR'
    const dict = await getDictionary(locale)
    return { success: false, error: dict.errors.updateRepeaterLocation }
  }
}

export async function updateRepeaterStatus(id: string, status: string) {
  try {
    const session = await getServerSession(authOptions)

    const updated = await prisma.repeater.update({
      where: { id },
      data: {
        status,
        updatedById: session?.user?.id || null,
        version: { increment: 1 }
      }
    })

    await prisma.auditLog.create({
      data: {
        action: 'UPDATE_STATUS',
        details: `Status da repetidora ${updated.code} alterado para ${status} por ${session?.user?.name || 'Sistema'}.`,
        newValues: { status } as any,
        userId: session?.user?.id || null,
        mineId: updated.mineId
      }
    })

    revalidatePath('/', 'layout')

    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, error: 'Erro ao atualizar o status da repetidora.' }
  }
}
