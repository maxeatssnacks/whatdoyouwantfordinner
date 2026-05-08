import { useMemo, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Copy, Check } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { PageWrapper } from '../components/layout/PageWrapper'
import { ShoppingList } from '../components/shopping/ShoppingList'
import { TopAppBar } from '../components/ui/TopAppBar'
import { Button } from '../components/ui/Button'
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

  const uncheckedItemCount = useMemo(() => {
    let count = 0
    for (const cat of CATEGORY_ORDER) {
      const items = groupedItems[cat] || []
      for (const it of items) if (!it.checked) count++
    }
    return count
  }, [groupedItems])

  const [copied, setCopied] = useState(false)
  const handleMobileCopy = async () => {
    const text = formatShoppingList(groupedItems)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  if (isMobile) {
    return (
      <div className="min-h-screen bg-bg pb-[160px]">
        <div className="sticky top-0 z-30">
          {/* No trailing icon — empty overflow menus are worse UX than none; restore when a menu item exists (Flow 5 spec lists OverflowDots) */}
          <TopAppBar title="Shopping List" />
        </div>

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

        {/* Sticky Copy footer — sits above BottomTabBar (h-20 = 80px) */}
        {!shoppingListLoading && uncheckedItemCount > 0 && (
          <div
            className="fixed left-0 right-0 z-30 bg-bg/95 backdrop-blur border-t border-border px-4 pt-3 pb-4"
            style={{
              bottom: '80px',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
            }}
          >
            <Button
              platform="mobile"
              variant="primary"
              fullWidth
              onClick={handleMobileCopy}
              icon={copied ? <Check size={16} strokeWidth={2.4} /> : <Copy size={16} strokeWidth={2} />}
            >
              {copied ? 'Copied!' : `Copy ${uncheckedItemCount} ${uncheckedItemCount === 1 ? 'item' : 'items'} to clipboard`}
            </Button>
          </div>
        )}
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
