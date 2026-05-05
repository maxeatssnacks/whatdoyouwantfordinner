import { useNavigate } from 'react-router-dom'
import { Clock, Utensils } from 'lucide-react'
import { capitalize, cn } from '../../lib/utils'

function MealCard({ entry, onClick }) {
  const recipe = entry.recipe
  if (!recipe) return null
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 w-[220px] bg-surface border border-border rounded-xl overflow-hidden text-left',
        'shadow-resting transition-all duration-fast ease-standard active:shadow-pressed-inset',
      )}
    >
      <div className="relative w-full h-24 bg-gradient-to-br from-background to-amber-50 overflow-hidden">
        {recipe.image_url ? (
          <img src={recipe.image_url} alt={recipe.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Utensils size={28} className="text-primary/25" strokeWidth={1.5} />
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-[10px] tracking-[1.2px] uppercase font-bold text-primary mb-1 truncate">
          {entry.dayLabel} · {capitalize(entry.meal_type ?? 'meal')}
        </p>
        <p className="font-display text-[14px] font-bold text-text-primary leading-tight line-clamp-2 mb-1.5">
          {recipe.title}
        </p>
        {recipe.cook_time_minutes != null && (
          <p className="text-[12px] text-text-secondary flex items-center gap-1 tabular-nums">
            <Clock size={11} strokeWidth={2} />
            <span className="font-semibold">{recipe.cook_time_minutes} min</span>
          </p>
        )}
      </div>
    </button>
  )
}

export function UpNextSection({ entries }) {
  const navigate = useNavigate()
  if (!entries?.length) return null

  return (
    <section>
      <h3 className="text-[11px] tracking-[1.4px] uppercase font-bold text-tertiary mb-2 px-1">
        Up next
      </h3>
      <div className="-mx-4 px-4 overflow-x-auto scrollbar-hidden">
        <div className="flex gap-3 pb-1">
          {entries.map((entry) => (
            <MealCard
              key={entry.id}
              entry={entry}
              onClick={() => entry.recipe && navigate(`/recipes/${entry.recipe.id}`)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
