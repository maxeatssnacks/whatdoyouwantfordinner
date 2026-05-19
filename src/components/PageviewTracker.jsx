import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { posthog } from '../lib/posthog'

export function PageviewTracker() {
  const location = useLocation()
  useEffect(() => {
    posthog.capture('$pageview', { $current_url: window.location.href })
  }, [location.pathname, location.search])
  return null
}
