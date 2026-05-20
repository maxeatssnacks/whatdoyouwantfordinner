import { Clock, ExternalLink } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { capitalize } from '../../lib/utils'

export function TitleBlock({ recipe, servings, stepper }) {
  const tags = [
    recipe.cuisine_type && { label: recipe.cuisine_type, tone: 'secondary' },
    ...(recipe.dietary_tags || []).map((t) => ({ label: t, tone: 'secondary' })),
  ].filter(Boolean)

  return (
    <div className="px-4 pt-5 pb-4">
      <h1 className="font-display text-[28px] font-bold text-text-primary leading-[1.15] -tracking-[0.3px] mb-2">
        {recipe.title}
      </h1>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {tags.map((tag, i) => (
            <Badge key={`${tag.label}-${i}`} tone={tag.tone} variant="outline">
              {tag.label}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-body text-text-secondary tabular-nums">
        {(recipe.prep_time_minutes > 0 || recipe.cook_time_minutes > 0) && (
          <span className="inline-flex items-center gap-1 font-semibold">
            <Clock size={13} strokeWidth={2} />
            {recipe.prep_time_minutes > 0 ? `Prep ${recipe.prep_time_minutes} min` : ''}
            {recipe.prep_time_minutes > 0 && recipe.cook_time_minutes > 0 ? ' · ' : ''}
            {recipe.cook_time_minutes > 0 ? `Cook ${recipe.cook_time_minutes} min` : ''}
          </span>
        )}
        {(recipe.prep_time_minutes > 0 || recipe.cook_time_minutes > 0 || recipe.servings) && servings && (
          <span className="text-text-secondary/40">·</span>
        )}
        {servings && (
          <span className="font-semibold">serves {servings}</span>
        )}
        {recipe.difficulty && (
          <>
            <span className="text-text-secondary/40">·</span>
            <span className="font-semibold">{capitalize(recipe.difficulty)}</span>
          </>
        )}
      </div>

      {stepper && (
        <div className="mt-3">
          {stepper}
        </div>
      )}

      {recipe.source_url && (
        <a
          href={recipe.source_url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 mt-3 text-[12px] font-body font-semibold text-primary"
        >
          <ExternalLink size={12} strokeWidth={2} />
          View original
        </a>
      )}
    </div>
  )
}
