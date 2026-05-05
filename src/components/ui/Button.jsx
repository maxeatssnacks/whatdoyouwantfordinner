import { cn } from '../../lib/utils'

const sizeClasses = {
  mobile: {
    sm: 'h-9 px-4 text-sm gap-1.5',
    md: 'h-12 px-5 text-[15px] gap-2',
    lg: 'h-14 px-7 text-[17px] gap-2.5',
  },
  desktop: {
    sm: 'h-9 px-4 text-sm gap-1.5',
    md: 'h-11 px-5 text-[15px] gap-2',
    lg: 'h-[52px] px-7 text-[17px] gap-2.5',
  },
}

const variantClasses = {
  primary:
    'bg-primary text-white border-transparent shadow-resting ' +
    'hover:bg-primary-hover ' +
    'active:bg-primary-pressed active:shadow-button-pressed active:translate-y-px ' +
    'focus-visible:shadow-ring-primary ' +
    'disabled:bg-[#E8D0BD] disabled:text-[#FFF2E4] disabled:shadow-none disabled:cursor-not-allowed',
  secondary:
    'bg-secondary text-white border-transparent shadow-resting ' +
    'hover:bg-secondary-hover ' +
    'active:bg-[#3E5530] active:shadow-button-pressed active:translate-y-px ' +
    'focus-visible:shadow-ring-primary ' +
    'disabled:bg-[#CBD4C2] disabled:text-[#F3F5EE] disabled:shadow-none disabled:cursor-not-allowed',
  ghost:
    'bg-transparent text-primary border-primary ' +
    'hover:bg-surface-hover ' +
    'active:bg-[#EADBC4] active:text-primary-hover active:border-primary-hover active:shadow-button-pressed active:translate-y-px ' +
    'focus-visible:shadow-ring-primary ' +
    'disabled:text-[#C9B49D] disabled:border-[#E0CFBB] disabled:cursor-not-allowed',
  destructive:
    'bg-error text-white border-transparent shadow-resting ' +
    'hover:bg-error-hover ' +
    'active:bg-error-pressed active:shadow-button-pressed active:translate-y-px ' +
    'focus-visible:shadow-ring-error ' +
    'disabled:bg-[#E7C4BE] disabled:text-[#FFF1EF] disabled:shadow-none disabled:cursor-not-allowed',
}

export function Button({
  variant = 'primary',
  size = 'md',
  platform = 'desktop',
  state,
  icon,
  fullWidth,
  className,
  children,
  ...props
}) {
  return (
    <button
      data-state={state}
      className={cn(
        'inline-flex items-center justify-center font-bold tracking-[0.1px] whitespace-nowrap',
        'rounded-pill border-[1.5px]',
        'transition-all duration-fast ease-standard',
        'focus-visible:outline-none',
        sizeClasses[platform][size],
        variantClasses[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {icon && <span className="inline-flex w-4 h-4 shrink-0">{icon}</span>}
      {children}
    </button>
  )
}
