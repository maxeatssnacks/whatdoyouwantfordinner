// The page behind a v2 Sheet can't scroll (step 7d2): not by touch, wheel or
// keys, keyboard up or not. iOS ignores overflow: hidden on the body for
// touch, so the body is fixed where the page was scrolled to (top: -scrollY)
// and the scroll position is put back exactly when the last sheet closes.
// The sheet's own content still scrolls (Sheet's body has overscroll-behavior:
// contain, so it doesn't hand the scroll on to the page). Counted, so stacked
// sheets lock once and unlock when the last one goes. While locked, <html>
// has data-page-locked (appShell.css hides the floating nav), and
// useHideOnScroll ignores the jumps the lock and unlock make.
//
// 7d3: with the keyboard up on the iPhone the visible part of the page is
// smaller than the page, and a drag pans it even with the body fixed; the
// sheet, following the visible part, jittered. So while locked a
// non-passive touchmove listener cancels every drag that can't scroll
// something in the direction it goes (sheetTouch.js has the rule).
import { letDragThrough, SLOP_PX } from './sheetTouch.js'

let locks = 0
let saved = null

const BODY_STYLES = ['position', 'top', 'left', 'right', 'width', 'overflow', 'paddingRight']

/** Whether a sheet has the page locked now. */
export const pageLocked = () => locks > 0

/** Fired on window when the last lock is released, after the scroll position is back. */
export const PAGE_UNLOCKED = 'v2:page-unlocked'

/** Locks the page; → release() (call once; extra calls do nothing). */
export function lockPage() {
  if (typeof document === 'undefined') return () => {}
  if (locks++ === 0) {
    const { body, documentElement: html } = document
    const x = window.scrollX
    const y = window.scrollY
    // The scrollbar goes with the scroll; keep the page from widening under the sheet.
    const scrollbar = Math.max(0, window.innerWidth - html.clientWidth)
    saved = { x, y, style: Object.fromEntries(BODY_STYLES.map((k) => [k, body.style[k]])) }
    Object.assign(body.style, {
      position: 'fixed',
      top: `${-y}px`,
      left: `${-x}px`,
      right: '0',
      width: '100%',
      overflow: 'hidden',
      ...(scrollbar ? { paddingRight: `${scrollbar}px` } : {}),
    })
    html.dataset.pageLocked = 'true'
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
  }
  let released = false
  return () => {
    if (released) return
    released = true
    if (--locks > 0) return
    const { body, documentElement: html } = document
    const { x, y, style } = saved ?? { x: 0, y: 0, style: {} }
    saved = null
    document.removeEventListener('touchstart', onTouchStart, { capture: true })
    document.removeEventListener('touchmove', onTouchMove, { capture: true })
    touch = null
    Object.assign(body.style, style)
    delete html.dataset.pageLocked
    // The two-argument form jumps (no smooth scrolling).
    window.scrollTo(x, y)
    window.dispatchEvent(new Event(PAGE_UNLOCKED))
  }
}

// ── The touch rule's DOM side (7d3)

const SCROLLS = /^(auto|scroll|overlay)$/
const isField = (el) => el?.tagName === 'TEXTAREA' || (el?.tagName === 'INPUT' && !/^(checkbox|radio|range|button|submit|reset|color|file|image)$/i.test(el.type))

/** What can scroll from `el` up to the page, innermost first, as plain numbers for letDragThrough. */
export function scrollBoxes(el) {
  const boxes = []
  for (let n = el; n && n.nodeType === 1 && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const field = isField(n)
    const cs = field ? null : getComputedStyle(n)
    const y = field ? n.tagName === 'TEXTAREA' : SCROLLS.test(cs.overflowY)
    const x = field ? true : SCROLLS.test(cs.overflowX)
    if (!x && !y) continue
    boxes.push({ y, x, scrollTop: n.scrollTop, scrollHeight: n.scrollHeight, clientHeight: n.clientHeight, scrollLeft: n.scrollLeft, scrollWidth: n.scrollWidth, clientWidth: n.clientWidth })
  }
  return boxes
}

// The touch now: where it went down, its last point, and how long it was held.
let touch = null

function onTouchStart(e) {
  const t = e.touches[0]
  if (!t) return
  const target = e.target instanceof Element ? e.target : null
  const field = target?.closest?.('textarea, input') ?? null
  touch = { x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, at: e.timeStamp, field: isField(field) ? field : null, heldMs: null }
}

function onTouchMove(e) {
  const t = e.touches[0]
  if (!t || !touch) return
  const dx = t.clientX - touch.x
  const dy = t.clientY - touch.y
  touch.x = t.clientX
  touch.y = t.clientY
  const moved = Math.hypot(t.clientX - touch.x0, t.clientY - touch.y0)
  if (touch.heldMs == null && moved >= SLOP_PX) touch.heldMs = e.timeStamp - touch.at
  const f = touch.field
  const selection = !!f && f.selectionStart != null && f.selectionStart !== f.selectionEnd
  const through = letDragThrough({
    boxes: scrollBoxes(e.target instanceof Element ? e.target : null),
    dx,
    dy,
    moved,
    touches: e.touches.length,
    field: !!f,
    selection,
    heldMs: touch.heldMs ?? 0,
  })
  if (!through && e.cancelable) e.preventDefault()
}
