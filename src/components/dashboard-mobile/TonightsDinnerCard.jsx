import { useNavigate } from 'react-router-dom'
import { Clock, Users, ChefHat, Utensils } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { capitalize } from '../../lib/utils'

export function TonightsDinnerCard({ entry }) {
  const navigate = useNavigate()
  const recipe = entry?.recipe
  if (!recipe) return null

  return (
    <div>
      <p className="text-[10px] tracking-[1.4px] uppercase font-bold text-tertiary mb-2 px-1">
        Tonight's dinner
      </p>
      <Card state="selected" platform="mobile" className="!p-0">
        <div className="relative w-full h-44 bg-gradient-to-br from-background to-amber-50 overflow-hidden">
          {recipe.image_url ? (
            <img
              src={recipe.image_url}
              alt={recipe.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Utensils size={48} className="text-primary/20" strokeWidth={1.5} />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface/85 to-transparent" />
        </div>

        <div className="p-4">
          <h2 className="font-display text-[22px] font-bold text-text-primary leading-tight line-clamp-2 mb-2 -tracking-[0.2px]">
            {recipe.title}
          </h2>

          <div className="flex flex-wrap items-center gap-3 text-text-secondary font-body text-[13px] mb-3 tabular-nums">
            {recipe.cook_time_minutes != null && (
              <span className="flex items-center gap-1.5">
                <Clock size={13} strokeWidth={2} />
                <span className="font-semibold">{recipe.cook_time_minutes} min</span>
              </span>
            )}
            {(entry.servings ?? recipe.servings) != null && (
              <span className="flex items-center gap-1.5">
                <Users size={13} strokeWidth={2} />
                <span className="font-semibold">
                  Serves {entry.servings ?? recipe.servings}
                </span>
              </span>
            )}
            {recipe.difficulty && (
              <span className="flex items-center gap-1.5">
                <ChefHat size={13} strokeWidth={2} />
                <span className="font-semibold">{capitalize(recipe.difficulty)}</span>
              </span>
            )}
          </div>

          {(recipe.cuisine_type || entry.is_leftover) && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {entry.is_leftover && (
                <Badge tone="accent" variant="soft">Leftovers</Badge>
              )}
              {recipe.cuisine_type && (
                <Badge tone="secondary" variant="soft">{recipe.cuisine_type}</Badge>
              )}
            </div>
          )}

          <Button
            platform="mobile"
            variant="primary"
            fullWidth
            onClick={() => navigate(`/recipes/${recipe.id}`)}
          >
            Start cooking
          </Button>
        </div>
      </Card>
    </div>
  )
}
