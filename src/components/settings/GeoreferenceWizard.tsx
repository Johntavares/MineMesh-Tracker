'use client'

import { useState, useRef, MouseEvent } from 'react'
import { Upload, MapPin, Calculator, Check, FileText, Image as ImageIcon, ChevronRight, ChevronLeft, RotateCcw } from 'lucide-react'
import { saveMineSettings } from '@/app/actions/mine'
import { useTranslation } from '@/lib/i18n/client'

interface Point {
  name: string
  x: number // percentage from left (0 to 100)
  y: number // percentage from top (0 to 100)
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
  currentTerrainEnabled?: boolean
  currentTerrainSource?: string | null
  currentTerrainResolution?: number | null
  currentHeatRadius?: number
  currentHeatBlur?: number
  currentHeatIntensity?: number
  lang: string
}

export function GeoreferenceWizard({
  mineId = 'default-mine',
  currentName = '',
  currentDescription = '',
  currentImageUrl = '',
  currentOpacity = 0.85,
  currentGridResolution = 40,
  currentCenterLat,
  currentCenterLng,
  currentTerrainEnabled = false,
  currentTerrainSource = '',
  currentTerrainResolution = 10,
  currentHeatRadius = 60,
  currentHeatBlur = 40,
  currentHeatIntensity = 0.8,
  lang
}: GeoreferenceWizardProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  // Form states
  const [name, setName] = useState(currentName || 'Mina do Salobo')
  const [description, setDescription] = useState(currentDescription || 'Principal área operacional')
  const [opacity, setOpacity] = useState(currentOpacity)
  const [gridResolution, setGridResolution] = useState(currentGridResolution)
  const [terrainEnabled, setTerrainEnabled] = useState(currentTerrainEnabled || false)
  const [terrainSource, setTerrainSource] = useState(currentTerrainSource || '')
  const [terrainResolution, setTerrainResolution] = useState(currentTerrainResolution || 10)
  const [heatRadius, setHeatRadius] = useState(currentHeatRadius)
  const [heatBlur, setHeatBlur] = useState(currentHeatBlur)
  const [heatIntensity, setHeatIntensity] = useState(currentHeatIntensity)

  // Files states
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>(currentImageUrl || '')
  const [pdfFile, setPdfFile] = useState<File | null>(null)

  // Calibration points states (at least 2 are needed)
  const [points, setPoints] = useState<Point[]>(() => {
    const baseLat = currentCenterLat ?? -19.8157
    const baseLng = currentCenterLng ?? -43.9542
    return [
      { name: 'Portaria / Oficina', x: 25, y: 30, lat: baseLat, lng: baseLng },
      { name: 'Pátio de Britagem', x: 75, y: 70, lat: baseLat + 0.005, lng: baseLng + 0.005 }
    ]
  })
  const [activePointIndex, setActivePointIndex] = useState<number | null>(0)

  // Calculation results
  const [calculatedBounds, setCalculatedBounds] = useState<[[number, number], [number, number]] | null>(null)
  const [calculatedCenter, setCalculatedCenter] = useState<[number, number] | null>(null)
  const [calculatedAccuracy, setCalculatedAccuracy] = useState<number | null>(null)

  const imageRef = useRef<HTMLImageElement>(null)

  // File upload handlers
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setImageFile(file)
      setImagePreviewUrl(URL.createObjectURL(file))
    }
  }

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPdfFile(e.target.files[0])
    }
  }

  // Handle clicking on the image to position the active point
  const handleImageClick = (e: MouseEvent<HTMLDivElement>) => {
    if (activePointIndex === null || !imageRef.current) return

    const rect = imageRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100

    setPoints(prev => prev.map((p, idx) => {
      if (idx === activePointIndex) {
        return { ...p, x, y }
      }
      return p
    }))
  }

  const updatePointField = (index: number, field: keyof Point, value: any) => {
    setPoints(prev => prev.map((p, idx) => {
      if (idx === index) {
        return { ...p, [field]: value }
      }
      return p
    }))
  }

  const addPoint = () => {
    const baseLat = currentCenterLat ?? -19.8157
    const baseLng = currentCenterLng ?? -43.9542
    setPoints(prev => [
      ...prev,
      { name: `Ponto ${prev.length + 1}`, x: 50, y: 50, lat: baseLat, lng: baseLng }
    ])
    setActivePointIndex(points.length)
  }

  const removePoint = (index: number) => {
    if (points.length <= 2) {
      alert('Você precisa de no mínimo 2 pontos para calibrar.')
      return
    }
    setPoints(prev => prev.filter((_, idx) => idx !== index))
    setActivePointIndex(0)
  }

  // Calibration Math
  const calculateCalibration = () => {
    if (points.length < 2) return

    // Pick first two points for direct 2-point mapping
    const p1 = points[0]
    const p2 = points[1]

    const dLat = p2.lat - p1.lat
    const dLng = p2.lng - p1.lng
    const dx = (p2.x - p1.x) / 100
    const dy = (p2.y - p1.y) / 100

    if (Math.abs(dx) < 0.01 || Math.abs(dy) < 0.01) {
      alert('Os pontos de calibração estão muito próximos ou alinhados. Escolha pontos distantes na imagem (ex: um no topo esquerdo e outro no canto inferior direito).')
      return
    }

    // Longitude/Latitude span per fraction of image width/height
    const dLngPerFraction = dLng / dx
    const dLatPerFraction = dLat / dy

    // Geographic coordinates at image borders
    const lngLeft = p1.lng - (p1.x / 100) * dLngPerFraction
    const lngRight = p1.lng + (1 - p1.x / 100) * dLngPerFraction
    const latTop = p1.lat - (p1.y / 100) * dLatPerFraction
    const latBottom = p1.lat + (1 - p1.y / 100) * dLatPerFraction

    const bounds: [[number, number], [number, number]] = [
      [Math.min(latTop, latBottom), Math.min(lngLeft, lngRight)], // Southwest [lat, lng]
      [Math.max(latTop, latBottom), Math.max(lngLeft, lngRight)]  // Northeast [lat, lng]
    ]

    const center: [number, number] = [
      (bounds[0][0] + bounds[1][0]) / 2,
      (bounds[0][1] + bounds[1][1]) / 2
    ]

    // Calculate accuracy (residual error in meters)
    let avgError = 0
    if (points.length > 2) {
      let totalError = 0
      points.forEach(p => {
        const predLng = lngLeft + (p.x / 100) * dLngPerFraction
        const predLat = latTop + (p.y / 100) * dLatPerFraction
        const diffLat = p.lat - predLat
        const diffLng = p.lng - predLng
        const latRad = (p.lat * Math.PI) / 180
        const dist = Math.sqrt(diffLat * diffLat + Math.cos(latRad) * Math.cos(latRad) * diffLng * diffLng) * 111320
        totalError += dist
      })
      avgError = totalError / points.length
    }

    setCalculatedBounds(bounds)
    setCalculatedCenter(center)
    setCalculatedAccuracy(avgError)
    setStep(4) // Advance to preview/results step
  }

  // Handle final save
  const handleSave = async () => {
    if (!calculatedBounds || !calculatedCenter) return

    setLoading(true)
    setMessage('')

    const formData = new FormData()
    formData.append('id', mineId)
    formData.append('name', name)
    formData.append('description', description)
    formData.append('opacity', opacity.toString())
    formData.append('centerLat', calculatedCenter[0].toString())
    formData.append('centerLng', calculatedCenter[1].toString())
    formData.append('defaultZoom', '14')
    formData.append('gridResolution', gridResolution.toString())
    formData.append('imageBounds', JSON.stringify(calculatedBounds))
    formData.append('currentImageUrl', currentImageUrl)
    formData.append('calibrationAccuracy', calculatedAccuracy !== null ? calculatedAccuracy.toString() : '')
    formData.append('terrainEnabled', terrainEnabled.toString())
    formData.append('terrainSource', terrainSource)
    formData.append('terrainResolution', terrainResolution.toString())
    formData.append('heatRadius', heatRadius.toString())
    formData.append('heatBlur', heatBlur.toString())
    formData.append('heatIntensity', heatIntensity.toString())

    if (imageFile) {
      formData.append('image', imageFile)
    }

    try {
      const res = await saveMineSettings(formData)
      if (res.success) {
        setMessage('Mina georreferenciada e salva com sucesso!')
        // Redirect or refresh
        setTimeout(() => {
          window.location.href = `/${lang}/map`
        }, 1500)
      } else {
        setMessage(res.error || 'Erro ao salvar configurações.')
      }
    } catch (err) {
      console.error(err)
      setMessage('Erro de conexão ao salvar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Wizard Header Steps */}
      <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2 text-lg">
          <Calculator className="w-5 h-5 text-blue-600" />
          Assistente de Georreferenciamento
        </h2>
        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
          <span className={step === 1 ? 'text-blue-600 font-bold' : ''}>1. Imagem</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <span className={step === 2 ? 'text-blue-600 font-bold' : ''}>2. PDF (Opcional)</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <span className={step === 3 ? 'text-blue-600 font-bold' : ''}>3. Calibração</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <span className={step >= 4 ? 'text-blue-600 font-bold' : ''}>4. Salvar</span>
        </div>
      </div>

      <div className="p-6">
        {/* STEP 1: IMAGE UPLOAD */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-blue-400 transition-colors relative">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <div className="flex flex-col items-center justify-center gap-2">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-full">
                  <Upload className="w-8 h-8" />
                </div>
                <h3 className="font-semibold text-slate-800 text-base">Upload da Imagem Aérea</h3>
                <p className="text-sm text-slate-500 max-w-sm">
                  Selecione uma ortofoto, imagem de satélite ou planta em formato JPG, JPEG ou PNG.
                </p>
                {imageFile && (
                  <span className="mt-2 text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3" /> {imageFile.name}
                  </span>
                )}
              </div>
            </div>

            {imagePreviewUrl && (
              <div className="border border-slate-100 rounded-lg p-3 bg-slate-50 flex items-center gap-3">
                <ImageIcon className="w-10 h-10 text-slate-400 object-cover rounded border" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">Visualização do Mapa</p>
                  <p className="text-xs text-slate-400">Pronto para calibração de escala e GPS</p>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
              <span className="text-xs text-slate-400">Etapa 1 de 4</span>
              <button
                onClick={() => setStep(2)}
                disabled={!imagePreviewUrl}
                className="flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              >
                Próximo <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: PDF UPLOAD */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-blue-400 transition-colors relative">
              <input
                type="file"
                accept="application/pdf"
                onChange={handlePdfChange}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <div className="flex flex-col items-center justify-center gap-2">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-full">
                  <FileText className="w-8 h-8" />
                </div>
                <h3 className="font-semibold text-slate-800 text-base">Upload de PDF Operacional (Opcional)</h3>
                <p className="text-sm text-slate-500 max-w-sm">
                  Envie a planta operacional da mina em formato PDF para calibração e visualização futura.
                </p>
                {pdfFile && (
                  <span className="mt-2 text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3" /> {pdfFile.name}
                  </span>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-semibold transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                Ir para Calibração <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: CALIBRATION POINTS */}
        {step === 3 && (
          <div className="space-y-6">
            <p className="text-sm text-slate-500">
              Instruções: Adicione no mínimo dois pontos de referência conhecidos. Selecione o ponto na lista ao lado, e <strong>clique exatamente na posição desse ponto na imagem aérea abaixo</strong>. Em seguida, informe a latitude e longitude reais.
            </p>

            <div className="flex flex-col lg:flex-row gap-6">
              {/* Point management panel */}
              <div className="w-full lg:w-80 space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="font-bold text-slate-800 text-sm">Pontos de Calibração</h4>
                  <button
                    onClick={addPoint}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                  >
                    + Adicionar Ponto
                  </button>
                </div>

                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {points.map((p, idx) => (
                    <div
                      key={idx}
                      onClick={() => setActivePointIndex(idx)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        activePointIndex === idx
                          ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <input
                          type="text"
                          value={p.name}
                          onChange={(e) => updatePointField(idx, 'name', e.target.value)}
                          className="font-bold text-xs bg-transparent border-b border-transparent focus:border-slate-300 focus:outline-none text-slate-800 w-36"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removePoint(idx)
                          }}
                          className="text-[10px] text-red-500 hover:text-red-700"
                        >
                          Remover
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
                        <div>
                          <label className="text-[9px] text-slate-400 font-semibold uppercase">Latitude</label>
                          <input
                            type="number"
                            step="any"
                            value={p.lat}
                            onChange={(e) => updatePointField(idx, 'lat', Number(e.target.value))}
                            className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-slate-400 font-semibold uppercase">Longitude</label>
                          <input
                            type="number"
                            step="any"
                            value={p.lng}
                            onChange={(e) => updatePointField(idx, 'lng', Number(e.target.value))}
                            className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 font-mono"
                          />
                        </div>
                      </div>
                      <div className="mt-1.5 flex justify-between text-[9px] text-slate-400">
                        <span>Posição na Imagem:</span>
                        <span>X: {p.x.toFixed(1)}% | Y: {p.y.toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={calculateCalibration}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  <Calculator className="w-4 h-4" /> Calcular Bounds
                </button>
              </div>

              {/* Georeferencing image canvas */}
              <div className="flex-1">
                <div
                  className="relative rounded-xl border border-slate-200 overflow-hidden bg-slate-100 cursor-crosshair group shadow-inner"
                  onClick={handleImageClick}
                  style={{ maxHeight: '500px' }}
                >
                  <img
                    ref={imageRef}
                    src={imagePreviewUrl}
                    alt="Calibration Map"
                    className="w-full h-auto object-contain mx-auto select-none"
                    style={{ maxHeight: '500px' }}
                  />

                  {/* Draw pins for each point */}
                  {points.map((p, idx) => (
                    <div
                      key={idx}
                      className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center select-none"
                      style={{ left: `${p.x}%`, top: `${p.y}%` }}
                    >
                      <MapPin
                        className={`w-6 h-6 drop-shadow ${
                          activePointIndex === idx ? 'text-red-500 scale-125' : 'text-blue-500'
                        } transition-transform`}
                      />
                      <span className="bg-slate-900/90 text-white font-bold text-[9px] px-1.5 py-0.5 rounded shadow whitespace-nowrap mt-1 border border-slate-700">
                        {p.name || `Pto ${idx + 1}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-semibold transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
              <span className="text-xs text-slate-400">Ponto Ativo: {activePointIndex !== null ? points[activePointIndex].name : 'Nenhum'}</span>
            </div>
          </div>
        )}

        {/* STEP 4: PREVIEW & SAVE */}
        {step === 4 && (
          <div className="space-y-6">
            <h3 className="font-semibold text-slate-800 text-base border-b pb-2">Configurações Gerais e Georreferenciamento</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Nome da Operação (Mina)</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Descrição</label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Opacidade do Mapa</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      max="1.0"
                      value={opacity}
                      onChange={(e) => setOpacity(Number(e.target.value))}
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Resolução da Grade</label>
                    <select
                      value={gridResolution}
                      onChange={(e) => setGridResolution(Number(e.target.value))}
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="20">20 x 20 (Rápido)</option>
                      <option value="40">40 x 40 (Padrão)</option>
                      <option value="80">80 x 80 (Fiel)</option>
                      <option value="120">120 x 120 (Máxima)</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 mt-4 space-y-4">
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wide">
                    Configuração do Mapa de Calor (Propagação de Sinal)
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase">Raio Base (100m)</label>
                      <input
                        type="number"
                        min="5"
                        max="200"
                        value={heatRadius}
                        onChange={(e) => setHeatRadius(Number(e.target.value))}
                        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase">Desfoque (Blur)</label>
                      <input
                        type="number"
                        min="5"
                        max="100"
                        value={heatBlur}
                        onChange={(e) => setHeatBlur(Number(e.target.value))}
                        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase">Opacidade Máx</label>
                      <input
                        type="number"
                        step="0.05"
                        min="0.1"
                        max="1.0"
                        value={heatIntensity}
                        onChange={(e) => setHeatIntensity(Number(e.target.value))}
                        className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 mt-4 space-y-4">
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wide">
                    Integração com Relevo Real (DEM/DTM)
                  </h4>
                  
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="terrainEnabled"
                      checked={terrainEnabled}
                      onChange={(e) => setTerrainEnabled(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <label htmlFor="terrainEnabled" className="text-sm font-medium text-slate-700 cursor-pointer">
                      Habilitar modelo digital de elevação (DEM)
                    </label>
                  </div>

                  {terrainEnabled && (
                    <div className="grid grid-cols-2 gap-4 animate-fade-in">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase">Fonte de Dados de Relevo</label>
                        <input
                          type="text"
                          placeholder="Ex: GeoTIFF, DEM, Curvas de Nível"
                          value={terrainSource}
                          onChange={(e) => setTerrainSource(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase">Resolução Espacial</label>
                        <select
                          value={terrainResolution}
                          onChange={(e) => setTerrainResolution(Number(e.target.value))}
                          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="5">5 metros (Alta)</option>
                          <option value="10">10 metros (Média)</option>
                          <option value="30">30 metros (Básica)</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Calibration Stats Panel */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 uppercase tracking-wide text-xs">
                  <Check className="w-4 h-4 text-emerald-500 font-bold" />
                  Resultado da Calibração
                </h4>

                {calculatedCenter && (
                  <div className="space-y-3.5 text-xs">
                    <div>
                      <p className="text-slate-400 font-medium">Centro da Mina (GPS)</p>
                      <p className="font-mono font-semibold text-slate-700 mt-0.5">
                        Lat: {calculatedCenter[0].toFixed(6)} | Lng: {calculatedCenter[1].toFixed(6)}
                      </p>
                    </div>

                    {calculatedBounds && (
                      <div>
                        <p className="text-slate-400 font-medium">Limites da Camada (Bounds)</p>
                        <p className="font-mono text-slate-500 mt-0.5">
                          SW: [{calculatedBounds[0][0].toFixed(5)}, {calculatedBounds[0][1].toFixed(5)}]
                        </p>
                        <p className="font-mono text-slate-500">
                          NE: [{calculatedBounds[1][0].toFixed(5)}, {calculatedBounds[1][1].toFixed(5)}]
                        </p>
                      </div>
                    )}

                    {calculatedAccuracy !== null && (
                      <div>
                        <p className="text-slate-400 font-medium">Precisão da Calibração (Erro Médio)</p>
                        <p className="font-mono font-semibold text-slate-700 mt-0.5">
                          {calculatedAccuracy === 0 ? 'Perfeito (0.0 m)' : `${calculatedAccuracy.toFixed(2)} metros`}
                        </p>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-200">
                      <p className="text-slate-400 font-medium">Imagem a ser Salva</p>
                      <p className="text-slate-700 font-semibold truncate mt-0.5">
                        {imageFile ? imageFile.name : 'Imagem pré-existente'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {message && (
              <div className={`p-4 rounded-lg text-sm font-medium ${
                message.includes('sucesso') ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {message}
              </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
              <button
                onClick={() => setStep(3)}
                className="flex items-center gap-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-semibold transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Ajustar Calibração
              </button>
              
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex items-center gap-1 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50"
              >
                {loading ? 'Salvando...' : 'Salvar Mina & Ativar Mapa'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
