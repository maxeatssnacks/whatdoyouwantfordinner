import { useMemo, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Clipboard } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { posthog } from '../lib/posthog'
import { PageWrapper } from '../components/layout/PageWrapper'
import { ShoppingList } from '../components/shopping/ShoppingList'
import { ShoppingItemSheet } from '../components/shopping/ShoppingItemSheet'
import { TopAppBar } from '../components/ui/TopAppBar'
import { IconBtn } from '../components/ui/IconBtn'
import { useMealPlan } from '../hooks/usePlanner'
import { useHouseholdMembers } from '../hooks/useHouseholdMembers'
import { shoppingItemId, useWeekShoppingList } from '../hooks/useShoppingList'
import { usePackageSizeChoices, useSetPackageSize } from '../hooks/usePackageSizeChoices'
import { useCorrectOnHand } from '../hooks/useOnHandCorrections'
import { entryById } from '../v2/lib/packages'
import { answerByLabel, correctionRow, leftAnswer } from '../v2/lib/onHand'
import { useIsMobile } from '../hooks/useIsMobile'
import {
  getPlannerWeekStartDateString,
  formatLocalDateString,
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

  // Fresh meal plan on every visit, in the background: the cached one shows
  // meanwhile. (invalidateQueries refetches it; a second refetch() doubled it.)
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['mealPlan', user?.id, weekStartDate] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handleFocus = () => refetch()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [refetch])

  const { items, groupedItems, haveItems, mealsThisWeek, isLoading: listLoading, isShoppingReady, toggleItem, toggleHave, onHandNow } =
    useWeekShoppingList({
      mealPlan,
      weekStartDate,
      onToggled: (item) => posthog.capture('shopping_item_checked', { key: item.key ?? null, checked: !!item.checked }),
    })

  // ── Item sheet (v2 step 4): sizes and Already have
  const { data: sizeChoices } = usePackageSizeChoices()
  const setPackageSize = useSetPackageSize()
  const [sheetItemId, setSheetItemId] = useState(null)
  const sheetItem = sheetItemId ? items.find((i) => shoppingItemId(i) === sheetItemId) ?? null : null
  const chosenSize = (item) => {
    const choice = item?.key ? sizeChoices?.[item.key] : null
    return choice && choice.unit === (item.package?.unit ?? item.needUnit) ? choice.size : null
  }

  // "I need this" on a line that what's on hand covers (step 5d) means those
  // leftovers aren't there: it's saved as a "Used up" correction for today,
  // and the line comes back with its full package. Anything else toggles
  // Already have, as the person's choice. Rejects if the correction fails
  // (the sheet stays open and says so).
  const correctOnHand = useCorrectOnHand()
  const handleToggleHave = async (item) => {
    if (item.covered && item.have && item.key) {
      const entry = entryById(item.key)
      const now = onHandNow?.[item.key]
      const row = correctionRow(
        { correction: { key: item.key, unit: entry?.unit, packageAmount: now?.packageAmount ?? 0, inferred: now?.inferred ?? 0 } },
        'used_up',
        formatLocalDateString(new Date()),
        'shopping',
      )
      await correctOnHand.mutateAsync(row)
      if (item.haveSetByUser) toggleHave(item)
      posthog.capture('shopping_item_have_toggled', { key: item.key, have: false, staple: !!item.staple, covered: true })
      posthog.capture('on_hand_corrected', {
        key: item.key,
        answer: 'used_up',
        preselected: now?.packageAmount ? answerByLabel(leftAnswer(now.inferred, now.packageAmount))?.key ?? null : null,
        source: 'shopping',
      })
    } else {
      toggleHave(item)
      posthog.capture('shopping_item_have_toggled', { key: item.key ?? null, have: !item.have, staple: !!item.staple, covered: !!item.covered })
    }
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
  const handleCopied = (lines) => posthog.capture('shopping_list_copied', { lines })
  const handleCopy = async () => {
    const text = formatShoppingList(groupedItems)
    try {
      await navigator.clipboard.writeText(text)
      handleCopied(totalItemCount)
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
          <div className="fixed bottom-[var(--v2-nav-float,var(--v2-nav-clearance,96px))] left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-pill bg-text-primary text-background text-sm font-semibold font-body whitespace-nowrap shadow-elevated pointer-events-none transition-[bottom] duration-200 ease-out motion-reduce:transition-none">
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
            onOpenItem={(item) => setSheetItemId(shoppingItemId(item))}
            haveItems={haveItems}
            isLoading={shoppingListLoading}
            hideTitleAndCopy
          />
        </div>
        {itemSheet}
      </div>
    )
  }

  return (
    <PageWrapper className="pb-20 md:pb-0">
      <ShoppingList
        groupedItems={groupedItems}
        haveItems={haveItems}
        weekStartDate={weekStartDate}
        memberNames={memberNames}
        mealsThisWeek={mealsThisWeek}
        onToggleItem={toggleItem}
        onOpenItem={(item) => setSheetItemId(shoppingItemId(item))}
        onCopied={handleCopied}
        isLoading={shoppingListLoading}
      />
      {itemSheet}
    </PageWrapper>
  )
}
