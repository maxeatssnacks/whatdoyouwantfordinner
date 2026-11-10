// Don't guess amounts (v2 build step 7d2). An on-hand change from voice is
// applied only when its words say how much is left: Chrome once heard "Rite
// of eggs and we're eating out on Friday" and the model answered "plenty",
// which nothing in the words supports. Plain JS on the device, so
// parse-changes is unchanged. The groups are broad on purpose; the guard is
// there for answers with no words behind them, not to second-guess the model.

const norm = (s) => ` ${String(s ?? '')
  .toLowerCase()
  .replace(/[’‘`]/g, "'")
  .replace(/[^a-z0-9'./ ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()} `

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const anyOf = (phrases) => new RegExp(`(?<=[ ])(?:${phrases.map((p) => escape(p).replace(/ /g, ' +')).join('|')})(?=[ .,!?])`, 'g')

// Words that have "out" in them but say nothing about the fridge.
const NOT_AMOUNTS = anyOf(['eating out', 'eat out', 'ate out', 'eaten out', 'dining out', 'dine out', 'going out', 'go out', 'take out', 'takeout', 'take-out', 'order out', 'ordering out'])

/** The word groups, by the answer they support. Checked in this order: a phrase is taken by the first group it's in. */
export const AMOUNT_WORDS = {
  a_little: ['a little', 'a bit', 'a tiny bit', 'a little bit', 'some', 'not much', 'not a lot', 'almost out', 'almost gone', 'almost finished', 'almost done', 'almost empty', 'nearly out', 'nearly gone', 'nearly finished', 'nearly empty', 'running low', 'running out', 'low on', 'getting low', 'barely any', 'hardly any', 'a few', 'a handful', 'a splash', 'a drop', 'a smidge', 'last bit', 'last few', 'down to'],
  used_up: ['out', 'gone', 'used up', 'used it all', 'used them all', 'used all', 'finished', 'done', 'ran out', 'run out', 'no more', 'none left', 'none', 'nothing left', 'no ', 'the rest of', 'ate the rest', 'used the rest', 'had the rest', 'finished the rest', 'the last of', 'all gone', 'empty', 'spoiled', 'spoilt', 'went bad', 'gone bad', 'gone off', 'expired', 'tossed', 'threw away', 'thrown away', 'threw it out', 'threw them out'],
  about_half: ['half', 'halfway', 'half way'],
  plenty: ['plenty', 'lots', 'loads', 'a lot', 'full', 'enough', 'still have', 'still has', 'still got', 'still plenty', 'tons', 'heaps', 'a ton', 'a bunch', 'most of', 'almost full', 'nearly full', 'barely used', 'hardly used', 'unopened', 'untouched', "haven't opened", "haven't touched", "haven't used", 'a whole', 'a full'],
}
const GROUPS = Object.entries(AMOUNT_WORDS).map(([answer, phrases]) => [answer, anyOf(phrases.map((p) => p.trim()))])
// A number said: digits, or a number word ("half a dozen", "two lemons").
const NUMBER = /(?<=[ ])(?:\d+(?:[.,/]\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|couple|pair)(?=[ .,!?])/

// A fragment that leans on the rest of the sentence: "so is the yogurt",
// "the yogurt too", or the item alone ("and the yogurt").
const ELLIPSIS = /(?<=[ ])(?:so (?:is|are|was|were|has|have|does|do)|too|as well|also|same|both|neither|nor|either)(?=[ .,!?])/
const FILLER = /^(?: |and|the|a|an|my|our|your|of|plus|then|,|\.)*$/

/** The text with the item's own words taken out ("half and half", "full fat yogurt" say nothing about how much). */
function withoutItem(text, names) {
  let t = norm(text)
  for (const name of names) {
    const n = norm(name).trim()
    if (n) t = t.replace(new RegExp(`(?<=[ ])${escape(n).replace(/ /g, ' +')}(?:s|es)?(?=[ .,!?'])`, 'g'), ' ')
  }
  return t.replace(/\s+/g, ' ').replace(/^ ?/, ' ').replace(/ ?$/, ' ')
}

/** The answers the words support: a Set of used_up, a_little, about_half, plenty and 'amount' (a number). */
export function amountsSaid(text, names = []) {
  let t = withoutItem(text, names).replace(NOT_AMOUNTS, ' ')
  const found = new Set()
  if (NUMBER.test(t)) found.add('amount')
  for (const [answer, re] of GROUPS) {
    re.lastIndex = 0
    if (re.test(t)) {
      found.add(answer)
      re.lastIndex = 0
      t = t.replace(re, ' ')
    }
  }
  return found
}

/**
 * Whether a change's words support its answer: the change's said fragment,
 * or the whole sentence when there's no fragment, or when the fragment leans
 * on it ("Feta's finished and so is the yogurt"). Words that say a different
 * amount than the answer don't. → boolean
 * answer: used_up | a_little | about_half | plenty | amount.
 */
export function wordsSupport(answer, { said = '', sentence = '', names = [] } = {}) {
  const fragment = String(said ?? '').trim()
  const own = fragment ? amountsSaid(fragment, names) : new Set()
  if (own.size) return own.has(answer)
  const rest = withoutItem(fragment, names).replace(NOT_AMOUNTS, ' ')
  const leans = !fragment || ELLIPSIS.test(rest) || FILLER.test(rest.trim())
  return leans && !!sentence && amountsSaid(sentence, names).has(answer)
}
