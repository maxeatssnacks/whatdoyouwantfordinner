import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

const FALLBACK_SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack']

function slotHasDinner(slots) {
  return slots.some((s) => s.toLowerCase() === 'dinner')
}

export function MealTypeSelector({ isOpen, onClose, onConfirm, mealSlots }) {
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
      open={isOpen}
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
                    ? 'border-amber-500 bg-amber-50'
                    : 'border-border bg-surface hover:border-amber-300'
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className={`font-display font-bold capitalize ${isSelected ? 'text-amber-900' : 'text-text-primary'}`}>
                      {slot}
                    </div>
                    <div className={`text-sm font-body ${isSelected ? 'text-amber-700' : 'text-text-secondary'}`}>
                      Fill {slot} slots for the week
                    </div>
                  </div>
                  <div className={`
                    w-6 h-6 rounded-full border-2 flex items-center justify-center
                    ${isSelected
                      ? 'border-amber-500 bg-amber-500'
                      : 'border-border'
                    }
                  `}>
                    {isSelected && (
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="secondary" onClick={onClose} className="flex-1">
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
