import { Calendar, Check } from 'lucide-react'
import { Button } from '../ui/Button'

export function StickyAddToPlanBar({
  onClick,
  label = 'Add to meal plan',
  disabled,
  pending,
  added,
}) {
  return (
    <div
      className="fixed left-0 right-0 z-30 bg-bg/95 backdrop-blur border-t border-border px-4 pt-3 pb-4"
      style={{
        // Sit above the BottomTabBar (h-20 = 80px) plus a small gap, with safe-area
        bottom: '80px',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
      }}
    >
      <Button
        platform="mobile"
        variant={added ? 'secondary' : 'primary'}
        fullWidth
        disabled={disabled || pending || added}
        onClick={onClick}
        icon={added ? <Check size={16} strokeWidth={2.4} /> : <Calendar size={16} strokeWidth={2} />}
      >
        {added ? 'Added!' : pending ? 'Adding…' : label}
      </Button>
    </div>
  )
}
