'use client'

import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.heat'

type HeatPoint = [number, number, number] // [lat, lng, intensity]

interface HeatmapLayerProps {
  points: HeatPoint[]
  radius: number
  blur: number
  maxZoom?: number
  max?: number
  minOpacity?: number
  gradient?: Record<string, string>
}

export function HeatmapLayer({
  points,
  radius,
  blur,
  maxZoom = 18,
  max = 1.0,
  minOpacity = 0.05,
  gradient = {
    '0.0':  '#00007f',
    '0.2':  '#0000ff',
    '0.4':  '#00ffff',
    '0.6':  '#ffff00',
    '0.8':  '#ff8c00',
    '1.0':  '#ff0000',
  },
}: HeatmapLayerProps) {
  const map = useMap()
  const heatRef = useRef<L.HeatLayer | null>(null)

  // Serialize gradient so useEffect detects changes
  const gradientKey = JSON.stringify(gradient)

  useEffect(() => {
    if (!map) return

    // Remove existing heat layer
    if (heatRef.current) {
      map.removeLayer(heatRef.current)
      heatRef.current = null
    }

    if (points.length === 0) return

    // @ts-ignore - leaflet.heat extends L
    const heatLayer = L.heatLayer(points, {
      radius,
      blur,
      maxZoom,
      max,
      minOpacity,
      gradient,
    })

    heatLayer.addTo(map)
    heatRef.current = heatLayer

    return () => {
      if (heatRef.current) {
        map.removeLayer(heatRef.current)
        heatRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, points, radius, blur, maxZoom, max, minOpacity, gradientKey])

  return null
}
