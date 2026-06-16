'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { isLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/server'

export async function saveRepeater(data: FormData) {
  const id = data.get('id') as string | null
  const name = data.get('name') as string
  const code = data.get('code') as string
  const model = data.get('model') as string
  const status = data.get('status') as string
  const notes = data.get('notes') as string
  const range = Number(data.get('range')) || 100
  let latitude = data.get('latitude') ? Number(data.get('latitude')) : null
  let longitude = data.get('longitude') ? Number(data.get('longitude')) : null
  const mineId = (data.get('mineId') as string) || 'default-mine'

  // If no coordinates are provided (e.g. creating a new repeater), default to the mine's center coordinates
  if (latitude === null || longitude === null) {
    const mine = await prisma.mine.findUnique({
      where: { id: mineId },
      select: { centerLat: true, centerLng: true }
    })
    if (mine) {
      if (latitude === null) latitude = mine.centerLat
      if (longitude === null) longitude = mine.centerLng
    }
  }

  const cookieStore = await cookies()
  const lang = cookieStore.get('NEXT_LOCALE')?.value || 'pt-BR'
  const locale = isLocale(lang) ? lang : 'pt-BR'

  const payload = {
    name,
    code,
    model,
    status,
    notes,
    range,
    latitude,
    longitude,
    mineId,
  }

  try {
    if (id) {
      await prisma.repeater.update({
        where: { id },
        data: payload
      })
    } else {
      await prisma.repeater.create({
        data: payload
      })
    }
  } catch (error) {
    console.error(error)
    const dict = await getDictionary(locale)
    throw new Error(dict.errors.saveRepeater)
  }

  revalidatePath('/', 'layout')
  redirect(`/${locale}/repeaters`)
}
