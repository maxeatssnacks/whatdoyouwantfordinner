import { useState } from 'react'
import { VariantsProvider } from '../variants/VariantsProvider'
import { VariantPanel } from '../variants/VariantPanel'
import { VoiceComingSoonSheet } from '../components/VoiceComingSoonSheet'
import { DesktopTopBar } from './DesktopTopBar'
import { MobileTabBar } from './MobileTabBar'
import './appShell.css'

// v2 logged-in chrome: floating pill nav + mic on mobile, plain top bar on
// desktop. The content area is padded by --v2-nav-clearance so the floating
// nav never covers page content.
export function AppShell({ children }) {
  const [voiceOpen, setVoiceOpen] = useState(false)
  const openVoice = () => setVoiceOpen(true)

  return (
    <VariantsProvider>
      <div className="v2-shell relative min-h-screen">
        <DesktopTopBar onSpeak={openVoice} />
        <div className="v2-shell-content">{children}</div>
        <MobileTabBar onSpeak={openVoice} />
        <VariantPanel />
        {voiceOpen && <VoiceComingSoonSheet onClose={() => setVoiceOpen(false)} />}
      </div>
    </VariantsProvider>
  )
}
