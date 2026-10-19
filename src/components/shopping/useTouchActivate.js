import { useCallback, useEffect, useRef } from 'react'

// Shopping rows on touch screens (iPhone). A quick second tap's click can be
// delivered to the first tap's element (pointer events go to the right row,
// the click doesn't), so a toggle flips back and the second row never toggles.
// So touch and pen activate on the pointer events instead:
// - pointerdown remembers the element and position; pointerup over the same
//   element, moved less than MOVE_PX, with no pointercancel in between,
//   activates it;
// - for DROP_MS after that, clicks anywhere on the page are dropped (one
//   capture-phase listener on the document), whichever element they land on:
//   that's the misrouted click, or a ghost click on a sheet that opened under
//   the finger. The touch's own mousedown/mouseup go too (a sheet closes on a
//   mousedown on its backdrop);
// - a click from Enter or Space (detail 0) is never dropped, and mouse clicks
//   activate on click as before;
// - a moved finger or a pointercancel (scrolling) activates nothing.
// One exception keeps other controls usable right after a row tap: a click
// that lands where the latest touch ended, when that touch wasn't one of these
// buttons (a quick tap on a nav link), goes through. The misrouted click lands
// on a different element than the latest touch, so it's still dropped.

const DROP_MS = 600
const MOVE_PX = 10
const DROPPED = ['click', 'mousedown', 'mouseup']

let dropUntil = 0
let lastTouchUp = null // { el, handled }: where the latest touch ended, and whether a row button took it
let users = 0
const droppedClickListeners = new Set()

function within(a, b) {
  return !!a && !!b && (a === b || (typeof a.contains === 'function' && a.contains(b)))
}

function onDocumentPointerUp(e) {
  if (e.pointerType === 'mouse') return
  lastTouchUp = { el: e.target, handled: false }
}

function onDocumentDrop(e) {
  if (performance.now() >= dropUntil) return
  if (e.type === 'click' && e.detail === 0) return
  if (lastTouchUp && !lastTouchUp.handled && (within(lastTouchUp.el, e.target) || within(e.target, lastTouchUp.el))) return
  e.preventDefault()
  e.stopPropagation()
  if (e.type === 'click') for (const fn of droppedClickListeners) fn(e.target)
}

function install() {
  if (users++ > 0) return
  document.addEventListener('pointerup', onDocumentPointerUp, true)
  for (const type of DROPPED) document.addEventListener(type, onDocumentDrop, true)
}

function uninstall() {
  if (--users > 0) return
  document.removeEventListener('pointerup', onDocumentPointerUp, true)
  for (const type of DROPPED) document.removeEventListener(type, onDocumentDrop, true)
}

/** Calls fn(element) for every click dropped after a touch activation (the internal tap log). */
export function onDroppedClick(fn) {
  droppedClickListeners.add(fn)
  return () => droppedClickListeners.delete(fn)
}

/**
 * Props for a button that should activate on touch at pointerup and on mouse
 * and keyboard at click: spread them onto the <button>. onActivate gets no
 * arguments.
 */
export function useTouchActivate(onActivate) {
  const activateRef = useRef(onActivate)
  activateRef.current = onActivate
  const down = useRef(null) // { id, x, y, el }
  const lastTouchAt = useRef(0)

  useEffect(() => {
    install()
    return uninstall
  }, [])

  const onPointerDown = useCallback((e) => {
    if (e.pointerType === 'mouse' || e.isPrimary === false) {
      down.current = null
      return
    }
    lastTouchAt.current = performance.now()
    down.current = { id: e.pointerId, x: e.clientX, y: e.clientY, el: e.currentTarget }
  }, [])

  const onPointerUp = useCallback((e) => {
    const start = down.current
    down.current = null
    if (!start || e.pointerType === 'mouse' || e.pointerId !== start.id) return
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) >= MOVE_PX) return
    // Touch pointers are captured by the element they went down on, so check
    // what's under the finger now.
    const over = document.elementFromPoint(e.clientX, e.clientY)
    if (!within(start.el, over)) return
    dropUntil = performance.now() + DROP_MS
    if (lastTouchUp) lastTouchUp.handled = true
    activateRef.current?.()
  }, [])

  const onPointerCancel = useCallback(() => {
    down.current = null
  }, [])

  const onClick = useCallback((e) => {
    // Enter and Space (detail 0) and mouse clicks activate here. A click from
    // a touch or pen is decided by the pointer events above (it was dropped
    // if it activated, and a moved or cancelled touch activates nothing).
    if (e.detail !== 0) {
      const type = e.nativeEvent?.pointerType
      if (type === 'touch' || type === 'pen') return
      if (!type && performance.now() - lastTouchAt.current < 1000) return
    }
    activateRef.current?.()
  }, [])

  return { onPointerDown, onPointerUp, onPointerCancel, onClick }
}
