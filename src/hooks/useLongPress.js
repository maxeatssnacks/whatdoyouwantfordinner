import { useRef, useCallback } from 'react'

/**
 * Returns pointer event handlers that fire `callback` after `delay` ms
 * of sustained pointer-down without movement.
 *
 * Spread the returned object onto a button/div:
 *   <button {...useLongPress(handler)} onClick={onClick}>
 *
 * Both onClick and long-press can coexist — onClick fires on quick tap,
 * long-press fires after the delay threshold.
 */
export function useLongPress(callback, { delay = 500 } = {}) {
  const timerRef = useRef(null)
  const triggeredRef = useRef(false)

  const start = useCallback((e) => {
    if (e.button != null && e.button !== 0) return
    triggeredRef.current = false
    timerRef.current = setTimeout(() => {
      triggeredRef.current = true
      callback(e)
    }, delay)
  }, [callback, delay])

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // If long-press fired, swallow the subsequent click so tap-action
  // doesn't run on top of the long-press handler.
  const handleClickCapture = useCallback((e) => {
    if (triggeredRef.current) {
      e.preventDefault()
      e.stopPropagation()
      triggeredRef.current = false
    }
  }, [])

  return {
    onPointerDown: start,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e) => e.preventDefault(),
    onClickCapture: handleClickCapture,
  }
}
