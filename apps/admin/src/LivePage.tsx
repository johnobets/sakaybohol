import { useCallback, useEffect, useState } from 'react'

import { fetchHubs, fetchRouteLines, routeColor, timeOf, useLiveVans, type Hub, type RouteLine } from './lib/data'
import { supabase } from './lib/supabase'
import { LiveMap } from './LiveMap'

type ActiveTrip = {
  id: string
  direction: string
  seats_taken: number
  seat_status: string
  started_at: string
  last_seen_at: string | null
  routes: { code: string; name: string }
  vehicles: { plate_no: string; capacity: number }
  profiles: { full_name: string | null } | null
}

const STATUS_LABEL: Record<string, string> = { available: 'Seats available', almost_full: 'Almost full', full: 'Full', unknown: 'Unknown' }

export function LivePage() {
  const [routes, setRoutes] = useState<RouteLine[]>([])
  const [hubs, setHubs] = useState<Hub[]>([])
  const [trips, setTrips] = useState<ActiveTrip[]>([])
  const [error, setError] = useState<string | null>(null)
  const vans = useLiveVans(routes.map((r) => r.id))
  const colorOf = useCallback((routeId: string) => routes.find((r) => r.id === routeId)?.color ?? '#0F2A3D', [routes])

  useEffect(() => {
    Promise.all([fetchRouteLines(), fetchHubs()])
      .then(([r, h]) => {
        setRoutes(r)
        setHubs(h)
      })
      .catch(() => setError('Could not load routes.'))
  }, [])

  const loadTrips = useCallback(async () => {
    const { data, error } = await supabase
      .from('trips')
      .select('id, direction, seats_taken, seat_status, started_at, last_seen_at, routes(code, name), vehicles(plate_no, capacity), profiles!trips_crew_id_fkey(full_name)')
      .eq('status', 'active')
      .order('started_at', { ascending: false })
    if (error) setError('Could not load active trips.')
    else setTrips(data as unknown as ActiveTrip[])
  }, [])

  useEffect(() => {
    loadTrips()
    const timer = setInterval(loadTrips, 15_000)
    return () => clearInterval(timer)
  }, [loadTrips])

  async function endTrip(t: ActiveTrip) {
    if (!confirm(`End the trip of ${t.vehicles.plate_no}? Use this only for a trip the crew forgot to end.`)) return
    const { error } = await supabase.from('trips').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', t.id)
    if (error) setError('Could not end the trip.')
    loadTrips()
  }

  return (
    <>
      <div className="page-head">
        <h1>Live map</h1>
        <span className="stat">{trips.length} active {trips.length === 1 ? 'trip' : 'trips'}</span>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <LiveMap routes={routes} hubs={hubs} vans={vans} colorOf={colorOf} />
      <div className="legend">
        {routes.map((r) => (
          <span key={r.id}>
            <i style={{ background: r.color }} /> {r.name}
          </span>
        ))}
      </div>

      <h2>Active trips</h2>
      {trips.length === 0 ? (
        <p className="muted">No vehicles are on a trip right now.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Route</th>
              <th>Direction</th>
              <th>Seats</th>
              <th>Crew</th>
              <th>Started</th>
              <th>Last GPS</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {trips.map((t) => (
              <tr key={t.id}>
                <td>{t.vehicles.plate_no}</td>
                <td>
                  <i className="dot" style={{ background: routeColor(t.routes.code) }} /> {t.routes.name}
                </td>
                <td>{t.direction === 'outbound' ? 'Outbound' : 'Inbound'}</td>
                <td>
                  {t.vehicles.capacity - t.seats_taken} left · {STATUS_LABEL[t.seat_status] ?? t.seat_status}
                </td>
                <td>{t.profiles?.full_name ?? '—'}</td>
                <td>{timeOf(t.started_at)}</td>
                <td>{t.last_seen_at ? timeOf(t.last_seen_at) : 'No GPS yet'}</td>
                <td>
                  <button className="link danger" onClick={() => endTrip(t)}>End trip</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
