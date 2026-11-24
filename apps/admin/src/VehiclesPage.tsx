import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { supabase } from './lib/supabase'
import { TableWrap } from './TableWrap'

type Vehicle = { id: string; plate_no: string; type: 'bus' | 'van'; capacity: number; operator_name: string | null; assigned_crew_id: string | null; active: boolean }
type Crew = { id: string; full_name: string | null }

export function VehiclesPage({ canEdit }: { canEdit: boolean }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [crew, setCrew] = useState<Crew[]>([])
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ plate_no: '', type: 'van', capacity: '14', operator_name: '' })

  const load = useCallback(async () => {
    const [v, c] = await Promise.all([
      supabase.from('vehicles').select('id, plate_no, type, capacity, operator_name, assigned_crew_id, active').order('plate_no'),
      supabase.from('profiles').select('id, full_name').eq('role', 'crew').order('full_name'),
    ])
    if (v.error || c.error) setError('Could not load vehicles and crew.')
    else {
      setVehicles(v.data)
      setCrew(c.data)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function update(id: string, change: Partial<Vehicle>) {
    const { error } = await supabase.from('vehicles').update(change).eq('id', id)
    setError(error ? 'Could not save. Only admins can change vehicles.' : null)
    load()
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    const capacity = Number(form.capacity)
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
      setError('Capacity must be a whole number from 1 to 100.')
      return
    }
    const { error } = await supabase.from('vehicles').insert({
      plate_no: form.plate_no.trim().toUpperCase(),
      type: form.type,
      capacity,
      operator_name: form.operator_name.trim() || null,
    })
    if (error) {
      setError(error.code === '23505' ? 'That plate number is already registered.' : 'Could not add the vehicle.')
      return
    }
    setError(null)
    setForm({ plate_no: '', type: 'van', capacity: '14', operator_name: '' })
    load()
  }

  const crewName = (id: string | null) => crew.find((c) => c.id === id)?.full_name ?? (id ? 'Crew account' : '—')

  return (
    <>
      <div className="page-head">
        <h1>Vehicles and crew</h1>
        <span className="stat">{vehicles.filter((v) => v.active).length} active vehicles · {crew.length} crew</span>
      </div>
      {error ? <p className="error">{error}</p> : null}

      <TableWrap label="Vehicles">

      <table>
        <thead>
          <tr>
            <th>Plate</th>
            <th>Type</th>
            <th>Seats</th>
            <th>Operator</th>
            <th>Assigned crew</th>
            <th>In service</th>
          </tr>
        </thead>
        <tbody>
          {vehicles.map((v) => (
            <tr key={v.id}>
              <td><b>{v.plate_no}</b></td>
              <td>{v.type === 'bus' ? 'Bus' : 'Van'}</td>
              <td>{v.capacity}</td>
              <td>{v.operator_name ?? '—'}</td>
              <td>
                {canEdit ? (
                  <select
                    aria-label={`Crew for ${v.plate_no}`}
                    value={v.assigned_crew_id ?? ''}
                    onChange={(e) => update(v.id, { assigned_crew_id: e.target.value || null })}>
                    <option value="">No crew</option>
                    {crew.map((c) => (
                      <option key={c.id} value={c.id}>{c.full_name ?? 'Unnamed crew'}</option>
                    ))}
                  </select>
                ) : (
                  crewName(v.assigned_crew_id)
                )}
              </td>
              <td>
                <label className="switch">
                  <input type="checkbox" checked={v.active} disabled={!canEdit} onChange={(e) => update(v.id, { active: e.target.checked })} />
                  {v.active ? 'Yes' : 'No'}
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </TableWrap>

      {canEdit ? (
        <form className="inline-form" onSubmit={add}>
          <h2>Add a vehicle</h2>
          <label>
            Plate number
            <input value={form.plate_no} onChange={(e) => setForm({ ...form, plate_no: e.target.value })} required maxLength={20} />
          </label>
          <label>
            Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, capacity: e.target.value === 'bus' ? '50' : '14' })}>
              <option value="van">Van</option>
              <option value="bus">Bus</option>
            </select>
          </label>
          <label>
            Seats
            <input type="number" min={1} max={100} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} required />
          </label>
          <label>
            Operator (optional)
            <input value={form.operator_name} onChange={(e) => setForm({ ...form, operator_name: e.target.value })} maxLength={80} />
          </label>
          <button className="primary">Add vehicle</button>
        </form>
      ) : null}
      <p className="muted">To make someone crew, create their account in Supabase, then set their role to crew. A Users screen comes in a later sprint.</p>
    </>
  )
}
