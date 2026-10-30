import { useEffect, useRef, useState } from 'react'
import { CalendarPlus, Trash2 } from 'lucide-react'
import { Button } from '../Button'
import { Sheet } from '../Sheet'
import { InlineMessage } from './bits'

/**
 * An eating-out or skipped slot (migration 020, 7b): "Plan a meal instead"
 * (the meal picker, replacing it) and Remove (with a confirm step), which
 * leaves the slot empty. `initialMessage` says what happened to the meal it
 * replaced ("Salmon rice bowls moved to Mon 19.").
 */
export function KindSheet({ meal, initialMessage = null, onClose, onPlanMeal, onRemove }) {
  const [confirming, setConfirming] = useState(false)
  const confirmRef = useRef(null)
  const removeRef = useRef(null)
  const didConfirm = useRef(false)
  useEffect(() => {
    if (confirming) confirmRef.current?.focus()
    else if (didConfirm.current) removeRef.current?.focus()
    didConfirm.current = confirming
  }, [confirming])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(initialMessage)

  const remove = async () => {
    setBusy(true)
    setMessage(null)
    const result = await onRemove(meal)
    setBusy(false)
    if (result.ok) onClose()
    else {
      setConfirming(false)
      setMessage({ tone: 'error', text: result.error })
    }
  }

  const what = meal.kind === 'eating_out' ? 'eating out' : 'skipped'
  return (
    <Sheet
      onClose={onClose}
      dismissible={!busy}
      eyebrow={`${meal.dayShort} · ${meal.slot}`}
      title={meal.title}
      titleClassName="text-[26px]"
      subtitle={meal.kind === 'eating_out' ? 'Nothing to cook or buy for this meal.' : 'This meal is skipped. Nothing to cook or buy.'}
      testId="kind-sheet"
      footer={confirming ? (
        <div className="flex flex-col gap-3">
          <p className="text-[15px]">Remove {what} from {meal.dayLong}? The {meal.slot.toLowerCase()} will be empty.</p>
          <div className="flex gap-2.5">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirming(false)} disabled={busy}>Cancel</Button>
            <Button variant="danger" className="flex-1" onClick={remove} disabled={busy} ref={confirmRef}>
              {busy ? 'Removing…' : 'Remove'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Button size="lg" onClick={() => onPlanMeal(meal)} disabled={busy}>
            <CalendarPlus size={18} strokeWidth={2.2} aria-hidden="true" />
            Plan a meal instead
          </Button>
          <Button variant="dangerQuiet" className="self-start -ml-2" onClick={() => setConfirming(true)} ref={removeRef} disabled={busy}>
            <Trash2 size={16} aria-hidden="true" />
            Remove from plan
          </Button>
        </div>
      )}
    >
      <div className="flex flex-col gap-4">
        {message ? <InlineMessage tone={message.tone}>{message.text}</InlineMessage> : <p className="sr-only">Choose an action below.</p>}
      </div>
    </Sheet>
  )
}
