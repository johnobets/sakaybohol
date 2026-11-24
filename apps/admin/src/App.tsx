import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

import { supabase } from './lib/supabase'
import { FaresPage } from './FaresPage'
import { LivePage } from './LivePage'
import { Login } from './Login'
import { ReportsPage } from './ReportsPage'
import { RoutesPage } from './RoutesPage'
import { SetPassword } from './SetPassword'
import { VehiclesPage } from './VehiclesPage'

type Role = 'commuter' | 'crew' | 'staff' | 'admin'
type Screen = 'live' | 'routes' | 'vehicles' | 'reports' | 'fares'

const SCREENS: { id: Screen | null; name: string }[] = [
  { id: 'live', name: 'Live map' },
  { id: 'routes', name: 'Routes' },
  { id: 'vehicles', name: 'Vehicles and crew' },
  { id: 'reports', name: 'Reports' },
  { id: 'fares', name: 'Tricycle fares' },
  { id: null, name: 'Analytics' }, // Sprint 6
]

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [ready, setReady] = useState(false)
  const [screen, setScreen] = useState<Screen>('live')
  const [notice, setNotice] = useState<string>()
  const [settingPassword, setSettingPassword] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      // Opened from a password reset email: ask for the new password first.
      if (event === 'PASSWORD_RECOVERY') setSettingPassword(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) {
      setRole(null)
      return
    }
    supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        const r = (data?.role as Role) ?? 'commuter'
        if (r === 'staff' || r === 'admin') {
          setNotice(undefined)
          setRole(r)
        } else {
          // Commuter and crew accounts may not use the dashboard.
          setNotice('This account is not staff or admin. Ask the traffic office for access.')
          supabase.auth.signOut()
        }
      })
  }, [userId])

  if (!ready || (session && !role)) return <main className="login"><p className="muted">Loading…</p></main>
  if (session && settingPassword) return <SetPassword onDone={() => setSettingPassword(false)} />
  if (!session || !role) return <Login notice={notice} />
  return (
    <div className="shell">
      <nav className="nav" aria-label="Dashboard">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={36} height={36} />
          <span>SakayBohol</span>
        </div>
        {SCREENS.map((s) => (
          <button
            key={s.name}
            className="nav-item"
            aria-current={s.id === screen ? 'page' : undefined}
            disabled={!s.id}
            title={s.id ? undefined : 'Coming in a later sprint'}
            onClick={() => s.id && setScreen(s.id)}>
            {s.name}
          </button>
        ))}
        <div className="nav-foot">
          <span>{session.user.email}</span>
          <span className="role">{role}</span>
          <button className="link" onClick={() => setSettingPassword(true)}>Change password</button>
          <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </nav>
      <main className="main">
        {screen === 'live' && <LivePage />}
        {screen === 'routes' && <RoutesPage canEdit={role === 'admin'} />}
        {screen === 'vehicles' && <VehiclesPage canEdit={role === 'admin'} />}
        {screen === 'reports' && <ReportsPage canEdit={role === 'admin'} />}
        {screen === 'fares' && <FaresPage canEdit={role === 'admin'} />}
      </main>
    </div>
  )
}
