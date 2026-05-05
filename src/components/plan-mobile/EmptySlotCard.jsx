import { Plus } from 'lucide-react'
import { cn } from '../../lib/utils'

export function EmptySlotCard({ mealType, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-3.5 py-3 rounded-xl',
        'border-[1.5px] border-dashed border-border-hover bg-transparent',
        'text-tertiary font-body text-[13px] font-semibold',
        'transition-all duration-fast ease-standard',
        'hover:border-primary/40 hover:text-primary hover:bg-primary-tint/30',
        'active:scale-[0.99]',
      )}
    >
      <Plus size={14} strokeWidth={2} />
      <span>Add {mealType.toLowerCase()}</span>
    </button>
  )
}
