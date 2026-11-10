import { useEffect, useRef, useState } from 'react'

// How much shorter the visible part has to get before the keyboard counts as
// up (a phone's is 260px or more; the browser's own bars moving are less).
const KEYBOARD_MIN = 120

// The layout viewport's height: what a fixed, full-screen element covers.
// innerHeight alone can follow the visible part on iOS, the root's doesn't.
const layoutHeight = () => Math.max(window.innerHeight, document.documentElement?.clientHeight ?? 0)

/**
 * The part of the page that's visible (7d, the voice sheet on phones):
 * { top, height, inset, keyboardUp } from window.visualViewport, following
 * its resize and scroll. `inset` is how far the visible part ends above the
 * bottom of the screen (the keyboard and iOS's arrows-and-check bar), so a
 * bottom sheet can sit on top of them instead of behind. The keyboard counts
 * as up when the visible part is 120px shorter than the screen, or than it
 * was when this started (7d2: whichever way iOS reports its heights). null
 * when `enabled` is false or the browser has no visualViewport.
 */
export function useVisualViewport(enabled = true) {
  const tallest = useRef(0)
  const read = () => {
    const vv = window.visualViewport
    if (!vv) return null
    const height = Math.round(vv.height)
    const top = Math.round(vv.offsetTop)
    const layout = layoutHeight()
    tallest.current = Math.max(tallest.current, height)
    const shorter = Math.max(layout, tallest.current) - height
    return { top, height, inset: Math.max(0, Math.round(layout - top - height)), keyboardUp: shorter >= KEYBOARD_MIN }
  }
  const [view, setView] = useState(() => (enabled && typeof window !== 'undefined' ? read() : null))

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.visualViewport) {
      setView(null)
      return undefined
    }
    const vv = window.visualViewport
    const update = () => {
      const next = read()
      setView((prev) => (prev && next && prev.top === next.top && prev.height === next.height && prev.inset === next.inset && prev.keyboardUp === next.keyboardUp ? prev : next))
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  return view
}
