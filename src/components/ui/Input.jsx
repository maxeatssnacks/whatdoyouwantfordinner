import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

export const Input = forwardRef(({
  label,
  helper,
  error,
  state = 'default',
  platform = 'desktop',
  leadingIcon,
  className,
  id,
  type = 'text',
  ...props
}, ref) => {
  const isRequired = state === 'required'
  const isDisabled = state === 'disabled'
  const isError = !!error
  const inputId = id ?? (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined)

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-[13px] font-bold text-text-primary mb-1.5 tracking-[0.1px]"
        >
          {label}
          {isRequired && <span className="text-primary ml-1">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        {leadingIcon && (
          <span className="absolute left-3 w-[18px] h-[18px] text-tertiary inline-flex items-center justify-center pointer-events-none">
            {leadingIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          disabled={isDisabled || props.disabled}
          required={isRequired}
          className={cn(
            'w-full bg-surface border-[1.5px] rounded-sm',
            'text-text-primary text-[15px] outline-none',
            'transition-all duration-fast',
            'placeholder:text-tertiary',
            platform === 'mobile' ? 'h-12' : 'h-11',
            leadingIcon ? 'pl-9 pr-3.5' : 'px-3.5',
            isError
              ? 'border-error focus-visible:ring-2 focus-visible:ring-error'
              : 'border-border focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary',
            (isDisabled || props.disabled) && 'bg-[#F2E9DC] opacity-70 cursor-not-allowed',
            className,
          )}
          {...props}
        />
      </div>
      {(helper || isError) && (
        <div className={cn(
          'text-xs mt-1.5 leading-4 flex items-center gap-1.5',
          isError ? 'text-error' : 'text-text-secondary',
        )}>
          {isError && <ErrorDot />}
          {error || helper}
        </div>
      )}
    </div>
  )
})

Input.displayName = 'Input'

function ErrorDot() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0" fill="none" stroke="currentColor">
      <circle cx="6" cy="6" r="5.5" />
      <path d="M6 3v3.5M6 8.2v.3" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
