import { useCallback, useDeferredValue, useEffect, useState } from 'react'

import { supabase } from './lib/supabase'
import { toast } from './lib/toast'
import { useConfirm } from './lib/useConfirm'
import { TableWrap } from './TableWrap'

type Role = 'commuter' | 'crew' | 'staff' | 'admin'
type User = {
  id: string
  email: string
  full_name: string | null
  phone: string | null
  role: Role
  created_at: string
  last_sign_in_at: string | null
}

const ROLES: Role[] = ['commuter', 'crew', 'staff', 'admin']
const ROLE_NAME: Record<Role, string> = { commuter: 'Commuter', crew: 'Crew', staff: 'Staff', admin: 'Admin' }
const ROLE_CAN: Record<Role, string> = {
  commuter: 'Uses the commuter app. Can send waiting, full, hazard and fare reports.',
  crew: "Driver or conductor. Can start trips and share the van's live location.",
  staff: 'Can open this dashboard and see everything, but cannot change anything.',
  admin: 'Full control of this dashboard, including fares, routes and user roles.',
}
const day = (iso: string) => new Date(iso).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })

// Accounts and their roles. Admins change roles (with a confirm step); staff can only look.
export function UsersPage({ canEdit, myId }: { canEdit: boolean; myId: string }) {
  const [users, setUsers] = useState<User[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Role | 'all'>('all')
  const [query, setQuery] = useState('')
  const q = useDeferredValue(query.trim().toLowerCase())
  const [dialog, confirm] = useConfirm()

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_users')
    if (error) setError('Could not load users. Check your connection and refresh.')
    else {
      setError(null)
      setUsers(data as User[])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function changeRole(u: User, role: Role) {
    if (role === u.role) return
    const who = u.full_name || u.email
    const raising = ROLES.indexOf(role) > ROLES.indexOf(u.role)
    const ok = await confirm({
      title: `Make ${who} ${ROLE_NAME[role].toLowerCase()}?`,
      body: `${ROLE_CAN[role]}${raising ? '' : ` They lose what ${ROLE_NAME[u.role].toLowerCase()} could do.`}`,
      confirm: `Make ${ROLE_NAME[role].toLowerCase()}`,
      danger: role === 'admin' || !raising,
    })
    if (!ok) return
    const { error } = await supabase.rpc('set_user_role', { p_user: u.id, p_role: role })
    if (error) return setError(`Could not change the role: ${error.message}`)
    setError(null)
    toast(`${who} is now ${ROLE_NAME[role].toLowerCase()}.`)
    load()
  }

  const counts = Object.fromEntries(ROLES.map((r) => [r, users?.filter((u) => u.role === r).length ?? 0])) as Record<Role, number>
  const shown = (users ?? []).filter(
    (u) => (filter === 'all' || u.role === filter) && (!q || u.email.toLowerCase().includes(q) || (u.full_name ?? '').toLowerCase().includes(q)),
  )

  return (
    <>
      <div className="page-head">
        <h1>Users</h1>
        <span className="stat">{users ? `${users.length} accounts` : ' '}</span>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <p className="muted">
        People appear here after they create an account in the SakayBohol app. {canEdit ? 'Change a role to give someone crew or dashboard access.' : 'Only admins can change roles.'}
      </p>

      <div className="toolbar">
        <div className="chips" role="group" aria-label="Filter by role">
          <button type="button" className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            All <span className="count">{users?.length ?? 0}</span>
          </button>
          {ROLES.map((r) => (
            <button key={r} type="button" className="chip" aria-pressed={filter === r} onClick={() => setFilter(r)}>
              {ROLE_NAME[r]} <span className="count">{counts[r]}</span>
            </button>
          ))}
        </div>
        <label className="search">
          <span className="sr-only">Search by name or email</span>
          <input type="search" placeholder="Search name or email" value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} />
        </label>
      </div>

      {users === null && !error ? (
        <p className="muted" aria-busy="true">Loading users…</p>
      ) : shown.length === 0 && users ? (
        <div className="empty">
          <p>{q ? `No one matches “${query.trim()}”${filter === 'all' ? '' : ` among ${ROLE_NAME[filter].toLowerCase()}`}.` : `No ${filter === 'all' ? '' : ROLE_NAME[filter].toLowerCase() + ' '}accounts yet.`}</p>
          {q || filter !== 'all' ? (
            <button type="button" className="secondary" onClick={() => { setQuery(''); setFilter('all') }}>Show everyone</button>
          ) : null}
        </div>
      ) : (
        <TableWrap label="Users">
          <table>
            <thead>
              <tr><th>Person</th><th>Role</th><th>Joined</th><th>Last signed in</th></tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id}>
                  <td>
                    <b>{u.full_name || <span className="muted">No name yet</span>}</b>
                    {u.id === myId ? <span className="badge"> You</span> : null}
                    <br />
                    <span className="muted">{u.email}</span>
                  </td>
                  <td>
                    {canEdit && u.id !== myId ? (
                      <select aria-label={`Role for ${u.full_name || u.email}`} value={u.role} onChange={(e) => changeRole(u, e.target.value as Role)}>
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_NAME[r]}</option>)}
                      </select>
                    ) : (
                      <span className={`badge role-${u.role}`}>{ROLE_NAME[u.role]}</span>
                    )}
                  </td>
                  <td>{day(u.created_at)}</td>
                  <td>{u.last_sign_in_at ? day(u.last_sign_in_at) : <span className="muted">Never</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      <h2>What each role can do</h2>
      <dl className="roles">
        {ROLES.map((r) => (
          <div key={r}>
            <dt><span className={`badge role-${r}`}>{ROLE_NAME[r]}</span></dt>
            <dd>{ROLE_CAN[r]}</dd>
          </div>
        ))}
      </dl>
      {dialog}
    </>
  )
}
