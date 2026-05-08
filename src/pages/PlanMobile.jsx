import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Sparkles, Utensils } from 'lucide-react'
import { TopAppBar } from '../components/ui/TopAppBar'
import { IconBtn } from '../components/ui/IconBtn'
import { Button } from '../components/ui/Button'
import { useMealPlan, useRecentMealHistory } from '../hooks/usePlanner'
import { useMealPlanSuggest } from '../hooks/useMealPlanSuggest'
import { useRecipes } from '../hooks/useRecipes'
import { useHouseholdMembers } from '../hooks/useHouseholdMembers'
import { useProfile } from '../hooks/useProfile'
import { useMealSlots } from '../hooks/useMealSlots'
import {
  getDaysOfWeek,
  getPlannerWeekStartDateString,
  formatLocalDateString,
  formatWeekRange,
  mealTypesMatch,
} from '../lib/utils'
import { LeftoverDetailModal } from '../components/planner/LeftoverDetailModal'
import { WeekHeader } from '../components/plan-mobile/WeekHeader'
import { DaySection } from '../components/plan-mobile/DaySection'
import { SlotCard } from '../components/plan-mobile/SlotCard'
import { EmptySlotCard } from '../components/plan-mobile/EmptySlotCard'
import { WeekSuggestSheet } from '../components/plan-mobile/WeekSuggestSheet'
import { PlannerSkeleton } from '../components/plan-mobile/PlannerSkeleton'

const DEFAULT_MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack']

export function PlanMobile() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const focusDay = searchParams.get('day') // YYYY-MM-DD or null

  const [currentWeekOffset, setCurrentWeekOffset] = useState(0)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [leftoverEntry, setLeftoverEntry] = useState(null)

  const weekStartDate = useMemo(
    () => getPlannerWeekStartDateString(currentWeekOffset),
    [currentWeekOffset]
  )
  const nextWeekDate = useMemo(
    () => getPlannerWeekStartDateString(currentWeekOffset + 1),
    [currentWeekOffset]
  )
  const days = useMemo(() => getDaysOfWeek(weekStartDate), [weekStartDate])
  const todayDate = formatLocalDateString(new Date())

  const { data: mealPlan, isLoading: planLoading } = useMealPlan(weekStartDate)
  const { data: nextWeekMealPlan } = useMealPlan(nextWeekDate)
  const { data: recipes } = useRecipes({}, 'accessible')
  const { data: householdMembers } = useHouseholdMembers()
  const { data: profile } = useProfile()
  const { data: recentRecipeIds } = useRecentMealHistory(profile?.recent_meal_filter_weeks || 2)
  const { data: mealSlotsData } = useMealSlots()

  const mealSlotNames = useMemo(
    () => (mealSlotsData && mealSlotsData.length > 0 ? mealSlotsData.map((s) => s.name) : DEFAULT_MEAL_TYPES),
    [mealSlotsData]
  )

  const activeMembers = useMemo(() => householdMembers ?? [], [householdMembers])

  const { suggest, isPending: isSuggesting } = useMealPlanSuggest({
    weekStartDate,
    nextWeekStartDate: nextWeekDate,
    recipes,
    recentRecipeIds,
    activeMembers,
    currentMealPlan: mealPlan,
    nextWeekMealPlan,
    days,
  })

  const entries = mealPlan?.entries ?? []
  const isEmpty = !planLoading && entries.length === 0

  // ── Day-section refs for scroll-to-day on mount ─────────────
  const dayRefs = useRef({})
  // Refs on the two sticky-chrome wrappers so we can measure their actual
  // rendered height at scroll time, instead of hardcoding an offset that
  // diverges from real chrome height (font metrics, viewport, dev-tools
  // emulation) and lands the day section clipped behind the WeekHeader.
  const topAppBarRef = useRef(null)
  const weekHeaderRef = useRef(null)

  const scrollToDay = useCallback((date) => {
    const el = dayRefs.current[date]
    if (!el) return
    // Measure on every call — sub-pixel rounding and any dynamic chrome
    // resize is reflected in the next scroll without rebuild.
    const chromeHeight =
      (topAppBarRef.current?.offsetHeight ?? 56) +
      (weekHeaderRef.current?.offsetHeight ?? 64) +
      8 // breathing room
    const targetY = el.getBoundingClientRect().top + window.scrollY - chromeHeight
    window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (!focusDay || planLoading) return
    // Two rAFs so we measure after the browser has applied the layout that
    // followed the planLoading → ready transition, not the frame that
    // queued it. Without this, the chrome refs occasionally measure 0 on
    // first paint and the scroll lands clipped.
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => scrollToDay(focusDay))
    })
    return () => {
      cancelAnimationFrame(outer)
      if (inner) cancelAnimationFrame(inner)
    }
  }, [focusDay, planLoading, scrollToDay])

  const handlePillTap = useCallback((date) => {
    scrollToDay(date)
    // Update URL so the focus state persists on refresh
    const next = new URLSearchParams(searchParams)
    next.set('day', date)
    setSearchParams(next, { replace: true })
  }, [scrollToDay, searchParams, setSearchParams])

  // ── Slot interactions ───────────────────────────────────────
  const handleEmptySlotTap = (day, mealType) => {
    navigate('/recipes', {
      state: {
        pendingSlot: {
          dayOfWeek: day.name,
          mealType,
          mealPlanId: mealPlan?.id,
          date: day.date,
          weekStartDate,
          nextWeekMealPlanId: nextWeekMealPlan?.id,
          numberOfPeople: Math.max(activeMembers.length, 1),
        },
      },
    })
  }

  const handleFilledSlotTap = (entry, day) => {
    if (!entry.recipe_id || !entry.recipe) return
    if (entry.is_leftover) {
      setLeftoverEntry(entry)
      return
    }
    navigate(`/recipes/${entry.recipe_id}`, {
      state: {
        mealPlanEntry: {
          id: entry.id,
          servings: entry.servings,
          mealPlanId: mealPlan?.id,
          dayOfWeek: entry.day_of_week,
          mealType: entry.meal_type,
          date: day.date,
        },
      },
    })
  }

  // ── Suggest sheet ───────────────────────────────────────────
  const handleConfirmSuggest = async (selectedTypes) => {
    const result = await suggest({ mealTypes: selectedTypes, bypassRecencyFilter: false })
    if (result.ok) {
      setSuggestOpen(false)
      return
    }
    switch (result.reason) {
      case 'no-recipes':
        alert('You need to add some recipes first!')
        return
      case 'no-user':
        alert('User not authenticated. Please refresh the page.')
        return
      case 'no-eligible-recipes':
        if (result.canBypassRecency) {
          if (window.confirm('All recipes have been used recently. Bypass the recency filter and suggest anyway?')) {
            const retry = await suggest({ mealTypes: selectedTypes, bypassRecencyFilter: true })
            if (retry.ok) setSuggestOpen(false)
            else if (retry.reason === 'error') alert(`Error suggesting meals: ${retry.error}`)
          }
        } else {
          alert('No eligible recipes found. Try adding more recipes!')
        }
        return
      case 'no-entries-generated':
        alert('Failed to generate meal plan entries. Please try again.')
        return
      case 'error':
        alert(`Error suggesting meals: ${result.error}`)
        return
      default:
        return
    }
  }

  const householdName = useMemo(() => {
    const primary = householdMembers?.find((m) => m.is_primary)
    if (!primary?.name) return null
    const size = householdMembers?.length || 1
    return `${primary.name}'s household · ${size} ${size === 1 ? 'person' : 'people'}`
  }, [householdMembers])

  return (
    <div className="min-h-screen bg-bg pb-24">
      {/* TopAppBar — sticky top */}
      <div ref={topAppBarRef} className="sticky top-0 z-30">
        {/* Spec calls for DatePickerToggle in leading; using ChevronLeft/Right split across leading/trailing with Sparkles — prev left, next+suggest right */}
        <TopAppBar
          titleFitContent
          title={formatWeekRange(weekStartDate)}
          leading={
            <IconBtn label="Previous week" onClick={() => setCurrentWeekOffset((o) => o - 1)}>
              <ChevronLeft size={20} strokeWidth={2} />
            </IconBtn>
          }
          trailing={
            <>
              <IconBtn label="Next week" onClick={() => setCurrentWeekOffset((o) => o + 1)}>
                <ChevronRight size={20} strokeWidth={2} />
              </IconBtn>
              <IconBtn label="Suggest my week" onClick={() => setSuggestOpen(true)}>
                <Sparkles size={20} strokeWidth={1.8} className="text-primary" />
              </IconBtn>
            </>
          }
        />
      </div>

      {/* Week pill row — sticky just below TopAppBar */}
      <div ref={weekHeaderRef} className="sticky top-14 z-25">
        <WeekHeader
          days={days}
          todayDate={todayDate}
          focusDate={focusDay}
          onPillTap={handlePillTap}
        />
      </div>

      {planLoading ? (
        <PlannerSkeleton days={days} slotCount={mealSlotNames.length} />
      ) : isEmpty ? (
        <EmptyPlanState
          householdSize={householdMembers?.length || 1}
          slotCount={mealSlotNames.length}
          canSuggest={!!recipes && recipes.length > 0}
          onSuggest={() => setSuggestOpen(true)}
        />
      ) : (
        <div>
          {days.map((day) => {
            const dayEntries = entries.filter((e) => e.day_of_week === day.name)
            return (
              <DaySection
                key={day.date}
                ref={(el) => { dayRefs.current[day.date] = el }}
                day={day}
                isToday={day.date === todayDate}
              >
                {mealSlotNames.map((mealType) => {
                  const entry = dayEntries.find((e) => mealTypesMatch(e.meal_type, mealType))
                  return entry ? (
                    <SlotCard
                      key={mealType}
                      mealType={mealType}
                      entry={entry}
                      onClick={() => handleFilledSlotTap(entry, day)}
                    />
                  ) : (
                    <EmptySlotCard
                      key={mealType}
                      mealType={mealType}
                      onClick={() => handleEmptySlotTap(day, mealType)}
                    />
                  )
                })}
              </DaySection>
            )
          })}
        </div>
      )}

      <WeekSuggestSheet
        open={suggestOpen}
        onClose={() => setSuggestOpen(false)}
        onConfirm={handleConfirmSuggest}
        mealSlots={mealSlotNames}
        currentEntries={entries}
        isPending={isSuggesting}
        subtitle={householdName ?? undefined}
      />

      {leftoverEntry && (
        <LeftoverDetailModal
          isOpen={!!leftoverEntry}
          onClose={() => setLeftoverEntry(null)}
          entry={leftoverEntry}
          allCurrentWeekEntries={entries}
          allNextWeekEntries={nextWeekMealPlan?.entries ?? []}
          days={days}
          householdSize={Math.max(householdMembers?.length || 0, 1)}
        />
      )}
    </div>
  )
}

function EmptyPlanState({ householdSize, slotCount, canSuggest, onSuggest }) {
  return (
    <div className="px-6 py-16 flex flex-col items-center text-center">
      <div className="w-20 h-20 rounded-pill bg-primary-tint flex items-center justify-center mb-5">
        <Utensils size={36} className="text-primary" strokeWidth={1.5} />
      </div>
      <h2 className="font-display text-[22px] font-bold text-text-primary mb-2 -tracking-[0.2px]">
        Let's plan this week
      </h2>
      <p className="text-[14px] text-text-secondary font-body leading-[20px] mb-6 max-w-[280px]">
        We'll fill {slotCount} meal {slotCount === 1 ? 'slot' : 'slots'} a day for your household of {householdSize}.
      </p>
      <Button
        platform="mobile"
        variant="primary"
        onClick={onSuggest}
        disabled={!canSuggest}
        icon={<Sparkles size={16} strokeWidth={2} />}
      >
        Suggest my week
      </Button>
      {!canSuggest && (
        <p className="text-[12px] text-text-secondary font-body mt-3">
          Add some recipes first to get suggestions.
        </p>
      )}
    </div>
  )
}
