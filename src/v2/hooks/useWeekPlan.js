import { useMemo } from 'react'
import { useMealPlan } from '../../hooks/usePlanner'
import { shiftWeek } from '../lib/week'

/**
 * The displayed week's plan plus its neighbours. Next week is needed for
 * cross-week leftovers (PARITY WK-3, LO-2); the previous week lets a leftover
 * find the meal it came from when that was cooked last week (LO-6).
 */
export function useWeekPlan(weekStart) {
  const prevWeek = shiftWeek(weekStart, -1)
  const nextWeek = shiftWeek(weekStart, 1)

  const current = useMealPlan(weekStart)
  const next = useMealPlan(nextWeek)
  const prev = useMealPlan(prevWeek)

  const entries = useMemo(() => current.data?.entries ?? [], [current.data])
  const allEntries = useMemo(
    () => [...(prev.data?.entries ?? []), ...entries, ...(next.data?.entries ?? [])],
    [prev.data, entries, next.data],
  )

  return {
    plan: current.data,
    nextPlan: next.data,
    prevPlan: prev.data,
    nextWeek,
    entries,
    allEntries,
    isLoading: current.isLoading,
    // Planning needs both neighbours (cross-week leftovers), not just this week.
    neighborsLoading: prev.isLoading || next.isLoading,
    isError: current.isError,
    isFetching: current.isFetching,
    refetch: current.refetch,
  }
}
