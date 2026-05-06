import { useState } from 'react'
import { ShoppingCart } from 'lucide-react'
import { Button } from '../ui/Button'
import { cn } from '../../lib/utils'

function scaleAmount(amount, scaleFactor) {
  if (!amount && amount !== 0) return amount
  const num = typeof amount === 'number' ? amount : parseFloat(amount)
  if (isNaN(num)) return amount
  const scaled = num * scaleFactor
  return Math.round(scaled * 100) / 100
}

function CheckMark() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5.5L4.2 7.5 8.5 2.5" />
    </svg>
  )
}

function IngredientRow({ ingredient, index, scaleFactor, checked, onToggle }) {
  // Three branches mirroring the desktop logic
  let qty = null
  let name = null

  if (ingredient && typeof ingredient === 'object') {
    const amt = scaleAmount(ingredient.amount, scaleFactor)
    qty = [amt, ingredient.unit].filter(Boolean).join(' ')
    name = ingredient.name
  } else if (typeof ingredient === 'string') {
    const match = ingredient.match(/^([\d./\s¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+\s*\w+)\s+(.+)$/)
    if (match) {
      qty = match[1].trim()
      name = match[2]
    } else {
      name = ingredient
    }
  } else {
    name = String(ingredient ?? '')
  }

  return (
    <li>
      <button
        onClick={() => onToggle(index)}
        className="w-full flex items-start gap-3 py-2 text-left transition-opacity active:opacity-70"
      >
        <span
          className={cn(
            'shrink-0 mt-0.5 w-5 h-5 rounded-md border-[1.5px] flex items-center justify-center',
            'transition-colors duration-fast',
            checked ? 'bg-primary border-primary text-white' : 'border-border bg-surface',
          )}
          aria-hidden="true"
        >
          {checked && <CheckMark />}
        </span>
        <span className={cn(
          'flex-1 font-body text-[14px] leading-[20px]',
          checked ? 'text-text-secondary line-through' : 'text-text-primary',
        )}>
          {qty && (
            <span className={cn('font-bold mr-1', !checked && 'text-primary')}>
              {qty}
            </span>
          )}
          <span>{name}</span>
        </span>
      </button>
    </li>
  )
}

export function IngredientsSection({ ingredients, scaleFactor = 1, isLoggedIn, onAddToShoppingList }) {
  const [checked, setChecked] = useState(() => new Set())

  const toggle = (index) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  if (!ingredients?.length) return null

  return (
    <section className="px-4 py-4 border-t border-border/60">
      <h2 className="font-display text-[18px] font-bold text-text-primary mb-2 -tracking-[0.2px]">
        Ingredients
        {scaleFactor !== 1 && (
          <span className="ml-2 text-[12px] font-body font-normal text-text-secondary tabular-nums">
            scaled × {Math.round(scaleFactor * 100) / 100}
          </span>
        )}
      </h2>
      <ul className="divide-y divide-border/40">
        {ingredients.map((ingredient, i) => (
          <IngredientRow
            key={i}
            ingredient={ingredient}
            index={i}
            scaleFactor={scaleFactor}
            checked={checked.has(i)}
            onToggle={toggle}
          />
        ))}
      </ul>
      {isLoggedIn && (
        <div className="mt-4">
          <Button
            platform="mobile"
            variant="primary"
            fullWidth
            onClick={onAddToShoppingList}
            icon={<ShoppingCart size={16} strokeWidth={2} />}
          >
            Add to shopping list
          </Button>
        </div>
      )}
    </section>
  )
}
