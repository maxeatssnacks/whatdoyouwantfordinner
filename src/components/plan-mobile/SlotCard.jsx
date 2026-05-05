import { Clock } from 'lucide-react'
import { cn } from '../../lib/utils'

export function SlotCard({ mealType, entry, onClick }) {
  const recipe = entry?.recipe
  const isLeftover = !!entry?.is_leftover
  const isUnavailable = !recipe

  return (
    <button
      onClick={onClick}
      disabled={isUnavailable}
      className={cn(
        'w-full text-left bg-surface border border-border rounded-xl px-3.5 py-3',
        'transition-all duration-fast ease-standard',
        !isUnavailable && 'shadow-resting active:shadow-pressed-inset active:scale-[0.99]',
        isUnavailable && 'opacity-70 cursor-default',
      )}
    >
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[10px] tracking-[1.4px] uppercase font-bold text-primary">
          {mealType}
        </span>
        {isLeftover && (
          <span className="text-[10px] tracking-[0.8px] uppercase font-bold text-accent">
            ↩ Leftover
          </span>
        )}
      </div>
      <p className="font-display text-[14px] font-bold text-text-primary leading-[18px] line-clamp-2">
        {recipe?.title ?? 'Recipe unavailable'}
      </p>
      {recipe?.cook_time_minutes != null && (
        <div className="flex items-center gap-1 mt-1.5 text-text-secondary tabular-nums">
          <Clock size={11} strokeWidth={2} />
          <span className="text-[12px] font-semibold">{recipe.cook_time_minutes} min</span>
        </div>
      )}
    </button>
  )
}
