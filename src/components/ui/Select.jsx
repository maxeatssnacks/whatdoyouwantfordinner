import { forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

export const Select = forwardRef(({
  label,
  error,
  options,
  placeholder,
  platform = 'desktop',
  className,
  children,
  id,
  ...props
}, ref) => {
  const isError = !!error
  const selectId = id ?? (label ? `select-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined)

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-[13px] font-bold text-text-primary mb-1.5 tracking-[0.1px]"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'w-full appearance-none bg-surface border-[1.5px] rounded-sm',
            'text-text-primary text-[15px] outline-none font-body',
            'transition-all duration-fast pr-9 pl-3.5',
            platform === 'mobile' ? 'h-12' : 'h-11',
            isError
              ? 'border-error focus-visible:ring-2 focus-visible:ring-error'
              : 'border-border focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary',
            className,
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))
            : children}
        </select>
        <ChevronDown
          size={16}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-tertiary pointer-events-none"
        />
      </div>
      {isError && (
        <p className="text-xs mt-1.5 leading-4 text-error">{error}</p>
      )}
    </div>
  )
})

Select.displayName = 'Select'
