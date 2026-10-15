import { AlertCircle, Calendar, CalendarPlus, Mic, Plus, RotateCw, Users, X } from 'lucide-react'
import { Skeleton } from '../../../components/ui/Skeleton'
import { Button } from '../Button'
import { SampleTag } from './bits'

/** Household nudge (PARITY OB-4): shown while the household is just the primary member. */
export function HouseholdBanner({ onAdd, onDismiss }) {
  return (
    <div data-testid="household-banner" className="flex items-start gap-3 pl-4 pr-1 py-1.5 rounded-xl bg-warning-soft border border-border text-sm">
      <Users size={18} aria-hidden="true" className="mt-3 shrink-0 text-text-secondary" />
      <p className="flex-1 min-w-0 py-2.5 text-text-primary">
        <span className="font-bold">Cooking for more than you?</span>{' '}
        <span className="text-text-secondary">Add your household so portions and leftovers fit.</span>{' '}
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex min-h-[44px] -my-3 items-center font-bold text-primary-hover underline underline-offset-2 rounded-sm focus-visible:outline-none focus-visible:shadow-ring-primary"
        >
          Add someone
        </button>
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 w-11 h-11 rounded-pill flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface/60 focus-visible:outline-none focus-visible:shadow-ring-primary"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  )
}

/**
 * Empty week, Empty-A. "I'll pick meals myself" shows the days (ST-4). A past
 * week offers no planning (SG-4), just a way back and the days.
 */
export function EmptyWeek({ isPast, onPlan, onThisWeek, onFridge, onPickMyself }) {
  if (isPast) {
    return (
      <div data-testid="empty-week" className="flex flex-col items-center text-center gap-3 pt-10 pb-6 px-2">
        <span className="w-16 h-16 rounded-pill bg-surface-hover text-text-secondary flex items-center justify-center">
          <Calendar size={28} strokeWidth={2} aria-hidden="true" />
        </span>
        <h2 className="mt-1 font-display text-[28px] leading-tight font-bold">Nothing was planned</h2>
        <p className="max-w-[300px] text-[15px] leading-relaxed text-text-secondary">This week is over.</p>
        <div className="w-full max-w-[360px] flex flex-col gap-2.5 mt-4">
          <Button size="lg" onClick={onThisWeek}>Go to this week</Button>
          <Button variant="quiet" className="self-center" onClick={onPickMyself}>Show the days</Button>
        </div>
      </div>
    )
  }
  return (
    <div data-testid="empty-week" className="flex flex-col items-center text-center gap-3 pt-10 pb-6 px-2">
      <span className="w-16 h-16 rounded-pill bg-surface-hover text-primary-hover flex items-center justify-center">
        <CalendarPlus size={28} strokeWidth={2} aria-hidden="true" />
      </span>
      <h2 className="mt-1 font-display text-[28px] leading-tight font-bold">Nothing planned yet</h2>
      <p className="max-w-[300px] text-[15px] leading-relaxed text-text-secondary">
        We’ll pick meals that fit everyone’s targets. You can swap anything you don’t fancy.
      </p>
      <div className="w-full max-w-[360px] flex flex-col gap-2.5 mt-4">
        <Button size="lg" onClick={onPlan}>Plan my week</Button>
        <Button size="lg" variant="secondary" onClick={onFridge}>
          <Mic size={18} strokeWidth={2.2} aria-hidden="true" />
          Tell us what’s in the fridge
        </Button>
        <Button variant="quiet" className="self-center" onClick={onPickMyself}>I’ll pick meals myself</Button>
      </div>
    </div>
  )
}

/** Plan load failure (ST-6): a real error with retry, never an empty week. */
export function WeekError({ onRetry, retrying }) {
  return (
    <div role="alert" data-testid="week-error" className="flex flex-col items-center text-center gap-3 py-12 px-4">
      <span className="w-14 h-14 rounded-pill bg-error-soft text-error flex items-center justify-center">
        <AlertCircle size={26} aria-hidden="true" />
      </span>
      <h2 className="font-display text-2xl font-bold">We couldn’t load this week</h2>
      <p className="max-w-[300px] text-[15px] text-text-secondary">Check your connection and try again. Your plan is safe.</p>
      <Button className="mt-2" onClick={onRetry} disabled={retrying}>
        <RotateCw size={17} aria-hidden="true" className={retrying ? 'animate-spin' : ''} />
        {retrying ? 'Trying again…' : 'Try again'}
      </Button>
    </div>
  )
}

/** Loading skeleton per LOADING.md: mirrors the resolved day list, shimmering. */
export function WeekSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your week" className="flex flex-col gap-6 pt-2">
      {[2, 1, 1].map((cards, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton width={96} height={13} radius={6} />
          {Array.from({ length: cards }).map((_, j) => (
            <Skeleton key={j} width="100%" height={92} radius={16} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Stats-F: the weekly note (sample data only for now). */
export function StatsNote({ summary, hidden, onHide, onShow, onSeeWhat }) {
  if (hidden) {
    return (
      <div className="flex items-center justify-between gap-3 min-h-[48px] pl-4 pr-1 border border-dashed border-border rounded-2xl">
        <p className="text-sm text-text-secondary">Note hidden for this week.</p>
        <Button variant="quiet" onClick={onShow}>Show again</Button>
      </div>
    )
  }
  return (
    <section aria-label="This week so far" data-testid="stats-note" className="flex items-start gap-1 pl-4 pr-1 pt-3 pb-1 bg-secondary-soft rounded-2xl">
      <div className="flex-1 min-w-0 flex flex-col gap-0.5 pt-0.5">
        <SampleTag className="self-start mb-1" />
        <p className="text-[15px] leading-relaxed">
          This week finishes <strong>{summary.things} {summary.things === 1 ? 'thing' : 'things'}</strong> from last week,
          about <strong>${summary.dollars}</strong> of food. Protein’s on target <strong>{summary.proteinDays} of 7</strong> days.
        </p>
        <button
          type="button"
          onClick={onSeeWhat}
          className="self-start inline-flex items-center min-h-[44px] text-sm font-bold text-secondary-hover underline underline-offset-[3px] rounded-sm focus-visible:outline-none focus-visible:shadow-ring-primary"
        >
          See what gets used
        </button>
      </div>
      <button
        type="button"
        onClick={onHide}
        aria-label="Dismiss this note"
        className="shrink-0 w-11 h-11 rounded-pill flex items-center justify-center text-secondary-hover hover:bg-surface/60 focus-visible:outline-none focus-visible:shadow-ring-primary"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </section>
  )
}

/** Empty-D: nothing on hand to use up (sample data only for now). */
export function EmptyOnHand({ proteinDays, onSay, onAdd }) {
  return (
    <div className="flex flex-col gap-3">
      <section data-testid="empty-on-hand" className="flex flex-col gap-3 p-4 bg-surface border border-border rounded-2xl">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 shrink-0 rounded-xl bg-secondary-soft text-secondary-hover flex items-center justify-center">
            <RotateCw size={18} strokeWidth={2.4} aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="font-body text-base font-black leading-snug">Nothing to use up this week</h2>
            <p className="text-sm leading-relaxed text-text-secondary">Got anything in the fridge? Tell us and we’ll plan around it.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={onSay}>
            <Mic size={17} strokeWidth={2.2} aria-hidden="true" />Say what’s there
          </Button>
          <Button variant="secondary" className="flex-1" onClick={onAdd}>
            <Plus size={17} strokeWidth={2.2} aria-hidden="true" />Add items
          </Button>
        </div>
      </section>
      <p className="flex items-center gap-2 text-sm text-text-secondary">
        Protein on target {proteinDays} of 7 days <SampleTag />
      </p>
    </div>
  )
}
