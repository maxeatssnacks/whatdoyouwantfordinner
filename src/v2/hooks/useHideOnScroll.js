import { useCallback, useEffect, useRef, useState } from 'react'

const HIDE_AFTER = 12 // px of downward scroll before hiding
const SHOW_AFTER = 8 // px of upward scroll before showing
const EDGE = 24 // px from the top or bottom where it always shows

/**
 * Whether the floating mobile nav should be out of the way: hidden while the
 * page scrolls down, shown again when it scrolls up, near the top and at the
 * bottom. One passive window scroll listener, throttled to one check per
 * animation frame. The scroll position is clamped to the page's real range,
 * so iOS rubber-band bounce at either end counts as no movement.
 * → { hidden, show }; `show()` brings it back (focus moved into it, a new page).
 */
export function useHideOnScroll({ enabled = true } = {}) {
  const [hidden, setHidden] = useState(false)
  const state = useRef({ lastY: 0, down: 0, up: 0, frame: 0 })

  useEffect(() => {
    if (!enabled) {
      setHidden(false)
      return undefined
    }
    const s = state.current
    const max = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
    s.lastY = Math.min(Math.max(window.scrollY, 0), max())
    s.down = 0
    s.up = 0

    const check = () => {
      s.frame = 0
      const limit = max()
      const y = Math.min(Math.max(window.scrollY, 0), limit)
      const delta = y - s.lastY
      s.lastY = y
      if (limit <= EDGE * 2 || y <= EDGE || y >= limit - EDGE) {
        s.down = 0
        s.up = 0
        setHidden(false)
        return
      }
      if (delta > 0) {
        s.down += delta
        s.up = 0
        if (s.down > HIDE_AFTER) setHidden(true)
      } else if (delta < 0) {
        s.up -= delta
        s.down = 0
        if (s.up > SHOW_AFTER) setHidden(false)
      }
    }
    const onScroll = () => {
      if (!s.frame) s.frame = requestAnimationFrame(check)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (s.frame) cancelAnimationFrame(s.frame)
      s.frame = 0
    }
  }, [enabled])

  const show = useCallback(() => {
    const s = state.current
    s.down = 0
    s.up = 0
    setHidden(false)
  }, [])

  return { hidden: enabled && hidden, show }
}
