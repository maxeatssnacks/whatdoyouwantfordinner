// The touch rule while a sheet is open (v2 build step 7d3), as plain
// functions so Node checks run it. With the keyboard up on the iPhone, the
// visible part of the page is smaller than the page, and a drag anywhere
// pans it even with the body fixed (scrollLock.js): the sheet, which follows
// the visible part, jittered a frame behind the pan. So a drag is cancelled
// unless it can scroll something: the sheet's own content, or a text field
// whose text overflows, in the direction the finger moves, and not past its
// end. Pinch zoom passes, and so do text selection and cursor moves in a
// field (a drag with a selection, for the handles; or after a long press,
// for the loupe). The keyboard's space-bar cursor is the keyboard's, not
// the page's, so it never reaches here.

/** A finger held this long before moving is a long press (the loupe, moving the cursor). */
export const LONG_PRESS_MS = 400
/** Moves shorter than this from where the finger went down are not a drag yet (iOS doesn't start a scroll for them either). */
export const SLOP_PX = 10

/**
 * Whether a scroll box can move for a finger move of (dx, dy): its content
 * goes the other way, so a finger moving down (dy > 0) needs room above
 * (scrollTop > 0) and a finger moving up needs room below.
 * box: { y, x (whether it scrolls that way), scrollTop, scrollHeight,
 * clientHeight, scrollLeft, scrollWidth, clientWidth }.
 */
export function canScrollBy(box, dx, dy) {
  const vertical = Math.abs(dy) >= Math.abs(dx)
  const [on, pos, size, client, d] = vertical
    ? [box.y, box.scrollTop, box.scrollHeight, box.clientHeight, dy]
    : [box.x, box.scrollLeft, box.scrollWidth, box.clientWidth, dx]
  if (!on || !d) return false
  const max = size - client
  if (max < 1) return false
  return d > 0 ? pos > 0.5 : pos < max - 0.5
}

/**
 * Whether to let one touchmove through while a sheet has the page locked.
 * boxes: what can scroll from where the touch started up to the page,
 * innermost first (scrollBoxes in scrollLock.js reads them). dx, dy: the
 * finger's move since the last touchmove. moved: how far it is from where it
 * went down. touches: fingers on the screen. field: the touch started in a
 * text field, with `selection` (text selected there) and `heldMs` (how long
 * the finger was down before it first moved past SLOP_PX). → boolean
 */
export function letDragThrough({ boxes = [], dx = 0, dy = 0, moved = Infinity, touches = 1, field = false, selection = false, heldMs = 0 } = {}) {
  if (touches > 1) return true
  if (field && (selection || heldMs >= LONG_PRESS_MS || moved < SLOP_PX)) return true
  if (!dx && !dy) return true
  return boxes.some((box) => canScrollBy(box, dx, dy))
}
