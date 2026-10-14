import { Mic } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { useIsMobile } from '../../hooks/useIsMobile'
import { cn } from '../../lib/utils'

// Placeholder for the mic / Speak button until the voice step (build order 6).
export function VoiceComingSoonSheet({ onClose }) {
  const isMobile = useIsMobile()

  return (
    <Modal
      open
      onClose={onClose}
      title="Speak a change"
      platform={isMobile ? 'mobile' : 'desktop'}
      width={400}
      scrollable={false}
    >
      <div className={cn('flex items-center gap-3', isMobile && 'px-5 pt-2 pb-6')}>
        <span className="shrink-0 w-11 h-11 rounded-pill bg-primary-tint text-primary-hover flex items-center justify-center">
          <Mic size={20} strokeWidth={2} aria-hidden="true" />
        </span>
        <p className="font-body text-[15px] text-text-primary">Voice changes are coming soon.</p>
      </div>
    </Modal>
  )
}
