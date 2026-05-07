import { useMemo, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import { PageWrapper } from '../components/layout/PageWrapper'
import { ShoppingList } from '../components/shopping/ShoppingList'
import { useMealPlan } from '../hooks/usePlanner'
import { useHouseholdMembers } from '../hooks/useHouseholdMembers'
import { useWeekShoppingList } from '../hooks/useShoppingList'
import { getPlannerWeekStartDateString } from '../lib/utils'

export function ShoppingListPage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const weekStartDate = useMemo(() => getPlannerWeekStartDateString(0), [])

  const { data: mealPlan, isLoading: mealPlanLoading, refetch } = useMealPlan(weekStartDate)
  const { data: householdMembers } = useHouseholdMembers()

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['mealPlan', user?.id, weekStartDate] })
    refetch()
  }, [])

  useEffect(() => {
    const handleFocus = () => refetch()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [refetch])

  const { groupedItems, mealsThisWeek, isLoading: listLoading, isShoppingReady, toggleItem } =
    useWeekShoppingList({
      mealPlan,
      weekStartDate,
    })

  const memberNames = householdMembers?.map(m => m.name) || []

  const shoppingListLoading =
    mealPlanLoading ||
    listLoading ||
    (Boolean(mealPlan?.id) && !isShoppingReady)

  return (
    <PageWrapper className="pb-20 md:pb-0">
      <ShoppingList
        groupedItems={groupedItems}
        weekStartDate={weekStartDate}
        memberNames={memberNames}
        mealsThisWeek={mealsThisWeek}
        onToggleItem={toggleItem}
        isLoading={shoppingListLoading}
      />
    </PageWrapper>
  )
}
