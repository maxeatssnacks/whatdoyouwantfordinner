import { Sparkles, ShoppingCart, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../lib/utils'

function QuickAction({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl',
        'bg-surface border border-primary/30 text-primary font-body',
        'transition-all duration-fast ease-standard',
        'active:bg-primary-tint active:shadow-pressed-inset',
      )}
    >
      <Icon size={20} strokeWidth={1.8} />
      <span className="text-[11px] font-bold tracking-[0.4px] uppercase">{label}</span>
    </button>
  )
}

export function QuickActionsRow({ onSuggest, suggestEnabled = true }) {
  const navigate = useNavigate()
  return (
    <div className="flex gap-2">
      <QuickAction icon={Sparkles} label="Suggest" onClick={suggestEnabled ? onSuggest : undefined} />
      <QuickAction icon={ShoppingCart} label="Shopping" onClick={() => navigate('/shopping')} />
      <QuickAction icon={Plus} label="Add recipe" onClick={() => navigate('/recipes', { state: { openModal: true } })} />
    </div>
  )
}
