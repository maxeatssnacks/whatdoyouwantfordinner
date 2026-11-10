import { MessageCircle, Mic } from 'lucide-react'
import { usePhoneOrTablet } from '../../hooks/usePhoneOrTablet'

/**
 * The icon on a button that opens the voice sheet (7d): a mic where the mic
 * listens (desktop), a speech bubble on a phone or tablet, where it opens
 * typing and the keyboard's own dictation does the talking. Props go to the
 * lucide icon.
 */
export function VoiceIcon(props) {
  const Icon = usePhoneOrTablet() ? MessageCircle : Mic
  return <Icon aria-hidden="true" {...props} />
}
