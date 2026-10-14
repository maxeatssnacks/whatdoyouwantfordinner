import { useCallback, useMemo, useState } from 'react'
import { VARIANT_DEFAULTS, VARIANT_PARTS } from './config'
import { VariantsContext } from './VariantsContext'

const STORAGE_KEY = 'wdywfd.v2.variants'

// Keep only known parts with valid options; anything else falls back to the default.
function sanitize(stored) {
  const choices = { ...VARIANT_DEFAULTS }
  if (!stored || typeof stored !== 'object') return choices
  for (const [key, part] of Object.entries(VARIANT_PARTS)) {
    if (part.options.some((opt) => opt.value === stored[key])) choices[key] = stored[key]
  }
  return choices
}

// Storage can be missing or throw (private mode, blocked site data), so every
// read and write is guarded and the defaults always win on failure.
function readChoices() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return sanitize(raw ? JSON.parse(raw) : null)
  } catch {
    return { ...VARIANT_DEFAULTS }
  }
}

function writeChoices(choices) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(choices))
  } catch {
    // Non-persistent session; choices still apply until reload.
  }
}

export function VariantsProvider({ children }) {
  const [choices, setChoices] = useState(readChoices)

  const setChoice = useCallback((partKey, value) => {
    setChoices((prev) => {
      const next = sanitize({ ...prev, [partKey]: value })
      writeChoices(next)
      return next
    })
  }, [])

  const resetChoices = useCallback(() => {
    const next = { ...VARIANT_DEFAULTS }
    writeChoices(next)
    setChoices(next)
  }, [])

  const value = useMemo(
    () => ({ choices, setChoice, resetChoices }),
    [choices, setChoice, resetChoices],
  )

  return <VariantsContext.Provider value={value}>{children}</VariantsContext.Provider>
}
