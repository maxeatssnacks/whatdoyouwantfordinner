import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { posthog } from '../../lib/posthog'
import { getDaysOfWeek, mealTypesMatch, normalizeMealType } from '../../lib/utils'
import { useAuth } from '../../hooks/useAuth'
import { useProfile } from '../../hooks/useProfile'
import { useRecipes } from '../../hooks/useRecipes'
import { useHouseholdMembers } from '../../hooks/useHouseholdMembers'
import { useMealSlots } from '../../hooks/useMealSlots'
import {
  useFillMealSlot,
  useMoveMealPlanEntry,
  useRecentMealHistory,
  useRemoveMealPlanEntry,
  useUpdateEntryServings,
} from '../../hooks/usePlanner'
import { useMealPlanSuggest } from '../../hooks/useMealPlanSuggest'
import { prefetchWeekShoppingList } from '../../hooks/useShoppingList'
import { packageSizeChoicesQuery } from '../../hooks/usePackageSizeChoices'
import { useWeekPlan } from '../hooks/useWeekPlan'
import { useCookingFor } from '../hooks/useCookingFor'
import { useSampleData, useVariant } from '../variants/VariantsContext'
import { VariantPanelTrigger } from '../variants/VariantPanel'
import { VoiceComingSoonSheet } from '../components/VoiceComingSoonSheet'
import {
  capitalizeDay,
  currentWeekStart,
  parseLocalDate,
  shiftWeek,
  shortDay,
  todayString,
  weekStartFor,
} from '../lib/week'
import {
  dayMeals,
  dayRangeLabel,
  entryDate,
  featuredMeal,
  freeSlots,
  leftoverOrigin,
  macrosLabel,
  planWeekIndex,
  timeLabel,
} from '../lib/weekModel'
import { canSwap, rankPickerRecipes } from '../lib/swap'
import { placeMeal } from '../lib/slotFill'
import { rolloverPreview, weekPreviewSummary } from '../lib/rolloverPreview'
import { WeekHeader } from '../components/week/WeekHeader'
import { CookingForCluster, CookingForSheet } from '../components/week/CookingFor'
import { DaySection, PastDaysRow } from '../components/week/DayList'
import { MealCard } from '../components/week/MealCard'
import { TodayCard } from '../components/week/TodayCard'
import { MealSheet } from '../components/week/MealSheet'
import { LeftoverSheet } from '../components/week/LeftoverSheet'
import { AddMealSheet } from '../components/week/AddMealSheet'
import { MealPicker } from '../components/week/MealPicker'
import { PlanWeekSheet } from '../components/week/PlanWeekSheet'
import {
  EmptyOnHand,
  EmptyWeek,
  HouseholdBanner,
  StatsNote,
  WeekError,
  WeekSkeleton,
} from '../components/week/States'

const DEFAULT_SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack']
// Same key as the v1 dashboard banner, so earlier dismissals still count.
const HOUSEHOLD_BANNER_KEY = 'household-setup-banner-dismissed'

function readFlag(key) {
  try {
    return window.localStorage.getItem(key) != null
  } catch {
    return false
  }
}

function writeFlag(key, on) {
  try {
    if (on) window.localStorage.setItem(key, '1')
    else window.localStorage.removeItem(key)
  } catch {
    // Not persisted; the in-memory state still applies.
  }
}

/**
 * v2 Week page (/dashboard): replaces the v1 Dashboard and Plan pages on
 * mobile and desktop. Acceptance criteria: design-system/v2/PARITY.md.
 */
export function Week() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  // ── Which week: ?day= wins (and switches week), then ?week=, then this week.
  const today = todayString()
  const thisWeek = currentWeekStart()
  const dayParam = parseLocalDate(params.get('day')) ? params.get('day') : null
  const weekStart = (dayParam && weekStartFor(dayParam)) || weekStartFor(params.get('week')) || thisWeek
  const isThisWeek = weekStart === thisWeek
  const isPastWeek = weekStart < thisWeek

  // ── Data
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const week = useWeekPlan(weekStart)
  const { data: recipes } = useRecipes({}, 'accessible')
  const { data: householdMembers, isLoading: membersLoading } = useHouseholdMembers()
  const { data: mealSlotsData } = useMealSlots()
  const recencyWeeks = profile?.recent_meal_filter_weeks || 2
  const { data: recentRecipeIds } = useRecentMealHistory(recencyWeeks)
  const cooking = useCookingFor(householdMembers, user?.id)

  // Once this week is on screen, load what the Shopping page needs (its saved
  // list and size choices), so going to List shows the list at once.
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!isThisWeek || week.isLoading || !user?.id) return
    prefetchWeekShoppingList(queryClient, user.id, thisWeek)
    queryClient.prefetchQuery(packageSizeChoicesQuery(user.id))
  }, [isThisWeek, week.isLoading, user?.id, thisWeek, queryClient])

  const fillSlot = useFillMealSlot()
  const removeEntry = useRemoveMealPlanEntry()
  const moveEntry = useMoveMealPlanEntry()
  const updateServings = useUpdateEntryServings()

  // ── Variants and sample data (internal; sample data is never on for regular users)
  const headerVariant = useVariant('weekHeader')
  const mealVariant = useVariant('mealCard')
  const todayVariant = useVariant('todayCard')
  const rolloverVariant = useVariant('rolloverSheet')
  const sample = useSampleData()

  const slotNames = useMemo(
    () => (mealSlotsData?.length ? mealSlotsData.map((s) => s.name) : DEFAULT_SLOTS),
    [mealSlotsData],
  )
  const planWeeks = useMemo(
    () => planWeekIndex([week.prevPlan, week.plan, week.nextPlan]),
    [week.prevPlan, week.plan, week.nextPlan],
  )
  const entries = week.entries

  const days = useMemo(
    () => getDaysOfWeek(weekStart).map((d) => ({
      ...d,
      dayNum: Number(d.date.slice(8)),
      shortName: shortDay(d.name),
      longName: capitalizeDay(d.name),
      isToday: d.date === today,
      isPast: d.date < today,
    })),
    [weekStart, today],
  )

  const buildMeal = useCallback((entry, slot, day) => {
    const recipe = entry.recipe
    const cookEntry = entry.is_leftover
      ? week.allEntries.find((e) => e.id === entry.original_entry_id) ?? null
      : null
    return {
      entry,
      recipe,
      slot: normalizeMealType(slot),
      date: day.date,
      dayName: day.name,
      dayShort: day.shortName,
      dayLong: day.longName,
      dayNum: day.dayNum,
      title: recipe?.title ?? 'Recipe unavailable',
      unavailable: !recipe,
      isLeftover: !!entry.is_leftover,
      isQuick: recipe?.recipe_type === 'quick',
      time: timeLabel(recipe),
      macros: macrosLabel(entry),
      origin: leftoverOrigin(cookEntry),
      cookEntry,
      cookDayLong: cookEntry ? capitalizeDay(cookEntry.day_of_week) : null,
      imageUrl: recipe?.image_url || null,
      rollover: sample ? rolloverPreview(entry, day.date) : null,
    }
  }, [week.allEntries, sample])

  const mealsByDay = useMemo(
    () => days.map((day) => dayMeals(entries, day.name, slotNames).map(({ entry, slot }) => buildMeal(entry, slot, day))),
    [days, entries, slotNames, buildMeal],
  )
  const allMeals = useMemo(() => mealsByDay.flat(), [mealsByDay])
  const visibleCount = allMeals.length

  const todayIdx = days.findIndex((d) => d.isToday)
  const featured = todayIdx >= 0 ? featuredMeal(mealsByDay[todayIdx]) : null
  const nextAfterFeatured = useMemo(() => {
    if (!featured) return null
    const rest = mealsByDay[todayIdx].slice(mealsByDay[todayIdx].indexOf(featured) + 1)
    return rest[0] ?? mealsByDay.slice(todayIdx + 1).flat()[0] ?? null
  }, [featured, mealsByDay, todayIdx])

  // Days-A: in this week, days before today collapse into one row; past weeks
  // collapse entirely; future weeks are fully expanded.
  const pastCount = isThisWeek ? Math.max(todayIdx, 0) : isPastWeek ? 7 : 0
  const pastDays = days.slice(0, pastCount)
  const pastMealCount = mealsByDay.slice(0, pastCount).reduce((n, m) => n + m.length, 0)

  // ── Per-week UI state
  const [ui, setUi] = useState({ week: weekStart, pastExpanded: false, pickMyself: false })
  if (ui.week !== weekStart) setUi({ week: weekStart, pastExpanded: false, pickMyself: false })
  const pastExpanded = ui.week === weekStart && ui.pastExpanded
  const pickMyself = ui.week === weekStart && ui.pickMyself
  const setPastExpanded = (v) => setUi((s) => ({ ...s, week: weekStart, pastExpanded: typeof v === 'function' ? v(s.pastExpanded) : v }))

  const [sheet, setSheet] = useState(null)
  const closeSheet = useCallback(() => setSheet(null), [])

  const [bannerDismissed, setBannerDismissed] = useState(() => readFlag(HOUSEHOLD_BANNER_KEY))
  const statsKey = `wdywfd.v2.statsHidden.${weekStart}`
  const [statsHiddenFor, setStatsHiddenFor] = useState({})
  const statsHidden = statsHiddenFor[weekStart] ?? readFlag(statsKey)

  // ── ?day=: scroll to the day, expanding collapsed past days first.
  const dayRefs = useRef({})
  const scrollToDay = useCallback((date) => {
    dayRefs.current[date]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  useEffect(() => {
    if (!dayParam || week.isLoading) return
    if (pastDays.some((d) => d.date === dayParam) && !pastExpanded) {
      setPastExpanded(true)
      return
    }
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => scrollToDay(dayParam))
    })
    return () => {
      cancelAnimationFrame(outer)
      if (inner) cancelAnimationFrame(inner)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayParam, week.isLoading, pastExpanded, weekStart])

  // ── Navigation
  const goWeek = (ws) => {
    setSheet(null)
    setParams(ws === thisWeek ? {} : { week: ws }, { replace: true })
    window.scrollTo({ top: 0 })
  }
  const onDayTap = (day) => {
    if (pastDays.some((d) => d.date === day.date)) setPastExpanded(true)
    setParams({ day: day.date }, { replace: true })
    requestAnimationFrame(() => requestAnimationFrame(() => scrollToDay(day.date)))
  }

  // ── Suggest (Plan my week). It never plans a day that has passed (SG-4):
  // today onward on this week, the whole week ahead, never a past week.
  // Leftovers of meals it won't replace (cooked before today, or last week)
  // stay, since that food exists.
  const planDays = useMemo(() => getDaysOfWeek(weekStart).filter((d) => d.date >= today), [weekStart, today])
  const { keepEntryIds, replaceableEntries } = useMemo(() => {
    const planDayNames = new Set(planDays.map((d) => d.name))
    const keepIds = new Set(entries.filter((e) => {
      if (!e.is_leftover) return false
      const cook = week.allEntries.find((c) => c.id === e.original_entry_id)
      return !!cook && !(cook.meal_plan_id === week.plan?.id && planDayNames.has(cook.day_of_week))
    }).map((e) => e.id))
    return {
      keepEntryIds: [...keepIds],
      replaceableEntries: entries.filter((e) => planDayNames.has(e.day_of_week) && !keepIds.has(e.id)),
    }
  }, [planDays, entries, week.allEntries, week.plan?.id])
  const { suggest } = useMealPlanSuggest({
    weekStartDate: weekStart,
    nextWeekStartDate: week.nextWeek,
    recipes,
    recentRecipeIds,
    activeMembers: cooking.activeMembers,
    currentMealPlan: week.plan,
    nextWeekMealPlan: week.nextPlan,
    days: planDays,
    keepEntryIds,
  })
  const canPlan = !isPastWeek && planDays.length > 0
  const planScopeNote = isThisWeek && todayIdx > 0
    ? `${todayIdx === 6 ? 'Plans today only' : 'Plans today to Saturday'}. Earlier days stay as they are.`
    : null
  const openPlan = () => {
    posthog.capture('suggest_week_tapped')
    setSheet({ type: 'plan' })
  }

  // ── Meal actions
  const viewRecipe = (meal) => {
    if (!meal.recipe) return
    navigate(`/recipes/${meal.recipe.slug || meal.recipe.id}`, {
      state: {
        mealPlanEntry: {
          id: meal.entry.id,
          servings: meal.entry.servings,
          mealPlanId: meal.entry.meal_plan_id,
          dayOfWeek: meal.entry.day_of_week,
          mealType: meal.entry.meal_type,
          date: meal.date,
        },
      },
    })
  }

  // ── Meal picker (add and swap; PARITY ADD-1, SW-1)
  // Puts a recipe, or a saved quick meal, in one slot under the leftover
  // rules in placeMeal; quick meals can go on more days of this week too.
  const putInSlot = async ({ day, slot, recipe, replace = null, alsoDays = [] }) => {
    if (!week.plan?.id) return { ok: false, error: 'Your week is still loading. Try again in a moment.' }
    const placement = placeMeal({
      recipe,
      people: cooking.people,
      dayOfWeek: day.name,
      mealType: slot,
      weekStart,
      today,
      currentEntries: entries,
      nextEntries: week.nextPlan?.entries ?? [],
      replaceEntryId: replace?.entry.id ?? null,
      currentPlanId: week.plan.id,
      nextPlanId: week.nextPlan?.id,
    })
    try {
      const entry = await fillSlot.mutateAsync({
        recipeId: recipe.id,
        mealType: slot,
        target: {
          replaceEntryId: replace?.entry.id ?? null,
          mealPlanId: week.plan.id,
          dayOfWeek: day.name,
          servings: placement.servings,
        },
        leftovers: placement.leftovers,
        extraDays: alsoDays.map((d) => ({ mealPlanId: week.plan.id, dayOfWeek: d.name })),
      })
      return { ok: true, entryId: entry.id }
    } catch (err) {
      console.error('[Week] fill slot failed:', err)
      if (err.partial) return { ok: true, entryId: err.entry?.id, partial: true }
      return {
        ok: false,
        error: replace
          ? 'Couldn’t swap this meal. It’s unchanged — please try again.'
          : 'Couldn’t add this meal. Please try again.',
      }
    }
  }

  // After a swap, the meal's sheet reopens with the result.
  const showSwapped = (replace, title, partial) => setSheet({
    type: 'meal',
    entryId: replace.entry.id,
    message: partial
      ? { tone: 'warning', text: `Swapped in ${title}, but its leftovers didn’t update. Check the next few days.` }
      : { tone: 'success', text: `Swapped in ${title}.` },
  })
  const showPartialAdd = (entryId, title) => setSheet({
    type: 'meal',
    entryId,
    message: { tone: 'warning', text: `Added ${title}, but not everything after it was saved. Check the next few days.` },
  })

  const pickSuggestion = async ({ day, slot, replace }, recipe) => {
    const result = await putInSlot({ day, slot, recipe, replace })
    if (!result.ok) return result
    if (replace) {
      posthog.capture('week_meal_swapped', { meal_type: normalizeMealType(slot), source: 'suggestion' })
      showSwapped(replace, recipe.title, result.partial)
    } else {
      posthog.capture('meal_slot_filled', { source: 'picker_suggestion' })
      if (result.partial) showPartialAdd(result.entryId, recipe.title)
      else setSheet(null)
    }
    return result
  }

  const addSimple = async ({ day, slot, replace }, { recipe, alsoDays }) => {
    const result = await putInSlot({ day, slot, recipe, replace, alsoDays })
    if (!result.ok) return result
    if (replace) {
      posthog.capture('week_meal_swapped', { meal_type: normalizeMealType(slot), source: 'simple' })
      if (alsoDays.length) posthog.capture('meal_slot_filled', { source: 'quick_meal', count: alsoDays.length })
      showSwapped(replace, recipe.title, result.partial)
    } else {
      posthog.capture('meal_slot_filled', { source: 'quick_meal', count: 1 + alsoDays.length })
      if (result.partial) showPartialAdd(result.entryId, recipe.title)
      else setSheet(null)
    }
    return result
  }

  const openSwap = (meal, from) => setSheet({ type: 'picker', mode: 'swap', entryId: meal.entry.id, from })
  const openEdit = (meal) => setSheet({ type: 'picker', mode: 'edit', entryId: meal.entry.id, from: 'meal' })

  const remove = async (meal) => {
    try {
      await removeEntry.mutateAsync(meal.entry.id)
      posthog.capture('week_meal_removed', {
        meal_type: normalizeMealType(meal.entry.meal_type),
        is_leftover: !!meal.entry.is_leftover,
      })
      return { ok: true }
    } catch (err) {
      console.error('[Week] remove failed:', err)
      return { ok: false, error: 'Couldn’t remove this meal. It’s still on your plan — please try again.' }
    }
  }

  // Leftover moves only go to free same-slot days after the cook day (LO-7).
  const moveTargets = (meal) => {
    const cookDate = meal.cookEntry ? entryDate(meal.cookEntry, planWeeks) : null
    const after = cookDate ?? meal.date
    return days.filter((d) =>
      d.name !== meal.dayName
      && d.date > after
      && !entries.some((e) => e.day_of_week === d.name && mealTypesMatch(e.meal_type, meal.entry.meal_type)),
    )
  }

  const moveLeftover = async (meal, day) => {
    try {
      await moveEntry.mutateAsync({ id: meal.entry.id, dayOfWeek: day.name })
      posthog.capture('week_leftover_moved', { meal_type: normalizeMealType(meal.entry.meal_type) })
      return { ok: true }
    } catch (err) {
      console.error('[Week] move leftover failed:', err)
      return { ok: false, error: 'Couldn’t move this leftover. It’s still on its day — please try again.' }
    }
  }

  // Removing a leftover also lowers the cook entry's servings by the number
  // of people eating (never below one round), unless the cook day is past (LO-6).
  const removeLeftover = async (meal) => {
    const result = await remove(meal)
    if (!result.ok) return result
    const cook = meal.cookEntry
    const cookDate = cook ? entryDate(cook, planWeeks) : null
    const cookIsPast = cookDate ? cookDate < today : false
    if (cook && !cookIsPast) {
      const people = cooking.people
      const current = cook.servings ?? cook.recipe?.servings ?? people
      try {
        await updateServings.mutateAsync({ id: cook.id, servings: Math.max(people, current - people) })
      } catch (err) {
        console.error('[Week] cook servings sync failed:', err)
      }
    }
    return { ok: true }
  }

  // "Choose from my recipes": Recipes in slot mode (ADD-2). When swapping it
  // carries the entry being replaced, so picking a recipe replaces that entry
  // instead of adding a second meal to the slot (ADD-9).
  const chooseFromRecipes = (day, slot, replace = null) => {
    navigate('/recipes', {
      state: {
        pendingSlot: {
          dayOfWeek: day.name,
          mealType: slot,
          mealPlanId: week.plan?.id,
          date: day.date,
          weekStartDate: weekStart,
          nextWeekMealPlanId: week.nextPlan?.id,
          numberOfPeople: cooking.people,
          ...(replace ? { replaceEntryId: replace.entry.id, replaceTitle: replace.title } : {}),
        },
      },
    })
  }

  const openMeal = (meal) => setSheet({ type: meal.isLeftover ? 'leftover' : 'meal', entryId: meal.entry.id })
  const sheetMeal = sheet?.entryId ? allMeals.find((m) => m.entry.id === sheet.entryId) ?? null : null

  // What the open picker is for: the day and slot, and the meal it replaces.
  const pickerTarget = useMemo(() => {
    if (sheet?.type !== 'picker') return null
    if (sheet.mode === 'add') {
      const day = days.find((d) => d.date === sheet.date)
      return day ? { day, slot: sheet.slot, replace: null } : null
    }
    if (!sheetMeal) return null
    const day = days.find((d) => d.date === sheetMeal.date)
    return day ? { day, slot: sheetMeal.slot, replace: sheetMeal } : null
  }, [sheet, sheetMeal, days])

  // Ranked once per open (and when the plan changes), never reshuffled.
  const pickerRanking = useMemo(() => {
    if (!pickerTarget || sheet?.mode === 'edit') return null
    return rankPickerRecipes({
      recipes: recipes ?? [],
      slot: pickerTarget.slot,
      activeMembers: cooking.activeMembers,
      recentRecipeIds: recentRecipeIds ?? [],
      excludeIds: entries.map((e) => e.recipe_id),
    })
  }, [pickerTarget, sheet?.mode, recipes, cooking.activeMembers, recentRecipeIds, entries])

  // "Also add to": other days of this week from today on with that slot free.
  // When swapping, the replaced meal's leftovers are about to go, so their
  // days count as free too.
  const pickerAlsoDays = pickerTarget
    ? days.filter((d) =>
      d.date >= today
      && d.date !== pickerTarget.day.date
      && !entries.some((e) =>
        e.day_of_week === d.name
        && mealTypesMatch(e.meal_type, pickerTarget.slot)
        && !(pickerTarget.replace && e.is_leftover && e.original_entry_id === pickerTarget.replace.entry.id)))
    : []

  const closePicker = () => setSheet(sheet?.from === 'meal' && sheetMeal ? { type: 'meal', entryId: sheetMeal.entry.id } : null)

  // ── Header bits
  const dinnerSlot = slotNames.find((s) => mealTypesMatch(s, 'dinner'))
  const summary = useMemo(() => {
    if (!isThisWeek) return visibleCount ? `${visibleCount} ${visibleCount === 1 ? 'meal' : 'meals'} planned` : 'Nothing planned yet'
    const toGo = allMeals.filter((m) => m.date >= today && (!dinnerSlot || mealTypesMatch(m.slot, dinnerSlot))).length
    const what = dinnerSlot ? (toGo === 1 ? 'dinner' : 'dinners') : (toGo === 1 ? 'meal' : 'meals')
    return `${Math.max(todayIdx, 0)} of 7 days done · ${toGo ? `${toGo} ${what} to go` : `no ${what} left to cook`}`
  }, [isThisWeek, visibleCount, allMeals, today, dinnerSlot, todayIdx])

  const headerDays = days.map((d, i) => ({ ...d, count: mealsByDay[i].length }))
  const primary = cooking.members.find((m) => m.is_primary)
  const householdLabel = primary
    ? `${primary.name}’s household · ${cooking.people} ${cooking.people === 1 ? 'person' : 'people'}${
        cooking.people < cooking.members.length ? ` of ${cooking.members.length}` : ''
      }`
    : undefined

  const showBanner = !bannerDismissed && !membersLoading && householdMembers?.length === 1 && !!householdMembers[0]?.is_primary
  const isEmpty = !week.isLoading && !week.isError && entries.length === 0 && !pickMyself

  // Sample-only weekly note / Empty-D
  const rollovers = allMeals.map((m) => m.rollover).filter(Boolean)
  const sampleSummary = sample ? weekPreviewSummary(weekStart, rollovers) : null

  const renderDay = (day, i) => {
    const meals = mealsByDay[i]
    const isFeaturedDay = day.isToday && featured
    const others = isFeaturedDay ? meals.filter((m) => m !== featured) : meals
    const slots = freeSlots(entries, day.name, slotNames)
    return (
      <DaySection
        key={day.date}
        ref={(el) => { dayRefs.current[day.date] = el }}
        day={day}
        isToday={day.isToday}
        variant={mealVariant}
        featured={isFeaturedDay ? (
          <TodayCard
            meal={featured}
            variant={todayVariant}
            onOpen={openMeal}
            onViewRecipe={viewRecipe}
            onSwap={(meal) => openSwap(meal, 'today')}
            swapAllowed={canSwap(featured.entry)}
            nextMeal={nextAfterFeatured}
            onOpenNext={openMeal}
          />
        ) : null}
        canAdd={slots.length > 0 && !!week.plan?.id}
        onAdd={() => setSheet({ type: 'add', date: day.date })}
      >
        {others.length > 0 ? others.map((meal) => (
          <MealCard key={meal.entry.id} meal={meal} variant={mealVariant} onOpen={openMeal} />
        )) : null}
      </DaySection>
    )
  }

  return (
    <div data-testid="week-page" className="mx-auto w-full max-w-[720px] px-4 md:px-6 pb-8">
      <WeekHeader
        variant={headerVariant}
        weekStart={weekStart}
        thisWeek={thisWeek}
        days={headerDays}
        focusDay={dayParam}
        summary={week.isLoading ? null : summary}
        todayName={isThisWeek && todayIdx >= 0 ? days[todayIdx].name : null}
        onPrev={() => goWeek(shiftWeek(weekStart, -1))}
        onNext={() => goWeek(shiftWeek(weekStart, 1))}
        onThisWeek={() => goWeek(thisWeek)}
        onDayTap={onDayTap}
        onPlan={canPlan ? openPlan : null}
        planDisabled={week.isLoading || week.isError || week.neighborsLoading}
        cookingFor={
          <CookingForCluster members={cooking.members} isEating={cooking.isEating} onOpen={() => setSheet({ type: 'cooking' })} />
        }
        variantTrigger={<VariantPanelTrigger />}
      />

      <div className="flex flex-col gap-5 mt-2">
        {showBanner && (
          <HouseholdBanner
            onAdd={() => navigate('/profile')}
            onDismiss={() => {
              writeFlag(HOUSEHOLD_BANNER_KEY, true)
              setBannerDismissed(true)
            }}
          />
        )}

        {week.isLoading ? (
          <WeekSkeleton />
        ) : week.isError ? (
          <WeekError onRetry={() => week.refetch()} retrying={week.isFetching} />
        ) : isEmpty ? (
          <EmptyWeek
            isPast={isPastWeek}
            onPlan={openPlan}
            onThisWeek={() => goWeek(thisWeek)}
            onFridge={() => setSheet({ type: 'voice', title: 'What’s in the fridge?', message: 'Telling us what’s in the fridge is coming soon.' })}
            onPickMyself={() => setUi({ week: weekStart, pastExpanded, pickMyself: true })}
          />
        ) : (
          <>
            {sample && visibleCount > 0 && (rollovers.length > 0 ? (
              <StatsNote
                summary={sampleSummary}
                hidden={statsHidden}
                onHide={() => { writeFlag(statsKey, true); setStatsHiddenFor((s) => ({ ...s, [weekStart]: true })) }}
                onShow={() => { writeFlag(statsKey, false); setStatsHiddenFor((s) => ({ ...s, [weekStart]: false })) }}
                onSeeWhat={() => {
                  const first = allMeals.find((m) => m.rollover)
                  if (first) openMeal(first)
                }}
              />
            ) : (
              <EmptyOnHand
                proteinDays={sampleSummary.proteinDays}
                onSay={() => setSheet({ type: 'voice', title: 'What’s in the fridge?', message: 'Telling us what’s in the fridge is coming soon.' })}
                onAdd={() => setSheet({ type: 'voice', title: 'Add items', message: 'Adding what’s on hand is coming soon.' })}
              />
            ))}

            {pastDays.length > 0 && (
              <div className="flex flex-col gap-5">
                <PastDaysRow
                  label={dayRangeLabel(pastDays)}
                  mealCount={pastMealCount}
                  expanded={pastExpanded}
                  onToggle={() => setPastExpanded((v) => !v)}
                  controlsId="past-days-panel"
                />
                <div id="past-days-panel" hidden={!pastExpanded} className="flex flex-col gap-5">
                  {pastExpanded && pastDays.map((day, i) => renderDay(day, i))}
                </div>
              </div>
            )}

            {days.slice(pastCount).map((day, i) => renderDay(day, i + pastCount))}
          </>
        )}
      </div>

      {sheet?.type === 'meal' && sheetMeal && (
        <MealSheet
          meal={sheetMeal}
          swapAllowed={canSwap(sheetMeal.entry)}
          rolloverVariant={rolloverVariant}
          initialMessage={sheet.message ?? null}
          onClose={closeSheet}
          onViewRecipe={viewRecipe}
          onSwap={(meal) => openSwap(meal, 'meal')}
          onEdit={openEdit}
          onRemove={remove}
        />
      )}
      {sheet?.type === 'leftover' && sheetMeal && (
        <LeftoverSheet
          meal={sheetMeal}
          moveTargets={moveTargets(sheetMeal)}
          onClose={closeSheet}
          onMove={moveLeftover}
          onRemove={removeLeftover}
        />
      )}
      {sheet?.type === 'add' && (() => {
        const day = days.find((d) => d.date === sheet.date)
        return day ? (
          <AddMealSheet
            day={day}
            slots={freeSlots(entries, day.name, slotNames)}
            onPick={(slot) => setSheet({ type: 'picker', mode: 'add', date: day.date, slot })}
            onClose={closeSheet}
          />
        ) : null
      })()}
      {sheet?.type === 'picker' && pickerTarget && (
        <MealPicker
          key={`${sheet.mode}-${sheet.entryId ?? sheet.date}-${pickerTarget.slot}`}
          mode={sheet.mode}
          day={pickerTarget.day}
          slot={pickerTarget.slot}
          current={pickerTarget.replace}
          ranking={pickerRanking ?? undefined}
          suggestionsLoading={!recipes}
          alsoDays={pickerAlsoDays}
          onPickRecipe={(recipe) => pickSuggestion(pickerTarget, recipe)}
          onChooseFromRecipes={() => chooseFromRecipes(pickerTarget.day, pickerTarget.slot, pickerTarget.replace)}
          onAddSimple={(input) => addSimple(pickerTarget, input)}
          onSaveEdit={({ count }) => setSheet({
            type: 'meal',
            entryId: sheet.entryId,
            message: { tone: 'success', text: count > 1 ? `Saved. Updated all ${count} times it’s planned.` : 'Saved.' },
          })}
          onClose={closePicker}
        />
      )}
      {sheet?.type === 'plan' && (
        <PlanWeekSheet
          slots={slotNames}
          entries={replaceableEntries}
          scopeNote={planScopeNote}
          householdLabel={householdLabel}
          recencyWeeks={recencyWeeks}
          onRun={suggest}
          onClose={closeSheet}
          onGoToRecipes={() => navigate('/recipes')}
        />
      )}
      {sheet?.type === 'cooking' && (
        <CookingForSheet
          members={cooking.members}
          isEating={cooking.isEating}
          onToggle={cooking.toggle}
          onAddSomeone={() => navigate('/profile')}
          onClose={closeSheet}
        />
      )}
      {sheet?.type === 'voice' && (
        <VoiceComingSoonSheet onClose={closeSheet} title={sheet.title} message={sheet.message} />
      )}
    </div>
  )
}
