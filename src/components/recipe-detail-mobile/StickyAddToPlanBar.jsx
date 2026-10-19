import { Calendar, Check } from 'lucide-react'
import { Button } from '../ui/Button'

export function StickyAddToPlanBar({
  onClick,
  label = 'Add to meal plan',
  disabled,
  pending,
  added,
  pendingLabel = 'Adding…',
  addedLabel = 'Added!',
}) {
  return (
    <div
      className="fixed left-0 right-0 z-30 bg-bg/95 backdrop-blur border-t border-border px-4 pt-3 pb-4 transition-[padding] duration-200 ease-out motion-reduce:transition-none"
      style={{
        // Docked to the bottom; the v2 shell's floating nav floats over this bar's
        // background, and the padding lifts the button clear of it. It follows
        // the nav down to the safe area when the nav slides away on scroll
        // (--v2-nav-float, src/v2/layout/appShell.css). Safe area only outside the shell.
        bottom: 0,
        paddingBottom: 'var(--v2-nav-float, var(--v2-nav-clearance, calc(env(safe-area-inset-bottom) + 12px)))',
      }}
      data-testid="sticky-add-bar"
    >
      <Button
        platform="mobile"
        variant={added ? 'secondary' : 'primary'}
        fullWidth
        disabled={disabled || pending || added}
        onClick={onClick}
        icon={added ? <Check size={16} strokeWidth={2.4} /> : <Calendar size={16} strokeWidth={2} />}
      >
        {added ? addedLabel : pending ? pendingLabel : label}
      </Button>
    </div>
  )
}
