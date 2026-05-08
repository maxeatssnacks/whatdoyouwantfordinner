import { Check } from 'lucide-react'
import { cn } from '../../lib/utils'

export function Checkbox({ label, children, checked, onChange, disabled, className }) {
  const content =
    children ??
    (label && <span className="text-[15px] font-body text-text-primary">{label}</span>)

  return (
    <label
      className={cn(
        'inline-flex items-center gap-2 cursor-pointer',
        disabled && 'cursor-not-allowed opacity-40',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={!!checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="sr-only peer"
      />
      <span
        className={cn(
          'w-5 h-5 rounded-sm border-2 flex items-center justify-center shrink-0 transition-colors',
          checked ? 'border-primary bg-primary' : 'border-border bg-surface',
          'peer-focus-visible:shadow-ring-input',
        )}
      >
        {checked && <Check size={14} strokeWidth={3} className="text-white" />}
      </span>
      {content}
    </label>
  )
}
