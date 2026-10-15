import { Mic } from 'lucide-react'
import { Sheet } from './Sheet'

// Placeholder for voice and fridge input until the voice step (build order 7).
export function VoiceComingSoonSheet({
  onClose,
  title = 'Speak a change',
  message = 'Voice changes are coming soon.',
}) {
  return (
    <Sheet onClose={onClose} title={title} width={400} testId="coming-soon-sheet">
      <div className="flex items-center gap-3 pb-2">
        <span className="shrink-0 w-11 h-11 rounded-pill bg-primary-tint text-primary-hover flex items-center justify-center">
          <Mic size={20} strokeWidth={2} aria-hidden="true" />
        </span>
        <p className="text-[15px] text-text-primary">{message}</p>
      </div>
    </Sheet>
  )
}
