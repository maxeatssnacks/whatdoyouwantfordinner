import { useMemo } from 'react'
import DOMPurify from 'dompurify'

// Convert legacy plain text to numbered-step HTML; pass HTML through unchanged.
function splitToSteps(content) {
  if (!content) return []
  const isHtml = /<[a-z][\s\S]*>/i.test(content)
  if (isHtml) {
    // Try to extract <li> entries from <ol>/<ul>; if none, fall back to a single step
    const liMatches = [...content.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1])
    if (liMatches.length > 0) return liMatches
    return [content]
  }
  return content.split('\n').map((p) => p.trim()).filter(Boolean)
}

export function InstructionsSection({ instructions }) {
  const steps = useMemo(() => splitToSteps(instructions), [instructions])
  if (steps.length === 0) return null

  return (
    <section className="px-4 py-4 border-t border-border/60">
      <h2 className="font-display text-[18px] font-bold text-text-primary mb-3 -tracking-[0.2px]">
        Instructions
      </h2>
      <ol className="space-y-4">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span
              aria-hidden="true"
              className="shrink-0 font-display text-[26px] font-bold text-primary tabular-nums leading-none w-8 text-right"
            >
              {i + 1}
            </span>
            <div
              className="flex-1 font-body text-[14px] leading-[22px] text-text-primary
                [&_p]:mb-2 [&_p:last-child]:mb-0
                [&_strong]:font-bold [&_em]:italic
                [&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:mb-2
                [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:mb-2"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(step) }}
            />
          </li>
        ))}
      </ol>
    </section>
  )
}
