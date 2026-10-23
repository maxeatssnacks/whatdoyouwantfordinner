import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn, mealTypesMatch } from '../../../lib/utils'
import { openDaysLabel, planDoneText } from '../../lib/weekModel'
import { Button } from '../Button'
import { Sheet } from '../Sheet'
import { InlineMessage } from './bits'

function defaultTypes(slots) {
  const dinner = slots.find((s) => mealTypesMatch(s, 'dinner'))
  return dinner ? [dinner] : slots.slice(0, 1)
}

/**
 * "Plan my week" (PARITY SG-1 to SG-8): pick meal types (Dinner by default),
 * see what will be replaced, run suggest. `entries` are only the meals a run
 * may replace (today onward, see Week.jsx). Locked while running; repeats,
 * open days and every failure are handled inside the sheet — no
 * alert/confirm. There's no "Plan anyway" step since 6c: recent recipes fill
 * gaps on their own, cooked longest ago first (PARITY SG-6).
 */
export function PlanWeekSheet({ slots, entries, scopeNote, householdLabel, onRun, onClose, onGoToRecipes }) {
  const [selected, setSelected] = useState(() => defaultTypes(slots))
  const [phase, setPhase] = useState('pick') // pick | running | done
  const [message, setMessage] = useState(null) // { text, action? }
  const [done, setDone] = useState(null) // { repeats, openDays, types } after a run that repeated recipes or left days open
  const doneRef = useRef(null)
  useEffect(() => {
    if (phase === 'done') doneRef.current?.focus()
  }, [phase])

  const toggle = (slot) => {
    setMessage(null)
    setSelected((prev) => {
      if (prev.includes(slot)) return prev.length === 1 ? prev : prev.filter((s) => s !== slot)
      return slots.filter((s) => s === slot || prev.includes(s))
    })
  }

  const toReplace = useMemo(
    () => entries.filter((e) => !e.is_leftover && selected.some((t) => mealTypesMatch(t, e.meal_type))),
    [entries, selected],
  )

  const run = async () => {
    setPhase('running')
    setMessage(null)
    const result = await onRun({ mealTypes: selected })
    if (result.ok) {
      // The week is planned either way; stay open only to say what repeated
      // or which days were left open.
      if (result.repeats?.length || result.openDays?.length) {
        setDone({ repeats: result.repeats ?? [], openDays: result.openDays ?? [], types: selected })
        setPhase('done')
      } else {
        onClose()
      }
      return
    }
    switch (result.reason) {
      case 'no-eligible-recipes':
        setMessage({ text: 'No recipes fit these meals. Try other meal types or add more recipes.', action: 'recipes' })
        break
      case 'no-recipes':
        setMessage({ text: 'There are no recipes to plan with yet. Add a few first.', action: 'recipes' })
        break
      case 'no-user':
        setMessage({ text: 'You’ve been signed out. Refresh the page and sign in again.' })
        break
      case 'no-entries-generated':
        setMessage({ text: 'There’s nothing left to fill: every day left already has leftovers planned for these meals.' })
        break
      case 'save-failed':
        setMessage({
          text: result.restored
            ? 'Couldn’t save the new plan, so your meals are back as they were. Please try again.'
            : 'Couldn’t save the new plan, and your old meals couldn’t be put back. Please plan again or add meals yourself.',
        })
        break
      case 'no-different-recipes':
        setMessage({
          text: `There weren’t enough different recipes to fill ${openDaysLabel(result.openDays ?? [], selected)}, so nothing changed. Add more recipes, or add a meal yourself.`,
          action: 'recipes',
        })
        break
      default:
        setMessage({ text: `Something went wrong while planning${result.error ? ` (${result.error})` : ''}. Please try again.` })
    }
    setPhase('pick')
  }

  const running = phase === 'running'

  const footer = phase === 'done' ? (
    <Button className="w-full" onClick={onClose} ref={doneRef} data-testid="plan-week-done">Done</Button>
  ) : (
    <div className="flex gap-2.5">
      <Button variant="secondary" className="flex-1" onClick={onClose} disabled={running}>Cancel</Button>
      <Button className="flex-[1.4]" onClick={run} disabled={running} data-testid="plan-week-confirm">
        {running ? 'Planning…' : 'Plan my week'}
      </Button>
    </div>
  )

  return (
    <Sheet
      onClose={onClose}
      dismissible={!running}
      title="Plan my week"
      subtitle={householdLabel}
      width={480}
      testId="plan-week-sheet"
      footer={footer}
    >
      {phase === 'done' ? (
        <div
          className="flex flex-col gap-3 pb-1"
          data-testid="plan-week-done-note"
          data-repeats={done.repeats.length}
          data-open-days={done.openDays.map((o) => o.dayOfWeek).join(',')}
        >
          <InlineMessage tone="warning">{planDoneText(done)}</InlineMessage>
          {/* Recent recipes already fill gaps before anything repeats, so only more recipes help. */}
          <p className="text-[15px] text-text-secondary">For more variety, add more recipes.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-1">
          {scopeNote && <p className="text-sm text-text-secondary" data-testid="plan-scope-note">{scopeNote}</p>}
          <p className="text-[15px] text-text-secondary">Which meals should we fill?</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Meal types to plan">
            {slots.map((slot) => {
              const on = selected.includes(slot)
              return (
                <button
                  key={slot}
                  type="button"
                  aria-pressed={on}
                  disabled={running}
                  onClick={() => toggle(slot)}
                  className={cn(
                    'min-h-[44px] px-4 rounded-pill border text-[15px] font-bold',
                    'focus-visible:outline-none focus-visible:shadow-ring-primary disabled:opacity-60',
                    on ? 'bg-primary-hover border-primary-hover text-white' : 'bg-surface border-border text-text-secondary hover:bg-surface-hover',
                  )}
                >
                  {slot}
                </button>
              )
            })}
          </div>
          {toReplace.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 bg-warning-soft text-sm" data-testid="replace-preview">
              <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-text-secondary" />
              <p>
                <strong>Will replace {toReplace.length} {toReplace.length === 1 ? 'meal' : 'meals'}:</strong>{' '}
                {toReplace.slice(0, 3).map((e) => e.recipe?.title).filter(Boolean).join(', ')}
                {toReplace.length > 3 && `, +${toReplace.length - 3} more`}
              </p>
            </div>
          )}
          {message && (
            <InlineMessage>
              {message.text}
              {message.action === 'recipes' && (
                <>
                  {' '}
                  <button type="button" onClick={onGoToRecipes} className="font-bold underline underline-offset-2 text-primary-hover">
                    Go to Recipes
                  </button>
                </>
              )}
            </InlineMessage>
          )}
        </div>
      )}
    </Sheet>
  )
}
