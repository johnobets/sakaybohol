import { useEffect, useRef, useSyncExternalStore } from 'react'

// One success/info notice at a time, bottom corner, in a named region. The result it reports is
// always also visible on the page (a badge, a row), so missing the toast loses nothing.
type Toast = { id: number; text: string }
let current: Toast | null = null
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(text: string) {
  current = { id: nextId++, text }
  emit()
}

function dismiss(id: number) {
  if (current?.id === id) {
    current = null
    emit()
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

const SHOW_MS = 5000

export function Toaster() {
  const t = useSyncExternalStore(subscribe, () => current)
  const ref = useRef<HTMLDivElement>(null)
  const live = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!t || !el) return
    el.showPopover?.()
    // Screen readers: ariaNotify where supported, else the live region below.
    const doc = document as Document & { ariaNotify?: (msg: string) => void }
    if (doc.ariaNotify) doc.ariaNotify(t.text)
    else if (live.current) live.current.textContent = t.text
    // Auto-hide, but never while the user is on the Close button.
    const timer = setInterval(() => {
      if (!el.contains(document.activeElement)) dismiss(t.id)
    }, SHOW_MS)
    return () => clearInterval(timer)
  }, [t])

  return (
    <div role="region" aria-label="Notifications">
      <div className="sr-only" aria-live="polite" ref={live} />
      {t ? (
        <div key={t.id} ref={ref} popover="manual" className="toast">
          <span className="toast-check">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <span>{t.text}</span>
          <button type="button" className="link" onClick={() => dismiss(t.id)}>Close</button>
        </div>
      ) : null}
    </div>
  )
}
