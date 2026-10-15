import { useEffect, useRef, useState } from 'react'
import { ArrowRight, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '../Button'
import { Sheet } from '../Sheet'
import { InlineMessage } from './bits'
import { RolloverSection } from './RolloverSection'

/**
 * A planned (cooked) meal: details plus View recipe, Swap and Remove (with a
 * confirm step). Unavailable recipes open here too so they can be removed
 * (PARITY OPEN-5).
 */
export function MealSheet({ meal, swapAllowed, rolloverVariant, onClose, onViewRecipe, onSwap, onRemove }) {
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
  const [busy, setBusy] = useState(null) // 'swap' | 'remove'
  const [message, setMessage] = useState(null) // { tone, text }

  const servings = meal.entry.servings ?? meal.recipe?.servings
  const meta = [meal.time, meal.macros && `${meal.macros} per person`].filter(Boolean).join(' · ')

  const swap = async () => {
    setBusy('swap')
    setMessage(null)
    const result = await onSwap(meal)
    setBusy(null)
    setMessage(result.ok ? { tone: 'success', text: `Swapped in ${result.title}.` } : { tone: 'error', text: result.error })
  }

  const remove = async () => {
    setBusy('remove')
    setMessage(null)
    const result = await onRemove(meal)
    setBusy(null)
    if (result.ok) {
      onClose()
    } else {
      setConfirming(false)
      setMessage({ tone: 'error', text: result.error })
    }
  }

  const footer = confirming ? (
    <div className="flex flex-col gap-3">
      <p className="text-[15px]">
        Remove <strong>{meal.title}</strong> from {meal.dayLong}?
        {!meal.unavailable && ' Any leftovers from it go too.'}
      </p>
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
    <div className="flex flex-col gap-2">
      {!meal.unavailable && (
        <div className="flex gap-2.5">
          {swapAllowed && (
            <Button size="lg" variant="secondary" onClick={swap} disabled={!!busy}>
              <RefreshCw size={17} strokeWidth={2.2} aria-hidden="true" className={busy === 'swap' ? 'animate-spin' : ''} />
              {busy === 'swap' ? 'Swapping…' : 'Swap'}
            </Button>
          )}
          <Button size="lg" className="flex-1" onClick={() => onViewRecipe(meal)} disabled={!!busy}>
            View recipe <ArrowRight size={18} strokeWidth={2.2} aria-hidden="true" />
          </Button>
        </div>
      )}
      <Button variant="dangerQuiet" className="self-start -ml-2" onClick={() => setConfirming(true)} ref={removeRef} disabled={!!busy}>
        <Trash2 size={16} aria-hidden="true" />
        Remove from plan
      </Button>
    </div>
  )

  return (
    <Sheet
      onClose={onClose}
      dismissible={!busy}
      eyebrow={`${meal.dayShort} · ${meal.slot}`}
      title={meal.title}
      titleClassName="text-[26px]"
      subtitle={
        meal.unavailable ? (
          'This recipe was removed or isn’t shared anymore. You can take it off your plan.'
        ) : (
          <>
            {meta && <span className="block">{meta}</span>}
            {servings != null && <span className="block">Cooks {servings} {Number(servings) === 1 ? 'serving' : 'servings'}</span>}
          </>
        )
      }
      footer={footer}
      testId="meal-sheet"
    >
      <div className="flex flex-col gap-4">
        {meal.rollover && <RolloverSection rollover={meal.rollover} variant={rolloverVariant} />}
        {message && <InlineMessage tone={message.tone}>{message.text}</InlineMessage>}
        {!meal.rollover && !message && <p className="sr-only">Choose an action below.</p>}
      </div>
    </Sheet>
  )
}
