import { useEffect, useState } from 'react'

// How tall the keyboard has to be before it counts as up (a phone's is
// 260px or more; the browser's own bars moving are less).
const KEYBOARD_MIN = 120

const read = () => {
  const vv = window.visualViewport
  if (!vv) return null
  const height = Math.round(vv.height)
  return { top: Math.round(vv.offsetTop), height, keyboardUp: window.innerHeight - height >= KEYBOARD_MIN }
}

/**
 * The part of the page that's visible (7d, the voice sheet on phones):
 * { top, height, keyboardUp } from window.visualViewport, following its
 * resize and scroll, so a bottom sheet can sit on top of the keyboard (and
 * iOS's arrows-and-check bar) instead of behind it. null when `enabled` is
 * false or the browser has no visualViewport.
 */
export function useVisualViewport(enabled = true) {
  const [view, setView] = useState(() => (enabled && typeof window !== 'undefined' ? read() : null))

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.visualViewport) {
      setView(null)
      return undefined
    }
    const vv = window.visualViewport
    const update = () => {
      const next = read()
      setView((prev) => (prev && next && prev.top === next.top && prev.height === next.height ? prev : next))
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [enabled])

  return view
}
