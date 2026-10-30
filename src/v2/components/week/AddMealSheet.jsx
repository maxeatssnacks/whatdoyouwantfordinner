import { useState } from 'react'
import { ChevronRight, Utensils } from 'lucide-react'
import { Sheet } from '../Sheet'
import { InlineMessage } from './bits'

/**
 * "+ Add a meal": that day's free slots; picking one opens the meal picker
 * (PARITY ADD-1). Since 7b a slot can be marked "Eating out" here too
 * (onEatingOut(slot) → { ok, error }), so it isn't voice-only.
 */
export function AddMealSheet({ day, slots, onPick, onEatingOut = null, onClose }) {
  const [busy, setBusy] = useState(null) // the slot being marked
  const [error, setError] = useState(null)

  const eatingOut = async (slot) => {
    setBusy(slot)
    setError(null)
    const result = await onEatingOut(slot)
    setBusy(null)
    if (!result.ok) setError(result.error)
  }

  return (
    <Sheet
      onClose={onClose}
      dismissible={!busy}
      eyebrow={`${day.shortName} ${day.dayNum}`}
      title="Add a meal"
      subtitle="Pick a slot, then choose what to eat."
      width={420}
      testId="add-meal-sheet"
    >
      <ul className="flex flex-col gap-2 pb-1">
        {slots.map((slot) => (
          <li key={slot}>
            <button
              type="button"
              onClick={() => onPick(slot)}
              disabled={!!busy}
              className="w-full min-h-[52px] px-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface text-left text-base font-bold hover:bg-surface-hover disabled:opacity-60 focus-visible:outline-none focus-visible:shadow-ring-primary"
            >
              {slot}
              <ChevronRight size={18} aria-hidden="true" className="text-text-secondary" />
            </button>
          </li>
        ))}
      </ul>
      {onEatingOut && slots.length > 0 && (
        <section className="flex flex-col gap-2 mt-4 pb-1" data-testid="add-eating-out">
          <h3 className="font-body text-sm font-bold text-text-secondary">Eating out</h3>
          <div className="flex flex-wrap gap-2" role="group" aria-label={`Eating out on ${day.longName}`}>
            {slots.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => eatingOut(slot)}
                disabled={!!busy}
                aria-label={`Eating out for ${slot.toLowerCase()}`}
                className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-pill border border-border bg-surface text-[15px] font-bold text-text-primary hover:bg-surface-hover disabled:opacity-60 focus-visible:outline-none focus-visible:shadow-ring-primary"
              >
                <Utensils size={16} strokeWidth={2.2} aria-hidden="true" />
                {busy === slot ? 'Saving…' : slot}
              </button>
            ))}
          </div>
          {error && <InlineMessage>{error}</InlineMessage>}
        </section>
      )}
    </Sheet>
  )
}
