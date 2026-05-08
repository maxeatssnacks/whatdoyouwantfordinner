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

Current version: **v1.1.0** (2026-05-07).

### v1.1.0 — Implementation reality sync

Documents the gap between the v1.0.0 aspirational spec and what shipped during mobile build-out. No token changes; component and flow docs updated to reflect production decisions.

**TopAppBar** — three new layout-override props added to handle real-world composition asymmetry:
- `titleFitContent` — shrinks title to content width, used by Plan to cluster chevrons + date + Sparkles tightly.
- `titleAbsoluteCenter` — absolutely centers title against full bar width, used by Recipes when leading is empty but trailing has multiple icons.
- `trailingPinRight` — pins an extra element to the bar's far right edge, used by Plan to separate Sparkles from the ChevronRight that stays adjacent to the date title.

**Flow deviations** — five flows have documented deviations from v1.0.0 (see "Implementation deviations from v1 spec" at the top of `FLOWS.md`):
- 5-tab bottom nav (was 4)
- Dashboard TopAppBar shows app name, not "Today"; no Bell/Settings
- Plan TopAppBar uses chevrons, not DatePickerToggle
- Shopping TopAppBar has no OverflowDots
- Profile TopAppBar has no SettingsGear

Restore deviated elements as their underlying features ship.

### Versioning rules

Any future additions should:
- Add new color tokens with the `gap token` note in `tokens.json`.
- Document new components in `COMPONENTS.md` with the same prop-table format.
- Update `FLOWS.md` whenever the implementation diverges from spec, even if the spec didn't change. Code is the truth.
- Bump version on `tokens.json` `$meta` when tokens change. Bump on `README.md` for any documented behavior change.

### Version history

- **v1.1.0** — 2026-05-07. Mobile implementation reality sync (TopAppBar override props, flow deviations).
- **v1.0.0** — 2026-05-04. Initial design system handoff. Six approved mobile flows + desktop verification.
