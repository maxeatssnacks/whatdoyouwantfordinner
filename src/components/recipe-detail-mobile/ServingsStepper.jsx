import { Minus, Plus, Users } from 'lucide-react'
import { cn } from '../../lib/utils'

export function ServingsStepper({ value, onChange, onSave, isDirty, isSaving, disabled }) {
  const dec = () => value > 1 && onChange(value - 1)
  const inc = () => onChange(value + 1)

  return (
    <div className={cn('flex items-center gap-2', disabled && 'opacity-40 pointer-events-none')}>
      <Users size={14} className="text-text-secondary" strokeWidth={2} />
      <span className="text-[13px] font-body font-semibold text-text-secondary">Serves</span>
      <button
        onClick={dec}
        disabled={value <= 1 || disabled}
        aria-label="Decrease servings"
        className={cn(
          'w-7 h-7 rounded-pill border-[1.5px] border-border bg-surface',
          'flex items-center justify-center text-text-primary',
          'transition-colors active:bg-surface-hover',
          'disabled:opacity-40 disabled:cursor-not-allowed',
        )}
      >
        <Minus size={12} strokeWidth={2} />
      </button>
      <span className="w-7 text-center font-display font-bold text-[15px] text-text-primary tabular-nums">
        {value}
      </span>
      <button
        onClick={inc}
        disabled={disabled}
        aria-label="Increase servings"
        className={cn(
          'w-7 h-7 rounded-pill border-[1.5px] border-border bg-surface',
          'flex items-center justify-center text-text-primary',
          'transition-colors active:bg-surface-hover',
          'disabled:opacity-40 disabled:cursor-not-allowed',
        )}
      >
        <Plus size={12} strokeWidth={2} />
      </button>
      {isDirty && onSave && (
        <button
          onClick={onSave}
          disabled={isSaving}
          className={cn(
            'ml-1 px-3 py-1 rounded-md bg-primary text-white text-[12px] font-body font-bold',
            'transition-colors active:bg-primary-pressed disabled:opacity-60',
          )}
        >
          {isSaving ? 'Saving…' : 'Update'}
        </button>
      )}
    </div>
  )
}
