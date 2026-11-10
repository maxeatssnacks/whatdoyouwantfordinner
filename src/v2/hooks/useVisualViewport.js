import { useEffect, useRef, useState } from 'react'

// How much shorter the visible part has to get before the keyboard counts as
// up (a phone's is 260px or more; the browser's own bars moving are less).
const KEYBOARD_MIN = 120

/**
 * The layout viewport's height: what a fixed, full-screen element covers.
 * innerHeight alone can follow the visible part on iOS, the root's doesn't.
 */
export const layoutHeight = () => Math.max(window.innerHeight, document.documentElement?.clientHeight ?? 0)

/**
 * Where a sheet's panel goes so it sits in the visible part of the page
 * (7d3, plain numbers): → the y offset for its `translate`. A bottom sheet's
 * bottom on the visible part's bottom (the top of the keyboard and iOS's
 * arrows-and-check bar); a centred dialog in the middle of the visible part.
 * layout: layoutHeight(); top, height: visualViewport's offsetTop and height.
 */
export function panelOffset({ layout, top, height, centered = false }) {
  const y = centered ? top + height / 2 - layout / 2 : Math.min(0, top + height - layout)
  return Math.round(y)
}

/**
 * Whether the keyboard is up, and how tall the visible part is (7d, the
 * voice sheet on phones): { height, keyboardUp } from window.visualViewport,
 * updated only when one of them changes (the keyboard opening or closing,
 * rotation), never on a pan, so a drag doesn't re-render the sheet (7d3).
 * The keyboard counts as up when the visible part is 120px shorter than the
 * screen, or than it was when this started (7d2: whichever way iOS reports
 * its heights). Where the panel sits is Sheet's job, in one animation frame
 * per change (followVisualViewport). null when `enabled` is false or the
 * browser has no visualViewport.
 */
export function useVisualViewport(enabled = true) {
  const tallest = useRef(0)
  const read = () => {
    const vv = window.visualViewport
    if (!vv) return null
    const height = Math.round(vv.height)
    tallest.current = Math.max(tallest.current, height)
    const shorter = Math.max(layoutHeight(), tallest.current) - height
    return { height, keyboardUp: shorter >= KEYBOARD_MIN }
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
      setView((prev) => (prev && next && prev.height === next.height && prev.keyboardUp === next.keyboardUp ? prev : next))
    }
    update()
    vv.addEventListener('resize', update)
    return () => vv.removeEventListener('resize', update)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  return view
}

/**
 * Keeps `panel` in the visible part of the page: its `translate` (not top,
 * and separate from the slide-up animation's transform) set from
 * panelOffset in one requestAnimationFrame per visualViewport resize or
 * scroll, and once now. → stop(), which takes the offset off.
 */
export function followVisualViewport(panel, { centered = false } = {}) {
  const vv = typeof window === 'undefined' ? null : window.visualViewport
  if (!vv || !panel) return () => {}
  let frame = 0
  const place = () => {
    frame = 0
    const y = panelOffset({ layout: layoutHeight(), top: vv.offsetTop, height: vv.height, centered })
    panel.style.translate = y ? `0 ${y}px` : ''
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(place)
  }
  place()
  vv.addEventListener('resize', schedule)
  vv.addEventListener('scroll', schedule)
  return () => {
    if (frame) cancelAnimationFrame(frame)
    vv.removeEventListener('resize', schedule)
    vv.removeEventListener('scroll', schedule)
    panel.style.translate = ''
  }
}
