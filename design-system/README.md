# WDYWFD — Handoff Package

Generated 2026-05-04 from approved design system v1. Six mobile flows + desktop scale verification.

## Contents

| File | Purpose |
|---|---|
| `tokens.css` | All design tokens as CSS custom properties. Drop into your global stylesheet or import in your Tailwind base layer. |
| `tokens.json` | Same tokens as a structured JSON. Wire into `tailwind.config.ts` via `theme.extend` or feed Style Dictionary. |
| `COMPONENTS.md` | Every component (Button, Input, Card, Badge, Modal/BottomSheet, TopAppBar, BottomTabBar) + the two saved patterns (MacrosRow, DestructivePreview). React + Tailwind code, full prop API, all variants and states. |
| `FLOWS.md` | Per-flow specs for Dashboard, Weekly Planner, Recipe Detail, Add Recipe, Shopping List, Profile — composition, all designed states, flow-specific patterns. |
| `LOADING.md` | Explicit shimmer values + per-screen skeleton recipes. **Read this before implementing any loading state.** |

## How to ingest

1. Install fonts: Lato (400/700/900) + Playfair Display (400/600/700/800) via Google Fonts or self-host.
2. Drop `tokens.css` into your app's global stylesheet, or convert to Tailwind theme via `tokens.json`.
3. Build out the components per `COMPONENTS.md` — copy the Tailwind class strings verbatim where possible; they reference the tokens.
4. Implement each flow following `FLOWS.md`. Each section under "Composition" maps to a leaf component.
5. Wire up loading states using `LOADING.md`. Don't substitute static skeletons.

## Source canvases (for visual reference)

Open these in the design tool to compare pixel output:

- `Dashboard + Planner.html` — Flow 1 + 2, all states
- `Recipe Detail + Add Recipe.html` — Flow 3 + 4, all states
- `Shopping List + Profile.html` — Flow 5 + 6, all states + the two saved-pattern docs cards
- `Desktop Verification.html` — desktop scale checks for MacrosRow, slot card, DestructivePreview
- `Component Library.html` — full atomic component reference (every variant of every component)

## Open questions / non-decisions

These were called out in the canvases as TBD — engineering can ship v1 with the noted defaults:

- "Will replace" warning visibility on add-to-meal-plan sheet — defaulting to **always-visible**.
- Print / Email-me-this-list on Shopping — **not in v1**, Copy-to-clipboard covers all use cases.
- Member edit screen — **out of scope** this batch; tap-row chevrons just navigate (route exists, view doesn't).
- Settings detail screens (notifications, units, theme) reachable via Profile gear — **out of scope** this batch.

## Versioning

This is **v1.0.0** of the system. Any future additions should:
- Add new color tokens with the `gap token` note in `tokens.json`.
- Document new components in `COMPONENTS.md` with the same prop-table format.
- Update `FLOWS.md` only when an approved screen actually changes.
- Bump version on `tokens.json` `$meta`.
