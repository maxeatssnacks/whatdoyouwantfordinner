import { useLocation, useNavigate } from 'react-router-dom'
import { BottomTabBar } from './BottomTabBar'

const ROUTE_TO_KEY = {
  '/dashboard': 'plan',
  '/recipes':   'recipes',
  '/shopping':  'shopping',
  '/profile':   'profile',
}

const KEY_TO_ROUTE = {
  plan:     '/dashboard',
  recipes:  '/recipes',
  shopping: '/shopping',
  profile:  '/profile',
}

function locationToKey(pathname) {
  if (pathname.startsWith('/recipes')) return 'recipes'
  return ROUTE_TO_KEY[pathname] ?? 'plan'
}

export function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  const active = locationToKey(location.pathname)

  const handleChange = (key) => {
    window.scrollTo(0, 0)
    navigate(KEY_TO_ROUTE[key])
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 md:hidden">
      <BottomTabBar active={active} onChange={handleChange} />
    </div>
  )
}
