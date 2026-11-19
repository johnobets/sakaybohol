import { useEffect, useRef } from 'react'
import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// Free vector tiles, no API key. Sprint 4: live trips from the route:{id} Realtime channels.
const STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const BOHOL: [number, number] = [124.15, 9.85]

export function LiveMap() {
  const el = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!el.current) return
    const map = new MapLibreMap({ container: el.current, style: STYLE, center: BOHOL, zoom: 9 })
    map.addControl(new NavigationControl(), 'top-right')
    return () => map.remove()
  }, [])

  return <div ref={el} className="map" role="region" aria-label="Live map of Bohol" />
}
