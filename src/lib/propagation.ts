/**
 * Georeferenced propagation and math utilities for MeshMonitor
 */

/**
 * Checks if a [lat, lng] point is inside a polygon of coordinates.
 * Ray-casting algorithm.
 */
export function isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  if (!polygon || polygon.length < 3) return false
  
  const [lat, lng] = point
  let inside = false
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0]
    const yi = polygon[i][1]
    const xj = polygon[j][0]
    const yj = polygon[j][1]
    
    const intersect = ((yi > lng) !== (yj > lng))
        && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi)
        
    if (intersect) inside = !inside
  }
  
  return inside
}

/**
 * Calculates the area of a georeferenced polygon in Hectares.
 * Uses Flat projection approximation (valid for local mine scale ~few km)
 * and Shoelace formula.
 */
export function calculatePolygonArea(polygon: [number, number][]): number {
  if (!polygon || polygon.length < 3) return 0

  // 1 degree of latitude is approx 111,320 meters
  const latToMeters = 111320
  
  // Calculate average latitude to scale longitude degrees to meters
  let sumLat = 0
  polygon.forEach(coord => sumLat += coord[0])
  const avgLatRad = (sumLat / polygon.length) * (Math.PI / 180)
  const lngToMeters = 111320 * Math.cos(avgLatRad)

  // Project coordinates to meters relative to first point
  const refLat = polygon[0][0]
  const refLng = polygon[0][1]

  const pointsInMeters = polygon.map(coord => {
    const y = (coord[0] - refLat) * latToMeters
    const x = (coord[1] - refLng) * lngToMeters
    return [x, y]
  })

  // Shoelace formula
  let area = 0
  const n = pointsInMeters.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += pointsInMeters[i][0] * pointsInMeters[j][1]
    area -= pointsInMeters[j][0] * pointsInMeters[i][1]
  }

  area = Math.abs(area) / 2
  
  // Convert square meters to Hectares (1 Hectare = 10,000 square meters)
  return area / 10000
}

/**
 * Helper to determine if line segment AB intersects line segment CD.
 */
function lineSegmentsIntersect(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number]
): boolean {
  const det = (b[0] - a[0]) * (d[1] - c[1]) - (d[0] - c[0]) * (b[1] - a[1])
  if (det === 0) return false // Parallel
  
  const lambda = ((d[1] - c[1]) * (d[0] - a[0]) + (c[0] - d[0]) * (d[1] - a[1])) / det
  const gamma = ((a[1] - b[1]) * (d[0] - a[0]) + (b[0] - a[0]) * (d[1] - a[1])) / det
  
  return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1)
}

export interface RadioModel {
  name: string
  txPower: number             // Transmitter power in dBm
  antennaGain: number         // Antenna gain in dBi
  receiverSensitivity: number // Receiver sensitivity in dBm
  maxRange: number            // Maximum communication range in meters
  obstacleFactor: number      // Sensitivity scale to obstacles (0.0 to 1.0)
}

export const RADIO_MODELS: Record<string, RadioModel> = {
  rajante: {
    name: 'Rajante',
    txPower: 30, // 1W
    antennaGain: 9,
    receiverSensitivity: -95,
    maxRange: 250,
    obstacleFactor: 1.0,
  },
  jr3: {
    name: 'JR3',
    txPower: 20, // 100mW
    antennaGain: 5,
    receiverSensitivity: -90,
    maxRange: 120,
    obstacleFactor: 0.8,
  }
}

export interface TerrainPoint3D {
  latitude: number
  longitude: number
  elevation: number // height in meters (MSL)
}

export interface DigitalElevationModel {
  source: string
  resolution: number // grid spacing in meters
  minElevation: number
  maxElevation: number
  points: TerrainPoint3D[]
}

/**
 * Returns the elevation in meters at a given geographic coordinate.
 * Placed here to support future bilinear interpolation on top of GeoTIFF or DEM grids.
 */
export function getTerrainElevation(
  lat: number,
  lng: number,
  dem?: DigitalElevationModel
): number {
  if (!dem || !dem.points || dem.points.length === 0) {
    return 0.0 // Baseline floor
  }
  // Future terrain lookups will go here
  return dem.points[0].elevation
}

interface Obstacle {
  id: string
  name: string
  type: string
  coordinates: string | [number, number][] // Flexible parsing for stringified or pre-parsed coordinates
  attenuation: number
}

/**
 * Casts a ray from Repeater (R) to Point (P).
 * Checks intersections against all active obstacles and returns the cumulative signal multiplier.
 */
export function calculateObstacleAttenuation(
  rPos: [number, number],
  pPos: [number, number],
  obstacles: Obstacle[]
): number {
  let multiplier = 1.0

  for (const obstacle of obstacles) {
    let obstacleCoords: [number, number][] = []
    
    if (typeof obstacle.coordinates === 'string') {
      try {
        obstacleCoords = JSON.parse(obstacle.coordinates)
      } catch {
        continue
      }
    } else if (Array.isArray(obstacle.coordinates)) {
      obstacleCoords = obstacle.coordinates
    } else {
      continue
    }

    if (!obstacleCoords || obstacleCoords.length < 2) continue

    // Check intersections with each segment of the obstacle polygon
    const n = obstacleCoords.length
    for (let i = 0; i < n; i++) {
      const nextIdx = (i + 1) % n
      const oStart = obstacleCoords[i]
      const oEnd = obstacleCoords[nextIdx]

      if (lineSegmentsIntersect(rPos, pPos, oStart, oEnd)) {
        // Apply attenuation: e.g. a multiplier of (1 - attenuation)
        multiplier *= (1 - obstacle.attenuation)
        if (multiplier <= 0) {
          return 0 // Sombra total
        }
      }
    }
  }

  return multiplier
}

/**
 * Calculates signal propagation level (0.0 to 1.0) based on logarithmic RF link budget.
 * Uses txPower, antennaGain, receiverSensitivity, maxRange and obstacle attenuation factor in decibels.
 */
export function calculatePathLoss(
  distanceMeters: number,
  model: string,
  obstacleMultiplier: number = 1.0
): number {
  const modelKey = model.toLowerCase()
  const radio = RADIO_MODELS[modelKey] || RADIO_MODELS.jr3
  const maxRange = radio.maxRange

  if (distanceMeters > maxRange) return 0.0
  if (distanceMeters <= 0.0) return 1.0

  // 1. Calculate free-space received power at 1 meter (approx. baseline)
  // Let's assume received power at 1m is P0 = txPower + antennaGain - 40 (dBm)
  const p0 = radio.txPower + radio.antennaGain - 40

  // 2. Solve path loss exponent (n) dynamically so that at maxRange, received power equals receiverSensitivity
  // receiverSensitivity = txPower + antennaGain - 40 - 10 * n * log10(maxRange)
  // n = (txPower + antennaGain - 40 - receiverSensitivity) / (10 * log10(maxRange))
  const logMaxRange = Math.log10(maxRange)
  const pathLossExponent = logMaxRange > 0
    ? (radio.txPower + radio.antennaGain - 40 - radio.receiverSensitivity) / (10 * logMaxRange)
    : 2.0

  // 3. Compute path loss at current distance
  const distForLog = Math.max(1, distanceMeters)
  const pathLossDb = 40 + 10 * pathLossExponent * Math.log10(distForLog)

  // 4. Calculate raw received power (dBm)
  let rxPower = radio.txPower + radio.antennaGain - pathLossDb

  // 5. Apply obstacle attenuation if multiplier < 1
  if (obstacleMultiplier < 1.0) {
    // Convert multiplier to attenuation in dB (e.g. multiplier 0.5 is -6dB, multiplier 0.1 is -20dB)
    const obstacleLossDb = -20 * Math.log10(Math.max(0.0001, obstacleMultiplier)) * radio.obstacleFactor
    rxPower -= obstacleLossDb
  }

  // 6. Normalize signal level (0.0 to 1.0) between receiverSensitivity and P0
  const rangePower = p0 - radio.receiverSensitivity
  if (rangePower <= 0) return 0.0

  const signal = (rxPower - radio.receiverSensitivity) / rangePower
  return Math.max(0.0, Math.min(1.0, signal))
}

/**
 * Gets approximate flat distance in meters between two georeferenced coordinates.
 */
export function getDistanceMeters(pos1: [number, number], pos2: [number, number]): number {
  const latToMeters = 111320
  const avgLatRad = ((pos1[0] + pos2[0]) / 2) * (Math.PI / 180)
  const lngToMeters = 111320 * Math.cos(avgLatRad)

  const dy = (pos1[0] - pos2[0]) * latToMeters
  const dx = (pos1[1] - pos2[1]) * lngToMeters

  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Gets the 3D distance in meters between two georeferenced coordinates, considering elevation.
 */
export function getDistanceMeters3D(
  pos1: [number, number, number?], // [lat, lng, elevation?]
  pos2: [number, number, number?],
  dem?: DigitalElevationModel
): number {
  const flatDist = getDistanceMeters([pos1[0], pos1[1]], [pos2[0], pos2[1]])
  
  const elev1 = pos1[2] !== undefined ? pos1[2] : getTerrainElevation(pos1[0], pos1[1], dem)
  const elev2 = pos2[2] !== undefined ? pos2[2] : getTerrainElevation(pos2[0], pos2[1], dem)
  
  const dElev = elev1 - elev2
  return Math.sqrt(flatDist * flatDist + dElev * dElev)
}
