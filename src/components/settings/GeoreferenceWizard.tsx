'use client'

import { useState, useRef, MouseEvent, useEffect } from 'react'
import { 
  Upload, 
  MapPin, 
  Calculator, 
  Check, 
  Image as ImageIcon, 
  ChevronRight, 
  ChevronLeft, 
  AlertCircle, 
  Loader2, 
  Lock,
  RotateCw,
  Sparkles,
  Navigation,
  ZoomIn,
  ZoomOut,
  Plus,
  Trash2,
  Crosshair,
  Activity
} from 'lucide-react'
import { saveMineSettings } from '@/app/actions/mine'

export interface ReferenceRepeater {
  id: string
  code: string
  name: string
  latitude: number
  longitude: number
  model?: string
  status?: string
}

interface Point {
  name: string
  repeaterId?: string
  x: number // percent from left (0 - 100)
  y: number // percent from top (0 - 100)
  lat: number
  lng: number
  errorMeters?: number
}

interface GeoreferenceWizardProps {
  mineId?: string
  currentName?: string
  currentDescription?: string
  currentImageUrl?: string
  currentOpacity?: number
  currentGridResolution?: number
  currentCenterLat?: number
  currentCenterLng?: number
  currentHeatRadius?: number
  currentHeatBlur?: number
  currentHeatIntensity?: number
  currentTerrainEnabled?: boolean
  currentTerrainSource?: string | null
  currentTerrainResolution?: number | null
  referenceRepeaters?: ReferenceRepeater[]
  lang: string
}

// Color palette for points
const POINT_COLORS = [
  { bg: 'bg-emerald-600', text: 'text-emerald-600', border: 'border-emerald-500', hex: '#059669', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { bg: 'bg-blue-600', text: 'text-blue-600', border: 'border-blue-500', hex: '#2563EB', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  { bg: 'bg-purple-600', text: 'text-purple-600', border: 'border-purple-500', hex: '#7C3AED', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
  { bg: 'bg-amber-600', text: 'text-amber-600', border: 'border-amber-500', hex: '#D97706', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  { bg: 'bg-rose-600', text: 'text-rose-600', border: 'border-rose-500', hex: '#E11D48', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
  { bg: 'bg-cyan-600', text: 'text-cyan-600', border: 'border-cyan-500', hex: '#0891B2', badge: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { bg: 'bg-indigo-600', text: 'text-indigo-600', border: 'border-indigo-500', hex: '#4F46E5', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { bg: 'bg-teal-600', text: 'text-teal-600', border: 'border-teal-500', hex: '#0D9488', badge: 'bg-teal-50 text-teal-700 border-teal-200' },
]

// Utility: Rotate any DataURL by 90 degrees clockwise using Canvas
function rotateDataUrl90(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.height
      canvas.height = img.width
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(dataUrl)

      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((90 * Math.PI) / 180)
      ctx.drawImage(img, -img.width / 2, -img.height / 2)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

// Utility: Ensure image is horizontal (landscape: width >= height). If vertical, rotate 90deg
function ensureHorizontal(dataUrl: string): Promise<{ dataUrl: string; rotated: boolean }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      if (img.height > img.width) {
        rotateDataUrl90(dataUrl)
          .then((rotated) => resolve({ dataUrl: rotated, rotated: true }))
          .catch(() => resolve({ dataUrl, rotated: false }))
      } else {
        resolve({ dataUrl, rotated: false })
      }
    }
    img.onerror = () => resolve({ dataUrl, rotated: false })
    img.src = dataUrl
  })
}

// Utility: Render PDF Page 1 directly to Canvas Image in the browser with high DPI
async function renderPdfToDataUrl(file: File): Promise<string> {
  if (!(window as any).pdfjsLib) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
      script.onload = () => {
        (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
        resolve(true)
      }
      script.onerror = () => reject(new Error('Não foi possível carregar o visualizador de PDF.'))
      document.head.appendChild(script)
    })
  }

  const pdfjsLib = (window as any).pdfjsLib
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 3.5 }) // Ultra high resolution (300+ DPI)

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Falha ao inicializar renderizador gráfico.')

  await page.render({ canvasContext: ctx, viewport }).promise
  const rawDataUrl = canvas.toDataURL('image/jpeg', 0.94)
  const { dataUrl } = await ensureHorizontal(rawDataUrl)
  return dataUrl
}

// Client-side compression preserving ultra-high resolution up to 4096px
function compressForServer(dataUrl: string, maxDim = 4096, quality = 0.90): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let width = img.width
      let height = img.height

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width)
          width = maxDim
        } else {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(dataUrl)

      ctx.drawImage(img, 0, 0, width, height)
      let q = quality
      let compressed = canvas.toDataURL('image/jpeg', q)

      while (compressed.length > 12.0 * 1024 * 1024 && q > 0.65) {
        q -= 0.08
        compressed = canvas.toDataURL('image/jpeg', q)
      }

      resolve(compressed)
    }
    img.onerror = () => reject(new Error('Erro ao processar imagem para envio.'))
    img.src = dataUrl
  })
}

export function GeoreferenceWizard({
  mineId = 'default-mine',
  currentName = 'Mina do Salobo',
  currentDescription = 'Operação de lavra e cobertura de rede Mesh',
  currentImageUrl = '',
  currentOpacity = 0.85,
  currentGridResolution = 40,
  currentCenterLat = -5.7947,
  currentCenterLng = -50.5357,
  currentHeatRadius = 60,
  currentHeatBlur = 40,
  currentHeatIntensity = 0.8,
  referenceRepeaters = [],
  lang
}: GeoreferenceWizardProps) {
  // Steps: 1 = Upload, 2 = Calibrate (320 + ROOTs), 3 = Confirm & Save
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [processingFile, setProcessingFile] = useState(false)
  const [message, setMessage] = useState('')
  const [fileError, setFileError] = useState('')
  const [fileInfo, setFileInfo] = useState('')

  // Map Image preview state
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>(currentImageUrl || '')
  const [isNewImage, setIsNewImage] = useState(false)
  const [zoom, setZoom] = useState(1)
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  // Calibration points: Point 1 (320 U&M), Point 2 (ROOT) + optional additional ROOTs
  const [points, setPoints] = useState<Point[]>([])
  const [activePointIndex, setActivePointIndex] = useState<number>(0)

  // Calculated Results
  const [calculatedBounds, setCalculatedBounds] = useState<[[number, number], [number, number]] | null>(null)
  const [calculatedCenter, setCalculatedCenter] = useState<[number, number] | null>(null)
  const [calibrationRmse, setCalibrationRmse] = useState<number | null>(null)

  // Pan / Drag State for zoomed map
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })
  const [hasDragged, setHasDragged] = useState(false)

  // Initialize Default Reference Points (320 U&M and CAIXA D' AGUA)
  useEffect(() => {
    const rpt320 = referenceRepeaters.find(r => 
      r.code.toLowerCase().includes('320') || r.name.toLowerCase().includes('320')
    )
    const rptRoot = referenceRepeaters.find(r => 
      r.code.toUpperCase().includes('CAIXA') || r.code.toUpperCase().startsWith('ROOT')
    )

    setPoints([
      {
        name: rpt320 ? rpt320.code : '320 U&M',
        repeaterId: rpt320?.id,
        x: 35,
        y: 55,
        lat: rpt320?.latitude ?? -5.796476109433988,
        lng: rpt320?.longitude ?? -50.53949356342996,
      },
      {
        name: rptRoot ? rptRoot.code : "ROOT - CAIXA D' AGUA",
        repeaterId: rptRoot?.id,
        x: 75,
        y: 52,
        lat: rptRoot?.latitude ?? -5.796381969634659,
        lng: rptRoot?.longitude ?? -50.53397149300766,
      }
    ])
  }, [referenceRepeaters])

  // Handle adding another ROOT reference point
  const handleAddPoint = () => {
    const usedIds = new Set(points.map(p => p.repeaterId).filter(Boolean))
    const available = referenceRepeaters.filter(r => !usedIds.has(r.id))
    const candidate = available.find(r => r.code.toUpperCase().startsWith('ROOT')) || available[0]

    const newIdx = points.length
    const fallbackLat = -5.7946
    const fallbackLng = -50.5352

    const newPoint: Point = {
      name: candidate ? candidate.code : `ROOT Ponto ${newIdx + 1}`,
      repeaterId: candidate?.id,
      x: Math.min(85, Math.max(15, 50 + ((newIdx % 3) - 1) * 18)),
      y: Math.min(85, Math.max(15, 50 + Math.floor(newIdx / 3) * 14)),
      lat: candidate?.latitude ?? fallbackLat,
      lng: candidate?.longitude ?? fallbackLng,
    }

    setPoints(prev => [...prev, newPoint])
    setActivePointIndex(newIdx)
  }

  // Handle removing a reference point
  const handleRemovePoint = (indexToRemove: number) => {
    if (points.length <= 2) {
      alert('São necessários pelo menos 2 pontos de referência para calibrar o mapa.')
      return
    }
    setPoints(prev => prev.filter((_, idx) => idx !== indexToRemove))
    if (activePointIndex >= indexToRemove) {
      setActivePointIndex(Math.max(0, activePointIndex - 1))
    }
  }

  // Handle file selection (Image or PDF)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileError('')
    setProcessingFile(true)
    setMessage('')

    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      let resultUrl = ''

      if (isPdf) {
        setFileInfo(`PDF: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`)
        resultUrl = await renderPdfToDataUrl(file)
      } else {
        const reader = new FileReader()
        resultUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = async (ev) => {
            const raw = ev.target?.result as string
            const { dataUrl, rotated } = await ensureHorizontal(raw)
            if (rotated) {
              setMessage('Imagem ajustada automaticamente para orientação horizontal (paisagem).')
            }
            resolve(dataUrl)
          }
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        setFileInfo(`${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`)
      }

      setImagePreviewUrl(resultUrl)
      setIsNewImage(true)
    } catch (err) {
      console.error(err)
      setFileError('Erro ao abrir o arquivo. Verifique se é uma imagem JPG/PNG ou documento PDF válido.')
    } finally {
      setProcessingFile(false)
    }
  }

  // Rotate map image 90 degrees manually
  const handleRotateManual = async () => {
    if (!imagePreviewUrl) return
    setLoading(true)
    try {
      const rotated = await rotateDataUrl90(imagePreviewUrl)
      setImagePreviewUrl(rotated)
      setMessage('Mapa girado em 90°. Orientação atualizada.')
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Handle clicking on image to position active reference point
  const handleImageClick = (e: MouseEvent<HTMLDivElement>) => {
    if (hasDragged) {
      setHasDragged(false)
      return
    }

    if (!imageRef.current) return

    const rect = imageRef.current.getBoundingClientRect()
    let x = ((e.clientX - rect.left) / rect.width) * 100
    let y = ((e.clientY - rect.top) / rect.height) * 100

    x = Math.max(0, Math.min(100, x))
    y = Math.max(0, Math.min(100, y))

    setPoints(prev => prev.map((p, idx) => {
      if (idx === activePointIndex) {
        return { ...p, x, y }
      }
      return p
    }))

    // Automatically advance to the next point in sequence
    setActivePointIndex(prev => (prev + 1) % points.length)
  }

  // Pan handlers when zoomed
  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!imageContainerRef.current) return
    setIsDragging(true)
    setHasDragged(false)
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      scrollLeft: imageContainerRef.current.scrollLeft,
      scrollTop: imageContainerRef.current.scrollTop
    })
  }

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !imageContainerRef.current) return
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      setHasDragged(true)
      imageContainerRef.current.scrollLeft = dragStart.scrollLeft - dx
      imageContainerRef.current.scrollTop = dragStart.scrollTop - dy
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) {
      e.preventDefault()
      const delta = e.deltaY < 0 ? 0.5 : -0.5
      setZoom(prev => Math.max(1, Math.min(12, +(prev + delta).toFixed(1))))
    }
  }

  // Nudge point position with fine-tuning buttons
  const nudgePoint = (index: number, dx: number, dy: number) => {
    setPoints(prev => prev.map((p, idx) => {
      if (idx === index) {
        return {
          ...p,
          x: Math.max(0, Math.min(100, p.x + dx)),
          y: Math.max(0, Math.min(100, p.y + dy)),
        }
      }
      return p
    }))
  }

  // Switch point reference repeater
  const handleSelectRepeater = (index: number, repeaterId: string) => {
    const selected = referenceRepeaters.find(r => r.id === repeaterId)
    if (!selected) return

    setPoints(prev => prev.map((p, idx) => {
      if (idx === index) {
        return {
          ...p,
          name: selected.code,
          repeaterId: selected.id,
          lat: selected.latitude,
          lng: selected.longitude
        }
      }
      return p
    }))
  }

  // Multi-Point Least-Squares Georeferencing
  // Finds global optimal isotropic scale and centroid alignment across all reference points (320 U&M + all ROOTs)
  const handleCalculateCalibration = () => {
    if (points.length < 2) {
      alert('Marque pelo menos 2 pontos de referência para calibrar.')
      return
    }

    const imgWidth = imageRef.current?.naturalWidth || 2048
    const imgHeight = imageRef.current?.naturalHeight || 1467
    const N = points.length

    // Centroid of GPS coordinates
    const meanLat = points.reduce((acc, p) => acc + p.lat, 0) / N
    const meanLng = points.reduce((acc, p) => acc + p.lng, 0) / N
    const latRad = (meanLat * Math.PI) / 180
    const metersPerDegLat = 111320
    const metersPerDegLng = 111320 * Math.cos(latRad)

    // Real ground coordinates (E, N) in meters relative to GPS centroid
    const groundPts = points.map(p => ({
      E: (p.lng - meanLng) * metersPerDegLng,
      N: (p.lat - meanLat) * metersPerDegLat
    }))

    // Centroid of image pixel coordinates
    const pixelPts = points.map(p => ({
      px: (p.x / 100) * imgWidth,
      py: (p.y / 100) * imgHeight
    }))
    const meanPx = pixelPts.reduce((acc, p) => acc + p.px, 0) / N
    const meanPy = pixelPts.reduce((acc, p) => acc + p.py, 0) / N

    // Image coordinates relative to pixel centroid:
    // u = East (px - meanPx), v = North (-(py - meanPy))
    const relPixelPts = pixelPts.map(p => ({
      u: p.px - meanPx,
      v: -(p.py - meanPy)
    }))

    // Least Squares optimal isotropic scale s (meters per pixel):
    // Minimizes sum( (u_i*s - E_i)^2 + (v_i*s - N_i)^2 )
    let numerator = 0
    let denominator = 0
    for (let i = 0; i < N; i++) {
      const { u, v } = relPixelPts[i]
      const { E, N: nGround } = groundPts[i]
      numerator += u * E + v * nGround
      denominator += u * u + v * v
    }

    let metersPerPixel = denominator > 0 ? numerator / denominator : 0

    // Fallback if points are coincident or inverse
    if (metersPerPixel <= 0 || !isFinite(metersPerPixel)) {
      let totalGDist = 0
      let totalPDist = 0
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dE = groundPts[i].E - groundPts[j].E
          const dN = groundPts[i].N - groundPts[j].N
          totalGDist += Math.sqrt(dE * dE + dN * dN)

          const du = pixelPts[i].px - pixelPts[j].px
          const dv = pixelPts[i].py - pixelPts[j].py
          totalPDist += Math.sqrt(du * du + dv * dv)
        }
      }
      metersPerPixel = totalPDist > 0 ? totalGDist / totalPDist : 0.75
    }

    // Offset from pixel centroid to image center (0.5 * imgWidth, 0.5 * imgHeight)
    const duCenter = 0.5 * imgWidth - meanPx
    const dvCenter = -(0.5 * imgHeight - meanPy)

    const centerEastMeters = duCenter * metersPerPixel
    const centerNorthMeters = dvCenter * metersPerPixel

    const centerLat = meanLat + centerNorthMeters / metersPerDegLat
    const centerLng = meanLng + centerEastMeters / metersPerDegLng

    // Total ground dimensions preserving 100% natural aspect ratio
    const totalWidthMeters = imgWidth * metersPerPixel
    const totalHeightMeters = imgHeight * metersPerPixel

    const spanLat = totalHeightMeters / metersPerDegLat
    const spanLng = totalWidthMeters / metersPerDegLng

    const bounds: [[number, number], [number, number]] = [
      [centerLat - spanLat / 2, centerLng - spanLng / 2],
      [centerLat + spanLat / 2, centerLng + spanLng / 2]
    ]

    // Calculate individual point error (residuals) in meters
    const updatedPoints = points.map((p) => {
      const predLng = bounds[0][1] + (p.x / 100) * spanLng
      const predLat = bounds[1][0] - (p.y / 100) * spanLat
      const dE = (predLng - p.lng) * metersPerDegLng
      const dN = (predLat - p.lat) * metersPerDegLat
      const err = Math.sqrt(dE * dE + dN * dN)
      return { ...p, errorMeters: err }
    })

    const rmse = Math.sqrt(
      updatedPoints.reduce((acc, p) => acc + (p.errorMeters || 0) ** 2, 0) / N
    )

    setPoints(updatedPoints)
    setCalibrationRmse(rmse)
    setCalculatedBounds(bounds)
    setCalculatedCenter([centerLat, centerLng])
    setStep(3) // Advance to confirm and save
  }

  // Handle final save
  const handleSave = async () => {
    if (!calculatedBounds || !calculatedCenter) return

    setLoading(true)
    setMessage('Otimizando mapa e ativando coordenadas...')

    try {
      const formData = new FormData()
      formData.append('id', mineId)
      formData.append('name', currentName)
      formData.append('description', currentDescription)
      formData.append('opacity', currentOpacity.toString())
      formData.append('centerLat', calculatedCenter[0].toString())
      formData.append('centerLng', calculatedCenter[1].toString())
      formData.append('defaultZoom', '14')
      formData.append('gridResolution', currentGridResolution.toString())
      formData.append('imageBounds', JSON.stringify(calculatedBounds))
      formData.append('currentImageUrl', currentImageUrl)
      formData.append('calibrationAccuracy', calibrationRmse ? Math.round(calibrationRmse).toString() : '0')
      formData.append('heatRadius', currentHeatRadius.toString())
      formData.append('heatBlur', currentHeatBlur.toString())
      formData.append('heatIntensity', currentHeatIntensity.toString())

      if (isNewImage && imagePreviewUrl) {
        const compressedDataUrl = await compressForServer(imagePreviewUrl)
        formData.append('imageDataUrl', compressedDataUrl)
      }

      const res = await saveMineSettings(formData)
      if (res.success) {
        setMessage('✅ Mapa da mina calibrado e ativado com sucesso! Redirecionando...')
        setTimeout(() => {
          window.location.href = `/${lang}/map`
        }, 1200)
      } else {
        setMessage(res.error || 'Erro ao salvar calibração do mapa.')
      }
    } catch (err) {
      console.error(err)
      setMessage(err instanceof Error ? `Erro: ${err.message}` : 'Erro de conexão ao salvar mapa.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Streamlined Step Header */}
      <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-600 text-white rounded-xl shadow-sm">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-slate-800 text-lg leading-tight">
              Atualização & Calibração do Mapa da Mina
            </h2>
            <p className="text-xs text-slate-500">
              Calibração multi-pontos com 320 U&M e ROOTs para alinhamento perfeito
            </p>
          </div>
        </div>

        {/* 3 Step Pill Indicator */}
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <span className={`px-3 py-1 rounded-full transition-colors ${
            step === 1 ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-200 text-slate-600'
          }`}>
            1. Enviar Arquivo
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <span className={`px-3 py-1 rounded-full transition-colors ${
            step === 2 ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-200 text-slate-600'
          }`}>
            2. Calibrar ({points.length} Pontos)
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <span className={`px-3 py-1 rounded-full transition-colors ${
            step === 3 ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-200 text-slate-600'
          }`}>
            3. Salvar Mapa
          </span>
        </div>
      </div>

      <div className="p-6">
        {/* ================= STEP 1: UPLOAD & ROTATION ================= */}
        {step === 1 && (
          <div className="space-y-6 max-w-3xl mx-auto">
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-slate-800">
                Selecione a Planta ou Imagem da Mina
              </h3>
              <p className="text-sm text-slate-500">
                Aceita arquivos <strong>PNG, JPEG, WEBP ou documentos PDF</strong>. O mapa fica sempre na horizontal para abranger toda a extensão da mina.
              </p>
            </div>

            {/* Drop Zone */}
            <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50/60 rounded-2xl p-8 sm:p-10 text-center relative transition-all group">
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
                onChange={handleFileSelect}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
              />
              <div className="flex flex-col items-center justify-center gap-3">
                <div className="p-4 bg-blue-100/80 text-blue-600 rounded-2xl group-hover:scale-105 transition-transform">
                  {processingFile ? (
                    <Loader2 className="w-8 h-8 animate-spin" />
                  ) : (
                    <Upload className="w-8 h-8" />
                  )}
                </div>
                <div>
                  <p className="font-bold text-slate-700 text-base">
                    {processingFile ? 'Convertendo e processando arquivo...' : 'Clique ou arraste o arquivo aqui'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Suporta imagens de alta resolução ou PDF da engenharia
                  </p>
                </div>

                {fileInfo && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold border border-blue-200 mt-2">
                    <Check className="w-3.5 h-3.5" /> {fileInfo}
                  </span>
                )}
              </div>
            </div>

            {fileError && (
              <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs flex items-center gap-2 border border-red-200">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{fileError}</span>
              </div>
            )}

            {/* Preview & Horizontal Orientation Controls */}
            {imagePreviewUrl && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    <ImageIcon className="w-4 h-4 text-blue-600" />
                    <span>Visualização da Planta (Orientação Horizontal Ativa)</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleRotateManual}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors shadow-sm"
                    title="Girar 90 graus no sentido horário"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-blue-600" />
                    <span>Girar 90° ↻</span>
                  </button>
                </div>

                <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 flex items-center justify-center max-h-72">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreviewUrl}
                    alt="Prévia da Planta"
                    className="max-h-72 w-auto object-contain select-none"
                  />
                </div>
              </div>
            )}

            {/* Navigation Button */}
            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
              <span className="text-xs text-slate-400">Passo 1 de 3</span>
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!imagePreviewUrl || processingFile}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm transition-all disabled:opacity-50"
              >
                <span>Avançar para Calibração</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 2: CALIBRATE WITH 320 AND MULTIPLE ROOTS ================= */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  Pontos de Referência na Planta ({points.length} pontos)
                </h3>
                <p className="text-xs text-slate-500">
                  O mapa se adapta às coordenadas fixas da mina. Adicione outros <strong>ROOTs</strong> para aumentar a precisão.
                </p>
              </div>

              {/* High-Precision Zoom Toolbar */}
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl shrink-0 self-start sm:self-auto border border-slate-200 shadow-sm">
                <span className="text-[11px] text-slate-600 font-bold px-1 flex items-center gap-1">
                  <ZoomIn className="w-3.5 h-3.5 text-blue-600" />
                  <span>Zoom:</span>
                </span>

                <button
                  type="button"
                  onClick={() => setZoom(prev => Math.max(1, +(prev - 0.5).toFixed(1)))}
                  className="w-7 h-7 bg-white hover:bg-slate-200 text-slate-800 rounded-lg flex items-center justify-center font-bold text-sm shadow-sm transition-colors"
                  title="Diminuir Zoom (-0.5x)"
                >
                  -
                </button>

                <span className="text-xs font-mono font-bold text-blue-700 px-1.5 min-w-[42px] text-center">
                  {zoom.toFixed(1)}x
                </span>

                <button
                  type="button"
                  onClick={() => setZoom(prev => Math.min(12, +(prev + 0.5).toFixed(1)))}
                  className="w-7 h-7 bg-white hover:bg-slate-200 text-slate-800 rounded-lg flex items-center justify-center font-bold text-sm shadow-sm transition-colors"
                  title="Aumentar Zoom (+0.5x)"
                >
                  +
                </button>

                <div className="h-4 w-px bg-slate-300 mx-0.5" />

                {[1, 2, 3, 4, 6, 8, 12].map(z => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setZoom(z)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                      Math.abs(zoom - z) < 0.25 
                        ? 'bg-blue-600 text-white shadow-sm scale-105' 
                        : 'bg-white hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {z}x
                  </button>
                ))}

                {zoom > 1 && (
                  <button
                    type="button"
                    onClick={() => setZoom(1)}
                    className="px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 rounded-lg font-bold transition-colors ml-1"
                  >
                    Reset (1x)
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left Column: Reference Points Selector */}
              <div className="lg:col-span-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Pontos de Apoio ({points.length})
                  </p>
                  <button
                    type="button"
                    onClick={handleAddPoint}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-colors shadow-sm"
                    title="Adicionar outro ROOT para refinar o alinhamento"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar ROOT</span>
                  </button>
                </div>

                <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                  {points.map((p, idx) => {
                    const isActive = activePointIndex === idx
                    const colorScheme = POINT_COLORS[idx % POINT_COLORS.length]

                    return (
                      <div
                        key={idx}
                        onClick={() => setActivePointIndex(idx)}
                        className={`p-3 rounded-xl border-2 transition-all cursor-pointer relative ${
                          isActive 
                            ? 'border-blue-600 bg-blue-50/60 shadow-sm ring-1 ring-blue-500' 
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${colorScheme.bg}`}>
                              {idx + 1}
                            </span>
                            <div>
                              <p className="text-xs font-bold text-slate-800 flex items-center gap-1">
                                {p.name}
                                <Lock className="w-3 h-3 text-amber-600" />
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono">
                                GPS: {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            {isActive && (
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-600 text-white rounded-full">
                                Marcando
                              </span>
                            )}
                            {idx >= 2 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleRemovePoint(idx)
                                }}
                                className="w-6 h-6 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded flex items-center justify-center transition-colors"
                                title="Remover este ponto"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Dropdown to change ROOT repeater */}
                        {referenceRepeaters.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                            <label className="text-[10px] text-slate-500 font-semibold block mb-1">
                              Repetidora associada:
                            </label>
                            <select
                              value={p.repeaterId || ''}
                              onChange={(e) => handleSelectRepeater(idx, e.target.value)}
                              className="w-full text-xs border border-slate-300 rounded px-2 py-1 bg-white font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                            >
                              {referenceRepeaters.map(r => (
                                <option key={r.id} value={r.id}>
                                  {r.code} {r.code.startsWith('ROOT') ? '(ROOT)' : r.code.includes('320') ? '(320 U&M)' : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Position & Nudge Buttons */}
                        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500" onClick={(e) => e.stopPropagation()}>
                          <span>Posição: <strong>{p.x.toFixed(1)}%, {p.y.toFixed(1)}%</strong></span>
                          <div className="flex items-center gap-0.5">
                            <button type="button" onClick={() => nudgePoint(idx, 0, -0.3)} className="w-5 h-5 bg-slate-100 hover:bg-slate-200 rounded font-bold text-xs" title="Cima">↑</button>
                            <button type="button" onClick={() => nudgePoint(idx, 0, 0.3)} className="w-5 h-5 bg-slate-100 hover:bg-slate-200 rounded font-bold text-xs" title="Baixo">↓</button>
                            <button type="button" onClick={() => nudgePoint(idx, -0.3, 0)} className="w-5 h-5 bg-slate-100 hover:bg-slate-200 rounded font-bold text-xs" title="Esquerda">←</button>
                            <button type="button" onClick={() => nudgePoint(idx, 0.3, 0)} className="w-5 h-5 bg-slate-100 hover:bg-slate-200 rounded font-bold text-xs" title="Direita">→</button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800 space-y-1">
                  <div className="flex items-center gap-1 font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>Dica de Alta Precisão:</span>
                  </div>
                  <p>
                    Com <strong>{points.length} pontos</strong> selecionados, o sistema usa ajuste global por Mínimos Quadrados.
                  </p>
                  <p>
                    Quanto mais ROOTs você marcar (ex: SE-2002 no norte, P. Montagem no sul, Caixa d'Água no leste), mais preciso fica o encaixe de todas as repetidoras.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleCalculateCalibration}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm transition-all"
                >
                  <Calculator className="w-4 h-4" />
                  <span>Calcular Encaixe com {points.length} Pontos</span>
                </button>
              </div>

              {/* Right Column: Interactive Canvas */}
              <div className="lg:col-span-8 flex flex-col">
                <div className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Crosshair className="w-4 h-4 text-blue-600" />
                    <span>
                      Marcando agora: <strong className="text-blue-600 font-bold">{points[activePointIndex]?.name}</strong> (Ponto #{activePointIndex + 1})
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Clique na imagem para posicionar
                  </span>
                </div>

                <div
                  ref={imageContainerRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onWheel={handleWheel}
                  className={`relative rounded-2xl border-2 border-slate-200 overflow-auto bg-slate-900 shadow-inner select-none transition-colors ${
                    isDragging ? 'cursor-grabbing' : zoom > 1 ? 'cursor-grab' : 'cursor-crosshair'
                  }`}
                  style={{ maxHeight: '760px', minHeight: '520px' }}
                >
                  <div
                    className="relative inline-block min-w-full"
                    style={{
                      transform: `scale(${zoom})`,
                      transformOrigin: 'top left',
                      transition: 'transform 0.15s ease'
                    }}
                    onClick={handleImageClick}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      ref={imageRef}
                      src={imagePreviewUrl}
                      alt="Ortofoto para Calibração"
                      className="block max-w-none w-full h-auto select-none"
                    />

                    {/* Reference Point Markers */}
                    {points.map((p, idx) => {
                      const colorScheme = POINT_COLORS[idx % POINT_COLORS.length]
                      const isActive = activePointIndex === idx

                      return (
                        <div
                          key={idx}
                          className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center select-none pointer-events-none z-20"
                          style={{ left: `${p.x}%`, top: `${p.y}%` }}
                        >
                          <div className={`relative flex items-center justify-center ${isActive ? 'animate-bounce' : ''}`}>
                            <MapPin
                              className="w-8 h-8 drop-shadow-lg"
                              style={{ color: colorScheme.hex }}
                            />
                            <span className="absolute top-1 text-[10px] font-black text-white">
                              {idx + 1}
                            </span>
                          </div>
                          <span className="bg-slate-950/90 text-white font-bold text-[10px] px-2 py-0.5 rounded shadow whitespace-nowrap border border-slate-700 mt-0.5">
                            {p.name}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Voltar ao Arquivo
              </button>
              <span className="text-xs text-slate-400">Passo 2 de 3</span>
            </div>
          </div>
        )}

        {/* ================= STEP 3: PREVIEW & SAVE ================= */}
        {step === 3 && (
          <div className="space-y-6 max-w-3xl mx-auto">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-2">
                <Check className="w-6 h-6 stroke-[3]" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">
                Calibração Concluída com Sucesso!
              </h3>
              <p className="text-sm text-slate-500">
                Ajuste global por Mínimos Quadrados calculado com {points.length} pontos de referência.
              </p>
            </div>

            {/* Calibration Summary Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Pontos Calibrados & Precisão
                </h4>
                {calibrationRmse !== null && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
                    <Activity className="w-3.5 h-3.5" />
                    Precisão Média: ±{calibrationRmse.toFixed(1)} metros
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs max-h-60 overflow-y-auto pr-1">
                {points.map((p, idx) => {
                  const colorScheme = POINT_COLORS[idx % POINT_COLORS.length]
                  return (
                    <div key={idx} className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${colorScheme.bg}`}>
                          {idx + 1}
                        </span>
                        <div>
                          <span className="font-bold text-slate-800 block">{p.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                          </span>
                        </div>
                      </div>
                      {p.errorMeters !== undefined && (
                        <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-semibold">
                          Desvio: {p.errorMeters.toFixed(1)}m
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {calculatedCenter && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between">
                  <div>
                    <span className="font-bold block">Centro Operacional Calculado</span>
                    <span className="font-mono text-[11px]">
                      Lat: {calculatedCenter[0].toFixed(6)} | Lng: {calculatedCenter[1].toFixed(6)}
                    </span>
                  </div>
                  <span className="px-2.5 py-1 bg-blue-600 text-white font-bold rounded-lg text-[10px]">
                    Proporção Real 1:1 OK
                  </span>
                </div>
              )}
            </div>

            {message && (
              <div className={`p-4 rounded-xl text-sm font-semibold flex items-center gap-2 ${
                message.includes('✅') 
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {message.includes('✅') ? <Check className="w-5 h-5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />}
                <span>{message}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={loading}
                className="flex items-center gap-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition-colors w-full sm:w-auto justify-center"
              >
                <ChevronLeft className="w-4 h-4" /> Ajustar Pontos
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={loading}
                className="flex items-center justify-center gap-2 px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-base font-bold shadow-md transition-all disabled:opacity-50 w-full sm:w-auto"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Salvando Mapa da Mina...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    <span>Salvar e Ativar Mapa da Mina</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
