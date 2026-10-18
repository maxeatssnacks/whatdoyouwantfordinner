import { ChevronRight } from 'lucide-react'
import { Sheet } from '../Sheet'

/** "+ Add a meal": that day's free slots; picking one opens the meal picker (PARITY ADD-1). */
export function AddMealSheet({ day, slots, onPick, onClose }) {
  return (
    <Sheet
      onClose={onClose}
      eyebrow={`${day.shortName} ${day.dayNum}`}
      title="Add a meal"
      subtitle="Pick a slot, then choose what to eat."
      width={420}
      testId="add-meal-sheet"
    >
      <ul className="flex flex-col gap-2 pb-1">
        {slots.map((slot) => (
          <li key={slot}>
            <button
              type="button"
              onClick={() => onPick(slot)}
              className="w-full min-h-[52px] px-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface text-left text-base font-bold hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-ring-primary"
            >
              {slot}
              <ChevronRight size={18} aria-hidden="true" className="text-text-secondary" />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
