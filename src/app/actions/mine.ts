'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { cookies } from 'next/headers'
import { isLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/server'

export async function getMine(id: string) {
  try {
    return await prisma.mine.findUnique({
      where: { id: id },
      include: {
        obstacles: true,
        repeaters: {
          include: {
            updatedBy: true
          }
        }
      }
    })
  } catch (error) {
    console.error('Failed to get mine:', error)
    return null
  }
}

export async function saveMineSettings(data: FormData) {
  try {
    const id = (data.get('id') as string) || 'default-mine'
    const name = (data.get('name') as string) || 'Mina Cobre'
    const description = data.get('description') as string | null
    const opacity = Number(data.get('opacity')) || 1.0
    const centerLat = Number(data.get('centerLat')) || -19.8157
    const centerLng = Number(data.get('centerLng')) || -43.9542
    const defaultZoom = Number(data.get('defaultZoom')) || 14
    const gridResolution = Number(data.get('gridResolution')) || 40
    const boundsStr = data.get('imageBounds') as string | null
    const imageBounds = boundsStr ? JSON.parse(boundsStr) : null
    const accuracyStr = data.get('calibrationAccuracy') as string | null
    const calibrationAccuracy = accuracyStr && accuracyStr !== '' ? Number(accuracyStr) : null

    const terrainEnabled = data.get('terrainEnabled') === 'true'
    const terrainSource = data.get('terrainSource') as string | null
    const resStr = data.get('terrainResolution') as string | null
    const terrainResolution = resStr && resStr !== '' ? Number(resStr) : null

    const heatRadius = Number(data.get('heatRadius')) || 60
    const heatBlur = Number(data.get('heatBlur')) || 40
    const heatIntensity = Number(data.get('heatIntensity')) || 0.8

    const file = data.get('image') as File | null
    let imageUrl = (data.get('currentImageUrl') as string) || '/uploads/placeholder.png'

    // Save uploaded image to public/uploads
    if (file && file.size > 0) {
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)

      const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      const path = join(process.cwd(), 'public', 'uploads', filename)
      
      await writeFile(path, buffer)
      imageUrl = `/uploads/${filename}`
    }

    const payload = {
      name,
      description,
      imageUrl,
      opacity,
      centerLat,
      centerLng,
      defaultZoom,
      gridResolution,
      imageBounds,
      calibrationAccuracy,
      isCalibrated: true,
      terrainEnabled,
      terrainSource,
      terrainResolution,
      heatRadius,
      heatBlur,
      heatIntensity,
    }

    await prisma.mine.upsert({
      where: { id },
      update: {
        ...payload,
        version: { increment: 1 }
      },
      create: {
        id,
        ...payload,
        version: 1
      },
    })

    revalidatePath('/', 'layout')
    return { success: true }
  } catch (error) {
    console.error('Error saving mine settings:', error)
    const cookieStore = await cookies()
    const lang = cookieStore.get('NEXT_LOCALE')?.value || 'pt-BR'
    const locale = isLocale(lang) ? lang : 'pt-BR'
    const dict = await getDictionary(locale)
    return { success: false, error: dict.errors.saveMapSettings || 'Erro ao salvar configurações da mina.' }
  }
}

export async function saveHeatmapConfig(
  mineId: string,
  heatRadius: number,
  heatBlur: number,
  heatIntensity: number
) {
  try {
    await prisma.mine.update({
      where: { id: mineId },
      data: {
        heatRadius: Math.round(heatRadius),
        heatBlur: Math.round(heatBlur),
        heatIntensity,
      },
    })
    revalidatePath('/', 'layout')
    return { success: true }
  } catch (error) {
    console.error('Error saving heatmap config:', error)
    return { success: false, error: 'Erro ao salvar configurações do mapa de calor.' }
  }
}
