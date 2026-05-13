import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { formatShoppingList, formatShoppingListItemAmount, CATEGORY_ORDER } from '../../lib/utils'

export function ShoppingList({
  groupedItems = {},
  weekStartDate,
  memberNames = [],
  mealsThisWeek = [],
  onToggleItem,
  isLoading,
  hideTitleAndCopy = false,
}) {
  const [copied, setCopied] = useState(false)

  const startDate = weekStartDate instanceof Date
    ? weekStartDate
    : weekStartDate
    ? new Date(weekStartDate + 'T00:00:00')
    : new Date()

  const handleCopyToClipboard = async () => {
    const text = formatShoppingList(groupedItems)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const hasItems = CATEGORY_ORDER.some(cat => (groupedItems[cat] || []).length > 0)

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          {!hideTitleAndCopy && (
            <h2 className="text-2xl font-display font-bold text-text-primary">
              Shopping List
            </h2>
          )}
          <p className="text-text-secondary font-body text-sm">
            Week of {startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          {memberNames.length > 0 && (
            <p className="text-text-secondary font-body text-sm mt-0.5">
              Cooking for: {memberNames.join(', ')}
            </p>
          )}
          {mealsThisWeek.length > 0 && (
            <p className="text-text-secondary font-body text-sm mt-1 leading-snug">
              <span className="font-semibold text-text-primary">Meals this week:</span>{' '}
              {mealsThisWeek.join(', ')}
            </p>
          )}
        </div>
        {!hideTitleAndCopy && (
          copied ? (
            <Button
              onClick={handleCopyToClipboard}
              variant="secondary"
              icon={<Check size={20} />}
            >
              Copied!
            </Button>
          ) : (
            <Button
              onClick={handleCopyToClipboard}
              variant="secondary"
              icon={<Copy size={20} />}
            >
              Copy to Clipboard
            </Button>
          )
        )}
      </div>

      {!hasItems && (
        <Card className="text-center py-12">
          <p className="text-text-secondary font-body text-lg">
            No recipes in your meal plan yet. Add some recipes to generate a shopping list!
          </p>
        </Card>
      )}

      {CATEGORY_ORDER.map(category => {
        const catItems = groupedItems[category] || []
        if (catItems.length === 0) return null

        const uncheckedCount = catItems.filter(i => !i.checked).length

        return (
          <div key={category}>
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                {category}
              </h3>
              <span className="text-xs text-text-secondary opacity-60">
                ({uncheckedCount} remaining)
              </span>
            </div>
            <Card className="p-0 overflow-hidden">
              <div className="divide-y divide-border/40">
                {catItems.map((item) => {
                  const amountStr = formatShoppingListItemAmount(item.amount, item.unit) || null
                  const displayName = item.name.charAt(0).toUpperCase() + item.name.slice(1)

                  return (
                    <Checkbox
                      key={item.name}
                      checked={item.checked}
                      onChange={() => onToggleItem?.(item.name)}
                      className="flex group pl-2 pr-3 py-1.5 hover:bg-surface-hover/80 transition-colors"
                    >
                      <span
                        className={`flex-1 min-w-0 text-sm font-body leading-tight truncate ${
                          item.checked
                            ? 'text-text-secondary line-through opacity-50'
                            : 'text-text-primary'
                        }`}
                      >
                        {displayName}
                      </span>
                      {amountStr ? (
                        <span
                          className={`text-xs font-body tabular-nums flex-shrink-0 max-w-[45%] text-right leading-tight ${
                            item.checked ? 'text-text-secondary opacity-50' : 'text-text-secondary'
                          }`}
                        >
                          {amountStr}
                        </span>
                      ) : null}
                    </Checkbox>
                  )
                })}
              </div>
            </Card>
          </div>
        )
      })}
    </div>
  )
}
