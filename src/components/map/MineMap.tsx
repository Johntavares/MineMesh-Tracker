'use client'

import { useEffect, useState, useRef, MouseEvent, useMemo, useTransition, useCallback } from 'react'
import { MapContainer, TileLayer, ImageOverlay, Marker, Popup, Circle, Tooltip, ScaleControl, Polygon, Polyline, useMap, useMapEvents } from 'react-leaflet'
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
  userRole?: string
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
  center,
  defaultZoom
}: {
  boundaryCoords: [number, number][]
  imageBounds: [[number, number], [number, number]] | null
  center: [number, number]
  defaultZoom: number
}) {
  const map = useMap()
  const hasFittedRef = useRef(false)

  useEffect(() => {
    if (hasFittedRef.current) return

    map.invalidateSize()

    // Build a latLngBounds that covers image or boundary
    let bounds: L.LatLngBounds | null = null

    if (imageBounds && imageBounds.length === 2 && imageBounds[0] && imageBounds[1]) {
      bounds = L.latLngBounds(imageBounds[0], imageBounds[1])
    } else if (boundaryCoords && boundaryCoords.length >= 3) {
      bounds = L.latLngBounds(boundaryCoords)
    }

    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] })
      hasFittedRef.current = true
    } else if (center && center[0] !== 0) {
      map.setView(center, defaultZoom || 15)
      hasFittedRef.current = true
    }
  }, [boundaryCoords, imageBounds, center, defaultZoom, map])
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
    },
    zoomend() {
      const currentZoom = map.getZoom()
      const scale = Math.pow(2, currentZoom - defaultZoom)
      setHeatRadius(Math.max(1, Math.round(baseRadius * scale)))
    },
    moveend() {
      const currentZoom = map.getZoom()
      const scale = Math.pow(2, currentZoom - defaultZoom)
      setHeatRadius(Math.max(1, Math.round(baseRadius * scale)))
    },
    resize() {
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
  lang,
  userRole = 'OPERATOR'
}: MineMapProps) {
  const isAdmin = userRole === 'ADMIN'
  const { t } = useTranslation()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Optimistic local positions: updated immediately on drag, independent of server state
  const [localPositions, setLocalPositions] = useState<Record<string, { lat: number; lng: number }>>({})

  // Debounced repeaters for grid computation — avoids blocking main thread during drag
  const [debouncedGridRepeaters, setDebouncedGridRepeaters] = useState<typeof repeaters>(repeaters)

  // Layers Toggles
  const [showOrtofoto, setShowOrtofoto] = useState(true)
  const [showGrid, setShowGrid] = useState(isAdmin)
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

  // Automatically sync pending offline updates when connection is restored
  useEffect(() => {
    if (isOnline && pendingSyncCount > 0) {
      triggerSync()
    }
  }, [isOnline, pendingSyncCount])

  // Merge repeaters with optimistic local positions and offline queue
  const localRepeaters = useMemo(() => {
    try {
      const queue = JSON.parse(localStorage.getItem('mesh_sync_queue') || '[]')
      return repeaters.map(r => {
        // Priority: optimistic local > offline queue > server
        const localPos = localPositions[r.id]
        if (localPos) {
          return { ...r, latitude: localPos.lat, longitude: localPos.lng }
        }
        const pending = queue.find((item: any) => item.repeaterId === r.id)
        if (pending) {
          return {
            ...r,
            latitude: pending.latitude,
            longitude: pending.longitude,
            locationDescription: pending.locationDescription || r.locationDescription,
            updatedAt: new Date(pending.timestamp).toISOString()
          }
        }
        return r
      })
    } catch {
      return repeaters
    }
  }, [repeaters, pendingSyncCount, localPositions])

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

  // Rollback optimistic position (called on server error)
  const rollbackLocalPosition = useCallback((repeaterId: string) => {
    setLocalPositions(prev => {
      const next = { ...prev }
      delete next[repeaterId]
      return next
    })
  }, [])

  // Handle updates (both online and enqueued offline)
  // Optimistic: caller must have already updated localPositions before calling this
  const handleLocationUpdate = async (repeaterId: string, lat: number, lng: number, desc?: string) => {
    if (!checkCoordinatesInBoundary(lat, lng)) {
      rollbackLocalPosition(repeaterId)
      alert('Atenção: A repetidora está fora dos limites operacionais oficiais da mina!')
      return
    }

    setUpdatingId(repeaterId)

    if (navigator.onLine) {
      try {
        const result = await updateRepeaterLocation(repeaterId, lat, lng, desc)
        if (!result.success) {
          // Rollback visual position on error
          rollbackLocalPosition(repeaterId)
          alert(result.error)
        }
        // On success: keep localPositions as-is (visual already correct, server is updated)
        // No router.refresh() needed — state is already correct
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
        rollbackLocalPosition(repeaterId)
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
    () => localRepeaters.filter(r => r.latitude && r.longitude && (r.status === 'ONLINE' || r.status === 'MAINTENANCE')),
    [localRepeaters]
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

  const heatmapPoints = useMemo<HeatPoint[]>(() => {
    const pts = heatmapRepeaters.map(r => [r.latitude!, r.longitude!, 1.0] as HeatPoint)
    if (simulatedRepeater) {
      pts.push([simulatedRepeater.latitude, simulatedRepeater.longitude, 1.0] as HeatPoint)
    }
    return pts
  }, [heatmapRepeaters, simulatedRepeater])

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

  // Debounce grid repeaters by 300ms so dragging doesn't block the main thread
  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(() => {
        setDebouncedGridRepeaters(activeRepeaters)
      })
    }, 300)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [physicalRepeatersKey])

  const debouncedActiveRepeaters = debouncedGridRepeaters.filter(
    r => r.latitude && r.longitude && (r.status === 'ONLINE' || r.status === 'MAINTENANCE')
  )

  const debouncedRepeatersKey = JSON.stringify(
    debouncedActiveRepeaters.map(r => ({
      id: r.id,
      lat: r.latitude,
      lng: r.longitude,
      range: r.range,
      model: r.model
    }))
  )

  const gridBounds = useMemo<[[number, number], [number, number]]>(() => {
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
    return [
      [gridMinLat, gridMinLng],
      [gridMaxLat, gridMaxLng]
    ]
  }, [boundary?.coordinates, hasBoundary, ortofotoBounds, mapConfig?.centerLat, mapConfig?.centerLng])

  const { baselineCells, currentGridCells } = useMemo(() => {
    const calc = (
      simulated: typeof simulatedRepeater,
      deactIds: string[],
      indId: string | null,
      indMode: boolean
    ) => {
      const validCellsList: GridCell[] = []
      
      const [[gridMinLat, gridMinLng], [gridMaxLat, gridMaxLng]] = gridBounds

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
            const effectiveRange = liveHeatRadius
            if (dist <= effectiveRange) {
              const obsMultiplier = calculateObstacleAttenuation([r.latitude!, r.longitude!], [cellLat, cellLng], obstacles)
              const signal = calculatePathLoss(dist, r.model, obsMultiplier, effectiveRange)
              if (signal > maxSignal) {
                maxSignal = signal
              }
            }
          })

          let cellStatus: 'excellent' | 'good' | 'critical' | 'uncovered' = 'uncovered'
          if (maxSignal >= 0.55) cellStatus = 'excellent'
          else if (maxSignal >= 0.15) cellStatus = 'good'
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
    gridBounds,
    liveHeatRadius,
    debouncedRepeatersKey,
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
          const effectiveRange = liveHeatRadius
          if (dist <= effectiveRange) {
            const obsMultiplier = calculateObstacleAttenuation([r.latitude!, r.longitude!], [cell.lat, cell.lng], obstacles)
            const signal = calculatePathLoss(dist, r.model, obsMultiplier, effectiveRange)
            if (signal >= 0.15) {
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
  }, [currentGridCells, currentStats, activeRepeaters, deactivatedRepeaterIds, obstacles, liveHeatRadius])

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
        const targetEffectiveRange = liveHeatRadius
        if (dist <= targetEffectiveRange) {
          const obsM = calculateObstacleAttenuation([target.latitude!, target.longitude!], [cell.lat, cell.lng], obstacles)
          const sig = calculatePathLoss(dist, target.model, obsM, targetEffectiveRange)
          
          if (sig >= 0.15) {
            // Is it covered by any other repeater?
            let coveredByOthers = false
            for (const other of otherActive) {
              const dOther = getDistanceMeters([other.latitude!, other.longitude!], [cell.lat, cell.lng])
              const otherEffectiveRange = liveHeatRadius
              if (dOther <= otherEffectiveRange) {
                const obsMO = calculateObstacleAttenuation([other.latitude!, other.longitude!], [cell.lat, cell.lng], obstacles)
                const sigO = calculatePathLoss(dOther, other.model, obsMO, otherEffectiveRange)
                if (sigO >= 0.15) {
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
  }, [baselineCells, activeRepeaters, boundary?.coordinates, obstacles, hasBoundary, liveHeatRadius])

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

  const heatmapDataUrl = useMemo(() => {
    if (typeof window === 'undefined' || currentGridCells.length === 0) return null

    const resolution = mapConfig?.gridResolution || 40
    const cellSize = 8 // scale canvas up for smoother interpolation
    const width = resolution * cellSize
    const height = resolution * cellSize

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const [[gridMinLat, gridMinLng], [gridMaxLat, gridMaxLng]] = gridBounds

    // 1. Clip canvas to boundary if configured
    if (hasBoundary && boundary?.coordinates) {
      ctx.beginPath()
      boundary.coordinates.forEach((coord, index) => {
        const pctX = (coord[1] - gridMinLng) / (gridMaxLng - gridMinLng)
        const pctY = 1 - (coord[0] - gridMinLat) / (gridMaxLat - gridMinLat)
        const cx = pctX * width
        const cy = pctY * height
        if (index === 0) ctx.moveTo(cx, cy)
        else ctx.lineTo(cx, cy)
      })
      ctx.closePath()
      ctx.clip()
    }

    // 2. Draw grid cells on canvas
    currentGridCells.forEach(cell => {
      if (cell.status === 'uncovered') return

      let cellColor = '#22C55E' // critical/ruim -> Verde
      if (cell.status === 'excellent') cellColor = '#EF4444' // excelente -> Vermelho
      else if (cell.status === 'good') cellColor = '#EAB308' // bom -> Amarelo

      const x = cell.j * cellSize
      const y = (resolution - 1 - cell.i) * cellSize

      ctx.fillStyle = cellColor
      ctx.fillRect(x, y, cellSize, cellSize)
    })

    // 3. Create blurred image overlay
    const blurredCanvas = document.createElement('canvas')
    blurredCanvas.width = width
    blurredCanvas.height = height
    const blurredCtx = blurredCanvas.getContext('2d')
    if (blurredCtx) {
      const blurPx = Math.max(2, (liveHeatBlur / 100) * 16)
      blurredCtx.filter = `blur(${blurPx}px)`
      blurredCtx.drawImage(canvas, 0, 0)
      return blurredCanvas.toDataURL()
    }

    return canvas.toDataURL()
  }, [currentGridCells, gridBounds, hasBoundary, boundary?.coordinates, mapConfig?.gridResolution, liveHeatBlur, liveHeatIntensity])

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
            preferCanvas={false}
          >


            <ScaleControl position="bottomleft" imperial={false} />
            <MapAutoFitter
              boundaryCoords={boundaryCoordsForFitter}
              imageBounds={ortofotoBounds}
              center={center}
              defaultZoom={zoom}
            />
            <MapRefocuser center={refocusCenter} trigger={refocusTrigger} />
            <MapClickHandler onMapClick={handleMapClickForBoundary} active={isDrawingBoundary} />
            <HeatmapZoomHandler setHeatRadius={setCurrentHeatRadius} baseRadius={liveHeatRadius} defaultZoom={zoom} />

            {/* Mine Image Overlay (if calibrated and checked) */}
            {mapConfig && mapConfig.isCalibrated && ortofotoBounds && showOrtofoto && (
              <ImageOverlay
                url={mapConfig.imageUrl}
                bounds={ortofotoBounds as L.LatLngBoundsExpression}
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

            {/* HEATMAP LAYER — Render smooth dynamic canvas overlay */}
            {isAdmin && showGrid && heatmapDataUrl && (
              <ImageOverlay
                url={heatmapDataUrl}
                bounds={gridBounds as any}
                opacity={liveHeatIntensity * 0.7}
                interactive={false}
                zIndex={400}
              />
            )}


            {/* PHYSICAL REPEATERS MARKERS */}
            {showRepeaters && localRepeaters.map(repeater => {
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

              const isRoot = repeater.code.toUpperCase().startsWith('ROOT-')

              // Custom SVG icons representing the actual physical Rajant and JR3 devices
              const isRajant = repeater.model.toLowerCase().includes('rajant')
              const modelIcon = isRajant
                ? `<!-- Rajant BreadCrumb Icon (Rugged Box with Dual Antennas) -->
                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${statusColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px">
                     <path d="M7 2v5M17 2v5" />
                     <rect x="4" y="7" width="16" height="14" rx="2" fill="${statusColor}" fill-opacity="0.12" />
                     <circle cx="8" cy="11" r="1" fill="${statusColor}" />
                     <circle cx="12" cy="11" r="1" fill="${statusColor}" />
                     <circle cx="16" cy="11" r="1" fill="${statusColor}" />
                     <path d="M9 16h6" stroke-dasharray="2 1.5" />
                     <circle cx="9" cy="16" r="1.5" fill="${statusColor}" />
                     <circle cx="15" cy="16" r="1.5" fill="${statusColor}" />
                   </svg>`
                : `<!-- JR3 Radio Transmitter Icon (Antenna Mast with Wave propagation) -->
                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${statusColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px">
                     <line x1="12" y1="22" x2="12" y2="7" />
                     <circle cx="12" cy="5" r="2.2" fill="${statusColor}" />
                     <path d="M16 6.5a4.5 4.5 0 0 1 0 7" />
                     <path d="M18.8 3.7a8.5 8.5 0 0 1 0 12.6" />
                     <path d="M8 13.5a4.5 4.5 0 0 1 0-7" />
                     <path d="M5.2 16.3a8.5 8.5 0 0 1 0-12.6" />
                   </svg>`

              const divIcon = L.divIcon({
                html: `
                  <div style="position: relative; width: 25px; height: 25px;">
                    <div style="
                      width: 25px;
                      height: 25px;
                      background: white;
                      border: 2.2px solid ${statusColor};
                      border-radius: 50%;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                      opacity: ${isDeactivated ? 0.6 : 1.0};
                    ">
                      ${modelIcon}
                    </div>
                    ${isRoot ? `
                      <div style="
                        position: absolute;
                        bottom: -4px;
                        right: -8px;
                        background: #2563EB;
                        color: white;
                        font-family: sans-serif;
                        font-size: 6px;
                        font-weight: 800;
                        padding: 0.5px 2px;
                        border-radius: 3px;
                        border: 1px solid white;
                        box-shadow: 0 1px 2px rgba(0,0,0,0.25);
                        white-space: nowrap;
                        z-index: 1000;
                      ">
                        FIBRA
                      </div>
                    ` : ''}
                  </div>
                `,
                className: '',
                iconSize: [25, 25],
                iconAnchor: [12.5, 12.5],
              })

              return (
                <div key={repeater.id}>
                  <Marker
                    position={position}
                    icon={divIcon}
                    draggable={isAdmin && !isDrawingBoundary}
                    eventHandlers={{
                      dragend: async (e) => {
                        const marker = e.target
                        const pos = marker.getLatLng()
                        // Optimistic update: move marker instantly in local state
                        setLocalPositions(prev => ({ ...prev, [repeater.id]: { lat: pos.lat, lng: pos.lng } }))
                        // Persist to server in background (no await blocking UI)
                        handleLocationUpdate(repeater.id, pos.lat, pos.lng, repeater.locationDescription || undefined)
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
                        {isAdmin && (
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
                        )}

                        <form className="mt-2.5 pt-2.5 border-t" onSubmit={async (e) => {
                          e.preventDefault()
                          const form = e.currentTarget
                          const desc = (form.elements.namedItem('desc') as HTMLInputElement).value
                          const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement
                          
                          if (submitBtn) {
                            submitBtn.disabled = true
                            submitBtn.textContent = 'Obtendo GPS do Celular...'
                          }

                          const fallbackToInputs = async () => {
                            const latInput = form.elements.namedItem('lat') as HTMLInputElement
                            const lngInput = form.elements.namedItem('lng') as HTMLInputElement
                            const lat = latInput ? Number(latInput.value) : null
                            const lng = lngInput ? Number(lngInput.value) : null
                            if (lat !== null && !isNaN(lat) && lng !== null && !isNaN(lng)) {
                              await handleLocationUpdate(repeater.id, lat, lng, desc)
                            } else {
                              alert('Não foi possível obter a localização do GPS e as coordenadas manuais estão em branco.')
                            }
                            if (submitBtn) {
                              submitBtn.disabled = false
                              submitBtn.textContent = 'Atualizar Coordenadas'
                            }
                          }

                          if ('geolocation' in navigator) {
                            navigator.geolocation.getCurrentPosition(
                              async (position) => {
                                const lat = position.coords.latitude
                                const lng = position.coords.longitude
                                await handleLocationUpdate(repeater.id, lat, lng, desc)
                                if (submitBtn) {
                                  submitBtn.disabled = false
                                  submitBtn.textContent = 'Atualizar Coordenadas'
                                }
                              },
                              async (error) => {
                                console.warn('GPS error, falling back to manual inputs:', error)
                                await fallbackToInputs()
                              },
                              { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
                            )
                          } else {
                            await fallbackToInputs()
                          }
                        }}>
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Descrição Localização / Referência</label>
                            <input type="text" name="desc" defaultValue={repeater.locationDescription || ''} className="w-full text-[11px] px-1.5 py-1 border rounded mt-0.5" />
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 uppercase">Latitude</label>
                              <input type="number" name="lat" step="any" defaultValue={repeater.latitude || ''} className="w-full text-[11px] px-1.5 py-1 border rounded mt-0.5 font-mono disabled:opacity-50" disabled={!isAdmin} />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 uppercase">Longitude</label>
                              <input type="number" name="lng" step="any" defaultValue={repeater.longitude || ''} className="w-full text-[11px] px-1.5 py-1 border rounded mt-0.5 font-mono disabled:opacity-50" disabled={!isAdmin} />
                            </div>
                          </div>
                          <button type="submit" className="w-full mt-2 py-1 bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-semibold rounded cursor-pointer transition-colors">
                            {!isAdmin ? 'Atualizar com GPS do Celular' : 'Atualizar Coordenadas'}
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
            {showCriticalZones && highlightedZoneId !== null && showGrid && (() => {
              const activeCluster = currentStats.clusters.find(cl => cl.id === highlightedZoneId)
              if (!activeCluster) return null
              const positions = activeCluster.cells.map(cell => [
                cell.bounds[0],
                [cell.bounds[0][0], cell.bounds[1][1]],
                cell.bounds[1],
                [cell.bounds[1][0], cell.bounds[0][1]]
              ] as [number, number][])
              return (
                <Polygon
                  positions={positions as any}
                  pathOptions={{
                    stroke: true,
                    color: '#DC2626',
                    weight: 2.5,
                    fillOpacity: 0
                  }}
                />
              )
            })()}

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

              {/* Connection Status & Offline Sync Row */}
              <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-50 border-b border-slate-100 text-[9px]">
                <div className="flex items-center gap-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
                  <span className="font-semibold text-slate-500">
                    {isOnline ? 'Rede: Online' : 'Rede: Offline'}
                  </span>
                </div>
                {pendingSyncCount > 0 && (
                  <button
                    onClick={triggerSync}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-1.5 py-0.5 rounded shadow text-[8px] flex items-center gap-0.5 transition-colors cursor-pointer"
                  >
                    Sincronizar ({pendingSyncCount})
                  </button>
                )}
              </div>

              {/* Heatmap toggle row */}
              {isAdmin && (
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
              )}

              {/* Expandable heatmap settings */}
              {isAdmin && showHeatSettings && showGrid && (
                <div className="px-3.5 pt-2.5 pb-3 space-y-3">

                  {/* Gradient legend bar (live preview of color scale) */}
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-slate-400 font-semibold mb-1">Escala de Sinal</div>
                    <div className="h-4 rounded-full w-full" style={{
                      background: 'linear-gradient(to right, #22C55E, #EAB308, #EF4444)'
                    }} />
                    <div className="flex justify-between mt-0.5">
                      <span className="text-[8px] text-slate-400">Ruim</span>
                      <span className="text-[8px] text-slate-400">Excelente</span>
                    </div>
                  </div>

                  {/* Slider: Raio */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-medium text-slate-600">Raio (alcance)</label>
                      <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{liveHeatRadius}m</span>
                    </div>
                    <input
                      type="range"
                      min={10} max={500} step={10}
                      value={liveHeatRadius}
                      onChange={e => setLiveHeatRadius(Number(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none bg-slate-200 accent-blue-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[8px] text-slate-400 mt-0.5">
                      <span>10m</span><span>500m</span>
                    </div>
                  </div>

                  {/* Slider: Suavidade (blur) */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-medium text-slate-600">Suavidade</label>
                      <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{liveHeatBlur}%</span>
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
                      if (res.success) {
                        router.refresh()
                      }
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


          {/* HEATMAP LEGEND OVERLAY */}
          {isAdmin && showGrid && (
            <div className="absolute bottom-12 left-3 z-[1000] select-none font-sans bg-white/95 backdrop-blur border border-slate-200/80 rounded-2xl shadow-lg p-3 text-[11px] w-[140px]">
              <div className="font-bold text-slate-700 mb-2 uppercase tracking-wider text-[9px]">Qualidade do Sinal</div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#EF4444] shadow" />
                  <span className="text-slate-600 font-medium font-mono text-[10px]">Excelente</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#EAB308] shadow" />
                  <span className="text-slate-600 font-medium font-mono text-[10px]">Bom</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#22C55E] shadow" />
                  <span className="text-slate-600 font-medium font-mono text-[10px]">Ruim</span>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
  )
}
