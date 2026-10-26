// Dates for voice changes (v2 build step 7a). Local YYYY-MM-DD strings,
// Sunday-start weeks, never toISOString(). Plain JS, so Node checks import it.
import { addDays } from '../onHand.js'
import { formatLocalDateString } from '../../../lib/utils.js'

export const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// How far ahead voice changes reach: this week and next, from today.
export const CALENDAR_DAYS = 14

function parse(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''))
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

export const isDate = (date) => !!parse(date)
export const dayIndexOf = (date) => parse(date)?.getDay() ?? -1
export const dayNameOf = (date) => DAY_NAMES[dayIndexOf(date)] ?? null
export const shortDayOf = (date) => SHORT[dayIndexOf(date)] ?? ''

/** The Sunday that starts date's week. */
export function weekStartOf(date) {
  const d = parse(date)
  if (!d) return null
  d.setDate(d.getDate() - d.getDay())
  return formatLocalDateString(d)
}

/** The days voice can change, from today: [{ date, name, short }]. */
export function calendar(today, days = CALENDAR_DAYS) {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i)
    return { date, name: dayNameOf(date), short: shortDayOf(date) }
  })
}

/** 'morning' | 'afternoon' | 'evening' | 'night' for a local time. */
export function timeOfDay(now = new Date()) {
  const h = now.getHours()
  if (h < 5) return 'night'
  if (h < 11) return 'morning'
  if (h < 17) return 'afternoon'
  if (h < 22) return 'evening'
  return 'night'
}

// Weekday words: full names, and the short forms people type ("fri", "tues").
const WEEKDAY_WORDS = [
  ['sunday', 'sun'],
  ['monday', 'mon'],
  ['tuesday', 'tue', 'tues'],
  ['wednesday', 'wed'],
  ['thursday', 'thu', 'thur', 'thurs'],
  ['friday', 'fri'],
  ['saturday', 'sat'],
]
const WEEKDAY_RE = new RegExp(`\\b(next\\s+)?(${WEEKDAY_WORDS.flat().join('|')})(?:'s)?\\b`, 'gi')
const dayFromWord = (word) => WEEKDAY_WORDS.findIndex((forms) => forms.includes(word.toLowerCase()))

/**
 * The date a change's words name, by the voice date rules, or null when they
 * name none (or more than one):
 * - "tonight", "today", "this evening": today;
 * - "tomorrow": the day after today (late on Saturday, next week's Sunday);
 * - a weekday: its next date, today included, so a weekday that has passed
 *   this week means next week's;
 * - "next Friday": the Friday of next week (the week after this Sunday-start week).
 * → { date, rule: 'today' | 'tomorrow' | 'weekday' | 'next' } | null
 */
export function saidDate(said, today) {
  const text = String(said ?? '')
  const found = []
  if (/\b(tonight|today|this evening)\b/i.test(text)) found.push({ date: today, rule: 'today' })
  if (/\btomorrow\b/i.test(text)) found.push({ date: addDays(today, 1), rule: 'tomorrow' })
  for (const m of text.matchAll(WEEKDAY_RE)) {
    const idx = dayFromWord(m[2])
    if (idx === -1) continue
    if (m[1]) {
      found.push({ date: addDays(weekStartOf(today), 7 + idx), rule: 'next' })
    } else {
      const ahead = (idx - dayIndexOf(today) + 7) % 7
      found.push({ date: addDays(today, ahead), rule: 'weekday' })
    }
  }
  const dates = [...new Set(found.map((f) => f.date))]
  return dates.length === 1 ? found[0] : null
}
