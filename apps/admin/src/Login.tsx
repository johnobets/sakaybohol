import { useState, type FormEvent } from 'react'

import { supabase } from './lib/supabase'

export function Login({ notice }: { notice?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // Sends a reset link that opens this dashboard, where SetPassword asks for the new password.
  async function forgot() {
    if (!email.trim()) return setError('Type your email first, then click "Forgot password?".')
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
    setBusy(false)
    if (error) setError(error.status === 429 ? 'Too many reset emails. Wait an hour and try again.' : 'Could not send the reset email.')
    else setInfo(`If ${email.trim()} has an account, a reset link is on its way. Open it once, on this computer.`)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : 'Could not sign in. Check your connection.')
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="brand dark">
          <img src="/favicon.svg" alt="" width={40} height={40} />
          <span>SakayBohol Admin</span>
        </div>
        <p className="muted">For the Tagbilaran City traffic office and Dao terminal staff.</p>
        {notice ? <p className="error">{notice}</p> : null}
        <label>
          Email
          <input id="email" name="email" type="email" autoComplete="username" spellCheck={false} enterKeyHint="next" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input id="current-password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" enterKeyHint="done" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <label className="show-password">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Show password
        </label>
        {error ? <p className="error">{error}</p> : null}
        {info ? <p className="muted">{info}</p> : null}
        <button className="primary" disabled={busy}>{busy ? 'Please wait…' : 'Sign in'}</button>
        <button type="button" className="link" onClick={forgot} disabled={busy}>Forgot password?</button>
      </form>
    </main>
  )
}
