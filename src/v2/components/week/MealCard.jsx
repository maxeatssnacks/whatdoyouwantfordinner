import { Clock } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { mealAriaLabel } from '../../lib/weekModel'
import { LeftoverTag, PhotoBox, QuickIcon, QuickTag } from './bits'
import { RolloverReason } from './RolloverReason'

// Stretched button: the title button's ::after covers the card so the whole
// card opens the meal sheet, while other controls (the desktop rollover
// popover) can sit above it.
const STRETCH =
  'text-left after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none focus-visible:after:shadow-ring-primary'

function cardData(meal) {
  return {
    'data-testid': 'meal-card',
    'data-entry-id': meal.entry.id,
    'data-day': meal.date,
    'data-leftover': meal.isLeftover ? 'true' : 'false',
    'data-quick': meal.isQuick ? 'true' : 'false',
  }
}

/** Leftover or Quick tag, if the meal is either. */
function KindTag({ meal, className }) {
  if (meal.isLeftover) return <LeftoverTag className={className} />
  if (meal.isQuick) return <QuickTag className={className} />
  return null
}

/** "Dinner · 30 min · 540 cal · 32g protein" / "Lunch · from Wednesday’s dinner". */
function subline(meal, { withSlot = true, withTime = true } = {}) {
  const parts = []
  if (withSlot) parts.push(meal.slot)
  if (meal.isLeftover) {
    if (meal.origin) parts.push(meal.origin)
  } else if (withTime && meal.time) {
    parts.push(meal.time)
  }
  if (meal.macros) parts.push(meal.macros)
  return parts.join(' · ')
}

/** Normal-day meal card, variants A–D (design-system/v2/now/Meal-*). */
export function MealCard({ meal, variant, onOpen }) {
  const open = () => onOpen(meal)
  const reason = <RolloverReason rollover={meal.rollover} onActivate={open} />

  if (variant === 'A') {
    return (
      <li {...cardData(meal)} className="relative flex items-center gap-3 min-h-[68px] py-2.5 border-b border-border last:border-b-0">
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <button type="button" onClick={open} aria-label={mealAriaLabel(meal)} className={cn(STRETCH, 'text-base font-bold leading-snug')}>
            {meal.title}
          </button>
          <span className="text-[13px] text-text-secondary">{subline(meal)}</span>
          {meal.rollover && <div className="mt-1">{reason}</div>}
        </div>
        <KindTag meal={meal} />
      </li>
    )
  }

  if (variant === 'C') {
    // Leftovers, unavailable recipes and quick meals use the compact card;
    // quick meals have no photo, so they get the icon tile.
    if (meal.isLeftover || meal.unavailable || meal.isQuick) {
      return (
        <li {...cardData(meal)} className="relative flex items-stretch min-h-[88px] bg-surface border border-border rounded-2xl">
          {meal.isQuick ? (
            <span className="w-[88px] shrink-0 flex items-center justify-center">
              <QuickIcon className="w-12 h-12" />
            </span>
          ) : (
            <PhotoBox src={meal.imageUrl} alt={meal.title} className="w-[88px] shrink-0 rounded-l-2xl" iconSize={20} />
          )}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1 px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold tracking-[0.06em] uppercase text-text-secondary">{meal.slot}</span>
              <KindTag meal={meal} />
            </div>
            <button type="button" onClick={open} aria-label={mealAriaLabel(meal)} className={cn(STRETCH, 'text-base font-bold leading-snug')}>
              {meal.title}
            </button>
            <span className="text-[13px] text-text-secondary">{subline(meal, { withSlot: false })}</span>
          </div>
        </li>
      )
    }
    return (
      <li {...cardData(meal)} className="relative flex flex-col bg-surface border border-border rounded-2xl">
        <div className="relative h-[150px]">
          <PhotoBox src={meal.imageUrl} alt={meal.title} className="absolute inset-0 w-full h-full rounded-t-2xl" />
          {meal.time && (
            <span className="absolute right-2.5 top-2.5 flex items-center gap-1 px-2.5 py-1 rounded-pill bg-surface text-text-primary text-[13px] font-bold shadow-resting">
              <Clock size={13} strokeWidth={2.2} aria-hidden="true" />
              {meal.time}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1 px-4 pt-3 pb-3.5">
          <span className="text-xs font-bold tracking-[0.06em] uppercase text-text-secondary">{meal.slot}</span>
          <button type="button" onClick={open} aria-label={mealAriaLabel(meal)} className={cn(STRETCH, 'text-lg font-bold leading-snug')}>
            {meal.title}
          </button>
          {meal.macros && <span className="text-[13px] text-text-secondary">{meal.macros}</span>}
          {meal.rollover && <div className="mt-1">{reason}</div>}
        </div>
      </li>
    )
  }

  if (variant === 'D') {
    return (
      <li {...cardData(meal)} className="relative flex flex-col gap-1.5 px-4 py-3.5 bg-surface border border-border rounded-2xl">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold tracking-[0.06em] uppercase text-text-secondary">{meal.slot}</span>
          <KindTag meal={meal} />
        </div>
        <button type="button" onClick={open} aria-label={mealAriaLabel(meal)} className={cn(STRETCH, 'text-xl font-black leading-tight')}>
          {meal.title}
        </button>
        <p className="flex items-center gap-1.5 text-sm text-text-secondary">
          {!meal.isLeftover && meal.time && <Clock size={14} strokeWidth={2.2} aria-hidden="true" className="shrink-0" />}
          <span>{subline(meal, { withSlot: false })}</span>
        </p>
        {meal.rollover && reason}
      </li>
    )
  }

  // B (default)
  return (
    <li {...cardData(meal)} className="relative flex flex-col gap-1 px-4 py-3.5 bg-surface border border-border rounded-2xl">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold tracking-[0.06em] uppercase text-text-secondary">{meal.slot}</span>
        {meal.isLeftover || meal.isQuick ? (
          <KindTag meal={meal} />
        ) : meal.time ? (
          <span className="flex items-center gap-1 text-[13px] text-text-secondary">
            <Clock size={13} strokeWidth={2.2} aria-hidden="true" />
            {meal.time}
          </span>
        ) : null}
      </div>
      <button type="button" onClick={open} aria-label={mealAriaLabel(meal)} className={cn(STRETCH, 'text-lg font-bold leading-snug')}>
        {meal.title}
      </button>
      {(meal.origin || meal.macros || meal.rollover) && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-1">
          {meal.rollover ? reason : <span className="text-[13px] text-text-secondary">{meal.isLeftover ? meal.origin : ''}</span>}
          {meal.macros && <span className="text-[13px] text-text-secondary">{meal.macros}</span>}
        </div>
      )}
    </li>
  )
}
