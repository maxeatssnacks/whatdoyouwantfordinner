// The routes App.jsx declares, for analytics that name a page without
// anything in its path (v2 step 7c2: app_error). Plain JS, so Node checks
// import it.

const ROUTES = ['/', '/login', '/signup', '/forgot-password', '/reset-password', '/check-email', '/dashboard', '/recipes', '/plan', '/planner', '/shopping', '/profile', '/admin', '/voice-probe']

/** The route a path belongs to, as App.jsx declares it: "/recipes/:id" for a recipe, "other" for anything unknown. */
export function routeOf(pathname = '/') {
  const path = String(pathname).replace(/\/+$/, '') || '/'
  if (/^\/recipes\/[^/]+$/.test(path)) return '/recipes/:id'
  return ROUTES.includes(path) ? path : 'other'
}
