import { cn } from '../../lib/utils'

export function RadioGroup({ label, value, onChange, options, name }) {
  const groupName = name ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : 'radio-group')

  return (
    <div>
      {label && (
        <label className="block text-[13px] font-bold text-text-primary mb-1.5 tracking-[0.1px]">
          {label}
        </label>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {options.map((opt) => {
          const isSelected = value === opt.value
          const inputId = `radio-${groupName}-${opt.value}`
          return (
            <label
              key={opt.value}
              htmlFor={inputId}
              className="flex items-center gap-2 cursor-pointer min-h-11"
            >
              {/* Visually hidden native input — keeps accessibility + form semantics */}
              <input
                type="radio"
                id={inputId}
                name={groupName}
                value={opt.value}
                checked={isSelected}
                onChange={() => onChange(opt.value)}
                className="sr-only"
              />
              <div
                className={cn(
                  'w-5 h-5 rounded-pill border-2 flex items-center justify-center shrink-0 transition-colors',
                  isSelected ? 'border-primary' : 'border-border',
                )}
              >
                {isSelected && (
                  <div className="w-2.5 h-2.5 rounded-pill bg-primary" />
                )}
              </div>
              <span className="text-[15px] font-body text-text-primary">{opt.label}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
