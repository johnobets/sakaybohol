import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { supabase } from './lib/supabase'

type Rule = { id: string; lgu: string; base_fare: number; base_km: number; per_km: number; effective_date: string }
type Complaint = {
  id: string
  charged: number
  expected: number | null
  tricycle_no: string | null
  status: 'pending' | 'approved' | 'rejected' | 'resolved'
  created_at: string
  from_geojson: { coordinates: [number, number] }
  to_geojson: { coordinates: [number, number] }
}

const LGU = 'Tagbilaran City'
const STATUS_LABEL = { pending: 'Pending', approved: 'Valid', rejected: 'Rejected', resolved: 'Acted on' }
const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const mapLink = ([lng, lat]: [number, number]) => `https://www.google.com/maps?q=${lat},${lng}`

// Tricycle fare matrix (new rules keep the old ones as history) and commuters' overcharge reports.
export function FaresPage({ canEdit }: { canEdit: boolean }) {
  const [rules, setRules] = useState<Rule[]>([])
  const [items, setItems] = useState<Complaint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ base_fare: '', base_km: '', per_km: '', effective_date: new Date().toISOString().slice(0, 10) })

  const load = useCallback(async () => {
    const [r, c] = await Promise.all([
      supabase.from('fare_rules').select('*').eq('lgu', LGU).order('effective_date', { ascending: false }),
      supabase.from('fare_complaint_list').select('*').order('created_at', { ascending: false }).limit(100),
    ])
    if (r.error || c.error) setError('Could not load fares.')
    else {
      setRules(r.data as Rule[])
      setItems(c.data as Complaint[])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function addRule(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('fare_rules').insert({
      lgu: LGU,
      base_fare: Number(form.base_fare),
      base_km: Number(form.base_km),
      per_km: Number(form.per_km),
      effective_date: form.effective_date,
    })
    setError(error ? 'Could not save the fare. Only admins can change it.' : null)
    if (!error) setForm({ ...form, base_fare: '', base_km: '', per_km: '' })
    load()
  }

  async function decide(id: string, status: Complaint['status']) {
    const { error } = await supabase.from('fare_complaints').update({ status }).eq('id', id)
    setError(error ? 'Could not save. Only admins can review complaints.' : null)
    load()
  }

  const today = new Date().toISOString().slice(0, 10)
  const current = rules.find((r) => r.effective_date <= today)
  const pending = items.filter((i) => i.status === 'pending')

  return (
    <>
      <div className="page-head">
        <h1>Tricycle fares</h1>
        <span className="stat">{pending.length} complaints waiting</span>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <p className="muted">
        {current
          ? `Now in effect: ₱${current.base_fare} for the first ${current.base_km} km, then ₱${current.per_km} per km (since ${current.effective_date}).`
          : 'No fare in effect yet.'}{' '}
        Commuters see this fare in the app. Distance is estimated from a straight line × 1.3.
      </p>

      <h2>Overcharge reports</h2>
      {items.length ? (
        <table>
          <thead>
            <tr><th>Reported</th><th>Paid</th><th>Fare</th><th>Tricycle</th><th>Trip</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{when(i.created_at)}</td>
                <td><b>₱{i.charged}</b></td>
                <td>{i.expected == null ? '—' : <>₱{i.expected} <span className="muted">(+₱{i.charged - i.expected})</span></>}</td>
                <td>{i.tricycle_no ?? <span className="muted">Not given</span>}</td>
                <td><a href={mapLink(i.from_geojson.coordinates)} target="_blank" rel="noreferrer">From</a> → <a href={mapLink(i.to_geojson.coordinates)} target="_blank" rel="noreferrer">To</a></td>
                <td><span className={`badge ${i.status}`}>{STATUS_LABEL[i.status]}</span></td>
                <td className="actions">
                  {canEdit && i.status === 'pending' ? (
                    <>
                      <button className="primary small" onClick={() => decide(i.id, 'approved')}>Valid</button>
                      <button className="link danger" onClick={() => decide(i.id, 'rejected')}>Reject</button>
                    </>
                  ) : null}
                  {canEdit && i.status === 'approved' ? <button className="link" onClick={() => decide(i.id, 'resolved')}>Mark acted on</button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">No reports yet.</p>
      )}

      <h2>Fare history</h2>
      <table>
        <thead>
          <tr><th>Effective</th><th>Base fare</th><th>Covers</th><th>Per extra km</th></tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id}>
              <td>{r.effective_date}{r === current ? <span className="badge approved"> In effect</span> : null}</td>
              <td>₱{r.base_fare}</td>
              <td>{r.base_km} km</td>
              <td>₱{r.per_km}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit ? (
        <form className="inline-form" onSubmit={addRule}>
          <h2>New fare (from the city ordinance)</h2>
          <label>Base fare (₱)<input type="number" min={0} step="0.5" value={form.base_fare} onChange={(e) => setForm({ ...form, base_fare: e.target.value })} required /></label>
          <label>First km covered<input type="number" min={0} step="0.1" value={form.base_km} onChange={(e) => setForm({ ...form, base_km: e.target.value })} required /></label>
          <label>Per extra km (₱)<input type="number" min={0} step="0.25" value={form.per_km} onChange={(e) => setForm({ ...form, per_km: e.target.value })} required /></label>
          <label>Takes effect<input type="date" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} required /></label>
          <button className="primary">Save fare</button>
        </form>
      ) : null}
    </>
  )
}
