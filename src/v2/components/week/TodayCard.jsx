import { ArrowRight, ChevronRight, Clock, RefreshCw } from 'lucide-react'
import { cn, mealTypesMatch } from '../../../lib/utils'
import { mealAriaLabel } from '../../lib/weekModel'
import { Button } from '../Button'
import { LeftoverTag, PhotoBox, QuickIcon, QuickTag } from './bits'
import { RolloverReason } from './RolloverReason'

const STRETCH =
  'text-left after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none focus-visible:after:shadow-ring-primary'

function eyebrow(meal) {
  return mealTypesMatch(meal.slot, 'dinner') ? 'Tonight' : 'Today'
}

function metaLine(meal) {
  const parts = []
  if (meal.isLeftover && meal.origin) parts.push(meal.origin)
  else if (meal.time) parts.push(meal.time)
  if (meal.macros) parts.push(meal.macros)
  return parts.join(' · ')
}

function todayData(meal, variant) {
  return {
    'data-testid': 'today-card',
    'data-variant': variant,
    'data-entry-id': meal.entry.id,
    'data-day': meal.date,
    'data-leftover': meal.isLeftover ? 'true' : 'false',
    'data-quick': meal.isQuick ? 'true' : 'false',
  }
}

function KindTag({ meal, className }) {
  if (meal.isLeftover) return <LeftoverTag className={className} />
  if (meal.isQuick) return <QuickTag className={className} />
  return null
}

/**
 * Today's featured meal (dinner if planned, otherwise the last meal today),
 * variants A–D. Every variant shows the recipe photo, or the placeholder;
 * quick meals have no photo and show a plain icon tile instead.
 */
export function TodayCard({ meal, variant, onOpen, onViewRecipe, onSwap, swapAllowed, nextMeal, onOpenNext }) {
  const open = () => onOpen(meal)
  const reason = <RolloverReason rollover={meal.rollover} onActivate={open} />
  const label = `${eyebrow(meal)} · ${meal.slot}`

  if (variant === 'A') {
    return (
      <div {...todayData(meal, variant)} className="relative flex items-center gap-3 p-3 bg-surface border border-primary rounded-xl">
        {meal.isQuick ? (
          <QuickIcon className="w-[72px] h-[72px]" iconSize={26} />
        ) : (
          <PhotoBox src={meal.imageUrl} alt={meal.title} className="w-[72px] h-[72px] shrink-0 rounded-lg" iconSize={20} />
        )}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="text-xs font-black tracking-[0.06em] uppercase text-primary-hover">{label}</span>
          <button type="button" onClick={open} aria-label={mealAriaLabel(meal)} className={cn(STRETCH, 'text-[17px] font-bold leading-snug')}>
            {meal.title}
          </button>
          <span className="text-[13px] text-text-secondary">{metaLine(meal)}</span>
          {meal.rollover && <div className="mt-1">{reason}</div>}
        </div>
        <KindTag meal={meal} className="self-start" />
      </div>
    )
  }

  if (variant === 'B') {
    return (
      <div {...todayData(meal, variant)} className="relative flex flex-col bg-surface border border-primary rounded-2xl">
        {meal.isQuick ? (
          <QuickIcon className="w-12 h-12 mx-4 mt-4" />
        ) : (
          <PhotoBox src={meal.imageUrl} alt={meal.title} className="w-full h-[140px] rounded-t-2xl" />
        )}
        <div className="flex flex-col gap-1 px-4 pt-3 pb-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-black tracking-[0.06em] uppercase text-primary-hover">{label}</span>
            {meal.isLeftover || meal.isQuick ? <KindTag meal={meal} /> : meal.time ? (
              <span className="flex items-center gap-1 text-[13px] text-text-secondary">
                <Clock size={13} strokeWidth={2.2} aria-hidden="true" />{meal.time}
              </span>
            ) : null}
          </div>
          <button type="button" onClick={open} aria-label={mealAriaLabel(meal)} className={cn(STRETCH, 'text-lg font-bold leading-snug')}>
            {meal.title}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-1">
            {meal.rollover ? reason : <span className="text-[13px] text-text-secondary">{meal.isLeftover ? meal.origin : ''}</span>}
            {meal.macros && <span className="text-[13px] text-text-secondary">{meal.macros}</span>}
          </div>
        </div>
      </div>
    )
  }

  if (variant === 'C') {
    return (
      <div {...todayData(meal, variant)} className="relative flex flex-col bg-surface border border-primary rounded-2xl">
        {meal.isQuick ? (
          <div className="flex items-center gap-2.5 px-4 pt-4">
            <QuickIcon className="w-12 h-12" />
            <span className="text-[13px] font-black uppercase tracking-[0.06em] text-primary-hover">{eyebrow(meal)}</span>
          </div>
        ) : (
          <div className="relative h-[190px]">
            <PhotoBox src={meal.imageUrl} alt={meal.title} className="absolute inset-0 w-full h-full rounded-t-2xl" iconSize={32} />
            <span className="absolute left-2.5 top-2.5 px-2.5 py-1 rounded-pill bg-surface text-[13px] font-black uppercase tracking-[0.06em] text-primary-hover shadow-resting">
              {eyebrow(meal)}
            </span>
            {!meal.isLeftover && meal.time && (
              <span className="absolute right-2.5 top-2.5 flex items-center gap-1 px-2.5 py-1 rounded-pill bg-surface text-text-primary text-[13px] font-bold shadow-resting">
                <Clock size={13} strokeWidth={2.2} aria-hidden="true" />{meal.time}
              </span>
            )}
          </div>
        )}
        <div className="flex flex-col gap-1 px-4 pt-3 pb-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold tracking-[0.06em] uppercase text-text-secondary">{meal.slot}</span>
            <KindTag meal={meal} />
          </div>
          <button type="button" onClick={open} aria-label={mealAriaLabel(meal)} className={cn(STRETCH, 'text-xl font-bold leading-snug')}>
            {meal.title}
          </button>
          <span className="text-[13px] text-text-secondary">{meal.isLeftover ? metaLine(meal) : meal.macros}</span>
          {meal.rollover && <div className="mt-1">{reason}</div>}
        </div>
      </div>
    )
  }

  return (
    <TodayCardD
      meal={meal}
      label={`${meal.dayShort} ${meal.dayNum} · ${meal.slot}`}
      onOpen={open}
      reason={reason}
      onViewRecipe={onViewRecipe}
      onSwap={onSwap}
      swapAllowed={swapAllowed}
      nextMeal={nextMeal}
      onOpenNext={onOpenNext}
    />
  )
}

// D: the "Tonight" card with direct View recipe / Swap actions (Meal-D),
// plus a photo so every today card leads with the food. Swap opens the meal
// picker; a quick meal's main action opens its sheet (it has no recipe page).
function TodayCardD({ meal, label, onOpen, reason, onViewRecipe, onSwap, swapAllowed, nextMeal, onOpenNext }) {
  return (
    <div className="flex flex-col gap-2">
      <article {...todayData(meal, 'D')} className="flex flex-col gap-2 px-4 pt-3.5 pb-4 bg-surface border-2 border-primary rounded-2xl shadow-resting">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-black tracking-[0.08em] uppercase text-primary-hover">{eyebrow(meal)}</p>
          <p className="text-[13px] font-bold text-text-secondary">{label}</p>
        </div>
        {meal.isQuick ? (
          <QuickIcon className="w-14 h-14" iconSize={26} />
        ) : (
          <PhotoBox src={meal.imageUrl} alt={meal.title} className="w-full h-[160px] rounded-xl" iconSize={32} />
        )}
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={onOpen}
            aria-label={mealAriaLabel(meal)}
            className="text-left text-2xl font-black leading-tight rounded-sm focus-visible:outline-none focus-visible:shadow-ring-primary"
          >
            {meal.title}
          </button>
          <KindTag meal={meal} className="mt-1.5" />
        </div>
        {metaLine(meal) && (
          <p className="flex items-center gap-1.5 text-sm text-text-secondary">
            {!meal.isLeftover && meal.time && <Clock size={15} strokeWidth={2.2} aria-hidden="true" className="shrink-0" />}
            <span>{metaLine(meal)}</span>
          </p>
        )}
        {meal.rollover && reason}
        <div className="flex gap-2 mt-1.5">
          {!meal.unavailable && (meal.isQuick ? (
            <Button size="lg" className="flex-1" onClick={onOpen}>
              Details <ArrowRight size={18} strokeWidth={2.2} aria-hidden="true" />
            </Button>
          ) : (
            <Button size="lg" className="flex-1" onClick={() => onViewRecipe(meal)}>
              View recipe <ArrowRight size={18} strokeWidth={2.2} aria-hidden="true" />
            </Button>
          ))}
          {swapAllowed && (
            <Button size="lg" variant="secondary" onClick={() => onSwap(meal)} className={meal.unavailable ? 'flex-1' : ''}>
              <RefreshCw size={17} strokeWidth={2.2} aria-hidden="true" />
              Swap
            </Button>
          )}
          {meal.unavailable && (
            <Button size="lg" variant="secondary" className="flex-1" onClick={onOpen}>
              Options
            </Button>
          )}
        </div>
      </article>
      {nextMeal && (
        <button
          type="button"
          onClick={() => onOpenNext(nextMeal)}
          className="flex items-center gap-2 min-h-[44px] px-1 text-sm text-text-primary rounded-sm text-left focus-visible:outline-none focus-visible:shadow-ring-primary"
        >
          <span className="shrink-0 whitespace-nowrap font-bold text-text-secondary">Up next</span>
          <span className="min-w-0 truncate">
            {nextMeal.dayShort} {nextMeal.slot.toLowerCase()} · {nextMeal.isLeftover ? `leftover ${nextMeal.title}` : nextMeal.title}
          </span>
          <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-text-secondary" />
        </button>
      )}
    </div>
  )
}
