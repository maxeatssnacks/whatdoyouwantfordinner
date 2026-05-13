import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

const FALLBACK_SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack']

function slotHasDinner(slots) {
  return slots.some((s) => s.toLowerCase() === 'dinner')
}

export function MealTypeSelector({ open, onClose, onConfirm, mealSlots }) {
  const slots = mealSlots && mealSlots.length > 0 ? mealSlots : FALLBACK_SLOTS

  const [selectedTypes, setSelectedTypes] = useState(() => {
    return slotHasDinner(slots)
      ? [slots.find((s) => s.toLowerCase() === 'dinner')]
      : slots.slice(0, 1)
  })

  // Reset selection when slots change
  useEffect(() => {
    setSelectedTypes((prev) => {
      const valid = prev.filter((t) => slots.includes(t))
      if (valid.length > 0) return valid
      return slotHasDinner(slots)
        ? [slots.find((s) => s.toLowerCase() === 'dinner')]
        : slots.slice(0, 1)
    })
  }, [slots])

  const toggleType = (slot) => {
    if (selectedTypes.includes(slot)) {
      if (selectedTypes.length === 1) return
      setSelectedTypes(selectedTypes.filter(t => t !== slot))
    } else {
      setSelectedTypes([...selectedTypes, slot])
    }
  }

  const handleConfirm = () => {
    if (selectedTypes.length === 0) return
    onConfirm(selectedTypes)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Which meals should I suggest?"
      width={672}
    >
      <div className="space-y-4">
        <p className="text-sm text-text-secondary font-body mb-4">
          Select the meal types you want to auto-fill. Unselected meal types will remain unchanged.
        </p>

        <div className="space-y-2">
          {slots.map((slot) => {
            const isSelected = selectedTypes.includes(slot)
            return (
              <button
                key={slot}
                onClick={() => toggleType(slot)}
                className={`
                  w-full p-4 rounded-xl border-2 text-left transition-all
                  ${isSelected
                    ? 'border-primary bg-accent-soft/40'
                    : 'border-border bg-surface hover:border-border-hover'
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-display font-bold capitalize text-text-primary">
                      {slot}
                    </div>
                    <div className="text-sm font-body text-text-secondary">
                      Fill {slot} slots for the week
                    </div>
                  </div>
                  <div className={`
                    w-6 h-6 rounded-full border-2 flex items-center justify-center
                    ${isSelected
                      ? 'border-primary bg-primary'
                      : 'border-border'
                    }
                  `}>
                    {isSelected && <Check size={14} className="text-white" />}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedTypes.length === 0}
            className="flex-1"
          >
            Suggest {selectedTypes.length} meal type{selectedTypes.length !== 1 ? 's' : ''}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
