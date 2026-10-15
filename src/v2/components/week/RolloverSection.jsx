import { useState } from 'react'
import { PencilLine, ShoppingBasket } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { LEFT_OPTIONS } from '../../lib/rolloverPreview'
import { SampleTag } from './bits'

// "Good till Fri" → "good till Fri" (mid-sentence; keep the weekday capitalized).
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1)

/** "How much is left?": Used up / A little / About half / Plenty, inferred answer preselected. */
function HowMuchLeft({ item }) {
  const [value, setValue] = useState(item.left)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-bold capitalize">{item.name}</span>
        <span className="text-[13px] text-text-secondary">
          {item.amount}{item.useBy ? ' · ' : ''}
          {item.useBy && (item.soon ? <strong className="text-text-primary">{lowerFirst(item.useBy)}</strong> : lowerFirst(item.useBy))}
        </span>
      </div>
      <div role="group" aria-label={`How much ${item.name} is left`} className="grid grid-cols-4 gap-0.5 p-[3px] rounded-xl bg-surface-hover">
        {LEFT_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            aria-pressed={value === opt}
            onClick={() => setValue(opt)}
            className={cn(
              'min-h-[44px] px-1 rounded-[9px] text-[13px] focus-visible:outline-none focus-visible:shadow-ring-primary',
              value === opt ? 'bg-surface text-text-primary font-black shadow-resting' : 'text-text-secondary font-bold',
            )}
          >
            {opt}
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
 * Rollover section inside the meal sheet (sample data only for now).
 * A: on-hand list with use-by dates; "Update what's left" reveals the
 * "How much is left?" control. D: the control straight away (quick half sheet).
 */
export function RolloverSection({ rollover, variant }) {
  const [updating, setUpdating] = useState(false)

  if (variant === 'D') {
    return (
      <section data-testid="rollover-section" data-variant="D" className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-black tracking-[0.06em] uppercase text-text-secondary">How much is left?</p>
          <SampleTag />
        </div>
        {rollover.items.map((item) => <HowMuchLeft key={item.name} item={item} />)}
        <StillNeed names={rollover.stillNeed} />
      </section>
    )
  }

  return (
    <section data-testid="rollover-section" data-variant="A" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-body flex items-center gap-2 text-base font-black">On hand <SampleTag /></h3>
        <span className="px-2.5 py-0.5 rounded-pill bg-secondary-soft text-secondary-hover text-[13px] font-bold">
          Saves about ${rollover.savings}
        </span>
      </div>
      {updating ? (
        <div className="flex flex-col gap-4">
          {rollover.items.map((item) => <HowMuchLeft key={item.name} item={item} />)}
        </div>
      ) : (
        <ul className="flex flex-col bg-background border border-border rounded-2xl">
          {rollover.items.map((item, i) => (
            <li key={item.name} className={cn('flex items-center justify-between gap-3 px-3.5 py-3', i > 0 && 'border-t border-border')}>
              <div className="min-w-0 flex flex-col gap-0.5">
                <span className="text-base font-bold capitalize">{item.name}</span>
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
      <button
        type="button"
        onClick={() => setUpdating((u) => !u)}
        aria-expanded={updating}
        className="self-start min-h-[44px] px-1 flex items-center gap-2 text-[15px] font-bold text-primary-hover rounded-sm focus-visible:outline-none focus-visible:shadow-ring-primary"
      >
        <PencilLine size={17} aria-hidden="true" />
        {updating ? 'Done' : 'Update what’s left'}
      </button>
      <StillNeed names={rollover.stillNeed} />
    </section>
  )
}
