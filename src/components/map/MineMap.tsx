'use client'

import { useEffect, useState, useRef, MouseEvent, useMemo } from 'react'
import { MapContainer, TileLayer, ImageOverlay, Marker, Popup, Circle, Tooltip, ScaleControl, Polygon, Polyline, useMap, useMapEvents } from 'react-leaflet'
import { HeatmapLayer } from './HeatmapLayer'
import { useRouter } from 'next/navigation'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTranslation } from '@/lib/i18n/client'
import { updateRepeaterLocation } from '@/app/actions/repeaters'
import { saveMineBoundary } from '@/app/actions/boundary'
import { saveHeatmapConfig } from '@/app/actions/mine'
import { 
  isPointInPolygon, 
  calculatePolygonArea, 
  calculatePathLoss, 
  calculateObstacleAttenuation, 
  getDistanceMeters,
  RADIO_MODELS
} from '@/lib/propagation'
import { 
  Map as MapIcon, 
  MapPin, 
  Check, 
  X, 
  ShieldAlert, 
  FileJson, 
  RotateCcw, 
  Layers, 
  Info, 
  Radio, 
  Plus, 
  Play, 
  BarChart2, 
  Eye, 
  EyeOff,
  Settings2,
  Save
} from 'lucide-react'

// Fix Leaflet's default icon path issues in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

type HeatPoint = [number, number, number] // [lat, lng, intensity]

type Repeater = {
  id: string
  name: string
  code: string
  model: string
  status: string
  range: number
  latitude: number | null
  longitude: number | null
  altitude: number | null
  locationDescription: string | null
  updatedAt: string
  updatedBy?: { name: string } | null
}

interface MineMapProps {
  mineId: string
  repeaters: Repeater[]
  mapConfig?: {
    imageUrl: string
    bounds?: L.LatLngBoundsExpression | null
    opacity: number
    centerLat: number
    centerLng: number
    defaultZoom: number
    gridResolution: number
    isCalibrated: boolean
    calibrationAccuracy?: number | null
  } | null
  heatConfig?: any
  boundary?: {
    id: string
    coordinates: [number, number][]
  } | null
  obstacles?: {
    id: string
    name: string
    type: string
    coordinates: [number, number][]
    attenuation: number
  }[]
  lang: string
}

// Leaflet Map events helper to capture clicks for polygon drawing
function MapClickHandler({ onMapClick, active }: { onMapClick: (latlng: L.LatLng) => void; active: boolean }) {
  useMapEvents({
    click(e) {
      if (active) {
        onMapClick(e.latlng)
      }
    }
  })
  return null
}

// Map Auto Fitter component to center boundaries on startup
// Expands fitBounds to include both the ortofoto bounds and all repeater positions
function MapAutoFitter({
  boundaryCoords,
  imageBounds,
  repeaterPositions,
  center,
  defaultZoom
}: {
  boundaryCoords: [number, number][]
  imageBounds: [[number, number], [number, number]] | null
  repeaterPositions: [number, number][]
  center: [number, number]
  defaultZoom: number
}) {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()

    // Build a combined latLngBounds that covers image + all active repeaters
    let bounds: L.LatLngBounds | null = null

    if (imageBounds && imageBounds.length === 2 && imageBounds[0] && imageBounds[1]) {
      bounds = L.latLngBounds(imageBounds[0], imageBounds[1])
    } else if (boundaryCoords && boundaryCoords.length >= 3) {
      bounds = L.latLngBounds(boundaryCoords)
    }

    // Extend bounds to include repeater positions
    if (repeaterPositions.length > 0) {
      repeaterPositions.forEach(pos => {
        if (bounds) {
          bounds.extend(pos)
        } else {
          bounds = L.latLngBounds(pos, pos)
        }
      })
    }

    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40] })
    } else if (center && center[0] !== 0) {
      map.setView(center, defaultZoom || 15)
    }
  }, [boundaryCoords, imageBounds, repeaterPositions, center, defaultZoom, map])
  return null
}

// Dynamic Map Refocus trigger for highlighting shadow zones
function MapRefocuser({ center, trigger }: { center: [number, number] | null, trigger: number }) {
  const map = useMap()
  useEffect(() => {
    if (center && center[0] !== 0) {
      map.setView(center, 16)
    }
  }, [center, trigger, map])
  return null
}

// Heatmap Zoom Handler to scale the pixel radius with map zoom, keeping geographic size fixed
function HeatmapZoomHandler({
  setHeatRadius,
  baseRadius,
  defaultZoom
}: {
  setHeatRadius: (r: number) => void
  baseRadius: number
  defaultZoom: number
}) {
  const map = useMapEvents({
    zoom() {
      const currentZoom = map.getZoom()
      const scale = Math.pow(2, currentZoom - defaultZoom)
      setHeatRadius(Math.max(1, Math.round(baseRadius * scale)))
    }
  })
  
  useEffect(() => {
    const currentZoom = map.getZoom()
    const scale = Math.pow(2, currentZoom - defaultZoom)
    setHeatRadius(Math.max(1, Math.round(baseRadius * scale)))
  }, [map, baseRadius, defaultZoom, setHeatRadius])

  return null
}

interface GridCell {
  i: number
  j: number
  lat: number
  lng: number
  status: 'excellent' | 'good' | 'critical' | 'uncovered'
  bounds: [[number, number], [number, number]]
  maxSignal: number
}

interface ShadowZone {
  id: number
  name: string
  area: number
  centroid: [number, number]
  severity: string
  distanceToNearest: number
  cellCount: number
  cells: GridCell[]
}

export default function MineMap({
  mineId,
  repeaters,
  mapConfig,
  heatConfig,
  boundary,
  obstacles = [],
  lang
}: MineMapProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // Layers Toggles
  const [showOrtofoto, setShowOrtofoto] = useState(true)
  const [showGrid, setShowGrid] = useState(true)
  const [showLayerMenu, setShowLayerMenu] = useState(false)

  // Live heatmap configuration (editable directly on the map)
  const [liveHeatRadius, setLiveHeatRadius] = useState(heatConfig?.radius ?? 60)
  const [liveHeatBlur, setLiveHeatBlur] = useState(heatConfig?.blur ?? 40)
  const [liveHeatIntensity, setLiveHeatIntensity] = useState(heatConfig?.intensity ?? 0.8)
  const [showHeatSettings, setShowHeatSettings] = useState(false)
  const [savingHeat, setSavingHeat] = useState(false)
  const [heatSaveMsg, setHeatSaveMsg] = useState('')

  // Dynamic Heatmap Radius based on Zoom Level (scaled from liveHeatRadius)
  const [currentHeatRadius, setCurrentHeatRadius] = useState(heatConfig?.radius ?? 60)

  useEffect(() => {
    setLiveHeatRadius(heatConfig?.radius ?? 60)
    setLiveHeatBlur(heatConfig?.blur ?? 40)
    setLiveHeatIntensity(heatConfig?.intensity ?? 0.8)
  }, [heatConfig?.radius, heatConfig?.blur, heatConfig?.intensity])

  // Operational Layers visibility — boundary is hidden by default because the stored
  // boundaryCoordinates may have been drawn incorrectly during setup (few points forming
  // a small triangle rather than the actual mine perimeter).
  const showBoundary = false
  const showObstacles = true
  const showRepeaters = true
  const showCriticalZones = true

  const showMinaImage = showOrtofoto // Backward compatibility alias

  // Ortofoto bounds derived from config
  const ortofotoBounds = useMemo<[[number, number], [number, number]] | null>(() => {
    if (mapConfig?.bounds) {
      const b = mapConfig.bounds as any
      if (Array.isArray(b) && b.length === 2) {
        return [
          [Number(b[0][0]), Number(b[0][1])],
          [Number(b[1][0]), Number(b[1][1])]
        ]
      }
    }
    return null
  }, [mapConfig?.bounds])

  // Image natural pixel dimensions (loaded async to compute aspect-ratio correction)
  const [imageNaturalSize, setImageNaturalSize] = useState<{ w: number; h: number } | null>(null)

  useEffect(() => {
    if (!mapConfig?.imageUrl) return
    const img = new window.Image()
    img.onload = () => setImageNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = mapConfig.imageUrl
  }, [mapConfig?.imageUrl])

  // Bounds corrected so the geographic aspect ratio matches the image pixel aspect ratio.
  // This prevents Leaflet from stretching the ImageOverlay horizontally or vertically.
  const correctedOrtofotoBounds = useMemo<[[number, number], [number, number]] | null>(() => {
    if (!ortofotoBounds || !imageNaturalSize || imageNaturalSize.w === 0 || imageNaturalSize.h === 0) {
      return ortofotoBounds
    }

    const [sw, ne] = ortofotoBounds
    const centerLat = (sw[0] + ne[0]) / 2
    const centerLng = (sw[1] + ne[1]) / 2

    const latSpan = Math.abs(ne[0] - sw[0])
    const lngSpan = Math.abs(ne[1] - sw[1])

    // Convert geographic spans to approximate meters
    const cosLat = Math.cos((centerLat * Math.PI) / 180)
    const hMeters = latSpan * 111000
    const wMeters = lngSpan * cosLat * 111000

    // Target: make geoAR (W/H in meters) === pixelAR (W/H in pixels)
    const pixelAR = imageNaturalSize.w / imageNaturalSize.h
    const geoAR = wMeters / hMeters

    let newLatSpan = latSpan
    let newLngSpan = lngSpan

    if (pixelAR > geoAR) {
      // Image is wider than the stored bounds → extend longitude to match
      const newWMeters = hMeters * pixelAR
      newLngSpan = newWMeters / (cosLat * 111000)
    } else if (pixelAR < geoAR) {
      // Image is taller than the stored bounds → extend latitude to match
      const newHMeters = wMeters / pixelAR
      newLatSpan = newHMeters / 111000
    }

    return [
      [centerLat - newLatSpan / 2, centerLng - newLngSpan / 2],
      [centerLat + newLatSpan / 2, centerLng + newLngSpan / 2]
    ]
  }, [ortofotoBounds, imageNaturalSize])

  const [ortofotoOpacity, setOrtofotoOpacity] = useState(1.0) // Initial opacity 100%

  // Boundary Drawing State
  const [isDrawingBoundary, setIsDrawingBoundary] = useState(false)
  const [boundaryCoords, setBoundaryCoords] = useState<[number, number][]>([])

  // Offline status states
  const [isOnline, setIsOnline] = useState(true)
  const [pendingSyncCount, setPendingSyncCount] = useState(0)

  // Simulation State
  const [simulatedRepeater, setSimulatedRepeater] = useState<{
    latitude: number
    longitude: number
    range: number
    model: string
  } | null>(null)
  
  // Interactive Expansion Analysis state
  const [selectedZone, setSelectedZone] = useState<ShadowZone | null>(null)
  const [refocusCenter, setRefocusCenter] = useState<[number, number] | null>(null)
  const [refocusTrigger, setRefocusTrigger] = useState(0)
  const [highlightedZoneId, setHighlightedZoneId] = useState<number | null>(null)

  // New simulation and analysis states
  const [selectedRepeaterId, setSelectedRepeaterId] = useState<string | null>(null)
  const [showIndividualCoverage, setShowIndividualCoverage] = useState(false)
  const [deactivatedRepeaterIds, setDeactivatedRepeaterIds] = useState<string[]>([])
  const [activeSidebarTab, setActiveSidebarTab] = useState<'shadow_zones' | 'radio_criticality'>('shadow_zones')

  useEffect(() => {
    setMounted(true)
    setIsOnline(navigator.onLine)

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    try {
      const queue = JSON.parse(localStorage.getItem('mesh_sync_queue') || '[]')
      setPendingSyncCount(queue.length)
    } catch {
      setPendingSyncCount(0)
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Dynamic Center and Fallbacks
  const center = useMemo<[number, number]>(() => mapConfig && mapConfig.centerLat && mapConfig.centerLng
    ? [mapConfig.centerLat, mapConfig.centerLng]
    : [0, 0],
    [mapConfig?.centerLat, mapConfig?.centerLng]
  )

  const zoom = mapConfig?.defaultZoom || 14
  const hasBoundary = boundary && boundary.coordinates && boundary.coordinates.length >= 3
  const boundaryCoordsForFitter = useMemo(() => hasBoundary ? boundary!.coordinates : [], [hasBoundary, boundary?.coordinates])

  // Validate coordinates inside boundary
  const checkCoordinatesInBoundary = (lat: number, lng: number): boolean => {
    if (!hasBoundary) return true
    return isPointInPolygon([lat, lng], boundary!.coordinates)
  }

  // Handle boundary drawing click
  const handleMapClickForBoundary = (latlng: L.LatLng) => {
    setBoundaryCoords(prev => [...prev, [latlng.lat, latlng.lng]])
  }

  // Save boundary coords
  const handleSaveBoundary = async () => {
    if (boundaryCoords.length < 3) {
      alert('Desenhe pelo menos 3 pontos para criar o perímetro.')
      return
    }

    try {
      const res = await saveMineBoundary(mineId, JSON.stringify(boundaryCoords))
      if (res.success) {
        setIsDrawingBoundary(false)
        router.refresh()
      } else {
        alert(res.error || 'Erro ao salvar limites.')
      }
    } catch (err) {
      alert('Erro de rede ao salvar limites.')
    }
  }

  // Import boundaries (GeoJSON / KML)
  const handleImportBoundaryFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (file.name.endsWith('.geojson') || file.name.endsWith('.json')) {
        try {
          const geojson = JSON.parse(text)
          let coords: [number, number][] = []
          if (geojson.type === 'FeatureCollection') {
            const feature = geojson.features.find((f: any) => f.geometry?.type === 'Polygon')
            if (feature) {
              coords = feature.geometry.coordinates[0].map((c: any) => [c[1], c[0]] as [number, number])
            }
          } else if (geojson.type === 'Feature') {
            if (geojson.geometry?.type === 'Polygon') {
              coords = geojson.geometry.coordinates[0].map((c: any) => [c[1], c[0]] as [number, number])
            }
          } else if (geojson.type === 'Polygon') {
            coords = geojson.coordinates[0].map((c: any) => [c[1], c[0]] as [number, number])
          }
          
          if (coords.length > 0) {
            setBoundaryCoords(coords)
            alert('Limites importados do GeoJSON com sucesso!')
          } else {
            alert('Nenhum polígono encontrado no GeoJSON.')
          }
        } catch (err) {
          alert('Erro ao analisar arquivo GeoJSON.')
        }
      } else if (file.name.endsWith('.kml')) {
        try {
          const parser = new DOMParser()
          const xmlDoc = parser.parseFromString(text, 'text/xml')
          const coordString = xmlDoc.getElementsByTagName('coordinates')[0]?.textContent || ''
          const coords: [number, number][] = coordString
            .trim()
            .split(/\s+/)
            .map(str => {
              const parts = str.split(',')
              return [Number(parts[1]), Number(parts[0])] as [number, number]
            })
            .filter(c => !isNaN(c[0]) && !isNaN(c[1]))

          if (coords.length > 0) {
            setBoundaryCoords(coords)
            alert('Limites importados do KML com sucesso!')
          } else {
            alert('Nenhuma coordenada válida encontrada no KML.')
          }
        } catch (err) {
          alert('Erro ao analisar arquivo KML.')
        }
      }
    }
    reader.readAsText(file)
  }

  // Handle updates (both online and enqueued offline)
  const handleLocationUpdate = async (repeaterId: string, lat: number, lng: number, desc?: string) => {
    if (!checkCoordinatesInBoundary(lat, lng)) {
      alert('Atenção: A repetidora está fora dos limites operacionais oficiais da mina!')
      router.refresh()
      return
    }

    setUpdatingId(repeaterId)

    if (navigator.onLine) {
      try {
        const result = await updateRepeaterLocation(repeaterId, lat, lng, desc)
        if (result.success) {
          router.refresh()
        } else {
          alert(result.error)
        }
      } finally {
        setUpdatingId(null)
      }
    } else {
      try {
        const queue = JSON.parse(localStorage.getItem('mesh_sync_queue') || '[]')
        const existingIdx = queue.findIndex((item: any) => item.repeaterId === repeaterId)
        const payload = { repeaterId, latitude: lat, longitude: lng, locationDescription: desc, timestamp: Date.now() }
        
        if (existingIdx > -1) {
          queue[existingIdx] = payload
        } else {
          queue.push(payload)
        }

        localStorage.setItem('mesh_sync_queue', JSON.stringify(queue))
        setPendingSyncCount(queue.length)
        alert('Dispositivo offline. Localização guardada localmente para sincronização.')
      } catch (err) {
        console.error('Failed to save offline actions', err)
      } finally {
        setUpdatingId(null)
      }
    }
  }

  const triggerSync = async () => {
    if (!navigator.onLine) {
      alert('Ainda sem conexão de rede.')
      return
    }

    const queue = JSON.parse(localStorage.getItem('mesh_sync_queue') || '[]')
    if (queue.length === 0) return

    setUpdatingId('syncing')
    let successCount = 0

    for (const item of queue) {
      try {
        const res = await updateRepeaterLocation(item.repeaterId, item.latitude, item.longitude, item.locationDescription)
        if (res.success) {
          successCount++
        }
      } catch (err) {
        console.error('Failed syncing item', item, err)
      }
    }

    const remaining = queue.slice(successCount)
    localStorage.setItem('mesh_sync_queue', JSON.stringify(remaining))
    setPendingSyncCount(remaining.length)
    setUpdatingId(null)

    if (remaining.length === 0) {
      alert('Todas as localizações offline foram sincronizadas com sucesso!')
      router.refresh()
    } else {
      alert(`Sincronização concluída parcialmente: ${successCount} salvas, ${remaining.length} falharam.`);
    }
  }

  // Active repeaters list (ONLINE and MAINTENANCE physical ones)
  const activeRepeaters = useMemo(
    () => repeaters.filter(r => r.latitude && r.longitude && (r.status === 'ONLINE' || r.status === 'MAINTENANCE')),
    [repeaters]
  )

  const repeaterPositions = useMemo(
    () => activeRepeaters.filter(r => r.latitude && r.longitude).map(r => [r.latitude!, r.longitude!] as [number, number]),
    [activeRepeaters]
  )

  // Heatmap active repeaters list (handles virtual deactivations and single coverage modes)
  const heatmapRepeaters = useMemo(() => {
    let list = activeRepeaters.filter(r => !deactivatedRepeaterIds.includes(r.id))
    if (showIndividualCoverage && selectedRepeaterId) {
      list = list.filter(r => r.id === selectedRepeaterId)
    }
    return list
  }, [activeRepeaters, deactivatedRepeaterIds, showIndividualCoverage, selectedRepeaterId])

  // ----------------------------------------------------
  // GRID PROPAGATION MATH (WITH MEMOIZATION & CANVAS COMPATIBILITY)
  // ----------------------------------------------------
  
  // Compact list of repeaters to avoid deep comparison in hook dependencies
  const physicalRepeatersKey = JSON.stringify(
    activeRepeaters.map(r => ({
      id: r.id,
      lat: r.latitude,
      lng: r.longitude,
      range: r.range,
      model: r.model
    }))
  )

  const { baselineCells, currentGridCells } = useMemo(() => {
    const calc = (
      simulated: typeof simulatedRepeater,
      deactIds: string[],
      indId: string | null,
      indMode: boolean
    ) => {
      const validCellsList: GridCell[] = []
      
      // Find grid bounding box
      let gridMinLat = 90, gridMaxLat = -90, gridMinLng = 180, gridMaxLng = -180
      if (hasBoundary) {
        boundary!.coordinates.forEach(coord => {
          if (coord[0] < gridMinLat) gridMinLat = coord[0]
          if (coord[0] > gridMaxLat) gridMaxLat = coord[0]
          if (coord[1] < gridMinLng) gridMinLng = coord[1]
          if (coord[1] > gridMaxLng) gridMaxLng = coord[1]
        })
      } else if (ortofotoBounds) {
        gridMinLat = Math.min(ortofotoBounds[0][0], ortofotoBounds[1][0])
        gridMaxLat = Math.max(ortofotoBounds[0][0], ortofotoBounds[1][0])
        gridMinLng = Math.min(ortofotoBounds[0][1], ortofotoBounds[1][1])
        gridMaxLng = Math.max(ortofotoBounds[0][1], ortofotoBounds[1][1])
      } else {
        const cLat = mapConfig?.centerLat || -5.78957
        const cLng = mapConfig?.centerLng || -50.53500
        gridMinLat = cLat - 0.015
        gridMaxLat = cLat + 0.015
        gridMinLng = cLng - 0.015
        gridMaxLng = cLng + 0.015
      }

      const resolution = mapConfig?.gridResolution || 40
      const latStep = (gridMaxLat - gridMinLat) / resolution
      const lngStep = (gridMaxLng - gridMinLng) / resolution

      // Apply virtual deactivations and coverage mode filters
      let computationRepeaters = activeRepeaters.filter(r => !deactIds.includes(r.id))
      if (indMode && indId) {
        computationRepeaters = computationRepeaters.filter(r => r.id === indId)
      }

      if (simulated) {
        computationRepeaters.push({
          id: 'simulated',
          name: 'Repetidora Virtual (Simulada)',
          code: 'SIM-999',
          model: simulated.model,
          status: 'ONLINE',
          range: simulated.range,
          latitude: simulated.latitude,
          longitude: simulated.longitude,
          altitude: 900,
          locationDescription: 'Posição Simulada',
          updatedAt: new Date().toISOString(),
          updatedBy: { name: 'Simulador' }
        } as any)
      }

      for (let i = 0; i < resolution; i++) {
        for (let j = 0; j < resolution; j++) {
          const cellLat = gridMinLat + (i + 0.5) * latStep
          const cellLng = gridMinLng + (j + 0.5) * lngStep
          
          const inside = hasBoundary ? isPointInPolygon([cellLat, cellLng], boundary!.coordinates) : true
          if (!inside) continue

          let maxSignal = 0.0
          
          // Compute signal from all visible repeaters
          computationRepeaters.forEach(r => {
            const dist = getDistanceMeters([r.latitude!, r.longitude!], [cellLat, cellLng])
            if (dist <= r.range) {
              const obsMultiplier = calculateObstacleAttenuation([r.latitude!, r.longitude!], [cellLat, cellLng], obstacles)
              const signal = calculatePathLoss(dist, r.model, obsMultiplier)
              if (signal > maxSignal) {
                maxSignal = signal
              }
            }
          })

          let cellStatus: 'excellent' | 'good' | 'critical' | 'uncovered' = 'uncovered'
          if (maxSignal >= 0.70) cellStatus = 'excellent'
          else if (maxSignal >= 0.40) cellStatus = 'good'
          else if (maxSignal > 0.00) cellStatus = 'critical'

          validCellsList.push({
            i,
            j,
            lat: cellLat,
            lng: cellLng,
            status: cellStatus,
            bounds: [
              [gridMinLat + i * latStep, gridMinLng + j * lngStep],
              [gridMinLat + (i + 1) * latStep, gridMinLng + (j + 1) * lngStep]
            ],
            maxSignal
          })
        }
      }

      return validCellsList
    }

    // Baseline is always calculated with all actual repeaters online (no simulated failure, no virtual antennas)
    const base = calc(null, [], null, false)
    
    // Current contains active simulations/deactivations
    const current = calc(simulatedRepeater, deactivatedRepeaterIds, selectedRepeaterId, showIndividualCoverage)

    return { baselineCells: base, currentGridCells: current }
  }, [
    physicalRepeatersKey,
    simulatedRepeater,
    deactivatedRepeaterIds,
    selectedRepeaterId,
    showIndividualCoverage,
    obstacles,
    boundary?.coordinates,
    mapConfig?.gridResolution,
    mapConfig?.centerLat,
    mapConfig?.centerLng,
    hasBoundary,
    ortofotoBounds
  ])

  // Automatic Coverage Scale Warning calculation
  const isScaleWarningActive = useMemo(() => {
    if (!hasBoundary || !ortofotoBounds) return false
    
    // Total cells in operational area
    let insideBoundaryCount = 0
    let insideImageCount = 0

    const sw = ortofotoBounds[0]
    const ne = ortofotoBounds[1]
    const latMin = Math.min(sw[0], ne[0])
    const latMax = Math.max(sw[0], ne[0])
    const lngMin = Math.min(sw[1], ne[1])
    const lngMax = Math.max(sw[1], ne[1])

    currentGridCells.forEach(cell => {
      insideBoundaryCount++
      const inImage = cell.lat >= latMin && cell.lat <= latMax && cell.lng >= lngMin && cell.lng <= lngMax
      if (inImage) {
        insideImageCount++
      }
    })

    const ratio = insideBoundaryCount > 0 ? insideImageCount / insideBoundaryCount : 1.0
    return ratio < 0.90
  }, [currentGridCells, ortofotoBounds, hasBoundary])

  // ----------------------------------------------------
  // STATISTICS & BFS CLUSTERING
  // ----------------------------------------------------
  const { baselineStats, currentStats, recoveredAreaHa } = useMemo(() => {
    const computeStats = (cells: GridCell[], isCurrentSimulation: boolean) => {
      const totalCount = cells.length
      const excellent = cells.filter(c => c.status === 'excellent').length
      const good = cells.filter(c => c.status === 'good').length
      const critical = cells.filter(c => c.status === 'critical').length
      const uncovered = cells.filter(c => c.status === 'uncovered').length

      const totalAreaHa = hasBoundary ? calculatePolygonArea(boundary!.coordinates) : 0.0
      const coveragePercent = totalCount > 0 ? ((excellent + good + critical) / totalCount) * 100 : 0.0
      const coveredArea = totalAreaHa * (coveragePercent / 100)
      const uncoveredArea = totalAreaHa - coveredArea

      // Connected component cluster BFS on critical / uncovered cells
      const visited = new Set<string>()
      const clusters: ShadowZone[] = []
      const cellMap = new Map<string, GridCell>()
      cells.forEach(c => cellMap.set(`${c.i},${c.j}`, c))

      let clusterIdCounter = 1

      cells.forEach(cell => {
        const key = `${cell.i},${cell.j}`
        if ((cell.status === 'critical' || cell.status === 'uncovered') && !visited.has(key)) {
          const queue: GridCell[] = [cell]
          const comp: GridCell[] = [cell]
          visited.add(key)

          let head = 0
          while (head < queue.length) {
            const curr = queue[head++]
            const neighbors = [
              [curr.i + 1, curr.j],
              [curr.i - 1, curr.j],
              [curr.i, curr.j + 1],
              [curr.i, curr.j - 1]
            ]
            neighbors.forEach(([ni, nj]) => {
              const nKey = `${ni},${nj}`
              const nCell = cellMap.get(nKey)
              if (nCell && (nCell.status === 'critical' || nCell.status === 'uncovered') && !visited.has(nKey)) {
                visited.add(nKey)
                queue.push(nCell)
                comp.push(nCell)
              }
            })
          }

          // Compute centroid
          let sumLat = 0, sumLng = 0
          comp.forEach(c => {
            sumLat += c.lat
            sumLng += c.lng
          })
          const centroidLat = sumLat / comp.length
          const centroidLng = sumLng / comp.length

          // Cluster Hectares Area
          const compAreaHa = totalAreaHa * (comp.length / totalCount)

          // Sector name calculation relative to mine center
          const refLat = mapConfig?.centerLat || -5.78957
          const refLng = mapConfig?.centerLng || -50.53500
          const dLat = centroidLat - refLat
          const dLng = centroidLng - refLng

          let sectorName = ''
          if (Math.abs(dLat) > Math.abs(dLng)) {
            sectorName = dLat > 0 ? 'Setor Norte' : 'Setor Sul'
          } else {
            sectorName = dLng > 0 ? 'Setor Leste' : 'Setor Oeste'
          }

          // Distance from cluster centroid to nearest physical active (non-deactivated) repeater
          let distanceToNearest = 0
          const activeNonDeact = isCurrentSimulation
            ? activeRepeaters.filter(r => !deactivatedRepeaterIds.includes(r.id))
            : activeRepeaters
            
          if (activeNonDeact.length > 0) {
            let minD = Infinity
            activeNonDeact.forEach(r => {
              const d = getDistanceMeters([r.latitude!, r.longitude!], [centroidLat, centroidLng])
              if (d < minD) minD = d
            })
            distanceToNearest = minD
          }

          const uncCount = comp.filter(c => c.status === 'uncovered').length
          const severity = uncCount > comp.length * 0.6 ? 'Crítico (Sem Sinal)' : 'Moderado (Sinal Fraco)'

          // Filter out very small noise clusters
          if (compAreaHa >= 0.05 && comp.length >= 2) {
            clusters.push({
              id: clusterIdCounter++,
              name: `${sectorName} - C${clusterIdCounter - 1}`,
              area: compAreaHa,
              centroid: [centroidLat, centroidLng],
              severity,
              distanceToNearest,
              cellCount: comp.length,
              cells: comp
            })
          }
        }
      })

      // Sort shadow zones by area descending
      clusters.sort((a, b) => b.area - a.area)

      return {
        excellent,
        good,
        critical,
        uncovered,
        totalCount,
        coveragePercent,
        coveredArea,
        uncoveredArea,
        totalAreaHa,
        clusters
      }
    }

    const base = computeStats(baselineCells, false)
    const curr = computeStats(currentGridCells, true)
    const recArea = simulatedRepeater
      ? Math.max(0, curr.coveredArea - base.coveredArea)
      : 0.0

    return {
      baselineStats: base,
      currentStats: curr,
      recoveredAreaHa: recArea
    }
  }, [
    baselineCells,
    currentGridCells,
    deactivatedRepeaterIds,
    simulatedRepeater,
    boundary?.coordinates,
    mapConfig?.centerLat,
    mapConfig?.centerLng,
    hasBoundary
  ])

  // ----------------------------------------------------
  // NETWORK HEALTH SCORE CALCULATION (0 to 100)
  // ----------------------------------------------------
  const healthScore = useMemo(() => {
    if (currentGridCells.length === 0) return 0
    
    // Coverage percent (excellent + good + critical cells count ratio)
    const coverage = currentStats.coveragePercent
    
    // Shadow/uncovered cells ratio
    const shadowCount = currentGridCells.filter(c => c.status === 'uncovered').length
    const shadowPercent = (shadowCount / currentGridCells.length) * 100

    // Redundancy index: average active repeaters covering covered cells
    let totalCoveredCells = 0
    let totalOverlaps = 0

    const activeNonDeact = activeRepeaters.filter(r => !deactivatedRepeaterIds.includes(r.id))
    
    currentGridCells.forEach(cell => {
      if (cell.status !== 'uncovered') {
        totalCoveredCells++
        let covers = 0
        activeNonDeact.forEach(r => {
          const dist = getDistanceMeters([r.latitude!, r.longitude!], [cell.lat, cell.lng])
          if (dist <= r.range) {
            const obsMultiplier = calculateObstacleAttenuation([r.latitude!, r.longitude!], [cell.lat, cell.lng], obstacles)
            const signal = calculatePathLoss(dist, r.model, obsMultiplier)
            if (signal >= 0.40) {
              covers++
            }
          }
        })
        totalOverlaps += covers
      }
    })

    const avgOverlap = totalCoveredCells > 0 ? totalOverlaps / totalCoveredCells : 0.0
    // Scales redundancy between 0.0 (single coverage) and 1.0 (average of 3 overlapping repeaters)
    const redundancyIndex = Math.max(0, Math.min(1.0, (avgOverlap - 1) / 2))

    // Quality Score combination
    const zonesCount = currentStats.clusters.length
    let score = (coverage * 0.6) + ((100 - shadowPercent) * 0.2) + (redundancyIndex * 20) - Math.min(20, zonesCount * 4)
    
    return Math.max(0, Math.min(100, Math.round(score)))
  }, [currentGridCells, currentStats, activeRepeaters, deactivatedRepeaterIds, obstacles])

  // ----------------------------------------------------
  // REPEATER CRITICALITY & EXCLUSIVE COVERAGE ANALYSIS
  // ----------------------------------------------------
  const repeaterCriticalityList = useMemo(() => {
    if (baselineCells.length === 0 || activeRepeaters.length === 0) return []

    const list: {
      id: string
      name: string
      code: string
      exclusiveArea: number
      dependentCells: number
      impactPercent: number
      criticality: 'Alta' | 'Média' | 'Baixa'
    }[] = []

    const totalAreaHa = hasBoundary ? calculatePolygonArea(boundary!.coordinates) : 0.0

    activeRepeaters.forEach(target => {
      let dependentCount = 0
      const otherActive = activeRepeaters.filter(r => r.id !== target.id)

      baselineCells.forEach(cell => {
        // Did target cover this cell?
        const dist = getDistanceMeters([target.latitude!, target.longitude!], [cell.lat, cell.lng])
        if (dist <= target.range) {
          const obsM = calculateObstacleAttenuation([target.latitude!, target.longitude!], [cell.lat, cell.lng], obstacles)
          const sig = calculatePathLoss(dist, target.model, obsM)
          
          if (sig >= 0.40) {
            // Is it covered by any other repeater?
            let coveredByOthers = false
            for (const other of otherActive) {
              const dOther = getDistanceMeters([other.latitude!, other.longitude!], [cell.lat, cell.lng])
              if (dOther <= other.range) {
                const obsMO = calculateObstacleAttenuation([other.latitude!, other.longitude!], [cell.lat, cell.lng], obstacles)
                const sigO = calculatePathLoss(dOther, other.model, obsMO)
                if (sigO >= 0.40) {
                  coveredByOthers = true
                  break
                }
              }
            }
            if (!coveredByOthers) {
              dependentCount++
            }
          }
        }
      })

      const exclusiveArea = totalAreaHa * (dependentCount / baselineCells.length)
      const impactPercent = (dependentCount / baselineCells.length) * 100

      let criticality: 'Alta' | 'Média' | 'Baixa' = 'Baixa'
      if (exclusiveArea > 4.0) {
        criticality = 'Alta'
      } else if (exclusiveArea >= 1.0) {
        criticality = 'Média'
      }

      list.push({
        id: target.id,
        name: target.name,
        code: target.code,
        exclusiveArea,
        dependentCells: dependentCount,
        impactPercent,
        criticality
      })
    })

    return list
  }, [baselineCells, activeRepeaters, boundary?.coordinates, obstacles, hasBoundary])

  // ----------------------------------------------------
  // INTERACTIVE EXPANSION ANALYSIS CALCULATOR
  // ----------------------------------------------------
  const handleExpansionAnalysis = (zone: ShadowZone) => {
    setSelectedZone(zone)
    const targetLat = zone.centroid[0]
    const targetLng = zone.centroid[1]

    // Simulate placing a virtual Rajante repeater at this centroid
    setSimulatedRepeater({
      latitude: targetLat,
      longitude: targetLng,
      range: 250,
      model: 'Rajante'
    })

    setHighlightedZoneId(zone.id)
    setRefocusCenter(zone.centroid)
    setRefocusTrigger(prev => prev + 1)
  }

  const triggerManualSimulation = () => {
    const defaultLat = mapConfig?.centerLat || -5.78957
    const defaultLng = mapConfig?.centerLng || -50.53500
    setSimulatedRepeater({
      latitude: defaultLat,
      longitude: defaultLng,
      range: 250,
      model: 'Rajante'
    })
    setSelectedZone(null)
    setHighlightedZoneId(null)
  }

  const removeSimulation = () => {
    setSimulatedRepeater(null)
    setSelectedZone(null)
    setHighlightedZoneId(null)
  }

  if (!mounted) return <div className="w-full h-screen bg-slate-100 animate-pulse" />

  // ----------------------------------------------------
  // HTML RENDER
  // ----------------------------------------------------
  return (
    <div className="relative w-full h-screen">
      {/* MAP PANEL */}
      <div className="w-full h-full overflow-hidden z-0">
          
          <MapContainer
            center={center}
            zoom={zoom}
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%' }}
            preferCanvas={true}
          >


            <ScaleControl position="bottomleft" imperial={false} />
            <MapAutoFitter
              boundaryCoords={boundaryCoordsForFitter}
              imageBounds={correctedOrtofotoBounds}
              repeaterPositions={repeaterPositions}
              center={center}
              defaultZoom={zoom}
            />
            <MapRefocuser center={refocusCenter} trigger={refocusTrigger} />
            <MapClickHandler onMapClick={handleMapClickForBoundary} active={isDrawingBoundary} />
            <HeatmapZoomHandler setHeatRadius={setCurrentHeatRadius} baseRadius={liveHeatRadius} defaultZoom={zoom} />

            {/* Mine Image Overlay (if calibrated and checked) */}
            {mapConfig && mapConfig.isCalibrated && correctedOrtofotoBounds && showOrtofoto && (
              <ImageOverlay
                url={mapConfig.imageUrl}
                bounds={correctedOrtofotoBounds as L.LatLngBoundsExpression}
                opacity={ortofotoOpacity}
                className="ortofoto-layer-overlay"
              />
            )}

            {/* Mine boundary polygon limits */}
            {hasBoundary && showBoundary && !isDrawingBoundary && (
              <Polygon
                positions={boundary!.coordinates}
                pathOptions={{
                  color: '#EF4444',
                  dashArray: '6, 6',
                  fillColor: '#EF4444',
                  fillOpacity: 0.02,
                  weight: 2
                }}
              />
            )}

            {/* Boundary drawing segment */}
            {isDrawingBoundary && boundaryCoords.length > 0 && (
              <>
                <Polyline
                  positions={boundaryCoords}
                  pathOptions={{ color: '#EF4444', weight: 2, dashArray: '4, 4' }}
                />
                {boundaryCoords.length >= 3 && (
                  <Polygon
                    positions={boundaryCoords}
                    pathOptions={{ color: '#EF4444', fillOpacity: 0.1, weight: 1 }}
                  />
                )}
                {boundaryCoords.map((coord, idx) => (
                  <Marker
                    key={idx}
                    position={coord}
                    icon={L.divIcon({
                      html: `<div style="width:10px;height:10px;background:#EF4444;border:2px solid white;border-radius:50%;box-shadow:0 0 4px rgba(0,0,0,0.5)"></div>`,
                      className: '',
                      iconSize: [10, 10],
                      iconAnchor: [5, 5]
                    })}
                    eventHandlers={{
                      click: () => {
                        setBoundaryCoords(prev => prev.filter((_, i) => i !== idx))
                      }
                    }}
                  />
                ))}
              </>
            )}

            {/* Obstacles polygons */}
            {showObstacles && obstacles.map(o => (
              <Polygon
                key={o.id}
                positions={o.coordinates}
                pathOptions={{
                  color: o.type === 'WALL' ? '#7F1D1D' : o.type === 'SLOPE' ? '#D97706' : '#475569',
                  fillColor: o.type === 'WALL' ? '#7F1D1D' : o.type === 'SLOPE' ? '#F59E0B' : '#64748B',
                  fillOpacity: 0.2,
                  weight: 1.5
                }}
              >
                <Tooltip><span className="font-semibold">{o.name}</span> (Atenuação: {o.attenuation * 100}%)</Tooltip>
              </Polygon>
            ))}

            {/* HEATMAP LAYER — single layer to avoid alpha-compositing artifacts from stacked canvases */}
            {showGrid && (
              <HeatmapLayer
                points={[
                  ...heatmapRepeaters.map(r => [r.latitude!, r.longitude!, 1.0] as HeatPoint),
                  ...(simulatedRepeater ? [[simulatedRepeater.latitude, simulatedRepeater.longitude, 1.0] as HeatPoint] : [])
                ]}
                radius={currentHeatRadius}
                blur={liveHeatBlur}
                max={liveHeatIntensity}
                minOpacity={0.04}
                gradient={{
                  0.0:  '#00007f',
                  0.2:  '#0000ff',
                  0.4:  '#00ffff',
                  0.6:  '#ffff00',
                  0.8:  '#ff8c00',
                  1.0:  '#ff0000',
                }}
              />
            )}


            {/* PHYSICAL REPEATERS MARKERS */}
            {showRepeaters && repeaters.map(repeater => {
              if (!repeater.latitude || !repeater.longitude) return null

              const position: L.LatLngTuple = [repeater.latitude!, repeater.longitude!]
              const isDeactivated = deactivatedRepeaterIds.includes(repeater.id)
              
              // Custom colors representing device active state
              const isOnline = repeater.status === 'ONLINE'
              const isMaintenance = repeater.status === 'MAINTENANCE'
              const statusColor = isDeactivated 
                ? '#94A3B8' 
                : isOnline 
                ? '#10B981' 
                : isMaintenance 
                ? '#F59E0B' 
                : '#EF4444'

              // Custom SVG icons depending on model
              const isRajante = repeater.model.toLowerCase() === 'rajante'
              const modelIcon = isRajante
                ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${statusColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/></svg>`
                : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${statusColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><circle cx="12" cy="12" r="2"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg>`

              const divIcon = L.divIcon({
                html: `
                  <div style="
                    width: 32px;
                    height: 32px;
                    background: white;
                    border: 3.5px solid ${statusColor};
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.35);
                    opacity: ${isDeactivated ? 0.6 : 1.0};
                  ">
                    ${modelIcon}
                  </div>
                `,
                className: '',
                iconSize: [32, 32],
                iconAnchor: [16, 16],
              })

              return (
                <div key={repeater.id}>
                  <Marker
                    position={position}
                    icon={divIcon}
                    draggable={!isDrawingBoundary}
                    eventHandlers={{
                      dragend: async (e) => {
                        const marker = e.target
                        const pos = marker.getLatLng()
                        await handleLocationUpdate(repeater.id, pos.lat, pos.lng, repeater.locationDescription || undefined)
                      },
                    }}
                  >
                    <Tooltip permanent direction="top" offset={[0, -18]} className="repeater-tooltip">
                      <span className="font-bold text-[10px] text-white bg-slate-900/90 px-1.5 py-0.5 rounded shadow whitespace-nowrap block" style={{ borderLeft: `3px solid ${statusColor}`, opacity: isDeactivated ? 0.6 : 1.0 }}>
                        {repeater.code} {isDeactivated ? '(Inativo)' : ''}
                      </span>
                    </Tooltip>
                    
                    <Popup>
                      <div className="text-xs min-w-[220px]">
                        <strong className="block text-sm font-bold">{repeater.name} ({repeater.model})</strong>
                        <span className="text-slate-400 font-mono">{repeater.code}</span>
                        
                        <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                          <p><strong>Alcance Físico:</strong> {repeater.range} metros</p>
                          {repeater.altitude !== null && <p><strong>Altitude:</strong> {repeater.altitude}m</p>}
                          {repeater.locationDescription && <p><strong>Local:</strong> {repeater.locationDescription}</p>}
                          <p><strong>Última Atu:</strong> {new Date(repeater.updatedAt).toLocaleString('pt-BR')}</p>
                          {repeater.updatedBy && <p><strong>Operador:</strong> {repeater.updatedBy.name}</p>}
                        </div>

                        {/* Interactive simulation controls in popup */}
                        <div className="mt-2.5 pt-2.5 border-t grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              if (isDeactivated) {
                                setDeactivatedRepeaterIds(prev => prev.filter(id => id !== repeater.id))
                              } else {
                                setDeactivatedRepeaterIds(prev => [...prev, repeater.id])
                              }
                            }}
                            className={`px-2 py-1 text-[10px] font-bold text-white rounded transition-colors text-center ${
                              isDeactivated ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                            }`}
                          >
                            {isDeactivated ? 'Reativar' : 'Simular Falha'}
                          </button>
                          
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              if (showIndividualCoverage && selectedRepeaterId === repeater.id) {
                                setShowIndividualCoverage(false)
                                setSelectedRepeaterId(null)
                              } else {
                                setShowIndividualCoverage(true)
                                setSelectedRepeaterId(repeater.id)
                              }
                            }}
                            className={`px-2 py-1 text-[10px] font-bold text-white rounded transition-colors text-center ${
                              showIndividualCoverage && selectedRepeaterId === repeater.id ? 'bg-slate-600 hover:bg-slate-700' : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                          >
                            {showIndividualCoverage && selectedRepeaterId === repeater.id ? 'Ver Rede' : 'Ver Alcance'}
                          </button>
                        </div>

                        <form className="mt-2.5 pt-2.5 border-t" onSubmit={async (e) => {
                          e.preventDefault()
                          const form = e.currentTarget
                          const lat = Number((form.elements.namedItem('lat') as HTMLInputElement).value)
                          const lng = Number((form.elements.namedItem('lng') as HTMLInputElement).value)
                          const desc = (form.elements.namedItem('desc') as HTMLInputElement).value
                          await handleLocationUpdate(repeater.id, lat, lng, desc)
                        }}>
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Descrição Localização</label>
                            <input type="text" name="desc" defaultValue={repeater.locationDescription || ''} className="w-full text-[11px] px-1.5 py-1 border rounded mt-0.5" />
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 uppercase">Latitude</label>
                              <input type="number" name="lat" step="any" defaultValue={repeater.latitude || ''} className="w-full text-[11px] px-1.5 py-1 border rounded mt-0.5 font-mono" />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 uppercase">Longitude</label>
                              <input type="number" name="lng" step="any" defaultValue={repeater.longitude || ''} className="w-full text-[11px] px-1.5 py-1 border rounded mt-0.5 font-mono" />
                            </div>
                          </div>
                          <button type="submit" className="w-full mt-2 py-1 bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-semibold rounded">
                            Atualizar Coordenadas
                          </button>
                        </form>
                      </div>
                    </Popup>
                  </Marker>

                  {/* Nominal range indicator overlay for selected individual coverage */}
                  {showIndividualCoverage && selectedRepeaterId === repeater.id && (
                    <Circle
                      center={position}
                      radius={repeater.range}
                      pathOptions={{
                        color: '#3B82F6',
                        fillColor: '#3B82F6',
                        fillOpacity: 0.05,
                        weight: 1.5,
                        dashArray: '5, 5'
                      }}
                    />
                  )}
                </div>
              )
            })}

            {/* SIMULATED VIRTUAL REPEATER MARKER */}
            {showRepeaters && simulatedRepeater && (
              <Marker
                position={[simulatedRepeater.latitude, simulatedRepeater.longitude]}
                draggable={true}
                eventHandlers={{
                  dragend: (e) => {
                    const marker = e.target
                    const pos = marker.getLatLng()
                    setSimulatedRepeater(prev => prev ? { ...prev, latitude: pos.lat, longitude: pos.lng } : null)
                  }
                }}
                icon={L.divIcon({
                  html: `
                    <div style="
                      width: 36px;
                      height: 36px;
                      background: #EEF2FF;
                      border: 3.5px dashed #4F46E5;
                      border-radius: 50%;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      box-shadow: 0 4px 10px rgba(79,70,229,0.45);
                      animation: pulse 2s infinite;
                    ">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/></svg>
                    </div>
                  `,
                  className: '',
                  iconSize: [36, 36],
                  iconAnchor: [18, 18],
                })}
              >
                <Circle
                  center={[simulatedRepeater.latitude, simulatedRepeater.longitude]}
                  radius={simulatedRepeater.range}
                  pathOptions={{
                    color: '#4F46E5',
                    fillColor: '#4F46E5',
                    fillOpacity: 0.08,
                    weight: 1.5,
                    dashArray: '4, 4'
                  }}
                />
                <Tooltip permanent direction="top" offset={[0, -20]}>
                  <span className="font-bold text-[10px] text-indigo-950 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded shadow block">
                    Repetidora Simulada (Arrastável)
                  </span>
                </Tooltip>
              </Marker>
            )}

            {/* HIGHLIGHTED CRITICAL ZONE OUTLINE (Layer 7 - Top) */}
            {showCriticalZones && highlightedZoneId !== null && showGrid && (
              currentGridCells.map((cell, idx) => {
                const isHighlighted = currentStats.clusters.find(cl => cl.id === highlightedZoneId)?.cells.some(c => c.i === cell.i && c.j === cell.j)
                if (!isHighlighted) return null
                return (
                  <Polygon
                    key={`highlight-outline-${idx}`}
                    positions={[
                      cell.bounds[0],
                      [cell.bounds[0][0], cell.bounds[1][1]],
                      cell.bounds[1],
                      [cell.bounds[1][0], cell.bounds[0][1]]
                    ]}
                    pathOptions={{
                      stroke: true,
                      color: '#DC2626',
                      weight: 2.5,
                      fillOpacity: 0
                    }}
                  />
                )
              })
            )}

          </MapContainer>

          <style dangerouslySetInnerHTML={{ __html: `
            .leaflet-container {
              background-color: transparent !important;
            }
          ` }} />

          {/* 5. FLOATING HEATMAP CONTROL PANEL */}
          <div className="absolute top-3 right-3 z-[1000] select-none font-sans" style={{ width: '220px' }}>
            <div className="bg-white/95 backdrop-blur border border-slate-200/80 rounded-2xl shadow-lg overflow-hidden">

              {/* Header row */}
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-[11px] font-semibold text-slate-700">Repetidoras</span>
                  <span className="bg-slate-100 text-slate-800 text-[10px] px-1.5 py-0.5 rounded-md font-mono font-bold">
                    {activeRepeaters.length}
                  </span>
                </div>
              </div>

              {/* Heatmap toggle row */}
              <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-100">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-blue-500 via-yellow-400 to-red-500" />
                  <span className="text-[11px] font-medium text-slate-600">Mapa de Calor</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Settings gear */}
                  {showGrid && (
                    <button
                      onClick={() => setShowHeatSettings(v => !v)}
                      title="Configurar mapa de calor"
                      className={`p-1 rounded-md transition-colors ${showHeatSettings ? 'bg-blue-100 text-blue-600' : 'text-slate-400 hover:text-blue-500 hover:bg-blue-50'}`}
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {/* Toggle switch */}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showGrid}
                      onChange={() => { setShowGrid(!showGrid); if (showGrid) setShowHeatSettings(false) }}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600" />
                  </label>
                </div>
              </div>

              {/* Expandable heatmap settings */}
              {showHeatSettings && showGrid && (
                <div className="px-3.5 pt-2.5 pb-3 space-y-3">

                  {/* Gradient legend bar (live preview of color scale) */}
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-slate-400 font-semibold mb-1">Escala de Sinal</div>
                    <div className="h-4 rounded-full w-full" style={{
                      background: 'linear-gradient(to right, #00007f, #0000ff 20%, #00ffff 40%, #ffff00 60%, #ff8c00 80%, #ff0000)'
                    }} />
                    <div className="flex justify-between mt-0.5">
                      <span className="text-[8px] text-slate-400">Sem sinal</span>
                      <span className="text-[8px] text-slate-400">Excelente</span>
                    </div>
                  </div>

                  {/* Slider: Raio */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-medium text-slate-600">Raio (alcance)</label>
                      <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{liveHeatRadius}px</span>
                    </div>
                    <input
                      type="range"
                      min={1} max={200} step={1}
                      value={liveHeatRadius}
                      onChange={e => setLiveHeatRadius(Number(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none bg-slate-200 accent-blue-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[8px] text-slate-400 mt-0.5">
                      <span>1</span><span>200</span>
                    </div>
                  </div>

                  {/* Slider: Suavidade (blur) */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-medium text-slate-600">Suavidade</label>
                      <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{liveHeatBlur}px</span>
                    </div>
                    <input
                      type="range"
                      min={5} max={100} step={5}
                      value={liveHeatBlur}
                      onChange={e => setLiveHeatBlur(Number(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none bg-slate-200 accent-blue-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[8px] text-slate-400 mt-0.5">
                      <span>Nítido</span><span>Suave</span>
                    </div>
                  </div>

                  {/* Slider: Intensidade/Opacidade */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-medium text-slate-600">Intensidade</label>
                      <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{Math.round(liveHeatIntensity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.1} max={1.0} step={0.05}
                      value={liveHeatIntensity}
                      onChange={e => setLiveHeatIntensity(Number(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none bg-slate-200 accent-blue-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[8px] text-slate-400 mt-0.5">
                      <span>10%</span><span>100%</span>
                    </div>
                  </div>

                  {/* Save button */}
                  <button
                    disabled={savingHeat}
                    onClick={async () => {
                      setSavingHeat(true)
                      setHeatSaveMsg('')
                      const res = await saveHeatmapConfig(mineId, liveHeatRadius, liveHeatBlur, liveHeatIntensity)
                      setSavingHeat(false)
                      setHeatSaveMsg(res.success ? '✓ Salvo!' : '✗ Erro ao salvar')
                      setTimeout(() => setHeatSaveMsg(''), 2500)
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-[10px] font-semibold rounded-lg transition-colors"
                  >
                    <Save className="w-3 h-3" />
                    {savingHeat ? 'Salvando…' : 'Salvar configuração'}
                  </button>
                  {heatSaveMsg && (
                    <p className={`text-[9px] text-center font-medium ${heatSaveMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}`}>
                      {heatSaveMsg}
                    </p>
                  )}
                </div>
              )}

            </div>
          </div>


        </div>

      </div>
  )
}
