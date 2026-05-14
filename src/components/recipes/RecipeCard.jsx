import { Link } from 'react-router-dom'
import { Clock, ChefHat, Heart, Utensils } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { useToggleFavorite } from '../../hooks/useRecipes'
import { useAuth } from '../../hooks/useAuth'
import { MacrosBadge } from './MacrosBadge'
import { capitalize, stripHtml } from '../../lib/utils'

export function RecipeCard({ recipe, isFavorited = false, linkState = null }) {
  const { user } = useAuth()
  const toggleFavorite = useToggleFavorite()
  const descriptionPreview = stripHtml(recipe.description)

  const handleToggleFavorite = (e) => {
    e.preventDefault()
    e.stopPropagation()
    toggleFavorite.mutate({ recipeId: recipe.id, isFavorited })
  }

  return (
    <Link to={`/recipes/${recipe.id}`} state={linkState}>
      <div className="recipe-card h-full flex flex-col rounded-2xl p-4 border border-border">
        {/* Image */}
        <div className="relative w-full h-40 bg-gradient-to-br from-background to-surface rounded-xl overflow-hidden mb-4 border-2 border-border/50">
          {recipe.image_url ? (
            <img
              src={recipe.image_url}
              alt={recipe.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <Utensils size={56} className="text-primary/20 mb-2" strokeWidth={1.5} />
              <div className="text-xs text-text-secondary/50 font-body">No image</div>
            </div>
          )}

          {/* Favorite button */}
          <button
            onClick={handleToggleFavorite}
            className="absolute top-3 right-3 w-10 h-10 rounded-full bg-surface/95 backdrop-blur-sm flex items-center justify-center hover:bg-surface hover:scale-110 transition-all shadow-md"
          >
            <Heart
              size={20}
              className={isFavorited ? 'fill-primary text-primary' : 'text-text-secondary'}
            />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col">
          <h3 className="text-xl font-display font-bold text-text-primary mb-2 leading-tight">
            {recipe.title}
          </h3>

          {descriptionPreview && (
            <p className="text-sm text-text-secondary font-body mb-3 line-clamp-2 leading-relaxed">
              {descriptionPreview}
            </p>
          )}

          {/* Metadata */}
          <div className="flex flex-wrap gap-2 mb-3">
            {recipe.cuisine_type && (
              <Badge tone="secondary">{recipe.cuisine_type}</Badge>
            )}
            {recipe.meal_type && (
              <Badge tone="accent">{capitalize(recipe.meal_type)}</Badge>
            )}
          </div>

          {/* Footer */}
          <div className="mt-auto pt-3 border-t border-border/50">
            <div className="flex items-center justify-between mb-2 text-text-secondary text-sm">
              <div className="flex items-center gap-4">
                {(recipe.prep_time_minutes || recipe.cook_time_minutes) && (
                  <div className="flex items-center gap-1">
                    <Clock size={14} />
                    <span className="font-body">
                      {recipe.prep_time_minutes ? `${recipe.prep_time_minutes} prep` : ''}
                      {recipe.prep_time_minutes && recipe.cook_time_minutes ? ' · ' : ''}
                      {recipe.cook_time_minutes ? `${recipe.cook_time_minutes} cook` : ''}
                    </span>
                  </div>
                )}
                {recipe.difficulty && (
                  <div className="flex items-center gap-1">
                    <ChefHat size={14} />
                    <span className="font-body capitalize">{capitalize(recipe.difficulty)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Macros — recipe stores totals; divide by servings for per-serving display */}
            <MacrosBadge
              calories={recipe.calories != null ? Math.round(recipe.calories / (recipe.servings || 1)) : null}
              protein={recipe.protein_g != null ? Math.round((recipe.protein_g / (recipe.servings || 1)) * 10) / 10 : null}
              carbs={recipe.carbs_g != null ? Math.round((recipe.carbs_g / (recipe.servings || 1)) * 10) / 10 : null}
              fat={recipe.fat_g != null ? Math.round((recipe.fat_g / (recipe.servings || 1)) * 10) / 10 : null}
            />
          </div>
        </div>
      </div>
    </Link>
  )
}
