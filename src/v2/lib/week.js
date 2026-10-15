// Week/date helpers for the v2 Week page. Weeks start on Sunday in local
// time; everything is built on the shared helpers in src/lib/utils.js and
// never on toISOString(), which shifts dates by timezone.
import {
  formatLocalDateString,
  getPlannerWeekStartDateString,
  getWeekStartDate,
} from '../../lib/utils'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** Parses YYYY-MM-DD as a local date; null if malformed or not a real date. */
export function parseLocalDate(str) {
  if (typeof str !== 'string' || !DATE_RE.test(str)) return null
  const [y, m, d] = str.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null
  return date
}

export function todayString() {
  return formatLocalDateString(new Date())
}

export function currentWeekStart() {
  return getPlannerWeekStartDateString(0)
}

/** Sunday that starts the week containing dateStr, or null for bad input. */
export function weekStartFor(dateStr) {
  const date = parseLocalDate(dateStr)
  return date ? formatLocalDateString(getWeekStartDate(date)) : null
}

export function addDays(dateStr, days) {
  const date = parseLocalDate(dateStr)
  if (!date) return null
  date.setDate(date.getDate() + days)
  return formatLocalDateString(date)
}

export function shiftWeek(weekStart, weeks) {
  return addDays(weekStart, weeks * 7)
}

/** Date (YYYY-MM-DD) of a day_of_week within the week starting weekStart. */
export function dateInWeek(weekStart, dayName) {
  const idx = DAY_NAMES.indexOf(String(dayName || '').toLowerCase())
  return idx === -1 ? null : addDays(weekStart, idx)
}

/** Week page URL. ?day= lands on a day (and its week); otherwise ?week=. */
export function weekPath({ week, day } = {}) {
  if (day && parseLocalDate(day)) return `/dashboard?day=${day}`
  if (week && parseLocalDate(week) && week !== currentWeekStart()) return `/dashboard?week=${week}`
  return '/dashboard'
}

/** Where add / servings-save flows return to: the day they touched (WK-7). */
export function weekReturnPath(dateStr) {
  return weekPath({ day: dateStr })
}

const MONTH = (d) => d.toLocaleDateString('en-US', { month: 'short' })

/** "Oct 11 – 17" or "Oct 25 – Nov 1"; adds the year only when it isn't this year. */
export function formatWeekRangeShort(weekStart) {
  const start = parseLocalDate(weekStart)
  if (!start) return ''
  const end = parseLocalDate(addDays(weekStart, 6))
  const sameMonth = start.getMonth() === end.getMonth()
  const range = sameMonth
    ? `${MONTH(start)} ${start.getDate()} – ${end.getDate()}`
    : `${MONTH(start)} ${start.getDate()} – ${MONTH(end)} ${end.getDate()}`
  return end.getFullYear() === new Date().getFullYear() ? range : `${range}, ${end.getFullYear()}`
}

/** "This week" / "Next week" / "Last week" / "Week of Oct 25". */
export function weekTitle(weekStart, thisWeek = currentWeekStart()) {
  if (weekStart === thisWeek) return 'This week'
  if (weekStart === shiftWeek(thisWeek, 1)) return 'Next week'
  if (weekStart === shiftWeek(thisWeek, -1)) return 'Last week'
  const start = parseLocalDate(weekStart)
  return `Week of ${MONTH(start)} ${start.getDate()}`
}

export function capitalizeDay(dayName) {
  const s = String(dayName || '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function shortDay(dayName) {
  return capitalizeDay(dayName).slice(0, 3)
}
