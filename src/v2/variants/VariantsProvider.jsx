import { useCallback, useMemo, useState } from 'react'
import { FLAG_DEFAULTS, VARIANT_DEFAULTS, VARIANT_FLAGS, VARIANT_PARTS } from './config'
import { VariantsContext } from './VariantsContext'

const STORAGE_KEY = 'wdywfd.v2.variants'

// Keep only known parts with valid options and boolean flags; anything else
// falls back to the default.
function sanitize(stored) {
  const choices = { ...VARIANT_DEFAULTS }
  const flags = { ...FLAG_DEFAULTS }
  if (!stored || typeof stored !== 'object') return { choices, flags }
  for (const [key, part] of Object.entries(VARIANT_PARTS)) {
    if (part.options.some((opt) => opt.value === stored[key])) choices[key] = stored[key]
  }
  const storedFlags = stored.flags && typeof stored.flags === 'object' ? stored.flags : {}
  for (const key of Object.keys(VARIANT_FLAGS)) {
    if (typeof storedFlags[key] === 'boolean') flags[key] = storedFlags[key]
  }
  return { choices, flags }
}

// Storage can be missing or throw (private mode, blocked site data), so every
// read and write is guarded and the defaults always win on failure.
function readState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return sanitize(raw ? JSON.parse(raw) : null)
  } catch {
    return sanitize(null)
  }
}

function writeState({ choices, flags }) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...choices, flags }))
  } catch {
    // Non-persistent session; choices still apply until reload.
  }
}

export function VariantsProvider({ children }) {
  const [state, setState] = useState(readState)

  const setChoice = useCallback((partKey, value) => {
    setState((prev) => {
      const next = sanitize({ ...prev.choices, [partKey]: value, flags: prev.flags })
      writeState(next)
      return next
    })
  }, [])

  const setFlag = useCallback((flagKey, value) => {
    setState((prev) => {
      const next = sanitize({ ...prev.choices, flags: { ...prev.flags, [flagKey]: !!value } })
      writeState(next)
      return next
    })
  }, [])

  const resetChoices = useCallback(() => {
    const next = sanitize(null)
    writeState(next)
    setState(next)
  }, [])

  const value = useMemo(
    () => ({ choices: state.choices, flags: state.flags, setChoice, setFlag, resetChoices }),
    [state, setChoice, setFlag, resetChoices],
  )

  return <VariantsContext.Provider value={value}>{children}</VariantsContext.Provider>
}
