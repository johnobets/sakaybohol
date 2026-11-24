import { useEffect, useState } from 'react'

import { supabase } from './lib/supabase'

type Spot = { lat: number; lng: number }
type Analytics = {
  days: number
  trips: number
  completed: number
  avg_minutes: number | null
  incidents: number
  complaints: number
  by_hour: { hour: number; trips: number }[]
  by_route: { code: string; name: string; trips: number; avg_minutes: number | null; avg_kmh: number | null }[]
  by_type: { type: string; reports: number }[]
  congestion: (Spot & { fixes: number })[]
  hazard_spots: (Spot & { reports: number; types: string })[]
}

const RANGES = [7, 30, 90]
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`
const mapLink = (s: Spot) => `https://www.google.com/maps?q=${s.lat},${s.lng}`

// Traffic analytics: trips per hour (peak hours), per-route travel times, congestion and hazard hotspots.
export function AnalyticsPage() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Analytics | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('traffic_analytics', { p_days: days }).then(({ data, error }) => {
      setError(error ? 'Could not load analytics.' : null)
      setData(error ? null : (data as Analytics))
    })
  }, [days])

  const max = Math.max(1, ...(data?.by_hour.map((h) => h.trips) ?? []))
  const peak = data?.by_hour.reduce((a, b) => (b.trips > a.trips ? b : a))

  return (
    <>
      <div className="page-head">
        <h1>Analytics</h1>
        <div className="range" role="group" aria-label="Time range">
          {RANGES.map((d) => (
            <button key={d} className={d === days ? 'primary small' : 'link'} aria-pressed={d === days} onClick={() => setDays(d)}>
              Last {d} days
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {data ? (
        <>
          <div className="tiles">
            <div className="tile"><span className="tile-num">{data.trips}</span><span className="muted">trips ({data.completed} completed)</span></div>
            <div className="tile"><span className="tile-num">{data.avg_minutes ?? '—'}<small> min</small></span><span className="muted">average trip</span></div>
            <div className="tile"><span className="tile-num">{peak && peak.trips ? hourLabel(peak.hour) : '—'}</span><span className="muted">busiest start hour</span></div>
            <div className="tile"><span className="tile-num">{data.incidents}</span><span className="muted">hazard reports</span></div>
            <div className="tile"><span className="tile-num">{data.complaints}</span><span className="muted">fare complaints</span></div>
          </div>

          <h2>Trips started per hour</h2>
          <div className="bars" role="img" aria-label={`Trips per hour; busiest ${peak ? hourLabel(peak.hour) : 'none'}`}>
            {data.by_hour.map((h) => (
              <div key={h.hour} className="bar-col" title={`${hourLabel(h.hour)}: ${h.trips} trips`}>
                <div className="bar" style={{ height: `calc((100% - 22px) * ${h.trips / max})` }} />
                <span className="bar-x">{h.hour % 3 === 0 ? hourLabel(h.hour) : ''}</span>
              </div>
            ))}
          </div>

          <h2>Routes</h2>
          <table>
            <thead><tr><th>Route</th><th>Trips</th><th>Average trip</th><th>Average speed</th></tr></thead>
            <tbody>
              {data.by_route.map((r) => (
                <tr key={r.code}>
                  <td><b>{r.code}</b> <span className="muted">{r.name}</span></td>
                  <td>{r.trips}</td>
                  <td>{r.avg_minutes == null ? '—' : `${r.avg_minutes} min`}</td>
                  <td>{r.avg_kmh == null ? '—' : `${r.avg_kmh} km/h`}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Slow traffic spots</h2>
          <p className="muted">Places where vans moved under 10 km/h most often (about 100 m areas, terminals left out).</p>
          {data.congestion.length ? (
            <table>
              <thead><tr><th>Location</th><th>Slow GPS readings</th></tr></thead>
              <tbody>
                {data.congestion.map((s) => (
                  <tr key={`${s.lat},${s.lng}`}><td><a href={mapLink(s)} target="_blank" rel="noreferrer">{s.lat}, {s.lng}</a></td><td>{s.fixes}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted">No slow traffic recorded yet.</p>}

          <h2>Hazard hotspots</h2>
          {data.hazard_spots.length ? (
            <table>
              <thead><tr><th>Location</th><th>Approved reports</th><th>Types</th></tr></thead>
              <tbody>
                {data.hazard_spots.map((s) => (
                  <tr key={`${s.lat},${s.lng}`}><td><a href={mapLink(s)} target="_blank" rel="noreferrer">{s.lat}, {s.lng}</a></td><td>{s.reports}</td><td>{s.types}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted">No approved hazard reports in this period.</p>}
        </>
      ) : null}
    </>
  )
}
