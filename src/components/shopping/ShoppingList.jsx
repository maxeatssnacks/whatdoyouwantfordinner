import { useId, useState } from 'react'
import { Copy, Check, ChevronRight } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { cn, formatShoppingList, formatShoppingItemQuantity, CATEGORY_ORDER } from '../../lib/utils'

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const HAVE_PREVIEW = 3

// Rows and their buttons on phones: no text selection or callout from a quick
// double tap, no grey tap flash, no double-tap zoom swallowing a second tap.
const TAP = 'select-none touch-manipulation [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]'
// Hover only where there's a pointer that hovers (a tapped row mustn't stay
// lit); a short pressed state instead.
const PRESS = 'transition-colors [@media(hover:hover)]:hover:bg-surface-hover/80 active:bg-surface-hover'

// A group's card: the shared Card's resting look, without its hover lift. The
// lift (-translate-y-0.5) also sticks after a tap on touch screens, so every
// row in the group moved 2px between quick taps.
function ListCard({ className, children }) {
  return (
    <div className={cn('relative rounded-xl overflow-hidden bg-surface border border-border shadow-resting p-6', className)}>
      {children}
    </div>
  )
}

// The left side of a row: a real button (role="checkbox"), so a tap toggles on
// click with nothing hidden to focus or scroll to. Same box and name as the
// shared Checkbox; Space and Enter toggle.
function BoughtToggle({ item, displayName, onToggle }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={!!item.checked}
      onClick={() => onToggle?.(item)}
      className={cn('group flex flex-1 min-w-0 items-center gap-2 pl-2 pr-1 text-left cursor-pointer focus-visible:outline-none', TAP)}
      data-testid="shopping-toggle"
    >
      <span
        aria-hidden="true"
        className={cn(
          'w-5 h-5 rounded-sm border-2 flex items-center justify-center shrink-0 transition-colors',
          item.checked ? 'border-primary bg-primary' : 'border-border bg-surface',
          'group-focus-visible:shadow-ring-input',
        )}
      >
        {item.checked && <Check size={14} strokeWidth={3} className="text-white" />}
      </span>
      <span
        className={cn(
          'flex-1 min-w-0 text-sm font-body leading-tight truncate',
          item.checked ? 'text-text-secondary line-through opacity-50' : 'text-text-primary',
        )}
      >
        {displayName}
      </span>
    </button>
  )
}

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
        'shrink-0 max-w-[45%] min-w-[64px] self-stretch flex items-center justify-end px-3 text-xs font-body tabular-nums text-right leading-tight',
        'rounded-sm focus-visible:outline-none focus-visible:shadow-ring-input',
        TAP,
        PRESS,
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
          <div key={category} data-testid="shopping-category" data-category={category}>
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                {category}
              </h3>
              <span className="text-xs text-text-secondary opacity-60" data-testid="remaining-count">
                ({uncheckedCount} remaining)
              </span>
            </div>
            <ListCard>
              <div className="flex flex-col divide-y divide-border/40">
                {catItems.map((item) => {
                  const displayName = capitalize(item.name)

                  return (
                    <div
                      key={item.key || item.name}
                      className={cn('flex items-stretch min-h-[48px]', TAP, PRESS)}
                      data-testid="shopping-row"
                      data-key={item.key || ''}
                      data-name={displayName}
                    >
                      {/* The whole left side, at full row height, toggles bought. */}
                      <BoughtToggle item={item} displayName={displayName} onToggle={onToggleItem} />
                      <QuantityButton item={item} displayName={displayName} onOpen={onOpenItem} muted={item.checked} />
                    </div>
                  )
                })}
              </div>
            </ListCard>
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
              <ListCard className="mt-1.5">
                <div className="flex flex-col divide-y divide-border/40">
                  {haveItems.map((item) => {
                    const displayName = capitalize(item.name)
                    return (
                      <div key={item.key || item.name} className={cn('flex items-stretch min-h-[48px]', TAP)} data-testid="have-row" data-key={item.key || ''} data-name={displayName}>
                        <span className="flex-1 min-w-0 self-center pl-3 text-sm font-body leading-tight truncate text-text-secondary">
                          {displayName}
                        </span>
                        <QuantityButton item={item} displayName={displayName} onOpen={onOpenItem} muted />
                      </div>
                    )
                  })}
                </div>
              </ListCard>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
