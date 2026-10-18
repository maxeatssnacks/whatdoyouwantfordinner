import { useId, useState } from 'react'
import { Copy, Check, ChevronRight } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { cn, formatShoppingList, formatShoppingItemQuantity, CATEGORY_ORDER } from '../../lib/utils'

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const HAVE_PREVIEW = 3

// The right side of a row: what to pick up (or the amounts, as before), as its
// own button that opens the item's sheet (sizes, Already have).
function QuantityButton({ item, displayName, onOpen, muted }) {
  const qty = formatShoppingItemQuantity(item)
  return (
    <button
      type="button"
      onClick={() => onOpen?.(item)}
      aria-label={`${displayName}${qty ? `, ${qty}` : ''}: sizes and Already have`}
      className={cn(
        'shrink-0 max-w-[45%] min-w-[44px] self-stretch flex items-center justify-end px-3 py-1.5 text-xs font-body tabular-nums text-right leading-tight',
        'rounded-sm hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-ring-input',
        item.package && !muted ? 'font-semibold text-text-primary' : 'text-text-secondary',
        muted && 'opacity-50',
      )}
      data-testid="shopping-qty"
      data-package={item.package ? 'true' : 'false'}
    >
      <span className="truncate">{qty || '…'}</span>
    </button>
  )
}

export function ShoppingList({
  groupedItems = {},
  haveItems = [],
  weekStartDate,
  memberNames = [],
  mealsThisWeek = [],
  onToggleItem,
  onOpenItem,
  isLoading,
  hideTitleAndCopy = false,
}) {
  const [copied, setCopied] = useState(false)
  const [haveOpen, setHaveOpen] = useState(false)
  const haveId = useId()

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

  const hasItems = haveItems.length > 0 || CATEGORY_ORDER.some(cat => (groupedItems[cat] || []).length > 0)
  const havePreview = haveItems.slice(0, HAVE_PREVIEW).map((i) => capitalize(i.name)).join(', ')
    + (haveItems.length > HAVE_PREVIEW ? ` +${haveItems.length - HAVE_PREVIEW}` : '')

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
              <div className="flex flex-col divide-y divide-border/40">
                {catItems.map((item) => {
                  const displayName = capitalize(item.name)

                  return (
                    <div
                      key={item.key || item.name}
                      className="flex items-center hover:bg-surface-hover/80 transition-colors"
                      data-testid="shopping-row"
                      data-key={item.key || ''}
                    >
                      <Checkbox
                        checked={item.checked}
                        onChange={() => onToggleItem?.(item)}
                        className="flex group flex-1 min-w-0 pl-2 py-1.5"
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
                      </Checkbox>
                      <QuantityButton item={item} displayName={displayName} onOpen={onOpenItem} muted={item.checked} />
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>
        )
      })}

      {/* Already have: quiet and collapsed; these don't count as remaining and aren't copied. */}
      {haveItems.length > 0 && (
        <div className="pt-2" data-testid="have-section">
          <button
            type="button"
            onClick={() => setHaveOpen((v) => !v)}
            aria-expanded={haveOpen}
            aria-controls={haveId}
            className="w-full flex items-center gap-2 py-1.5 text-left rounded-sm focus-visible:outline-none focus-visible:shadow-ring-input"
            data-testid="have-toggle"
          >
            <ChevronRight
              size={14}
              aria-hidden="true"
              className={cn('shrink-0 text-text-secondary transition-transform', haveOpen && 'rotate-90')}
            />
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-text-secondary">Already have</span>
            <span className="shrink-0 text-xs text-text-secondary opacity-60">({haveItems.length})</span>
            {!haveOpen && <span className="min-w-0 truncate text-xs text-text-secondary opacity-80">{havePreview}</span>}
          </button>
          <div id={haveId} hidden={!haveOpen}>
            {haveOpen && (
              <Card className="p-0 overflow-hidden mt-1.5">
                <div className="flex flex-col divide-y divide-border/40">
                  {haveItems.map((item) => {
                    const displayName = capitalize(item.name)
                    return (
                      <div key={item.key || item.name} className="flex items-center" data-testid="have-row" data-key={item.key || ''}>
                        <span className="flex-1 min-w-0 pl-3 py-1.5 text-sm font-body leading-tight truncate text-text-secondary">
                          {displayName}
                        </span>
                        <QuantityButton item={item} displayName={displayName} onOpen={onOpenItem} muted />
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
