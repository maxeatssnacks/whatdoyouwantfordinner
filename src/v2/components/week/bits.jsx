import { AlertCircle, Utensils, Zap } from 'lucide-react'
import { RecipePhotoPlaceholder } from '../../../components/ui/RecipePhotoPlaceholder'
import { cn } from '../../../lib/utils'

/**
 * Recipe photo, or the standard striped placeholder when there isn't one.
 * `decorative` hides it from screen readers (e.g. inside a button that
 * already says the recipe's name).
 */
export function PhotoBox({ src, alt, className, iconSize = 24, decorative = false }) {
  if (src) {
    return <img src={src} alt={decorative ? '' : alt} loading="lazy" className={cn('object-cover bg-surface-hover', className)} />
  }
  return (
    <RecipePhotoPlaceholder className={cn('flex items-center justify-center', className)}>
      <span
        {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': alt ? `No photo for ${alt}` : 'No photo' })}
        className="text-text-secondary/70"
      >
        <Utensils size={iconSize} strokeWidth={1.6} aria-hidden="true" />
      </span>
    </RecipePhotoPlaceholder>
  )
}

/** Quick meals have no photo: a plain icon tile instead of the striped placeholder. */
export function QuickIcon({ className, iconSize = 22 }) {
  return (
    <span aria-hidden="true" className={cn('shrink-0 flex items-center justify-center rounded-xl bg-secondary-soft text-secondary-hover', className)}>
      <Zap size={iconSize} strokeWidth={2} />
    </span>
  )
}

/** Eating out (B2): a fork and knife in a tile, where a meal shows its photo. */
export function KindIcon({ className, iconSize = 20 }) {
  return (
    <span aria-hidden="true" className={cn('shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-surface-hover text-text-primary', className)}>
      <Utensils size={iconSize} strokeWidth={2} />
    </span>
  )
}

/** On a card voice just changed (7b, B2), while the bar is up. */
export function JustChanged({ className }) {
  return (
    <span data-testid="just-changed" className={cn('shrink-0 text-xs font-bold text-text-secondary', className)}>
      Just changed
    </span>
  )
}

/** Marks stubbed numbers. Every sample figure on screen sits next to one. */
export function SampleTag({ className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center shrink-0 px-1.5 py-px rounded-sm border border-dashed border-border-hover',
        'text-[11px] font-bold uppercase tracking-[0.06em] text-text-secondary bg-surface',
        className,
      )}
    >
      Sample
    </span>
  )
}

export function LeftoverTag({ className }) {
  return (
    <span className={cn('shrink-0 px-2.5 py-0.5 rounded-pill bg-accent-soft text-text-primary text-xs font-bold', className)}>
      Leftover
    </span>
  )
}

/** Marks a quick meal ("Something simple"). */
export function QuickTag({ className }) {
  return (
    <span data-testid="quick-tag" className={cn('shrink-0 px-2.5 py-0.5 rounded-pill bg-secondary-soft text-text-primary text-xs font-bold', className)}>
      Quick
    </span>
  )
}

/** Inline status line inside sheets and cards (ST-7, SG-7). */
export function InlineMessage({ tone = 'error', children, className }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm',
        tone === 'error' && 'bg-error-soft/60 text-text-primary',
        tone === 'warning' && 'bg-warning-soft text-text-primary',
        tone === 'success' && 'bg-secondary-soft text-text-primary',
        tone === 'info' && 'bg-surface-hover text-text-primary',
        className,
      )}
    >
      {tone === 'error' && <AlertCircle size={16} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />}
      <span className="min-w-0">{children}</span>
    </p>
  )
}
