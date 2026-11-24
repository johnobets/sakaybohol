import { useState, type FormEvent } from 'react'

import { supabase } from './lib/supabase'

// Shown after a password reset link, or from "Change password" in the menu.
// One field with Show password instead of typing it twice; the browser can also suggest a strong one.
export function SetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
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
          <input id="new-password" name="new-password" type={show ? 'text' : 'password'} autoComplete="new-password" minLength={8} enterKeyHint="done" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <label className="show-password">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Show password
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
        <button type="button" className="link" onClick={onDone}>Cancel</button>
      </form>
    </main>
  )
}
