import { useLocation, useNavigate } from 'react-router-dom'
import { BottomTabBar } from './BottomTabBar'

const ROUTE_TO_KEY = {
  '/dashboard': 'home',
  '/plan':      'plan',
  '/recipes':   'recipes',
  '/shopping':  'shopping',
  '/profile':   'profile',
}

const KEY_TO_ROUTE = {
  home:     '/dashboard',
  plan:     '/plan',
  recipes:  '/recipes',
  shopping: '/shopping',
  profile:  '/profile',
}

function locationToKey(pathname) {
  if (pathname.startsWith('/recipes')) return 'recipes'
  if (pathname.startsWith('/plan')) return 'plan'
  if (pathname.startsWith('/dashboard')) return 'home'
  return ROUTE_TO_KEY[pathname] ?? 'home'
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
