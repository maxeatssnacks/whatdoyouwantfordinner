import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useProfile } from '../../hooks/useProfile'
import { cn } from '../../lib/utils'
import { SegmentedControl } from '../components/SegmentedControl'
import { VARIANT_PARTS } from './config'
import { useVariantControls } from './VariantsContext'

// Internal tool for trying design options in the real app. Visible in dev
// builds, or in production to admins only. Regular users never see it.
export function VariantPanel() {
  const { data: profile } = useProfile()
  const visible = import.meta.env.DEV || profile?.is_admin === true
  const [open, setOpen] = useState(false)

  if (!visible) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Design variants"
        title="Design variants"
        className={cn(
          'fixed right-0 top-1/2 -translate-y-1/2 z-40 w-11 h-11 rounded-l-pill',
          'flex items-center justify-center bg-text-primary/80 text-surface shadow-elevated',
          'hover:bg-text-primary focus-visible:outline-none focus-visible:shadow-ring-primary',
        )}
      >
        <SlidersHorizontal size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && <VariantSheet onClose={() => setOpen(false)} />}
    </>
  )
}

function VariantSheet({ onClose }) {
  const isMobile = useIsMobile()
  const { choices, setChoice, resetChoices } = useVariantControls()

  return (
    <Modal
      open
      onClose={onClose}
      title="Design variants"
      subtitle="Internal · dev and admins only · saved on this device"
      platform={isMobile ? 'mobile' : 'desktop'}
      width={440}
      scrollable={false}
    >
      <div className={cn('flex flex-col gap-5', isMobile && 'px-5 pt-4 pb-6')}>
        {Object.entries(VARIANT_PARTS).map(([key, part]) => (
          <div key={key} className="flex flex-col gap-2">
            <span className="font-body text-sm font-bold text-text-primary">
              {part.label}
            </span>
            <SegmentedControl
              aria-label={part.label}
              options={part.options}
              value={choices[key]}
              onChange={(value) => setChoice(key, value)}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={resetChoices}
          className="self-start min-h-[44px] px-1 font-body text-sm font-bold text-primary-hover hover:text-text-primary focus-visible:outline-none focus-visible:shadow-ring-primary rounded-sm"
        >
          Reset to defaults
        </button>
      </div>
    </Modal>
  )
}
