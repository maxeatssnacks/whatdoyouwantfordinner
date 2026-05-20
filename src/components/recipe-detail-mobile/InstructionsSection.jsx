import { useMemo } from 'react'
import DOMPurify from 'dompurify'

// Convert recipe instructions to a typed step array.
// HTML content: walk top-level children via DOMParser.
//   - <ol>/<ul>: each <li> becomes a 'list' step (gets an orange number)
//   - <p>, <h2>–<h4>, etc.: becomes a 'prose' step (no number, plain prose)
// Plain-text fallback: each line treated as a 'list' step (legacy behavior).
function splitToSteps(content) {
  if (!content) return []
  const isHtml = /<[a-z][\s\S]*>/i.test(content)
  if (!isHtml) {
    return content
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((html) => ({ type: 'list', html }))
  }
  try {
    const doc = new DOMParser().parseFromString(content, 'text/html')
    const steps = []
    for (const el of doc.body.children) {
      if (el.tagName === 'OL' || el.tagName === 'UL') {
        for (const li of el.children) {
          if (li.textContent.trim()) steps.push({ type: 'list', html: li.innerHTML })
        }
      } else {
        if (el.textContent.trim()) steps.push({ type: 'prose', html: el.outerHTML })
      }
    }
    if (steps.length > 0) return steps
  } catch {
    // DOMParser unavailable — fall through
  }
  return [{ type: 'prose', html: content }]
}

// Group a flat step array into consecutive same-type runs so prose blocks and
// numbered list blocks can be rendered as separate DOM elements.
function groupSteps(steps) {
  return steps.reduce((acc, step) => {
    const last = acc[acc.length - 1]
    if (last && last.type === step.type) {
      last.items.push(step)
    } else {
      acc.push({ type: step.type, items: [step] })
    }
    return acc
  }, [])
}

const STEP_CONTENT_CLASS =
  'flex-1 font-body text-[14px] leading-[22px] text-text-primary ' +
  '[&_p]:mb-2 [&_p:last-child]:mb-0 ' +
  '[&_strong]:font-bold [&_em]:italic ' +
  '[&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:mb-2 ' +
  '[&_ul]:list-disc [&_ul]:ml-5 [&_ul]:mb-2'

export function InstructionsSection({ instructions }) {
  const steps = useMemo(() => splitToSteps(instructions), [instructions])
  const groups = useMemo(() => groupSteps(steps), [steps])
  if (groups.length === 0) return null

  // Running counter for numbered steps — increments across all list groups so
  // numbers are contiguous for the typical single-list recipe, and restart only
  // when explicitly needed (currently always contiguous).
  let stepCounter = 0

  return (
    <section className="px-4 py-4 border-t border-border/60">
      <h2 className="font-display text-[18px] font-bold text-text-primary mb-3 -tracking-[0.2px]">
        Instructions
      </h2>
      <div className="space-y-4">
        {groups.map((group, gi) => {
          if (group.type === 'prose') {
            return (
              <div key={gi} className="space-y-2">
                {group.items.map((step, si) => (
                  <div
                    key={si}
                    className={STEP_CONTENT_CLASS}
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(step.html) }}
                  />
                ))}
              </div>
            )
          }

          // list group — numbered with orange step indicators
          return (
            <ol key={gi} className="space-y-4">
              {group.items.map((step) => {
                stepCounter += 1
                const n = stepCounter
                return (
                  <li key={n} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="shrink-0 font-display text-[26px] font-bold text-primary tabular-nums leading-none w-8 text-right"
                    >
                      {n}
                    </span>
                    <div
                      className={STEP_CONTENT_CLASS}
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(step.html) }}
                    />
                  </li>
                )
              })}
            </ol>
          )
        })}
      </div>
    </section>
  )
}
