import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Sheet } from '../../v2/components/Sheet'
import { Button } from '../../v2/components/Button'
import { InlineMessage } from '../../v2/components/week/bits'
import { choosePackage, entryById, formatInUnit, formatPackage, packageOptions } from '../../v2/lib/packages'
import { cn, formatShoppingItemQuantity } from '../../lib/utils'

const OPTION =
  'w-full min-h-[52px] flex items-center gap-3 px-3 py-2 rounded-xl border text-left ' +
  'focus-visible:outline-none focus-visible:shadow-ring-primary disabled:opacity-60'

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/**
 * One shopping list item (v2 step 4), from the right side of its row: what
 * the week needs and which meals use it, the sizes it's sold in with what
 * each leaves over (choosing one is remembered for this person; "Smallest
 * that fits" is the default), and "I already have this" / "I need this".
 * Items with no package entry get only the Already have action.
 */
export function ShoppingItemSheet({ item, chosenSize = null, onClose, onToggleHave, onChooseSize }) {
  const entry = item.key ? entryById(item.key) : null
  const canChoose = !!entry && entry.sizes.length > 0 && item.need != null
  const name = capitalize(item.name)
  const [busy, setBusy] = useState(null) // 'default' | size
  const [error, setError] = useState(null)

  const needText = entry && item.need != null
    ? formatInUnit(entry, item.need)
    : formatShoppingItemQuantity({ ...item, package: null })
  const leftText = (over) => (over > 0 ? `${formatInUnit(entry, over)} left over` : 'nothing left over')
  const smallest = canChoose ? choosePackage(entry, item.need) : null
  const options = canChoose ? packageOptions(entry, item.need) : []
  const inUse = options.some((o) => o.size.size === chosenSize) ? chosenSize : null

  const choose = async (size) => {
    if (size === inUse || busy) return
    setBusy(size ?? 'default')
    setError(null)
    try {
      await onChooseSize(item, size)
    } catch (err) {
      console.error('[ShoppingItemSheet] size choice failed:', err)
      setError('Couldn’t save that size. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const option = ({ id, selected, title, detail, onPick, pending }) => (
    <li key={id}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onPick}
        disabled={!!busy}
        className={cn(OPTION, selected ? 'border-primary-hover bg-primary-soft/40' : 'border-border bg-surface hover:bg-surface-hover')}
        data-testid="package-option"
        data-selected={selected}
      >
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="font-bold">{title}</span>
          <span className="text-[13px] text-text-secondary">{detail}</span>
        </span>
        {pending ? (
          <Loader2 size={18} aria-hidden="true" className="shrink-0 animate-spin text-text-secondary" />
        ) : selected ? (
          <Check size={18} strokeWidth={2.4} aria-hidden="true" className="shrink-0 text-primary-hover" />
        ) : null}
        {selected && <span className="sr-only">(in use)</span>}
      </button>
    </li>
  )

  return (
    <Sheet
      onClose={onClose}
      dismissible={!busy}
      eyebrow={item.have ? 'Already have' : 'Shopping list'}
      title={name}
      subtitle={`This week: ${needText || 'no amount given'}`}
      width={440}
      testId="shopping-item-sheet"
      footer={
        <Button
          variant={item.have ? 'primary' : 'secondary'}
          className="w-full"
          onClick={() => onToggleHave(item)}
          disabled={!!busy}
          data-testid="toggle-have"
        >
          {item.have ? 'I need this' : 'I already have this'}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-1">
        {item.meals?.length > 0 && (
          <p className="text-[15px]">
            <span className="font-bold">Used in: </span>
            {item.meals.join(', ')}
          </p>
        )}
        {item.staple && (
          <p className="text-sm text-text-secondary">Most kitchens keep this, so it starts in Already have.</p>
        )}

        {canChoose ? (
          <section aria-labelledby="package-sizes" className="flex flex-col gap-2">
            <h3 id="package-sizes" className="font-body text-sm font-bold text-text-secondary">Sizes</h3>
            <ul className="flex flex-col gap-2">
              {option({
                id: 'default',
                selected: inUse == null,
                title: 'Smallest that fits',
                detail: `${formatPackage(smallest)}, ${leftText(smallest.over)}`,
                onPick: () => choose(null),
                pending: busy === 'default',
              })}
              {options.map((o) => option({
                id: o.size.size,
                selected: inUse === o.size.size,
                title: o.size.label,
                detail: `${o.count > 1 ? `${o.text}, ` : ''}${leftText(o.over)}`,
                onPick: () => choose(o.size.size),
                pending: busy === o.size.size,
              }))}
            </ul>
            <p className="text-[13px] text-text-secondary">Your choice is used for {item.name} from now on.</p>
            {error && <InlineMessage>{error}</InlineMessage>}
          </section>
        ) : entry && entry.sizes.length > 0 ? (
          <p className="text-sm text-text-secondary">These amounts can’t be matched to a package size, so the list shows them as they are.</p>
        ) : null}
      </div>
    </Sheet>
  )
}
