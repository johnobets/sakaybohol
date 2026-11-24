import { useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { LineString } from 'geojson'

import { supabase } from './supabase'

// Same colours as the mobile app.
const ROUTE_COLORS: Record<string, string> = {
  'TAG-PAN': '#E07A1F',
  'DAO-NOR': '#2E8B57',
  'DAO-CAR': '#2B7BB9',
  'DAO-UBA': '#8E44AD',
}
export const routeColor = (code: string) => ROUTE_COLORS[code] ?? '#6B7280'

export type RouteLine = { id: string; code: string; name: string; lengthKm: number; color: string; geometry: LineString }
export type Hub = { name: string; lng: number; lat: number }
export type Van = { tripId: string; routeId: string; lng: number; lat: number; seatsLeft: number; seatStatus: string; plateNo: string; ts: string }

export async function fetchRouteLines(): Promise<RouteLine[]> {
  const { data, error } = await supabase.from('route_lines').select('id, code, name, length_km, geojson').order('code')
  if (error) throw error
  return data.map((r) => ({ id: r.id, code: r.code, name: r.name, lengthKm: Number(r.length_km), color: routeColor(r.code), geometry: r.geojson }))
}

export async function fetchHubs(): Promise<Hub[]> {
  const { data, error } = await supabase.from('hub_points').select('name, geojson')
  if (error) throw error
  return data.map((h) => ({ name: h.name, lng: h.geojson.coordinates[0], lat: h.geojson.coordinates[1] }))
}

const STALE_MS = 5 * 60_000

// Live vans on the given routes: last known positions, then Realtime "position" and "trip_ended" events.
export function useLiveVans(routeIds: string[]) {
  const [vans, setVans] = useState<Record<string, Van>>({})
  const key = routeIds.join(',')

  useEffect(() => {
    if (!key) return
    const ids = key.split(',')
    let cancelled = false

    async function loadLastKnown() {
      const { data } = await supabase.from('live_trips').select('trip_id, route_id, seat_status, seats_left, plate_no, geojson, last_seen_at').in('route_id', ids)
      if (cancelled || !data) return
      setVans((current) => {
        const next: Record<string, Van> = {}
        for (const t of data) {
          const known = current[t.trip_id]
          next[t.trip_id] =
            known && Date.parse(known.ts) > Date.parse(t.last_seen_at)
              ? known
              : { tripId: t.trip_id, routeId: t.route_id, lng: t.geojson.coordinates[0], lat: t.geojson.coordinates[1], seatsLeft: t.seats_left, seatStatus: t.seat_status, plateNo: t.plate_no, ts: t.last_seen_at }
        }
        for (const [id, v] of Object.entries(current)) if (!next[id] && Date.now() - Date.parse(v.ts) < STALE_MS) next[id] = v
        return next
      })
    }

    const channels: RealtimeChannel[] = ids.map((id) =>
      supabase
        .channel(`route:${id}`, { config: { private: true } })
        .on('broadcast', { event: 'position' }, ({ payload: p }) =>
          setVans((v) => ({ ...v, [p.trip_id]: { tripId: p.trip_id, routeId: p.route_id, lng: p.lng, lat: p.lat, seatsLeft: p.seats_left, seatStatus: p.seat_status, plateNo: p.plate_no, ts: p.ts } })),
        )
        .on('broadcast', { event: 'trip_ended' }, ({ payload }) =>
          setVans((v) => Object.fromEntries(Object.entries(v).filter(([id]) => id !== payload.trip_id))),
        )
        .subscribe(),
    )

    loadLastKnown()
    const timer = setInterval(loadLastKnown, 30_000)
    return () => {
      cancelled = true
      clearInterval(timer)
      channels.forEach((c) => supabase.removeChannel(c))
    }
  }, [key])

  return Object.values(vans)
}

export const timeOf = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—')
