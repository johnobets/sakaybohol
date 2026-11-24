import { useCallback, useEffect, useState } from 'react'

import { routeColor } from './lib/data'
import { supabase } from './lib/supabase'
import { toast } from './lib/toast'
import { TableWrap } from './TableWrap'

type Route = {
  id: string
  code: string
  name: string
  origin: string
  destination: string
  vehicle_type: string
  length_m: number | null
  last_trip_time: string | null
  active: boolean
}

// Route lines come from supabase/routes (tools/route-builder). Here admins switch routes on or off
// and set the last trip time used by last-trip warnings.
export function RoutesPage({ canEdit }: { canEdit: boolean }) {
  const [routes, setRoutes] = useState<Route[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('routes').select('id, code, name, origin, destination, vehicle_type, length_m, last_trip_time, active').order('code')
    if (error) setError('Could not load routes.')
    else setRoutes(data)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function update(id: string, change: Partial<Route>) {
    const { error } = await supabase.from('routes').update(change).eq('id', id)
    setError(error ? 'Could not save. Only admins can change routes.' : null)
    if (!error) toast('Route saved.')
    load()
  }

  return (
    <>
      <div className="page-head">
        <h1>Routes</h1>
        <span className="stat">{routes.filter((r) => r.active).length} of {routes.length} active</span>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <TableWrap label="Routes">
      <table>
        <thead>
          <tr>
            <th>Route</th>
            <th>From</th>
            <th>To</th>
            <th>Vehicle</th>
            <th>Length</th>
            <th>Last trip</th>
            <th>Shown to commuters</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((r) => (
            <tr key={r.id}>
              <td>
                <i className="dot" style={{ background: routeColor(r.code) }} /> <b>{r.code}</b> {r.name}
              </td>
              <td>{r.origin}</td>
              <td>{r.destination}</td>
              <td>{r.vehicle_type === 'bus' ? 'Bus' : 'Van'}</td>
              <td>{r.length_m ? `${(r.length_m / 1000).toFixed(1)} km` : 'No line yet'}</td>
              <td>
                {canEdit ? (
                  <input
                    type="time"
                    aria-label={`Last trip time for ${r.name}`}
                    defaultValue={r.last_trip_time?.slice(0, 5) ?? ''}
                    onBlur={(e) => {
                      const v = e.target.value || null
                      if (v !== (r.last_trip_time?.slice(0, 5) ?? null)) update(r.id, { last_trip_time: v })
                    }}
                  />
                ) : (
                  r.last_trip_time?.slice(0, 5) ?? '—'
                )}
              </td>
              <td>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={r.active}
                    disabled={!canEdit || !r.length_m}
                    onChange={(e) => update(r.id, { active: e.target.checked })}
                  />
                  {r.active ? 'Active' : 'Hidden'}
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </TableWrap>
      <p className="muted">Route lines are approximate (OpenStreetMap) until replaced by ride-along GPS. A route needs a line before it can be shown.</p>
    </>
  )
}
