import { useState } from 'react'
import { PencilLine, ShoppingBasket } from 'lucide-react'
import { capitalize, cn } from '../../../lib/utils'
import { ANSWERS } from '../../lib/onHand'
import { SampleTag } from './bits'

// "Good till Fri" → "good till Fri" (mid-sentence; keep the weekday capitalized).
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1)

/**
 * "How much is left?": Used up / A little / About half / Plenty, with the
 * answer that's in effect selected (today's, or the one the inferred amount
 * suggests). Real data: a tap on another answer calls onAnswer(item, label),
 * which saves it; the selected one does nothing. Sample data: kept here only.
 * The amount shown is what's left now when that differs from the meal's.
 */
function HowMuchLeft({ item, onAnswer }) {
  const [local, setLocal] = useState(item.left)
  const value = onAnswer ? item.left : local
  const pick = (label) => {
    if (label === value) return
    if (onAnswer) onAnswer(item, label)
    else setLocal(label)
  }
  const now = item.correction?.nowText
  const amount = now && now !== item.amount ? `${now} now` : item.amount
  return (
    <div className="flex flex-col gap-1.5" data-testid="how-much-left" data-key={item.key ?? ''}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-bold">{capitalize(item.name)}</span>
        <span className="text-[13px] text-text-secondary" data-testid="how-much-left-amount">
          {amount}{item.useBy ? ' · ' : ''}
          {item.useBy && (item.soon ? <strong className="text-text-primary">{lowerFirst(item.useBy)}</strong> : lowerFirst(item.useBy))}
        </span>
      </div>
      <div role="group" aria-label={`How much ${item.name} is left`} className="grid grid-cols-4 gap-0.5 p-[3px] rounded-xl bg-surface-hover">
        {ANSWERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={value === label}
            data-answer={key}
            onClick={() => pick(label)}
            className={cn(
              'min-h-[44px] px-1 rounded-[9px] text-[13px] focus-visible:outline-none focus-visible:shadow-ring-primary',
              value === label ? 'bg-surface text-text-primary font-black shadow-resting' : 'text-text-secondary font-bold',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function StillNeed({ names }) {
  if (!names?.length) return null
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 h-10 shrink-0 rounded-xl bg-surface-hover text-text-secondary flex items-center justify-center">
        <ShoppingBasket size={18} aria-hidden="true" />
      </span>
      <p className="text-sm">
        <strong>Still need</strong> <span className="text-text-secondary">{names.join(', ')}</span>
      </p>
    </div>
  )
}

/**
 * Rollover section inside the meal sheet, real data (src/v2/lib/onHand.js)
 * or the labelled sample data: "You already have" (the line's items, up to 3,
 * in its order, with amounts and use-by dates; 7a3) and "Still need". "Update what's left" turns the
 * list into "How much is left?" for each item; with real data an answer is
 * saved at once through onAnswer(item, label) (step 5c), and "Used up" takes
 * the item off. Dollar amounts only with sample data (step 8).
 */
export function RolloverSection({ rollover, onAnswer = null }) {
  // While answering, the rows stay the ones "Update what's left" opened with
  // (an answer can move an item down the order, or past the 3 listed); "Used
  // up" takes a row off. Once they're all gone, the items listed now.
  const [openedWith, setOpenedWith] = useState(null) // item keys, or null when not updating
  const updating = openedWith != null
  const sampleData = rollover.sample === true
  const answer = sampleData ? null : onAnswer
  const idOf = (item) => item.key ?? item.name
  const everyItem = rollover.allItems ?? rollover.items
  const stillThere = updating ? openedWith.map((id) => everyItem.find((i) => idOf(i) === id)).filter(Boolean) : []
  const answering = stillThere.length ? stillThere : rollover.items

  return (
    <section data-testid="rollover-section" data-sample={sampleData ? 'true' : 'false'} className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-body flex items-center gap-2 text-base font-black">You already have {sampleData && <SampleTag />}</h3>
        {rollover.savings != null && (
          <span className="px-2.5 py-0.5 rounded-pill bg-secondary-soft text-secondary-hover text-[13px] font-bold">
            Saves about ${rollover.savings}
          </span>
        )}
      </div>
      {updating ? (
        <div className="flex flex-col gap-4">
          {answering.map((item) => <HowMuchLeft key={idOf(item)} item={item} onAnswer={answer} />)}
        </div>
      ) : (
        <ul className="flex flex-col bg-background border border-border rounded-2xl">
          {rollover.items.map((item, i) => (
            <li key={item.key ?? item.name} data-testid="on-hand-item" data-key={item.key ?? ''} className={cn('flex items-center justify-between gap-3 px-3.5 py-3', i > 0 && 'border-t border-border')}>
              <div className="min-w-0 flex flex-col gap-0.5">
                <span className="text-base font-bold">{capitalize(item.name)}</span>
                <span className="text-[13px] text-text-secondary">{item.amount}</span>
              </div>
              {item.useBy && (
                <span className={cn(
                  'shrink-0 flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill text-[13px] font-bold',
                  item.soon ? 'bg-accent-soft text-text-primary' : 'bg-surface-hover text-text-secondary',
                )}>
                  {item.soon && <span aria-hidden="true" className="w-1.5 h-1.5 rounded-pill bg-accent" />}
                  {item.useBy}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {rollover.canUpdate !== false && (
        <button
          type="button"
          onClick={() => setOpenedWith(updating ? null : rollover.items.map(idOf))}
          aria-expanded={updating}
          className="self-start min-h-[44px] px-1 flex items-center gap-2 text-[15px] font-bold text-primary-hover rounded-sm focus-visible:outline-none focus-visible:shadow-ring-primary"
        >
          <PencilLine size={17} aria-hidden="true" />
          {updating ? 'Done' : 'Update what’s left'}
        </button>
      )}
      <StillNeed names={rollover.stillNeed} />
    </section>
  )
}
