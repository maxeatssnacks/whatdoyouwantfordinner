import { createContext, useContext } from 'react'
import { VARIANT_DEFAULTS } from './config'

export const VariantsContext = createContext(null)

// Current choice for one switchable part, e.g. useVariant('mealCard') → 'B'.
// Outside a VariantsProvider it falls back to the configured default.
export function useVariant(partKey) {
  const ctx = useContext(VariantsContext)
  return ctx ? ctx.choices[partKey] : VARIANT_DEFAULTS[partKey]
}

// Full state + setters, for the variant panel.
export function useVariantControls() {
  const ctx = useContext(VariantsContext)
  if (!ctx) throw new Error('useVariantControls must be used inside VariantsProvider')
  return ctx
}
