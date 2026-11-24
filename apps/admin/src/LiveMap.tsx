import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, Marker, NavigationControl, type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FeatureCollection } from 'geojson'

import type { Hub, RouteLine, Van } from './lib/data'

// Free vector tiles, no API key.
const STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const BOHOL: [number, number] = [124.15, 9.85]

export function LiveMap({ routes, hubs, vans, colorOf }: { routes: RouteLine[]; hubs: Hub[]; vans: Van[]; colorOf: (routeId: string) => string }) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const vanMarkers = useRef(new Map<string, Marker>())
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!el.current) return
    const map = new MapLibreMap({ container: el.current, style: STYLE, center: BOHOL, zoom: 9 })
    map.addControl(new NavigationControl(), 'top-right')
    map.on('load', () => setLoaded(true))
    mapRef.current = map
    const markers = vanMarkers.current
    return () => {
      markers.clear()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Route lines, one GeoJSON source coloured per feature.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    const data: FeatureCollection = {
      type: 'FeatureCollection',
      features: routes.map((r) => ({ type: 'Feature', properties: { color: r.color, name: r.name }, geometry: r.geometry })),
    }
    const source = map.getSource('routes') as GeoJSONSource | undefined
    if (source) source.setData(data)
    else {
      map.addSource('routes', { type: 'geojson', data })
      map.addLayer({ id: 'routes', type: 'line', source: 'routes', paint: { 'line-color': ['get', 'color'], 'line-width': 4 }, layout: { 'line-cap': 'round' } })
    }
  }, [routes, loaded])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const markers = hubs.map((h) => {
      const node = document.createElement('div')
      node.className = 'hub-pin'
      node.title = h.name
      return new Marker({ element: node }).setLngLat([h.lng, h.lat]).addTo(map)
    })
    return () => markers.forEach((m) => m.remove())
  }, [hubs])

  // Live vans: move existing markers, add new ones, drop the ones that left.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const seen = new Set<string>()
    for (const v of vans) {
      seen.add(v.tripId)
      let marker = vanMarkers.current.get(v.tripId)
      if (!marker) {
        const node = document.createElement('div')
        node.className = 'van-pin'
        marker = new Marker({ element: node }).setLngLat([v.lng, v.lat]).addTo(map)
        vanMarkers.current.set(v.tripId, marker)
      }
      marker.setLngLat([v.lng, v.lat])
      const node = marker.getElement()
      node.textContent = String(v.seatsLeft)
      node.style.borderColor = colorOf(v.routeId)
      node.title = `${v.plateNo} · ${v.seatsLeft} seats left`
    }
    for (const [id, m] of vanMarkers.current) {
      if (!seen.has(id)) {
        m.remove()
        vanMarkers.current.delete(id)
      }
    }
  }, [vans, colorOf])

  return <div ref={el} className="map" role="region" aria-label="Live map of Bohol" />
}
