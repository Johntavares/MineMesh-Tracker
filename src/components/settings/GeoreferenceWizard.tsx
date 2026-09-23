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
  Navigation
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

// Utility: Render PDF Page 1 directly to Canvas Image in the browser
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
  const viewport = page.getViewport({ scale: 2.2 })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Falha ao inicializar renderizador gráfico.')

  await page.render({ canvasContext: ctx, viewport }).promise
  const rawDataUrl = canvas.toDataURL('image/jpeg', 0.88)
  const { dataUrl } = await ensureHorizontal(rawDataUrl)
  return dataUrl
}

// Client-side compression to guarantee payload is < 2.0MB for Netlify/Lambda
function compressForServer(dataUrl: string, maxDim = 2048, quality = 0.76): Promise<string> {
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

      while (compressed.length > 2.0 * 1024 * 1024 && q > 0.35) {
        q -= 0.12
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
  // Steps: 1 = Upload, 2 = Calibrate (320 + ROOT), 3 = Confirm & Save
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

  // Calibration points: Point 1 (320 U&M) and Point 2 (ROOT)
  const [points, setPoints] = useState<Point[]>([])
  const [activePointIndex, setActivePointIndex] = useState<number>(0)

  // Calculated Results
  const [calculatedBounds, setCalculatedBounds] = useState<[[number, number], [number, number]] | null>(null)
  const [calculatedCenter, setCalculatedCenter] = useState<[number, number] | null>(null)

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

    // Automatically toggle to second point for convenience
    if (activePointIndex === 0 && points.length > 1) {
      setActivePointIndex(1)
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

  // Calculate georeference: map adapts to fixed GPS coordinates
  const handleCalculateCalibration = () => {
    if (points.length < 2) return

    const p1 = points[0]
    const p2 = points[1]

    const dLat = p2.lat - p1.lat
    const dLng = p2.lng - p1.lng
    const dx = (p2.x - p1.x) / 100
    const dy = (p2.y - p1.y) / 100

    if (Math.abs(dx) < 0.02 && Math.abs(dy) < 0.02) {
      alert('Os pontos 320 U&M e ROOT estão muito próximos ou na mesma posição na imagem. Marque os dois locais corretos.')
      return
    }

    if (Math.abs(dx) < 0.005) {
      alert('Os dois pontos estão exatamente na mesma coluna vertical. Escolha dois pontos com separação horizontal também.')
      return
    }

    if (Math.abs(dy) < 0.005) {
      alert('Os dois pontos estão exatamente na mesma linha horizontal. Escolha pontos com separação vertical e horizontal.')
      return
    }

    // Longitude and Latitude span per fraction of image width and height
    const dLngPerFraction = dLng / dx
    const dLatPerFraction = dLat / dy

    const lngLeft = p1.lng - (p1.x / 100) * dLngPerFraction
    const lngRight = p1.lng + (1 - p1.x / 100) * dLngPerFraction
    const latTop = p1.lat - (p1.y / 100) * dLatPerFraction
    const latBottom = p1.lat + (1 - p1.y / 100) * dLatPerFraction

    const bounds: [[number, number], [number, number]] = [
      [Math.min(latTop, latBottom), Math.min(lngLeft, lngRight)], // Southwest
      [Math.max(latTop, latBottom), Math.max(lngLeft, lngRight)]  // Northeast
    ]

    const center: [number, number] = [
      (bounds[0][0] + bounds[1][0]) / 2,
      (bounds[0][1] + bounds[1][1]) / 2
    ]

    setCalculatedBounds(bounds)
    setCalculatedCenter(center)
    setStep(3) // Advance directly to save step
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
      formData.append('calibrationAccuracy', '0')
      formData.append('heatRadius', currentHeatRadius.toString())
      formData.append('heatBlur', currentHeatBlur.toString())
      formData.append('heatIntensity', currentHeatIntensity.toString())

      if (isNewImage && imagePreviewUrl) {
        // Compress client-side to ensure it is always under 2MB
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
              Processo simplificado em 3 passos para alinhar ortofoto e repetidoras
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
            2. Calibrar (320 e ROOT)
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

        {/* ================= STEP 2: CALIBRATE WITH 320 AND ROOTS ================= */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  Aponte os Pontos de Referência na Planta
                </h3>
                <p className="text-xs text-slate-500">
                  O mapa se adapta aos pontos fixos da mina. Basta clicar onde fica o <strong>320 U&M</strong> e o <strong>ROOT</strong>.
                </p>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0 self-start sm:self-auto">
                <span className="text-[10px] text-slate-500 font-semibold px-1">Zoom:</span>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className={`px-2 py-0.5 text-xs font-bold rounded ${zoom === 1 ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'}`}
                >
                  1x
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1.5)}
                  className={`px-2 py-0.5 text-xs font-bold rounded ${zoom === 1.5 ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'}`}
                >
                  1.5x
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(2)}
                  className={`px-2 py-0.5 text-xs font-bold rounded ${zoom === 2 ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'}`}
                >
                  2x
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left Column: Reference Points Selector */}
              <div className="lg:col-span-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Pontos de Referência Fixos
                </p>

                {points.map((p, idx) => {
                  const isActive = activePointIndex === idx

                  return (
                    <div
                      key={idx}
                      onClick={() => setActivePointIndex(idx)}
                      className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                        isActive 
                          ? 'border-blue-600 bg-blue-50/60 shadow-sm ring-1 ring-blue-500' 
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                            idx === 0 ? 'bg-emerald-600' : 'bg-blue-600'
                          }`}>
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

                        {isActive && (
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-600 text-white rounded-full">
                            Ativo
                          </span>
                        )}
                      </div>

                      {/* Dropdown to change ROOT if needed */}
                      {idx > 0 && referenceRepeaters.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                          <label className="text-[10px] text-slate-500 font-semibold block mb-1">
                            Alterar repetidora de apoio:
                          </label>
                          <select
                            value={p.repeaterId || ''}
                            onChange={(e) => handleSelectRepeater(idx, e.target.value)}
                            className="w-full text-xs border border-slate-300 rounded px-2 py-1 bg-white font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          >
                            {referenceRepeaters
                              .filter(r => !r.code.includes('320'))
                              .map(r => (
                                <option key={r.id} value={r.id}>
                                  {r.code} {r.code.startsWith('ROOT') ? '(ROOT Fixo)' : ''}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}

                      {/* Position & Nudge Buttons */}
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500" onClick={(e) => e.stopPropagation()}>
                        <span>Posição na imagem: <strong>{p.x.toFixed(1)}%, {p.y.toFixed(1)}%</strong></span>
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

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800 space-y-1">
                  <div className="flex items-center gap-1 font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>Como funciona:</span>
                  </div>
                  <p>
                    1. Clique no <strong>Ponto 1 ({points[0]?.name})</strong> e dê 1 clique sobre o local dele na foto da mina.
                  </p>
                  <p>
                    2. Clique no <strong>Ponto 2 ({points[1]?.name})</strong> e dê 1 clique sobre ele.
                  </p>
                  <p>
                    As coordenadas de GPS já são conhecidas de implantação. O mapa será esticado e alinhado exatamente sob os pontos.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleCalculateCalibration}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm transition-all"
                >
                  <Calculator className="w-4 h-4" />
                  <span>Calcular Encaixe do Mapa</span>
                </button>
              </div>

              {/* Right Column: Interactive Canvas */}
              <div className="lg:col-span-8 flex flex-col">
                <div className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>
                    Marcando agora: <strong className="text-blue-600 font-bold">{points[activePointIndex]?.name}</strong> (clique na imagem abaixo)
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Use o Zoom para ver torres e estruturas em detalhe
                  </span>
                </div>

                <div
                  ref={imageContainerRef}
                  className="relative rounded-2xl border-2 border-slate-200 overflow-auto bg-slate-900 cursor-crosshair shadow-inner"
                  style={{ maxHeight: '580px', minHeight: '420px' }}
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
                    {points.map((p, idx) => (
                      <div
                        key={idx}
                        className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center select-none pointer-events-none z-20"
                        style={{ left: `${p.x}%`, top: `${p.y}%` }}
                      >
                        <MapPin
                          className={`w-7 h-7 drop-shadow-lg ${
                            activePointIndex === idx ? 'text-red-500 scale-125 animate-bounce' : idx === 0 ? 'text-emerald-500' : 'text-blue-500'
                          } transition-all`}
                        />
                        <span className="bg-slate-950/90 text-white font-bold text-[10px] px-2 py-0.5 rounded shadow whitespace-nowrap border border-slate-700 mt-0.5">
                          {p.name}
                        </span>
                      </div>
                    ))}
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
                O mapa foi posicionado horizontalmente e alinhado aos pontos fixos da mina.
              </p>
            </div>

            {/* Calibration Summary Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Resumo dos Ajustes
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-white rounded-xl border border-slate-200">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Âncora Primária</span>
                  <span className="font-bold text-slate-800">{points[0]?.name}</span>
                  <span className="text-[10px] text-slate-500 block font-mono mt-0.5">
                    {points[0]?.lat.toFixed(5)}, {points[0]?.lng.toFixed(5)}
                  </span>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Âncora Secundária</span>
                  <span className="font-bold text-slate-800">{points[1]?.name}</span>
                  <span className="text-[10px] text-slate-500 block font-mono mt-0.5">
                    {points[1]?.lat.toFixed(5)}, {points[1]?.lng.toFixed(5)}
                  </span>
                </div>
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
                    Horizontal OK
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
