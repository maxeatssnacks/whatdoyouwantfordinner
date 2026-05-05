import { useState, useEffect, useMemo } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { DestructivePreview } from '../patterns/DestructivePreview'
import { cn, mealTypesMatch } from '../../lib/utils'

const FALLBACK_SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack']

function slotHasDinner(slots) {
  return slots.some((s) => s.toLowerCase() === 'dinner')
}

export function WeekSuggestSheet({
  open,
  onClose,
  onConfirm,
  mealSlots,
  currentEntries = [],
  isPending = false,
  subtitle,
}) {
  const slots = mealSlots && mealSlots.length > 0 ? mealSlots : FALLBACK_SLOTS

  const [selectedTypes, setSelectedTypes] = useState(() =>
    slotHasDinner(slots) ? [slots.find((s) => s.toLowerCase() === 'dinner')] : slots.slice(0, 1)
  )

  // Reset selection when slots change or sheet reopens
  useEffect(() => {
    if (!open) return
    setSelectedTypes((prev) => {
      const valid = prev.filter((t) => slots.includes(t))
      if (valid.length > 0) return valid
      return slotHasDinner(slots)
        ? [slots.find((s) => s.toLowerCase() === 'dinner')]
        : slots.slice(0, 1)
    })
  }, [slots, open])

  const toggleType = (slot) => {
    setSelectedTypes((prev) => {
      if (prev.includes(slot)) {
        if (prev.length === 1) return prev
        return prev.filter((t) => t !== slot)
      }
      return [...prev, slot]
    })
  }

  // Entries that will be replaced when Suggest runs
  const entriesToReplace = useMemo(() => {
    return currentEntries.filter((e) =>
      !e.is_leftover && selectedTypes.some((t) => mealTypesMatch(t, e.meal_type))
    )
  }, [currentEntries, selectedTypes])

  const replaceCount = entriesToReplace.length
  const targetCount = selectedTypes.length * 7

  const handleConfirm = () => {
    if (selectedTypes.length === 0 || isPending) return
    onConfirm(selectedTypes)
  }

  return (
    <Modal
      open={open}
      onClose={isPending ? () => {} : onClose}
      platform="mobile"
      title="Suggest my week"
      subtitle={subtitle}
      scrollable
      actions={
        <div className="flex gap-2.5 w-full">
          <Button
            platform="mobile"
            variant="ghost"
            onClick={onClose}
            disabled={isPending}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            platform="mobile"
            variant="primary"
            onClick={handleConfirm}
            disabled={selectedTypes.length === 0 || isPending}
            className="flex-[1.4]"
          >
            {isPending ? 'Suggesting…' : `Suggest ${targetCount} meals`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] text-text-secondary leading-[18px]">
          Pick which meal types to fill. We'll match recipes to your household.
        </p>

        <div className="flex flex-wrap gap-2">
          {slots.map((slot) => {
            const isSelected = selectedTypes.includes(slot)
            return (
              <button
                key={slot}
                type="button"
                onClick={() => toggleType(slot)}
                className={cn(
                  'px-3.5 py-1.5 rounded-pill border-[1.5px] text-[13px] font-bold capitalize',
                  'transition-all duration-fast ease-standard',
                  isSelected
                    ? 'bg-primary text-white border-primary'
                    : 'bg-transparent text-text-secondary border-border hover:border-border-hover',
                )}
              >
                {slot}
              </button>
            )
          })}
        </div>

        {replaceCount > 0 && (
          <DestructivePreview
            message={
              <>
                <span className="font-bold">Will replace {replaceCount} {replaceCount === 1 ? 'meal' : 'meals'}.</span>{' '}
                {entriesToReplace
                  .slice(0, 3)
                  .map((e) => e.recipe?.title)
                  .filter(Boolean)
                  .join(', ')}
                {replaceCount > 3 && `, +${replaceCount - 3} more`}
              </>
            }
          />
        )}
      </div>
    </Modal>
  )
}
