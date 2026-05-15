import { Link } from 'react-router-dom'
import { Sparkles, Utensils, Clock, ChefHat } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { capitalize } from '../../lib/utils'

/**
 * Two modes:
 *  - mode="no-plan"  → "Let's plan this week" + Suggest my week (FLOWS.md empty state)
 *  - mode="suggest" → shows the random suggestion + try-another / view-recipe (legacy "I have no idea" pattern)
 */
export function EmptyHero({ mode, suggestedRecipe, onTryAnother, canSuggest }) {
  if (mode === 'no-plan') {
    return (
      <div>
        <p className="text-[10px] tracking-[1.4px] uppercase font-bold text-tertiary mb-2 px-1">
          Tonight's dinner
        </p>
        <Card platform="mobile" state="resting">
          <div className="flex flex-col items-center text-center py-3">
            <div className="w-14 h-14 rounded-pill bg-primary-tint flex items-center justify-center mb-3">
              <Sparkles size={26} className="text-primary" strokeWidth={1.8} />
            </div>
            <h2 className="font-display text-[20px] font-bold text-text-primary mb-1 -tracking-[0.2px]">
              Not sure what's for dinner?
            </h2>
            <p className="text-[13px] text-text-secondary font-body leading-[20px] mb-4 max-w-[260px]">
              Tap Surprise me below — we'll suggest something.
            </p>
          </div>
        </Card>
      </div>
    )
  }

  // mode === 'suggest'
  return (
    <div>
      <p className="text-[10px] tracking-[1.4px] uppercase font-bold text-tertiary mb-2 px-1">
        How about this?
      </p>
      <Card platform="mobile" state="resting" className="!p-0">
        <div className="relative w-full h-40 bg-gradient-to-br from-background to-amber-50 overflow-hidden">
          {suggestedRecipe?.image_url ? (
            <img
              src={suggestedRecipe.image_url}
              alt={suggestedRecipe.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Utensils size={44} className="text-primary/20" strokeWidth={1.5} />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface/85 to-transparent" />
        </div>
        <div className="p-4">
          {suggestedRecipe ? (
            <>
              <h2 className="font-display text-[20px] font-bold text-text-primary leading-tight line-clamp-2 min-h-[2.5em] mb-2 -tracking-[0.2px]">
                {suggestedRecipe.title}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-text-secondary font-body text-[13px] min-h-[1.5em] mb-4 tabular-nums">
                {suggestedRecipe.cook_time_minutes != null && (
                  <span className="flex items-center gap-1.5">
                    <Clock size={13} strokeWidth={2} />
                    <span className="font-semibold">{suggestedRecipe.cook_time_minutes} min</span>
                  </span>
                )}
                {suggestedRecipe.difficulty && (
                  <span className="flex items-center gap-1.5">
                    <ChefHat size={13} strokeWidth={2} />
                    <span className="font-semibold">{capitalize(suggestedRecipe.difficulty)}</span>
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="font-display text-[18px] font-bold text-text-primary mb-3 -tracking-[0.2px]">
              No idea what to make tonight?
            </p>
          )}

          <div className="flex gap-2">
            {suggestedRecipe && (
              <Link to={`/recipes/${suggestedRecipe.id}`} className="flex-1">
                <Button platform="mobile" variant="primary" fullWidth>
                  Pick this one
                </Button>
              </Link>
            )}
            <Button
              platform="mobile"
              variant="ghost"
              onClick={onTryAnother}
              disabled={!canSuggest}
              className={suggestedRecipe ? '' : 'flex-1'}
              icon={<Sparkles size={14} strokeWidth={2} />}
            >
              {suggestedRecipe ? 'Try another' : 'Suggest one'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
