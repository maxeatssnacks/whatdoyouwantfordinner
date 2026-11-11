// What may go to PostHog (security round from the audit of 2026-11-10,
// findings 3 and 7): counts, fixed labels and ids. No hash, no query, no
// email, no names people typed. Plain JS, so Node checks import it.
//
// Password-reset and email-confirmation links arrive as
// /reset-password#access_token=…&refresh_token=…, and posthog-js reads
// location.href for $current_url and the initial and session-entry URLs, so
// every URL it sends is rewritten here (main.jsx's before_send), and the URLs
// it keeps in its own storage (a first-party cookie and localStorage) too.

import { routeOf } from './routes.js'

const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack']

/**
 * A meal slot as analytics names it: "Breakfast", "Lunch", "Dinner" or
 * "Snack" as before, and "custom" for any other name (people type those).
 */
export function analyticsSlot(name) {
  if (name == null || name === '') return null
  const s = String(name).trim().toLowerCase()
  return SLOTS.includes(s) ? s[0].toUpperCase() + s.slice(1) : 'custom'
}

const ABSOLUTE = /^https?:\/\//i
const PATH_KEY = /pathname$/i // $pathname, $initial_pathname, $session_entry_pathname, $prev_pageview_pathname, initialPathName
const EMAIL = /[^\s@/]+@[^\s@/]+\.[a-z]{2,}/i
const TOKEN = /(access|refresh|provider)_token|token_hash|[?#&](code|token)=/i

/**
 * An absolute URL as analytics may carry it: this app's origin plus the
 * route pattern ("https://…/recipes/:id"), never a hash or a query; another
 * site's origin only. Anything that isn't an http(s) URL → null.
 */
export function analyticsUrl(value, origin) {
  if (typeof value !== 'string' || !ABSOLUTE.test(value)) return null
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  return url.origin === origin ? url.origin + routePath(url.pathname) : url.origin
}

/** The route pattern as a path: "/recipes/:id", and "/other" for a path App.jsx doesn't declare. */
export function routePath(pathname) {
  const route = routeOf(pathname)
  return route.startsWith('/') ? route : `/${route}`
}

// Every string in a property tree: path keys become route patterns, URLs go
// through analyticsUrl, and anything that looks like an email or a token is
// dropped (no event sets one; this is the backstop).
function scrub(key, value, origin, depth) {
  if (typeof value === 'string') {
    if (PATH_KEY.test(key)) return routePath(value.split(/[?#]/)[0])
    if (ABSOLUTE.test(value)) return analyticsUrl(value, origin)
    if (EMAIL.test(value) || TOKEN.test(value)) return null
    return value
  }
  if (value === null || typeof value !== 'object' || depth > 8) return value
  if (Array.isArray(value)) return value.map((v) => scrub('', v, origin, depth + 1))
  const out = {}
  for (const [k, v] of Object.entries(value)) out[k] = scrub(k, v, origin, depth + 1)
  return out
}

/** A property object scrubbed as above (for checks and the stored URLs). */
export function scrubProperties(props, origin) {
  return scrub('', props, origin, 0)
}

/**
 * posthog-js's before_send: the event with its properties, $set and
 * $set_once scrubbed ($current_url, $pathname, $referrer, $initial_*,
 * $session_entry_*, $prev_pageview_*, and any other URL or path).
 */
export function scrubEvent(event, origin) {
  if (!event || typeof event !== 'object') return event
  const out = { ...event }
  for (const k of ['properties', '$set', '$set_once']) {
    if (event[k] && typeof event[k] === 'object') out[k] = scrub('', event[k], origin, 0)
  }
  return out
}

// What posthog-js keeps between page loads that holds a URL: the first URL
// and referrer it saw ($initial_person_info, kept in a cookie as well), and
// the session's entry URL ($client_session_props).
const STORED_KEYS = ['$initial_person_info', '$client_session_props']

/**
 * Rewrites the URLs posthog-js stored, as scrubEvent would send them. Called
 * when it loads and before each event (the first event is when it stores the
 * page's URL). Uses its persistence object; does nothing if that's missing.
 */
export function scrubPostHogStorage(ph, origin) {
  try {
    const persistence = ph?.persistence
    const props = persistence?.props
    if (!props || typeof persistence.register !== 'function') return
    const fixed = {}
    for (const key of STORED_KEYS) {
      const value = props[key]
      if (!value || typeof value !== 'object') continue
      const clean = scrub('', value, origin, 0)
      if (JSON.stringify(clean) !== JSON.stringify(value)) fixed[key] = clean
    }
    if (Object.keys(fixed).length) persistence.register(fixed)
  } catch {
    // Analytics must never break the app.
  }
}
