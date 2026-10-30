import { useCallback, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useProfile } from '../../hooks/useProfile'
import { useRecipes } from '../../hooks/useRecipes'
import { useHouseholdMembers } from '../../hooks/useHouseholdMembers'
import { useRecentMealHistory } from '../../hooks/usePlanner'
import { formatLocalDateString } from '../../lib/utils'
import { onHandRowsFor } from '../lib/mealChanges'
import { addDays, withAdjustment } from '../lib/onHand'
import { weekStartOf } from '../lib/voice/dates'
import { useCookingFor } from './useCookingFor'

// Weeks of meal history the Week page reads for "cooked longest ago" (6b2).
const HISTORY_WEEKS = 8

const lastDays = (meals) => {
  const map = new Map()
  for (const m of meals ?? []) if (!(map.get(m.recipe_id) >= (m.date ?? ''))) map.set(m.recipe_id, m.date ?? '')
  return map
}

/**
 * What a voice meal change needs to pick and place meals as the Week page
 * would (7b): the recipes, who's eating (the session's Cooking for), recent
 * and last-cooked days, and on-hand for the swaps' ranking. Mounted only
 * while the voice sheet or Review is open.
 * → { ready, build({ today, onHandRaw: { [weekStart]: raw read }, adjustments }) → ctx }
 *   adjustments: correction rows this batch saved (they count for the ranking).
 */
export function useMealChangeContext() {
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const { data: recipes } = useRecipes({}, 'accessible')
  const { data: householdMembers } = useHouseholdMembers()
  const cooking = useCookingFor(householdMembers, user?.id)
  const recencyWeeks = profile?.recent_meal_filter_weeks || 2
  const { data: history } = useRecentMealHistory(Math.max(HISTORY_WEEKS, recencyWeeks))

  const recent = useMemo(() => {
    if (!history) return null
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - recencyWeeks * 7)
    const from = formatLocalDateString(cutoff)
    return lastDays(history.filter((m) => m.week_start >= from))
  }, [history, recencyWeeks])
  const lastCooked = useMemo(() => (history ? lastDays(history) : null), [history])

  const build = useCallback(({ today, onHandRaw = {}, adjustments = [] } = {}) => {
    const thisWeek = weekStartOf(today)
    return {
      today,
      people: cooking.people,
      activeMembers: cooking.activeMembers,
      recipes: recipes ?? [],
      recent,
      lastCooked,
      // On hand for this week and next only, from today on (as the picker).
      onHandFor: (weekStart, model, date) => {
        if (date < today || (weekStart !== thisWeek && weekStart !== addDays(thisWeek, 7))) return null
        const raw = onHandRaw[weekStart]
        if (!raw) return null
        const withRows = adjustments.reduce((rows, row) => withAdjustment(rows, row), raw.adjustments ?? [])
        return onHandRowsFor({ ...raw, adjustments: withRows }, model, weekStart)
      },
    }
  }, [cooking.people, cooking.activeMembers, recipes, recent, lastCooked])

  return { ready: !!recipes && !!householdMembers, build }
}
