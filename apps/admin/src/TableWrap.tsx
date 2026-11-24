import type { ReactNode } from 'react'

// Named, focusable scroll region around a table, so keyboard users can scroll a wide table
// and screen readers announce what it holds.
export function TableWrap({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="table-wrap" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  )
}
