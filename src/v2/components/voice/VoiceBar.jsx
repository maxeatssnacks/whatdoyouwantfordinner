import { barText } from '../../lib/voice/words'

// The bar after voice changes (design-system/v2/later/Voice-B2): "2 changes
// made." with the first on-hand change in words (or what wasn't changed),
// Undo (everything) and Review. It sits above the floating nav and follows
// it as the nav hides on scroll (--v2-nav-float, appShell.css); on desktop,
// 24px off the bottom. VoiceProvider takes it away after 10 s without a
// touch, on opening a meal, or on leaving the Week page.
export function VoiceBar({ result, busy, onTouch, onUndo, onReview }) {
  const { strong, rest } = barText(result)
  return (
    <div
      role="status"
      data-testid="voice-bar"
      onPointerDown={onTouch}
      onFocusCapture={onTouch}
      style={{ bottom: 'max(var(--v2-nav-float, 0px), 24px)' }}
      className="fixed z-40 left-3 right-3 md:left-1/2 md:right-auto md:w-[480px] md:-translate-x-1/2 flex items-center gap-1 py-1.5 pl-4 pr-1.5 rounded-2xl bg-text-primary text-surface font-body shadow-elevated transition-[bottom] duration-200 ease-out motion-reduce:transition-none"
    >
      <p className="flex-1 min-w-0 text-sm leading-snug">
        <strong>{strong}</strong>{rest ? ` ${rest}` : ''}
      </p>
      <button
        type="button"
        onClick={onUndo}
        disabled={busy}
        className="shrink-0 min-h-[44px] px-3 rounded-pill text-sm font-black text-accent disabled:opacity-60 focus-visible:outline-none focus-visible:shadow-ring-primary"
      >
        Undo
      </button>
      <button
        type="button"
        onClick={onReview}
        className="shrink-0 min-h-[44px] px-3 rounded-pill text-sm font-bold text-surface focus-visible:outline-none focus-visible:shadow-ring-primary"
      >
        Review
      </button>
    </div>
  )
}
