import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

// v2 button: fills use primary-hover so white text passes contrast; every
// size meets the 44px tap target.
const VARIANTS = {
  primary: 'bg-primary-hover text-white hover:bg-primary-pressed disabled:opacity-50',
  secondary: 'bg-surface text-text-primary border border-border hover:bg-surface-hover disabled:text-tertiary',
  quiet: 'bg-transparent text-primary-hover hover:bg-surface-hover disabled:text-tertiary',
  danger: 'bg-error text-white hover:bg-error-hover disabled:opacity-60',
  dangerQuiet: 'bg-transparent text-error hover:bg-error-soft/60 disabled:opacity-60',
}

const SIZES = {
  md: 'min-h-[44px] px-4 text-[15px]',
  lg: 'min-h-[52px] px-5 text-base',
}

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', className, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-pill font-body font-bold',
        'focus-visible:outline-none focus-visible:shadow-ring-primary disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
})
