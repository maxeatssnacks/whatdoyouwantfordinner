import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { cn } from '../../lib/utils'
import { SegmentedControl } from '../components/SegmentedControl'
import { Sheet } from '../components/Sheet'
import { VARIANT_FLAGS, VARIANT_PARTS } from './config'
import { useVariantControls, useVariantPanelAccess } from './VariantsContext'

// Internal tool for trying design options in the real app. The trigger sits
// in the Week page header (where it covers nothing) and renders only in dev
// builds or for admins. Regular users never see it.
export function VariantPanelTrigger({ className }) {
  const visible = useVariantPanelAccess()
  const [open, setOpen] = useState(false)

  if (!visible) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Design variants"
        title="Design variants (internal)"
        className={cn(
          'w-11 h-11 shrink-0 rounded-pill flex items-center justify-center',
          'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
          'focus-visible:outline-none focus-visible:shadow-ring-primary',
          className,
        )}
      >
        <SlidersHorizontal size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && <VariantSheet onClose={() => setOpen(false)} />}
    </>
  )
}

function VariantSheet({ onClose }) {
  const { choices, flags, setChoice, setFlag, resetChoices } = useVariantControls()

  return (
    <Sheet
      onClose={onClose}
      title="Design variants"
      subtitle="Internal · dev and admins only · saved on this device"
      width={460}
      testId="variant-sheet"
    >
      <div className="flex flex-col gap-5">
        {Object.entries(VARIANT_PARTS).map(([key, part]) => (
          <div key={key} className="flex flex-col gap-2">
            <span className="text-sm font-bold text-text-primary">{part.label}</span>
            <SegmentedControl
              aria-label={part.label}
              options={part.options}
              value={choices[key]}
              onChange={(value) => setChoice(key, value)}
            />
          </div>
        ))}

        {Object.entries(VARIANT_FLAGS).map(([key, flag]) => (
          <div key={key} className="flex items-center justify-between gap-3 pt-1">
            <span id={`flag-${key}`} className="text-sm font-bold text-text-primary">
              {flag.label}
              <span className="block text-[13px] font-normal text-text-secondary">
                Shows labelled sample numbers. Never shown to regular users.
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={flags[key]}
              aria-labelledby={`flag-${key}`}
              onClick={() => setFlag(key, !flags[key])}
              className={cn(
                'shrink-0 w-[52px] h-11 rounded-pill p-1 flex items-center',
                'focus-visible:outline-none focus-visible:shadow-ring-primary',
                flags[key] ? 'bg-primary-hover justify-end' : 'bg-border justify-start',
              )}
            >
              <span className="w-9 h-9 rounded-pill bg-surface shadow-resting" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={resetChoices}
          className="self-start min-h-[44px] px-1 text-sm font-bold text-primary-hover hover:text-text-primary focus-visible:outline-none focus-visible:shadow-ring-primary rounded-sm"
        >
          Reset to defaults
        </button>
      </div>
    </Sheet>
  )
}
