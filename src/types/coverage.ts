/**
 * Types and interfaces for MeshMonitor Network Coverage reporting
 */

export interface CoverageSnapshot {
  id: string
  mineId: string
  createdAt: Date
  coveragePercent: number
  coveredArea: number      // in hectares
  uncoveredArea: number    // in hectares
  criticalZones: string    // Serialized JSON array of shadow zone details (ShadowZone[])
}
