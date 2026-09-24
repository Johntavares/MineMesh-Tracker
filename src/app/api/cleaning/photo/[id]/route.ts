import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id

  if (!id) {
    return new NextResponse('Missing ID', { status: 400 })
  }

  try {
    const record = await prisma.cleaningRecord.findUnique({
      where: { id },
      select: { photoUrl: true }
    })

    if (!record || !record.photoUrl) {
      return new NextResponse('Not found', { status: 404 })
    }

    if (record.photoUrl.startsWith('data:')) {
      // e.g. "data:image/jpeg;base64,..."
      const matches = record.photoUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*?,(.*)/)
      if (matches && matches.length === 3) {
        const mimeType = matches[1]
        const base64Data = matches[2]
        const buffer = Buffer.from(base64Data, 'base64')

        return new NextResponse(buffer, {
          headers: {
            'Content-Type': mimeType,
            'Cache-Control': 'public, max-age=31536000, immutable'
          }
        })
      }
    }

    // Se n\u00e3o for base64, pode fazer redirect para o path original (ex: /uploads/...)
    return NextResponse.redirect(new URL(record.photoUrl, request.url))

  } catch (error) {
    console.error('[PHOTO API] Error:', error)
    return new NextResponse('Internal Error', { status: 500 })
  }
}
