import { cn } from '../../lib/utils'

const STRIPE_BG = `repeating-linear-gradient(
  45deg,
  #E8D9C8 0px,
  #E8D9C8 4px,
  #DFCCB6 4px,
  #DFCCB6 8px
)`

export function RecipePhotoPlaceholder({ className, style, children }) {
  return (
    <div
      aria-hidden={children ? undefined : 'true'}
      className={cn('relative w-full h-full', className)}
      style={{ backgroundImage: STRIPE_BG, ...style }}
    >
      {children}
    </div>
  )
}
