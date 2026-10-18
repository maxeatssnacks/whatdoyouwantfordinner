import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { quickMealTotals } from '../../../hooks/useQuickMeal'
import { calProtein, itemLabel } from '../../lib/quickMeal'
import { Button } from '../Button'
import { Sheet } from '../Sheet'
import { InlineMessage, QuickTag } from './bits'
import { RolloverSection } from './RolloverSection'

/** A quick meal's items with their nutrition, and the total. */
function QuickItems({ items }) {
  return (
    <div className="flex flex-col gap-1" data-testid="quick-items">
      <h3 className="font-body text-sm font-bold text-text-secondary">What’s in it</h3>
      <ul className="flex flex-col divide-y divide-border">
        {items.map((ing, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3 py-2 text-[15px]">
            <span className="min-w-0">{itemLabel(ing)}</span>
            <span className="shrink-0 text-[13px] text-text-secondary">{calProtein(ing)}</span>
          </li>
        ))}
      </ul>
      <p className="flex items-baseline justify-between gap-3 pt-2 border-t border-border font-bold">
        <span>Total</span>
        <span>{calProtein(quickMealTotals(items))}</span>
      </p>
    </div>
  )
}

/**
 * A planned (cooked) meal: details plus View recipe, Swap (opens the meal
 * picker) and Remove (with a confirm step). Quick meals list their items and
 * offer Edit instead of View recipe. Unavailable recipes open here too so
 * they can be removed (PARITY OPEN-5).
 */
export function MealSheet({ meal, swapAllowed, rolloverVariant, initialMessage = null, onClose, onViewRecipe, onSwap, onEdit, onRemove }) {
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
  const [busy, setBusy] = useState(null) // 'remove'
  const [message, setMessage] = useState(initialMessage) // { tone, text }

  const servings = meal.entry.servings ?? meal.recipe?.servings
  const meta = [meal.time, meal.macros && `${meal.macros} per person`].filter(Boolean).join(' · ')
  const items = meal.isQuick && Array.isArray(meal.recipe?.ingredients) ? meal.recipe.ingredients : null

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
            <Button size="lg" variant="secondary" onClick={() => onSwap(meal)} disabled={!!busy}>
              <RefreshCw size={17} strokeWidth={2.2} aria-hidden="true" />
              Swap
            </Button>
          )}
          {meal.isQuick ? (
            <Button size="lg" className="flex-1" onClick={() => onEdit(meal)} disabled={!!busy}>
              <Pencil size={17} strokeWidth={2.2} aria-hidden="true" />
              Edit
            </Button>
          ) : (
            <Button size="lg" className="flex-1" onClick={() => onViewRecipe(meal)} disabled={!!busy}>
              View recipe <ArrowRight size={18} strokeWidth={2.2} aria-hidden="true" />
            </Button>
          )}
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
        ) : meal.isQuick ? (
          <span className="flex flex-wrap items-center gap-2">
            <QuickTag />
            {meal.macros && <span>{meal.macros}</span>}
          </span>
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
        {message && <InlineMessage tone={message.tone}>{message.text}</InlineMessage>}
        {items && <QuickItems items={items} />}
        {meal.rollover && <RolloverSection rollover={meal.rollover} variant={rolloverVariant} />}
        {!meal.rollover && !message && !items && <p className="sr-only">Choose an action below.</p>}
      </div>
    </Sheet>
  )
}
