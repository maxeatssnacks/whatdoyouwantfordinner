import { useMemo, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Clipboard } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { posthog } from '../lib/posthog'
import { PageWrapper } from '../components/layout/PageWrapper'
import { ShoppingList } from '../components/shopping/ShoppingList'
import { ShoppingItemSheet } from '../components/shopping/ShoppingItemSheet'
import { ShoppingTapLogPanel, useShoppingTapLog } from '../components/shopping/ShoppingTapLog'
import { useTapLog } from '../v2/variants/VariantsContext'
import { TopAppBar } from '../components/ui/TopAppBar'
import { IconBtn } from '../components/ui/IconBtn'
import { useMealPlan } from '../hooks/usePlanner'
import { useHouseholdMembers } from '../hooks/useHouseholdMembers'
import { shoppingItemId, useWeekShoppingList } from '../hooks/useShoppingList'
import { usePackageSizeChoices, useSetPackageSize } from '../hooks/usePackageSizeChoices'
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
    posthog.capture('shopping_list_opened')
  }, [])

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['mealPlan', user?.id, weekStartDate] })
    refetch()
  }, [])

  useEffect(() => {
    const handleFocus = () => refetch()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [refetch])

  // Internal tap log (variant panel flag; dev builds and admins only).
  const tapLog = useShoppingTapLog(useTapLog())

  const { items, groupedItems, haveItems, mealsThisWeek, isLoading: listLoading, isShoppingReady, toggleItem, toggleHave } =
    useWeekShoppingList({
      mealPlan,
      weekStartDate,
      onToggled: tapLog.logToggle,
    })

  // ── Item sheet (v2 step 4): sizes and Already have
  const { data: sizeChoices } = usePackageSizeChoices()
  const setPackageSize = useSetPackageSize()
  const [sheetItemId, setSheetItemId] = useState(null)
  const sheetItem = sheetItemId ? items.find((i) => shoppingItemId(i) === sheetItemId) ?? null : null
  const chosenSize = (item) => {
    const choice = item?.key ? sizeChoices?.[item.key] : null
    return choice && choice.unit === item.package?.unit ? choice.size : null
  }

  const handleToggleHave = (item) => {
    toggleHave(item)
    posthog.capture('shopping_item_have_toggled', { key: item.key ?? null, have: !item.have, staple: !!item.staple })
    setSheetItemId(null)
  }

  // size null = back to "Smallest that fits" (the stored choice is removed).
  const handleChooseSize = async (item, size) => {
    await setPackageSize.mutateAsync({ key: item.key, size, unit: item.package?.unit ?? item.needUnit })
    posthog.capture('shopping_package_size_changed', { key: item.key, size: size ?? 'default' })
  }

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

  const itemSheet = sheetItem ? (
    <ShoppingItemSheet
      key={sheetItemId}
      item={sheetItem}
      chosenSize={chosenSize(sheetItem)}
      onClose={() => setSheetItemId(null)}
      onToggleHave={handleToggleHave}
      onChooseSize={handleChooseSize}
    />
  ) : null

  if (isMobile) {
    return (
      <div className="min-h-screen">
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
          <div className="fixed bottom-[var(--v2-nav-clearance,96px)] left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-pill bg-text-primary text-background text-sm font-semibold font-body whitespace-nowrap shadow-elevated pointer-events-none">
            {toast}
          </div>
        )}

        <div className="px-4 pt-4" ref={tapLog.containerRef}>
          <ShoppingList
            groupedItems={groupedItems}
            weekStartDate={weekStartDate}
            memberNames={memberNames}
            mealsThisWeek={mealsThisWeek}
            onToggleItem={toggleItem}
            onOpenItem={(item) => setSheetItemId(shoppingItemId(item))}
            haveItems={haveItems}
            isLoading={shoppingListLoading}
            hideTitleAndCopy
          />
        </div>
        {itemSheet}
        {tapLog.logToggle && <ShoppingTapLogPanel entries={tapLog.entries} />}
      </div>
    )
  }

  return (
    <PageWrapper className="pb-20 md:pb-0">
      <div ref={tapLog.containerRef}>
        <ShoppingList
          groupedItems={groupedItems}
          haveItems={haveItems}
          weekStartDate={weekStartDate}
          memberNames={memberNames}
          mealsThisWeek={mealsThisWeek}
          onToggleItem={toggleItem}
          onOpenItem={(item) => setSheetItemId(shoppingItemId(item))}
          isLoading={shoppingListLoading}
        />
      </div>
      {itemSheet}
      {tapLog.logToggle && <ShoppingTapLogPanel entries={tapLog.entries} />}
    </PageWrapper>
  )
}
