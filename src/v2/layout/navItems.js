import { Calendar, BookOpen, List, User } from 'lucide-react'

// The four v2 destinations. /plan and /planner stay reachable by URL and count
// as Week, since they're the v1 week surfaces.
export const NAV_ITEMS = [
  { key: 'week', label: 'Week', to: '/dashboard', Icon: Calendar, match: ['/dashboard', '/plan', '/planner'] },
  { key: 'recipes', label: 'Recipes', to: '/recipes', Icon: BookOpen, match: ['/recipes'] },
  { key: 'list', label: 'List', to: '/shopping', Icon: List, match: ['/shopping'] },
  { key: 'profile', label: 'Profile', to: '/profile', Icon: User, match: ['/profile'] },
]

export function isNavItemActive(item, pathname) {
  return item.match.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}
