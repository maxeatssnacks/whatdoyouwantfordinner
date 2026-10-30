import { ArrowUpDown, Ban, Check, Clock, Mic, MoveRight, Plus, Utensils } from 'lucide-react'
import { Sheet } from '../Sheet'
import { Button } from '../Button'
import { cn } from '../../../lib/utils'
import { canUndoAny, reviewTitle, sameWords } from '../../lib/voice/words'

// Review (design-system/v2/later/Voice-A2): every change from the last batch,
// one row each: applied ones with their own Undo, "Not changed" ones with the
// reason, and (7a, admins only) meal changes as "Not done yet". "You said"
// is the words from memory; nothing stores them. Since 7a3 a "Not changed"
// row doesn't repeat the words when they're all that was said ("You said"
// shows them), and Undo all only shows when something was applied.

const ICONS = {
  on_hand: { Icon: Check, cls: 'bg-surface-hover text-text-secondary' },
  eating_out: { Icon: Utensils, cls: 'bg-accent-soft text-text-primary' },
  skip: { Icon: Ban, cls: 'bg-surface-hover text-text-secondary' },
  move: { Icon: MoveRight, cls: 'bg-secondary-soft text-secondary-hover' },
  swap: { Icon: ArrowUpDown, cls: 'bg-secondary-soft text-secondary-hover' },
  add: { Icon: Plus, cls: 'bg-secondary-soft text-secondary-hover' },
}

function Row({ item, text, busy, onUndo, last }) {
  const notChanged = item.status === 'not_changed'
  const notDone = item.status === 'not_done'
  const line = notChanged && sameWords(item.said, text) ? null : item.line
  const { Icon, cls } = notChanged
    ? { Icon: Ban, cls: 'bg-surface-hover text-text-tertiary' }
    : notDone ? { Icon: Clock, cls: 'bg-surface-hover text-text-tertiary' } : ICONS[item.type] ?? ICONS.on_hand
  return (
    <li
      data-testid="voice-review-row"
      data-status={item.status}
      data-type={item.type}
      className={cn('flex items-start gap-3 py-3', !last && 'border-b border-border')}
    >
      <span className={cn('shrink-0 w-9 h-9 rounded-pill flex items-center justify-center', cls)}>
        <Icon size={18} strokeWidth={2.2} aria-hidden="true" />
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-px">
        <span className="text-xs font-bold tracking-[0.06em] uppercase text-text-secondary">{item.eyebrow}</span>
        {item.was && (
          <span className="text-sm text-text-secondary line-through">
            <span className="sr-only">Was </span>{item.was}
          </span>
        )}
        <span className={cn('text-base font-bold', (notChanged || item.status === 'undone') && 'text-text-secondary')}>{item.title}</span>
        {line && <span className="text-[13px] text-text-secondary">{line}</span>}
      </div>
      {item.status === 'applied' && (
        <Button
          variant="secondary"
          className="shrink-0 text-sm px-3.5"
          onClick={() => onUndo(item.id)}
          disabled={busy}
          aria-label={`Undo: ${item.title}`}
        >
          Undo
        </Button>
      )}
      {item.status === 'undone' && <span className="shrink-0 self-center text-sm font-bold text-text-secondary">Undone</span>}
    </li>
  )
}

export function VoiceReview({ result, busy, onUndo, onUndoAll, onSpeak, onClose }) {
  const canUndo = result.items.some((i) => i.status === 'applied')
  const showUndoAll = canUndoAny(result)
  return (
    <Sheet
      onClose={onClose}
      title={reviewTitle(result)}
      testId="voice-review"
      footer={(
        <div className="flex gap-2.5">
          <button
            type="button"
            aria-label="Say another change"
            onClick={onSpeak}
            className="shrink-0 w-[52px] h-[52px] rounded-pill border border-border bg-surface text-primary-hover flex items-center justify-center hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-ring-primary"
          >
            <Mic size={20} strokeWidth={2.2} aria-hidden="true" />
          </button>
          {showUndoAll && (
            <Button size="lg" variant="secondary" className="flex-1" onClick={onUndoAll} disabled={!canUndo || busy}>
              Undo all
            </Button>
          )}
          <Button size="lg" className="flex-1" onClick={onClose}>Done</Button>
        </div>
      )}
    >
      {result.text && (
        <p className="px-3.5 py-3 rounded-xl bg-background text-sm leading-relaxed text-text-secondary">
          You said: “{result.text}”
        </p>
      )}
      <ul className="flex flex-col mt-1">
        {result.items.map((item, i) => (
          <Row key={item.id} item={item} text={result.text} busy={busy} onUndo={onUndo} last={i === result.items.length - 1} />
        ))}
      </ul>
    </Sheet>
  )
}
