// Just enough React for hooks called outside a component.
export const useState = (v) => [typeof v === 'function' ? v() : v, () => {}]
export const useCallback = (fn) => fn
export const useMemo = (fn) => fn()
export const useRef = (v) => ({ current: v })
export const useEffect = () => {}
export default { useState, useCallback, useMemo, useRef, useEffect }
