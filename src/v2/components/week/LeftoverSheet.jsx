import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '../Button'
import { Sheet } from '../Sheet'
import { InlineMessage } from './bits'

/**
 * A leftover meal (PARITY LO-5): where it came from, the per-person portion,
 * move it to a later day (only after the cook day, LO-7), or remove it, which
 * also shrinks the cooked meal's servings (LO-6).
 */
export function LeftoverSheet({ meal, moveTargets, onClose, onMove, onRemove }) {
  const [confirming, setConfirming] = useState(false)
  // Keep keyboard focus on the step that's showing: the confirm button, or
  // back on the remove button after Cancel.
  const confirmRef = useRef(null)
  const removeRef = useRef(null)
  const didConfirm = useRef(false)
  useEffect(() => {
    if (confirming) confirmRef.current?.focus()
    else if (didConfirm.current) removeRef.current?.focus()
    didConfirm.current = confirming
  }, [confirming])
  const [busy, setBusy] = useState(null) // day name | 'remove'
  const [error, setError] = useState(null)

  const move = async (day) => {
    setBusy(day.name)
    setError(null)
    const result = await onMove(meal, day)
    setBusy(null)
    if (result.ok) onClose()
    else setError(result.error)
  }

  const remove = async () => {
    setBusy('remove')
    setError(null)
    const result = await onRemove(meal)
    setBusy(null)
    if (result.ok) onClose()
    else {
      setConfirming(false)
      setError(result.error)
    }
  }

  return (
    <Sheet
      onClose={onClose}
      dismissible={!busy}
      eyebrow={`${meal.dayShort} · ${meal.slot}`}
      title={meal.title}
      titleClassName="text-[26px]"
      subtitle={
        <>
          <span className="block">{meal.cookDayLong ? `Leftover from ${meal.cookDayLong}` : 'Leftover'}</span>
          {meal.macros && <span className="block">1 portion each · {meal.macros}</span>}
        </>
      }
      testId="leftover-sheet"
      footer={
        confirming ? (
          <div className="flex flex-col gap-3">
            <p className="text-[15px]">Remove this leftover from {meal.dayLong}?</p>
            <div className="flex gap-2.5">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirming(false)} disabled={busy === 'remove'}>
                Cancel
              </Button>
              <Button variant="danger" className="flex-1" onClick={remove} disabled={busy === 'remove'} ref={confirmRef}>
                {busy === 'remove' ? 'Removing…' : 'Remove'}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="dangerQuiet" className="-ml-2" onClick={() => setConfirming(true)} ref={removeRef} disabled={!!busy}>
            <Trash2 size={16} aria-hidden="true" />
            Remove leftover
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-3">
        <h3 className="font-body text-sm font-bold text-text-secondary">Move to a different day</h3>
        {moveTargets.length > 0 ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Move to a different day">
            {moveTargets.map((day) => (
              <Button key={day.name} variant="secondary" onClick={() => move(day)} disabled={!!busy}>
                {busy === day.name ? 'Moving…' : `${day.shortName} ${day.dayNum}`}
                <span className="sr-only"> ({day.longName})</span>
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">No free {meal.slot.toLowerCase()} later this week.</p>
        )}
        {error && <InlineMessage>{error}</InlineMessage>}
      </div>
    </Sheet>
  )
}
