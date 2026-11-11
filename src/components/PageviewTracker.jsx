import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { posthog } from '../lib/posthog'
import { routePath } from '../v2/lib/analytics'

// One pageview per path, named by its route pattern ("/recipes/:id"): never
// the hash (password-reset links carry tokens there) or the query. main.jsx's
// before_send rewrites every other URL property the same way.
export function PageviewTracker() {
  const location = useLocation()
  useEffect(() => {
    const route = routePath(location.pathname)
    posthog.capture('$pageview', { $current_url: window.location.origin + route, $pathname: route })
  }, [location.pathname])
  return null
}
