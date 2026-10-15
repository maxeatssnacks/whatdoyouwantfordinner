import { Check, UserPlus } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { joinNames } from '../../lib/weekModel'
import { Button } from '../Button'
import { Sheet } from '../Sheet'

// Existing token tints, cycled per member. No new colors.
const TINTS = [
  'bg-primary-soft text-primary-hover',
  'bg-secondary-soft text-secondary-hover',
  'bg-accent-soft text-text-primary',
  'bg-surface-hover text-text-secondary',
]
const MAX_SHOWN = 3

function initial(name) {
  return (String(name || '?').trim().charAt(0) || '?').toUpperCase()
}

function Avatar({ member, index, eating, size = 'sm' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex items-center justify-center rounded-pill font-black ring-2 ring-background',
        size === 'sm' ? 'w-7 h-7 text-[13px]' : 'w-10 h-10 text-base',
        eating ? TINTS[index % TINTS.length] : 'bg-background text-tertiary border border-dashed border-border-hover opacity-70',
      )}
    >
      {initial(member.name)}
    </span>
  )
}

/**
 * "Cooking for" (PARITY OB-5, redesigned): overlapping initial avatars in the
 * Week header. One 44px control; people not eating this session are dimmed
 * and outlined.
 */
export function CookingForCluster({ members, isEating, onOpen }) {
  if (!members.length) return null
  const eatingNames = members.filter((m) => isEating(m.id)).map((m) => m.name)
  const shown = members.slice(0, MAX_SHOWN)
  const extra = members.length - shown.length

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Cooking for ${joinNames(eatingNames)}. Change`}
      data-testid="cooking-for"
      className="min-h-[44px] min-w-[44px] px-1.5 flex items-center rounded-pill hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-ring-primary"
    >
      <span className="flex items-center -space-x-2">
        {shown.map((m, i) => (
          <Avatar key={m.id} member={m} index={i} eating={isEating(m.id)} />
        ))}
        {extra > 0 && (
          <span aria-hidden="true" className="inline-flex items-center justify-center w-7 h-7 rounded-pill bg-surface-hover text-text-secondary text-xs font-bold ring-2 ring-background">
            +{extra}
          </span>
        )}
      </span>
    </button>
  )
}

/** Who's eating this session: aria-pressed toggles; the last person stays on. */
export function CookingForSheet({ members, isEating, onToggle, onAddSomeone, onClose }) {
  const eatingCount = members.filter((m) => isEating(m.id)).length

  return (
    <Sheet
      onClose={onClose}
      title="Who’s eating?"
      subtitle="Portions, leftovers and suggestions follow this. It resets when you close the app."
      testId="cooking-for-sheet"
      footer={
        <Button variant="secondary" className="w-full" onClick={onAddSomeone}>
          <UserPlus size={18} strokeWidth={2.2} aria-hidden="true" />
          Add someone
        </Button>
      }
    >
      <ul className="flex flex-col gap-2" aria-label="Household members">
        {members.map((m, i) => {
          const on = isEating(m.id)
          const locked = on && eatingCount <= 1
          return (
            <li key={m.id}>
              <button
                type="button"
                aria-pressed={on}
                aria-disabled={locked || undefined}
                onClick={() => !locked && onToggle(m.id)}
                className={cn(
                  'w-full min-h-[56px] flex items-center gap-3 px-3 rounded-xl border text-left',
                  'focus-visible:outline-none focus-visible:shadow-ring-primary',
                  on ? 'border-primary bg-primary-tint' : 'border-border bg-surface hover:bg-surface-hover',
                  locked && 'cursor-default',
                )}
              >
                <Avatar member={m} index={i} eating={on} size="md" />
                <span className="flex-1 min-w-0">
                  <span className="block text-base font-bold truncate">
                    {m.name}{m.is_primary ? ' (You)' : ''}
                  </span>
                  <span className="block text-[13px] text-text-secondary">
                    {on ? (locked ? 'Eating · at least one person has to be' : 'Eating') : 'Not eating this time'}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'w-6 h-6 rounded-pill flex items-center justify-center border-2',
                    on ? 'bg-primary-hover border-primary-hover text-white' : 'border-border-hover',
                  )}
                >
                  {on && <Check size={14} strokeWidth={3} />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {members.length === 1 && (
        <p className="mt-3 text-sm text-text-secondary">Cooking for more people? Add them so portions and leftovers fit.</p>
      )}
    </Sheet>
  )
}
