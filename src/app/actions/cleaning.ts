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
import exifr from 'exifr'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

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

    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']
    const isAllowedType = ALLOWED_TYPES.includes(file.type) || 
                          (file.type === 'application/octet-stream' && allowedExtensions.includes(fileExtension || '')) ||
                          (!file.type && allowedExtensions.includes(fileExtension || ''))

    if (!isAllowedType) {
      return { success: false, error: 'Formato de imagem não suportado. Use JPG, PNG, WEBP ou HEIC.' }
    }

    const repeater = await prisma.repeater.findUnique({
      where: { id: repeaterId },
      select: { id: true, code: true, name: true, mineId: true }
    })

    if (!repeater) {
      return { success: false, error: 'Repetidora não encontrada.' }
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    let photoUrl = ''

    try {
      const uploadDir = join(process.cwd(), 'public', 'uploads', 'cleaning')
      await mkdir(uploadDir, { recursive: true })

      const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      const filePath = join(uploadDir, filename)
      await writeFile(filePath, buffer)
      photoUrl = `/uploads/cleaning/${filename}`
    } catch (e) {
      console.warn('[CLEANING] Failed to save file to filesystem, falling back to base64', e)
      const fallbackMime = file.type && file.type !== 'application/octet-stream' ? file.type : (fileExtension === 'png' ? 'image/png' : 'image/jpeg')
      photoUrl = `data:${fallbackMime};base64,${buffer.toString('base64')}`
    }

    const session = await getServerSession(authOptions)
    const isAdmin = session?.user?.role === 'ADMIN'
    const weekStart = getWeekStart()
    const team = (formData.get('team') as string) || null

    const rawBrowserLat = formData.get('browserLat') as string | null
    const rawBrowserLng = formData.get('browserLng') as string | null
    const browserLat = rawBrowserLat ? parseFloat(rawBrowserLat) : null
    const browserLng = rawBrowserLng ? parseFloat(rawBrowserLng) : null

    let latitude: number | null = null
    let longitude: number | null = null
    let photoDate: Date | null = null

    try {
      const exifData = await exifr.parse(buffer)
      if (exifData) {
        if (exifData.latitude !== undefined && exifData.longitude !== undefined) {
          latitude = exifData.latitude
          longitude = exifData.longitude
        }
        if (exifData.DateTimeOriginal) {
          photoDate = new Date(exifData.DateTimeOriginal)
        } else if (exifData.CreateDate) {
          photoDate = new Date(exifData.CreateDate)
        }
      }
    } catch (e) {
      console.warn('[CLEANING] Failed to parse EXIF', e)
    }

    // Se a foto não continha coordenadas no EXIF, utiliza as coordenadas do dispositivo/navegador
    if ((latitude === null || longitude === null) && browserLat !== null && browserLng !== null && !isNaN(browserLat) && !isNaN(browserLng)) {
      latitude = browserLat
      longitude = browserLng
    }

    // Se não houver data no EXIF, registra a data e hora do momento do envio
    if (!photoDate || isNaN(photoDate.getTime())) {
      photoDate = new Date()
    }

    // Validações para OPERADOR (flexibilizadas para não impedir uploads legítimos em campo)
    if (!isAdmin) {
      const now = new Date()
      const diffMinutes = (now.getTime() - photoDate.getTime()) / (1000 * 60)
      const MAX_AGE_MINUTES = 72 * 60 // 72 horas

      // Se a foto tiver data EXIF antiga com mais de 72 horas
      if (diffMinutes > MAX_AGE_MINUTES) {
        const timeString = photoDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        const dateString = photoDate.toLocaleDateString('pt-BR')
        return {
          success: false,
          error: `A foto selecionada é antiga (tirada em ${dateString} às ${timeString}). Para operadores, selecione uma foto das últimas 72 horas.`,
        }
      }

      if (diffMinutes < -15) {
        return {
          success: false,
          error: 'O horário da foto está adiantado em relação ao horário atual. Ajuste o relógio do seu celular e tente novamente.',
        }
      }

      // Anti-fraude: Bloqueio de fotos idênticas já utilizadas em outras repetidoras
      if (latitude !== null && longitude !== null) {
        const existingDuplicate = await prisma.cleaningRecord.findFirst({
          where: {
            photoDate: photoDate,
            latitude: latitude,
            longitude: longitude,
            repeaterId: { not: repeaterId }
          },
          include: {
            repeater: {
              select: { code: true }
            }
          }
        })

        if (existingDuplicate) {
          return {
            success: false,
            error: `Esta mesma foto já foi registrada anteriormente na repetidora ${existingDuplicate.repeater.code}. Envie uma nova foto desta repetidora.`,
          }
        }
      }
    }

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
        latitude,
        longitude,
        team,
        photoDate,
        cleanedById: session?.user?.id || null,
      },
      create: {
        repeaterId,
        weekStart,
        photoUrl,
        notes,
        latitude,
        longitude,
        team,
        photoDate,
        cleanedById: session?.user?.id || null,
      },
    })

    await prisma.auditLog.create({
      data: {
        action: 'RPT_CLEANING',
        details: `Limpeza da repetidora ${repeater.code} registrada por ${session?.user?.name || 'Sistema'}.`,
        newValues: {
          photoUrl: photoUrl.startsWith('data:') ? `/api/cleaning/photo/${record.id}` : photoUrl,
          notes,
          team,
          weekStart: weekStart.toISOString(),
          latitude,
          longitude,
        } as Prisma.InputJsonValue,
        userId: session?.user?.id || null,
        mineId: repeater.mineId,
      },
    })

    // Atualiza a localização da repetidora se for OPERADOR em campo (liberado para todos a pedido)
    if (!isAdmin && latitude !== null && longitude !== null) {
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

export async function clearCleaningBoard() {
  try {
    const session = await getServerSession(authOptions)
    if (session?.user?.role !== 'ADMIN') {
      return { success: false, error: 'Acesso negado. Apenas administradores podem zerar o quadro.' }
    }

    const weekStart = getWeekStart()

    await prisma.cleaningRecord.deleteMany({
      where: {
        weekStart: weekStart,
      },
    })

    await prisma.auditLog.create({
      data: {
        action: 'RPT_CLEANING_BOARD_RESET',
        details: `Quadro de limpeza zerado manualmente por ${session?.user?.name || 'Admin'}.`,
        userId: session?.user?.id || null,
        mineId: null,
      },
    })

    revalidatePath('/', 'layout')
    return { success: true }
  } catch (error) {
    console.error('[CLEANING] Failed to clear board:', error)
    return { success: false, error: 'Erro interno ao zerar o quadro.' }
  }
}