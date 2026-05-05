import { cn } from '../../lib/utils'

export function Card({ children, className, hover = false, ...props }) {
  return (
    <div
      className={cn(
        'bg-surface rounded-2xl p-6 shadow-resting',
        'border border-border/50',
        hover && 'hover:shadow-elevated transition-shadow duration-150 cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
