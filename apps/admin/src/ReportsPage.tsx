import { useCallback, useEffect, useState } from 'react'

import { supabase } from './lib/supabase'
import { TableWrap } from './TableWrap'

type Incident = {
  id: string
  type: string
  description: string | null
  photo_path: string | null
  status: 'pending' | 'approved' | 'rejected' | 'resolved'
  created_at: string
  expires_at: string
  geojson: { coordinates: [number, number] }
}

const TYPE_LABEL: Record<string, string> = { flood: 'Flood', landslide: 'Landslide', accident: 'Accident', roadwork: 'Road work', other: 'Other' }
const SHOW_HOURS = 6 // an approved hazard stays on commuters' maps this long

const photoUrl = (path: string) => supabase.storage.from('incident-photos').getPublicUrl(path).data.publicUrl
const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

// Road reports from commuters: pending ones first, then the last 50 handled.
export function ReportsPage({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<Incident[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('incident_points')
      .select('id, type, description, photo_path, status, created_at, expires_at, geojson')
      .order('created_at', { ascending: false })
      .limit(80)
    if (error) setError('Could not load reports.')
    else setItems(data as Incident[])
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 30_000)
    return () => clearInterval(timer)
  }, [load])

  async function decide(i: Incident, status: Incident['status']) {
    const change: Partial<Incident> = { status }
    if (status === 'approved') change.expires_at = new Date(Date.now() + SHOW_HOURS * 3_600_000).toISOString()
    const { error } = await supabase.from('incidents').update(change).eq('id', i.id)
    setError(error ? 'Could not save. Only admins can review reports.' : null)
    load()
  }

  const pending = items.filter((i) => i.status === 'pending')
  const handled = items.filter((i) => i.status !== 'pending').slice(0, 50)

  const row = (i: Incident) => {
    const [lng, lat] = i.geojson.coordinates
    const live = i.status === 'approved' && Date.parse(i.expires_at) > Date.now()
    return (
      <tr key={i.id}>
        <td>{i.photo_path ? <a href={photoUrl(i.photo_path)} target="_blank" rel="noreferrer"><img className="thumb" src={photoUrl(i.photo_path)} alt={`Photo of ${TYPE_LABEL[i.type]}`} /></a> : <span className="muted">No photo</span>}</td>
        <td><b>{TYPE_LABEL[i.type] ?? i.type}</b><br /><span className="muted">{i.description ?? '—'}</span></td>
        <td>{when(i.created_at)}</td>
        <td><a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer">{lat.toFixed(4)}, {lng.toFixed(4)}</a></td>
        <td>
          <span className={`badge ${i.status}`}>{i.status === 'approved' ? (live ? 'On map' : 'Expired') : i.status[0].toUpperCase() + i.status.slice(1)}</span>
          {live ? <div className="muted">until {when(i.expires_at)}</div> : null}
        </td>
        <td className="actions">
          {canEdit && i.status === 'pending' ? (
            <>
              <button className="primary small" onClick={() => decide(i, 'approved')}>Approve</button>
              <button className="link danger" onClick={() => decide(i, 'rejected')}>Reject</button>
            </>
          ) : null}
          {canEdit && live ? <button className="link" onClick={() => decide(i, 'resolved')}>Mark cleared</button> : null}
        </td>
      </tr>
    )
  }

  const table = (list: Incident[], label: string) => (
    <TableWrap label={label}>
    <table>
      <thead>
        <tr><th>Photo</th><th>Hazard</th><th>Reported</th><th>Location</th><th>Status</th><th /></tr>
      </thead>
      <tbody>{list.map(row)}</tbody>
    </table>
    </TableWrap>
  )

  return (
    <>
      <div className="page-head">
        <h1>Reports</h1>
        <span className="stat">{pending.length} waiting for review</span>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <p className="muted">Approved hazards show on commuters' maps for {SHOW_HOURS} hours, or until marked cleared.</p>
      <h2>Waiting for review</h2>
      {pending.length ? table(pending, 'Reports waiting for review') : <p className="muted">No new reports.</p>}
      <h2>Recently handled</h2>
      {handled.length ? table(handled, 'Recently handled reports') : <p className="muted">Nothing yet.</p>}
    </>
  )
}
