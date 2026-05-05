import { useNavigate } from 'react-router-dom'
import { Utensils } from 'lucide-react'
import { cn } from '../../lib/utils'

function FavoriteCard({ recipe, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 w-[148px] bg-surface border border-border rounded-xl overflow-hidden text-left',
        'shadow-resting transition-all duration-fast ease-standard active:shadow-pressed-inset',
      )}
    >
      <div className="relative w-full h-[100px] bg-gradient-to-br from-background to-amber-50 overflow-hidden">
        {recipe.image_url ? (
          <img src={recipe.image_url} alt={recipe.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Utensils size={24} className="text-primary/25" strokeWidth={1.5} />
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="font-display text-[13px] font-bold text-text-primary leading-tight line-clamp-2">
          {recipe.title}
        </p>
      </div>
    </button>
  )
}

export function RecipesYouFavoritedSection({ recipes }) {
  const navigate = useNavigate()
  if (!recipes?.length) return null
  const display = recipes.slice(0, 6)

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2 px-1">
        <h3 className="text-[11px] tracking-[1.4px] uppercase font-bold text-tertiary">
          Recipes you favorited
        </h3>
        <button
          onClick={() => navigate('/recipes')}
          className="text-[12px] font-bold text-primary"
        >
          See all
        </button>
      </div>
      <div className="-mx-4 px-4 overflow-x-auto scrollbar-hidden">
        <div className="flex gap-2.5 pb-1">
          {display.map((recipe) => (
            <FavoriteCard
              key={recipe.id}
              recipe={recipe}
              onClick={() => navigate(`/recipes/${recipe.id}`)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
