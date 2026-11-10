// The page behind a v2 Sheet can't scroll (step 7d2): not by touch, wheel or
// keys, keyboard up or not. iOS ignores overflow: hidden on the body for
// touch, so the body is fixed where the page was scrolled to (top: -scrollY)
// and the scroll position is put back exactly when the last sheet closes.
// The sheet's own content still scrolls (Sheet's body has overscroll-behavior:
// contain, so it doesn't hand the scroll on to the page). Counted, so stacked
// sheets lock once and unlock when the last one goes. While locked, <html>
// has data-page-locked (appShell.css hides the floating nav), and
// useHideOnScroll ignores the jumps the lock and unlock make.

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
  }
  let released = false
  return () => {
    if (released) return
    released = true
    if (--locks > 0) return
    const { body, documentElement: html } = document
    const { x, y, style } = saved ?? { x: 0, y: 0, style: {} }
    saved = null
    Object.assign(body.style, style)
    delete html.dataset.pageLocked
    // The two-argument form jumps (no smooth scrolling).
    window.scrollTo(x, y)
    window.dispatchEvent(new Event(PAGE_UNLOCKED))
  }
}
