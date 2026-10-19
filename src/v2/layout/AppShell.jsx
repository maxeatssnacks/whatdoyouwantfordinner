import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { OnboardingModal } from '../../components/household/OnboardingModal'
import { useHouseholdMembers } from '../../hooks/useHouseholdMembers'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useHideOnScroll } from '../hooks/useHideOnScroll'
import { VariantsProvider } from '../variants/VariantsProvider'
import { VoiceComingSoonSheet } from '../components/VoiceComingSoonSheet'
import { DesktopTopBar } from './DesktopTopBar'
import { MobileTabBar } from './MobileTabBar'
import './appShell.css'

// v2 logged-in chrome: floating pill nav + mic on mobile, plain top bar on
// desktop. The content area is padded by --v2-nav-clearance so the floating
// nav never covers page content. On phones the nav slides out of the way
// while the page scrolls down (useHideOnScroll); the padding stays, and
// things that sit above it follow it via --v2-nav-float (appShell.css).
export function AppShell({ children }) {
  const [voiceOpen, setVoiceOpen] = useState(false)
  const openVoice = () => setVoiceOpen(true)
  const isMobile = useIsMobile()
  const nav = useHideOnScroll({ enabled: isMobile })
  const { pathname } = useLocation()
  const { show } = nav
  // Another page always starts with the nav in view.
  useEffect(() => { show() }, [pathname, show])

  return (
    <VariantsProvider>
      <div className="v2-shell relative min-h-screen" data-nav-hidden={nav.hidden ? 'true' : 'false'}>
        <DesktopTopBar onSpeak={openVoice} />
        <div className="v2-shell-content">{children}</div>
        <MobileTabBar onSpeak={openVoice} hidden={nav.hidden} onFocusInside={show} />
        {voiceOpen && <VoiceComingSoonSheet onClose={() => setVoiceOpen(false)} />}
        <OnboardingGate />
      </div>
    </VariantsProvider>
  )
}

// Onboarding (PARITY OB-1 to OB-3), moved here from the v1 Dashboard so any
// logged-in route triggers it for a user without a primary household member.
// The modal itself is unchanged: forced, no close.
function OnboardingGate() {
  const { data: householdMembers, isLoading } = useHouseholdMembers()
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    if (!isLoading && householdMembers !== undefined) {
      const hasPrimary = householdMembers.some((m) => m.is_primary === true)
      if (!hasPrimary) setShowOnboarding(true)
    }
  }, [householdMembers, isLoading])

  // Mounted only when needed: the v1 Modal resets body scroll locking on mount.
  if (!showOnboarding) return null
  return <OnboardingModal open onComplete={() => setShowOnboarding(false)} />
}
