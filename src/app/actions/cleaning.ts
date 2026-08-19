'use server'

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { isLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { getWeekStart } from '@/lib/cleaning'
import { updateRepeaterLocation } from './repeaters'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

export async function saveCleaning(formData: FormData) {
  try {
    const repeaterId = formData.get('repeaterId') as string
    const notes = (formData.get('notes') as string) || null
    const file = formData.get('photo') as File | null

    if (!repeaterId) {
      return { success: false, error: 'ID da repetidora não informado.' }
    }

    if (!file || file.size === 0) {
      return { success: false, error: 'Selecione uma foto como evidência da limpeza.' }
    }

    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: 'A foto deve ter no máximo 10MB.' }
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return { success: false, error: 'Formato de imagem não suportado. Use JPG, PNG, WEBP ou HEIC.' }
    }

    const repeater = await prisma.repeater.findUnique({
      where: { id: repeaterId },
      select: { id: true, code: true, mineId: true }
    })

    if (!repeater) {
      return { success: false, error: 'Repetidora não encontrada.' }
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const uploadDir = join(process.cwd(), 'public', 'uploads', 'cleaning')
    await mkdir(uploadDir, { recursive: true })

    const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
    const filePath = join(uploadDir, filename)
    await writeFile(filePath, buffer)
    const photoUrl = `/uploads/cleaning/${filename}`

    const session = await getServerSession(authOptions)
    const weekStart = getWeekStart()

    const latRaw = formData.get('latitude')
    const lngRaw = formData.get('longitude')
    const latitude = latRaw !== null ? Number(latRaw) : null
    const longitude = lngRaw !== null ? Number(lngRaw) : null
    const hasLocation =
      latitude !== null &&
      longitude !== null &&
      !Number.isNaN(latitude) &&
      !Number.isNaN(longitude)

    const record = await prisma.cleaningRecord.upsert({
      where: {
        repeaterId_weekStart: {
          repeaterId,
          weekStart,
        },
      },
      update: {
        photoUrl,
        notes,
        latitude: hasLocation ? latitude : null,
        longitude: hasLocation ? longitude : null,
        cleanedById: session?.user?.id || null,
      },
      create: {
        repeaterId,
        weekStart,
        photoUrl,
        notes,
        latitude: hasLocation ? latitude : null,
        longitude: hasLocation ? longitude : null,
        cleanedById: session?.user?.id || null,
      },
    })

    await prisma.auditLog.create({
      data: {
        action: 'RPT_CLEANING',
        details: `Limpeza da repetidora ${repeater.code} registrada por ${session?.user?.name || 'Sistema'}.`,
        newValues: {
          photoUrl,
          notes,
          weekStart: weekStart.toISOString(),
          latitude,
          longitude,
        } as Prisma.InputJsonValue,
        userId: session?.user?.id || null,
        mineId: repeater.mineId,
      },
    })

    if (hasLocation) {
      await updateRepeaterLocation(repeaterId, latitude, longitude)
    }

    revalidatePath('/', 'layout')
    return { success: true, id: record.id }
  } catch (error) {
    console.error('[CLEANING] Failed to save cleaning record:', error)
    const cookieStore = await cookies()
    const lang = cookieStore.get('NEXT_LOCALE')?.value || 'pt-BR'
    const locale = isLocale(lang) ? lang : 'pt-BR'
    const dict = await getDictionary(locale)
    return { success: false, error: dict.errors.saveCleaning }
  }
}