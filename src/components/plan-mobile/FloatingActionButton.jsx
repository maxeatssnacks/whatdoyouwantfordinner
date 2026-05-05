import { Sparkles } from 'lucide-react'
import { cn } from '../../lib/utils'

export function FloatingActionButton({ onClick, disabled, label = 'Suggest my week' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'fixed right-4 z-30 inline-flex items-center gap-2 px-5 h-12 rounded-pill',
        'bg-primary text-white font-body font-bold text-[15px] tracking-[0.1px]',
        'shadow-elevated transition-all duration-fast ease-standard',
        'active:bg-primary-pressed active:shadow-button-pressed active:translate-y-px',
        'disabled:bg-[#E8D0BD] disabled:text-[#FFF2E4] disabled:shadow-none disabled:cursor-not-allowed',
      )}
      style={{ bottom: 'calc(80px + 16px + env(safe-area-inset-bottom))' }}
    >
      <Sparkles size={16} strokeWidth={2} />
      <span>{label}</span>
    </button>
  )
}
