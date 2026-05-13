import { useMemo, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Clipboard } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { PageWrapper } from '../components/layout/PageWrapper'
import { ShoppingList } from '../components/shopping/ShoppingList'
import { TopAppBar } from '../components/ui/TopAppBar'
import { IconBtn } from '../components/ui/IconBtn'
import { useMealPlan } from '../hooks/usePlanner'
import { useHouseholdMembers } from '../hooks/useHouseholdMembers'
import { useWeekShoppingList } from '../hooks/useShoppingList'
import { useIsMobile } from '../hooks/useIsMobile'
import {
  getPlannerWeekStartDateString,
  formatShoppingList,
  CATEGORY_ORDER,
} from '../lib/utils'

export function ShoppingListPage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isMobile = useIsMobile()
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

  const totalItemCount = useMemo(() => {
    let count = 0
    for (const cat of CATEGORY_ORDER) count += (groupedItems[cat] || []).length
    return count
  }, [groupedItems])

  const [toast, setToast] = useState('')
  const handleCopy = async () => {
    const text = formatShoppingList(groupedItems)
    try {
      await navigator.clipboard.writeText(text)
      setToast(`Copied ${totalItemCount} ${totalItemCount === 1 ? 'item' : 'items'}`)
      setTimeout(() => setToast(''), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="sticky top-0 z-30">
          {/* trailing has Clipboard copy IconBtn; Flow 5 spec lists OverflowDots — copy is more useful than an empty overflow menu in v1 */}
          <TopAppBar
            title="Shopping List"
            trailing={
              <IconBtn label="Copy shopping list" onClick={handleCopy}>
                <Clipboard size={20} strokeWidth={1.8} />
              </IconBtn>
            }
          />
        </div>

        {toast && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-pill bg-text-primary text-background text-sm font-semibold font-body whitespace-nowrap shadow-elevated pointer-events-none">
            {toast}
          </div>
        )}

        <div className="px-4 pt-4">
          <ShoppingList
            groupedItems={groupedItems}
            weekStartDate={weekStartDate}
            memberNames={memberNames}
            mealsThisWeek={mealsThisWeek}
            onToggleItem={toggleItem}
            isLoading={shoppingListLoading}
            hideTitleAndCopy
          />
        </div>
      </div>
    )
  }

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
