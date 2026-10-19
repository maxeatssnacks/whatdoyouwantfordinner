import { useCallback, useEffect, useRef, useState } from 'react'
import { onDroppedClick } from './useTouchActivate'

// Internal: the variant panel's "Tap log" flag (dev builds and admins only,
// off by default). Shows the last taps on Shopping rows, for chasing missed
// taps on phones. Kept in memory on this page; nothing is sent anywhere.
// Temporary: see the v2 backlog.

const EVENTS = ['pointerdown', 'pointerup', 'pointercancel', 'click']
const MAX_ENTRIES = 12

function rowName(target) {
  const row = target?.closest?.('[data-testid="shopping-row"], [data-testid="have-row"]')
  return row ? row.dataset.name || row.dataset.key || '(row)' : null
}

// Where a dropped click landed: the row, or else the nearest test id or tag.
function describe(target) {
  const row = rowName(target)
  if (row != null) {
    const part = target.closest?.('[data-testid="shopping-qty"]') ? ' (size button)' : ''
    return `${row}${part}`
  }
  const tagged = target?.closest?.('[data-testid]')
  return tagged ? tagged.dataset.testid : String(target?.tagName ?? '?').toLowerCase()
}

/**
 * → { containerRef, entries, logToggle }. Put containerRef on the element
 * around the list: pointer and click events on rows are logged from passive
 * listeners there, and every click dropped after a touch ("dropped click",
 * with where it landed). logToggle(item) records a bought toggle with the
 * item's checked value after it (undefined while the log is off).
 */
export function useShoppingTapLog(enabled) {
  const containerRef = useRef(null)
  const [entries, setEntries] = useState([])

  const add = useCallback((entry) => {
    const next = { t: Math.round(performance.now()), ...entry }
    setEntries((prev) => [...prev, next].slice(-MAX_ENTRIES))
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!enabled || !el) return undefined
    const onEvent = (e) => {
      const name = rowName(e.target)
      if (name != null) add({ type: e.type, name })
    }
    for (const type of EVENTS) el.addEventListener(type, onEvent, { passive: true, capture: true })
    // Clicks dropped after a touch never reach the list, so they're reported here.
    const offDropped = onDroppedClick((target) => add({ type: 'dropped click', name: describe(target) }))
    return () => {
      for (const type of EVENTS) el.removeEventListener(type, onEvent, { capture: true })
      offDropped()
    }
  }, [enabled, add])

  // Named as the row shows it, like the pointer events.
  const logToggle = useCallback((item) => {
    const name = String(item.name ?? '')
    add({ type: 'toggle', name: name.charAt(0).toUpperCase() + name.slice(1), checked: !!item.checked })
  }, [add])

  return { containerRef, entries, logToggle: enabled ? logToggle : undefined }
}

/** The panel, pinned to the top; it never takes taps itself. */
export function ShoppingTapLogPanel({ entries }) {
  return (
    <div
      aria-hidden="true"
      data-testid="tap-log"
      className="fixed top-0 inset-x-0 z-[60] pointer-events-none px-2 pb-1 bg-text-primary/85 text-white font-mono text-[10px] leading-[13px]"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 4px)' }}
    >
      <div className="font-bold">Tap log (internal) · last {MAX_ENTRIES} · ms since load</div>
      {entries.length === 0 ? (
        <div className="opacity-70">Tap a row…</div>
      ) : (
        entries.map((e, i) => (
          <div key={`${e.t}-${i}`} className="truncate" data-testid="tap-log-entry">
            {e.t} · {e.type} · {e.name}{e.type === 'toggle' ? ` → checked ${e.checked}` : ''}
          </div>
        ))
      )}
    </div>
  )
}
