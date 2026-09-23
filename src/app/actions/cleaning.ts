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
      select: { id: true, code: true, name: true, mineId: true }
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
    const isAdmin = session?.user?.role === 'ADMIN'
    const weekStart = getWeekStart()
    const team = (formData.get('team') as string) || null

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

    // Regras estritas para OPERADOR (prevenção de fraudes e fotos antigas/repetidas)
    if (!isAdmin) {
      // 1. Localização (GPS) obrigatória
      if (latitude === null || longitude === null) {
        return {
          success: false,
          error: 'A foto não contém dados de localização (GPS). Por favor, ative a localização na câmera do seu celular e tire a foto no local da repetidora.',
        }
      }

      // 2. Data/hora original da câmera obrigatória
      if (!photoDate || isNaN(photoDate.getTime())) {
        return {
          success: false,
          error: 'A foto não possui registro de data/hora original da câmera. Para operadores, a foto deve ser tirada no momento do registro através da câmera.',
        }
      }

      // 3. Validação de janela de tempo: a foto deve ter sido tirada no mesmo turno (tolerância de até 12 horas)
      const now = new Date()
      const diffMinutes = (now.getTime() - photoDate.getTime()) / (1000 * 60)
      const MAX_AGE_MINUTES = 12 * 60 // 12 horas

      if (diffMinutes > MAX_AGE_MINUTES) {
        const timeString = photoDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        const dateString = photoDate.toLocaleDateString('pt-BR')
        return {
          success: false,
          error: `A foto selecionada é antiga (tirada em ${dateString} às ${timeString}). Para operadores, a foto deve ter sido tirada nas últimas 12 horas durante o turno.`,
        }
      }

      if (diffMinutes < -5) {
        return {
          success: false,
          error: 'O horário da foto está no futuro. Ajuste o relógio do seu celular e tire uma nova foto.',
        }
      }

      // 4. Anti-fraude: Bloqueio de fotos repetidas já utilizadas
      const existingDuplicate = await prisma.cleaningRecord.findFirst({
        where: {
          photoDate: photoDate,
          latitude: latitude,
          longitude: longitude,
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
          error: `Esta foto já foi registrada anteriormente na repetidora ${existingDuplicate.repeater.code}. Tire uma nova foto em tempo real.`,
        }
      }
    } else {
      // Para ADMIN: se não houver data no EXIF, registra a data e hora do momento do upload
      if (!photoDate || isNaN(photoDate.getTime())) {
        photoDate = new Date()
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
          photoUrl,
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

    const isFixed = repeater.code.toUpperCase().startsWith('ROOT') || 
                    repeater.name.toUpperCase().startsWith('ROOT') || 
                    repeater.code.toLowerCase().includes('320') || 
                    repeater.name.toLowerCase().includes('320')

    // Atualiza a localização da repetidora apenas se for OPERADOR em campo e se NÃO for repetidora fixa/root/320
    if (!isAdmin && !isFixed && latitude !== null && longitude !== null) {
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