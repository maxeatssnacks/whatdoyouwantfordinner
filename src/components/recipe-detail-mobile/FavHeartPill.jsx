import { Heart } from 'lucide-react'
import { cn } from '../../lib/utils'

export function FavHeartPill({ active, onClick, disabled, className }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={active ? 'Remove from favorites' : 'Add to favorites'}
      aria-pressed={active}
      className={cn(
        'absolute bottom-3 right-3 z-10 w-11 h-11 rounded-pill',
        'bg-surface/95 backdrop-blur shadow-elevated border border-border/60',
        'flex items-center justify-center transition-all duration-fast ease-standard',
        'active:scale-[0.94]',
        disabled && 'opacity-60 pointer-events-none',
        className,
      )}
    >
      <Heart
        size={20}
        strokeWidth={active ? 0 : 2}
        className={active ? 'fill-primary text-primary' : 'text-text-secondary'}
      />
    </button>
  )
}
