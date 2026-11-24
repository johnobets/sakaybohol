import { useEffect, useId, useRef, useState } from 'react'

type Ask = { title: string; body: string; confirm: string; danger?: boolean }

// Native modal <dialog>: the browser handles focus, Esc, the inert page and focus return.
// Usage: const [dialog, confirm] = useConfirm(); if (await confirm({...})) doIt(); and render {dialog}.
export function useConfirm() {
  const ref = useRef<HTMLDialogElement>(null)
  const resolve = useRef<((ok: boolean) => void) | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  const titleId = useId()

  useEffect(() => {
    if (ask && !ref.current?.open) ref.current?.showModal()
  }, [ask])

  function onClose() {
    const d = ref.current
    const ok = d?.returnValue === 'ok' // Esc or Cancel leaves it '' / 'cancel'
    if (d) d.returnValue = ''
    resolve.current?.(ok)
    resolve.current = null
    setAsk(null)
  }

  const dialog = (
    <dialog ref={ref} className="confirm" aria-labelledby={titleId} onClose={onClose}>
      {ask ? (
        <>
          <h1 id={titleId}>{ask.title}</h1>
          <p>{ask.body}</p>
          {/* Cancel comes first so it gets focus: the safe choice is the default. */}
          <form method="dialog" className="dialog-actions">
            <button value="cancel" className="secondary">Cancel</button>
            <button value="ok" className={ask.danger ? 'primary danger' : 'primary'}>{ask.confirm}</button>
          </form>
        </>
      ) : null}
    </dialog>
  )

  const confirm = (a: Ask) =>
    new Promise<boolean>((res) => {
      resolve.current = res
      setAsk(a)
    })

  return [dialog, confirm] as const
}
