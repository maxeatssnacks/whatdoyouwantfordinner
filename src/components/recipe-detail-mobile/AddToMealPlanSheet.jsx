import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { DestructivePreview } from '../patterns/DestructivePreview'
import { cn, capitalize, mealTypesMatch } from '../../lib/utils'

const DAY_INITIALS = {
  sunday: 'S', monday: 'M', tuesday: 'T', wednesday: 'W',
  thursday: 'T', friday: 'F', saturday: 'S',
}

const DEFAULT_SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack']

export function AddToMealPlanSheet({
  open,
  onClose,
  onConfirm,
  recipe,
  days,
  entries,
  mealSlots,
  todayDate,
  isPending,
}) {
  const slots = mealSlots && mealSlots.length > 0 ? mealSlots : DEFAULT_SLOTS

  // Default selected day = today if it's in the visible week, else first day.
  const initialDay = useMemo(() => {
    if (!days?.length) return null
    const todayDay = days.find((d) => d.date === todayDate)
    return todayDay?.name ?? days[0].name
  }, [days, todayDate])

  const [selectedDay, setSelectedDay] = useState(initialDay)
  const [selectedMealType, setSelectedMealType] = useState(null)

  // Reset when the sheet reopens or the week changes
  useEffect(() => {
    if (open) {
      setSelectedDay(initialDay)
      setSelectedMealType(null)
    }
  }, [open, initialDay])

  const occupiedEntry = useMemo(() => {
    if (!selectedDay || !selectedMealType) return null
    return entries?.find(
      (e) =>
        e.day_of_week === selectedDay && mealTypesMatch(e.meal_type, selectedMealType)
    )
  }, [entries, selectedDay, selectedMealType])

  const handleConfirm = () => {
    if (!selectedDay || !selectedMealType || isPending) return
    onConfirm({
      dayOfWeek: selectedDay,
      mealType: selectedMealType,
      occupiedEntry: occupiedEntry || null,
    })
  }

  const dayEntries = useMemo(() => {
    if (!selectedDay) return []
    return entries?.filter((e) => e.day_of_week === selectedDay) ?? []
  }, [entries, selectedDay])

  return (
    <Modal
      open={open}
      onClose={isPending ? () => {} : onClose}
      platform="mobile"
      title="Add to meal plan"
      subtitle={recipe?.title}
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
            disabled={!selectedDay || !selectedMealType || isPending}
            className="flex-[1.4]"
          >
            {isPending ? 'Adding…' : 'Add to plan'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Week pill picker */}
        <div>
          <p className="text-[11px] tracking-[1.4px] uppercase font-bold text-tertiary mb-2">Day</p>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((day) => {
              const isSelected = day.name === selectedDay
              const isToday = day.date === todayDate
              const dayNum = day.displayDate.split(' ')[1]
              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => { setSelectedDay(day.name); setSelectedMealType(null) }}
                  className={cn(
                    'min-h-[44px] flex flex-col items-center justify-center rounded-md',
                    'transition-all duration-fast ease-standard active:scale-[0.95]',
                    isSelected
                      ? 'bg-primary text-white'
                      : isToday
                        ? 'bg-primary-tint text-primary'
                        : 'border border-border bg-surface text-text-secondary',
                  )}
                >
                  <span className="text-[10px] tracking-[1px] uppercase font-bold leading-none">
                    {DAY_INITIALS[day.name]}
                  </span>
                  <span className="font-display text-[14px] font-bold tabular-nums leading-none mt-0.5">
                    {dayNum}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Slot list for the selected day */}
        {selectedDay && (
          <div>
            <p className="text-[11px] tracking-[1.4px] uppercase font-bold text-tertiary mb-2">
              {capitalize(selectedDay)} slots
            </p>
            <ul className="space-y-2">
              {slots.map((slotType) => {
                const occupied = dayEntries.find((e) => mealTypesMatch(e.meal_type, slotType))
                const isSelected = selectedMealType === slotType
                return (
                  <li key={slotType}>
                    <button
                      type="button"
                      onClick={() => setSelectedMealType(slotType)}
                      className={cn(
                        'w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl',
                        'border-[1.5px] text-left transition-all duration-fast ease-standard',
                        isSelected
                          ? 'border-primary bg-primary-tint shadow-card-selected'
                          : occupied
                            ? 'border-border bg-surface'
                            : 'border-dashed border-border-hover bg-transparent',
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          'text-[10px] tracking-[1.4px] uppercase font-bold mb-0.5',
                          isSelected ? 'text-primary' : 'text-tertiary',
                        )}>
                          {slotType}
                        </p>
                        <p className={cn(
                          'font-body text-[13px] leading-[16px] truncate',
                          occupied ? 'text-text-primary font-semibold' : 'text-tertiary italic',
                        )}>
                          {occupied?.recipe?.title ?? `Empty — add ${slotType.toLowerCase()}`}
                        </p>
                      </div>
                      <span
                        aria-hidden="true"
                        className={cn(
                          'shrink-0 w-5 h-5 rounded-pill border-[1.5px] flex items-center justify-center',
                          isSelected
                            ? 'bg-primary border-primary text-white'
                            : 'border-border bg-surface',
                        )}
                      >
                        {isSelected && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                            <path d="M2 5.5L4.2 7.5 8.5 2.5" />
                          </svg>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Destructive preview when an occupied slot is selected */}
        {occupiedEntry?.recipe?.title && (
          <DestructivePreview
            message={
              <>
                <span className="font-bold">Will replace {occupiedEntry.recipe.title}</span>{' '}
                in {capitalize(selectedDay)}'s {String(selectedMealType).toLowerCase()}.
              </>
            }
          />
        )}
      </div>
    </Modal>
  )
}
