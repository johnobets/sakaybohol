import { useState, type FormEvent } from 'react'

import { supabase } from './lib/supabase'

// Shown after a password reset link, or from "Change password" in the menu.
export function SetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== confirm) return setError('The two passwords do not match.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(error.message)
    onDone()
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit}>
        <h1>Set a new password</h1>
        <p className="muted">At least 8 characters. Keep it in a password manager.</p>
        <label>
          New password
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <label>
          Type it again
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
        <button type="button" className="link" onClick={onDone}>Cancel</button>
      </form>
    </main>
  )
}
