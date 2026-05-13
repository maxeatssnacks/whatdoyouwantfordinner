# Planner Subsystem — Design System Cohesion Audit

**Audited files:**
- `src/components/planner/WeeklyPlanner.jsx` (290 lines)
- `src/components/planner/DayColumn.jsx` (123 lines)
- `src/components/planner/MealSlot.jsx` (304 lines)
- `src/components/planner/MealSlotSkeleton.jsx` (9 lines)
- `src/components/planner/MealTypeSelector.jsx` (115 lines)
- `src/components/planner/HouseholdSelector.jsx` (46 lines)
- `src/components/planner/LeftoverDetailModal.jsx` (135 lines)
- `src/components/planner/WeeklyMacroSummary.jsx` (123 lines)

**Audited against:** `design-system/COMPONENTS.md` v1.2.0, `design-system/tokens.css`, `design-system/LOADING.md` (skeleton spec), `design-system/FLOWS.md` Flow 2 (Weekly Planner — mobile reference only, not a conformance target per the desktop overhaul scope decision), `audits/dashboard-desktop.md` (prior context — Dashboard renders `WeeklyPlanner` and `WeeklyMacroSummary` so internal findings here were explicitly deferred from that audit).

**Date:** 2026-05-12

**Scope:** Cohesion of every shared planner subcomponent with the design system. The 8 files surveyed render through both `PlanDesktop.jsx` and `PlanMobile.jsx` (and partially through `DashboardDesktop.jsx`), so findings here ripple across multiple surfaces. Findings target the *components themselves*, not the pages that compose them.

**Out of scope:**
- `src/pages/Plan.jsx` (8-line platform router — no UI)
- `src/pages/PlanDesktop.jsx` (14-line shell — see thin-shell note below)
- `src/pages/PlanMobile.jsx` (337 lines — own audit later if mobile cohesion work is ever done)
- `Card` / `Modal` / `Button` / `IconBtn` / `Input` / `Badge` / `Checkbox` / `LoadingSpinner` primitive internals
- `MacrosBadge` (separate audit queued)
- `useMealPlanSuggest` / `usePlanner` hook internals
- `recipeContainsAvoidedIngredients` / `scoreRecipeForHousehold` / `weightedRandomSelect` logic

**Thin-shell note (PlanDesktop.jsx):** PlanDesktop renders a single page-title `<h1 className="text-3xl font-display font-bold text-text-primary mb-6">Weekly Plan</h1>` then drops `<WeeklyPlanner />`. `text-3xl` (30px) sits between Dashboard's `text-4xl` (36px) hero and a Card-section H2. Heading is single-color where Dashboard's hero greeting is dual-color (after the recent fix). Not a finding here — bundled in the "next pass on page-level headings" set already on Design queue. PlanMobile.jsx not surveyed.

---

## Summary

The planner subsystem is the largest accumulation of pre-design-system drift in the codebase. Three reinforcing patterns make it dense:

1. **Color drift is broad and consistent.** Amber (~67 instances), orange (8 instances of gradient companions), raw red/green/yellow/gray for semantic state in `WeeklyMacroSummary`. Almost every visible surface is colored outside the token system.
2. **Primitives are bypassed at every level.** Hand-rolled chip toggles in `HouseholdSelector`, hand-rolled selectable cards in `MealTypeSelector`, hand-rolled pill day-picker in `LeftoverDetailModal`, hand-rolled progress bars in `WeeklyMacroSummary`, hand-rolled tooltip + hand-rolled destructive `<button>`s in `MealSlot`, hand-rolled prev/next week IconBtns and a gradient `<Button>` override in `WeeklyPlanner`, hand-rolled "Today" badge in `DayColumn`.
3. **The skeleton is non-conforming.** `MealSlotSkeleton` uses `animate-pulse` + raw `bg-amber-100` — LOADING.md's spec is an explicit shimmer animation with token-derived stops. This is the canonical example of what LOADING.md is warning against ("Engineers must not substitute static skeletons").

**The cleanest files are the small ones:**
- `MealSlotSkeleton.jsx` (9 lines) — every line is drift, but mechanically trivial to fix.
- `HouseholdSelector.jsx` (46 lines) — one widget, drift is concentrated.

**The hardest files are the big ones:**
- `MealSlot.jsx` (304 lines) — both the empty-slot affordance AND the filled card need redesign-grade treatment; macro stats markup repeats 4× and could be primitive-ized; tooltip is hand-rolled.
- `WeeklyPlanner.jsx` (290 lines) — page header, household banner, "Suggest My Week" gradient CTA, "No Eligible Recipes" Modal, and a second gradient inside the Modal all need attention.

**No silent bugs found.** All Tailwind classes are static strings (no dynamic interpolation like the Landing `bg-${color}/10` bug). The `bg-amber-*` / `bg-red-500` / `bg-green-500` etc. are real Tailwind utilities and will render — they're just not on-brand.

One naming inconsistency surfaces: `MealTypeSelector` and `LeftoverDetailModal` both expose an `isOpen` prop that they pipe to Modal's `open`. Already noted on Dashboard audit for `OnboardingModal`; this audit confirms it's a 3-instance pattern.

**Total findings: 35. Bug findings: 0.**

Severity tags:
- **🔴 high** — visible cohesion failure that contradicts the design system
- **🟡 medium** — bypasses primitives or tokens but renders acceptably
- **🟢 low** — polish, consistency, or minor token alignment
- **⚪ note** — observation that may need a Design system extension or PM-style decision

---

## Cross-cutting findings

Patterns that recur in 2+ files. Numbered `X.N`. Each gives a per-file instance breakdown so a fix prompt can target specifically.

### 🔴 X.1 · `amber-*` drift across all 8 files

~67 instances per `grep -rcn 'amber-' src/components/planner/`:

| File | Count |
|---|---|
| `DayColumn.jsx` | 12 |
| `MealSlot.jsx` | 12 |
| `WeeklyMacroSummary.jsx` | 12 |
| `WeeklyPlanner.jsx` | 11 |
| `LeftoverDetailModal.jsx` | 8 |
| `MealTypeSelector.jsx` | 5 |
| `MealSlotSkeleton.jsx` | 4 |
| `HouseholdSelector.jsx` | 3 |

Canonical mapping (per `PROJECT_NOTES.md` and prior audits):

| Source class | Maps to |
|---|---|
| `bg-amber-50` / `bg-amber-50/50` / `from-amber-50` | `bg-accent-soft/40` |
| `bg-amber-100` / `bg-amber-100/70` | `bg-accent-soft/60` (or `bg-accent-soft` solid for skeleton) |
| `bg-amber-500` (solid fill, e.g. "Today" badge) | `bg-primary` |
| `border-amber-200` / `border-amber-200/30` / `border-amber-200/50` | `border-accent/60` (or `border-border` for neutral surfaces) |
| `border-amber-300` (dashed empty slot) | `border-accent/60` |
| `border-amber-400` / `border-amber-400/50` (today highlight) | `border-primary` |
| `border-amber-500` (selected state) | `border-primary` |
| `text-amber-500` (icon tertiary) | `text-text-tertiary` or `text-warning` (semantic question) |
| `text-amber-600` (icon at rest) | `text-primary` or `text-text-secondary` |
| `text-amber-700` (body text inside warm surface) | `text-text-secondary` |
| `text-amber-800` (body text emphasized) | `text-text-secondary` or `text-text-primary` |
| `text-amber-900` (heading) | `text-text-primary` |
| `hover:bg-amber-50` / `hover:bg-amber-200` | `hover:bg-surface-hover` |

Same drift pattern fixed on Profile, Recipes, Dashboard, Recipe Detail, and the Landing skeleton. Mechanical to apply; large because of the file count.

### 🔴 X.2 · `orange-*` drift, always paired with amber gradients

8 instances across 3 files:

| File | Lines | Pattern |
|---|---|---|
| `WeeklyPlanner.jsx` | 214, 281 | `bg-gradient-to-r from-amber-500 to-orange-500` (Suggest button × 2) |
| `DayColumn.jsx` | 62, 63, 92, 93 | `bg-gradient-to-br from-amber-100/70 to-orange-100/50` (today) and `from-amber-50/50 to-orange-50/30` (default) |
| `WeeklyMacroSummary.jsx` | 35 | `bg-gradient-to-br from-amber-50 to-orange-50` (card background) |

The orange→amber gradient is essentially "warm primary tone fading to warm accent." Drop the gradient entirely:
- Day-column today: solid `bg-accent-soft/60 border-2 border-primary` (highlights as warm + primary border).
- Day-column default: solid `bg-accent-soft/40 border border-border` (neutral warm surface).
- Macro summary card background: solid `bg-accent-soft/40` or `bg-surface` (it's a sidebar card — see X.5 about the broader treatment).
- Suggest button: see X.3.

### 🔴 X.3 · Gradient buttons bypass the Button primitive (2 instances)

`WeeklyPlanner.jsx:211-218` and `WeeklyPlanner.jsx:276-284` both render `<Button>` with `className="… bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-sm"`. This overrides Button's `variant="primary"` styling.

Same finding shipped on Recipe Detail (gradient CTAs → `variant="primary"`). Fix: drop the `bg-gradient-*` classes, keep `<Button>` (default variant is primary). The Sparkles icon stays. Inside the "No Eligible Recipes" Modal, the same drop applies.

### 🟡 X.4 · Raw `red-*` tokens for destructive actions (3 sites, 3 files)

| File | Line | Context | Class |
|---|---|---|---|
| `MealSlot.jsx` | 226, 229 | Remove (X) button | `hover:bg-red-50` + `text-red-500` |
| `LeftoverDetailModal.jsx` | 125 | "Remove leftover" Button override | `text-red-600 hover:text-red-700 hover:bg-red-50` |
| `WeeklyMacroSummary.jsx` | 25 | Macro progress bar (semantic state) | `bg-red-500` |

Two distinct semantics:
- **Destructive interactions** (MealSlot remove, LeftoverDetailModal remove): map to `text-error` / `bg-error-soft` / `hover:bg-error-soft`. The LeftoverDetailModal case is even cleaner: drop the className overrides entirely and use `<Button variant="destructive">`.
- **Semantic "over goal" state** (WeeklyMacroSummary): map to `bg-error`. This is the same `error` token but used as state color, not interaction color. Acceptable use.

### 🟡 X.5 · Raw `red-500` / `yellow-500` / `green-500` / `gray-400` for macro state (1 file, 4 sites)

`WeeklyMacroSummary.jsx:17-26` returns one of four hex-Tailwind defaults depending on macro-goal proximity:

```js
const getColorClass = (actual, goal) => {
  if (!goal) return 'bg-gray-400'
  const percentDiff = Math.abs((actual - weeklyGoal) / weeklyGoal) * 100
  if (percentDiff <= 10) return 'bg-green-500'
  if (percentDiff <= 20) return 'bg-yellow-500'
  return 'bg-red-500'
}
```

Token mapping:
- `bg-gray-400` (no goal set) → `bg-text-tertiary`
- `bg-green-500` (within 10%) → `bg-success`
- `bg-yellow-500` (within 20%) → `bg-warning`
- `bg-red-500` (>20% off) → `bg-error`

Same pattern shows up nowhere else in the codebase, so this is a one-file fix. The four tokens already exist in `tokens.css`.

### 🟢 X.6 · `isOpen` vs Modal's `open` prop inconsistency (2 sites)

Both `MealTypeSelector` and `LeftoverDetailModal` accept `isOpen` and pipe it to `<Modal open={isOpen}>`. Same inconsistency Dashboard audit flagged on `OnboardingModal`. Three sites now confirmed — the inconsistency is consistent enough to be a stylistic preference rather than a typo.

Two paths:
- (a) Rename `isOpen` → `open` everywhere. Matches Modal's API. Three files, three trivial renames.
- (b) Document the wrapper-vs-primitive distinction (wrappers use `isOpen`; Modal itself uses `open`) and accept it.

⚪ Lean (a). The inconsistency provides no information, and the wrappers are thin enough that pass-through naming is best.

### 🟡 X.7 · `bg-white` should be `bg-surface` (3 sites, 3 files)

| File | Line | Context |
|---|---|---|
| `MealSlotSkeleton.jsx` | 3 | Skeleton wrapper |
| `MealSlot.jsx` | 187 | Filled-slot card background |
| `WeeklyMacroSummary.jsx` | 48 | Per-member sub-card background |
| `HouseholdSelector.jsx` | 35 | Unselected chip background |

`bg-white` (`#FFFFFF`) differs from `bg-surface` (`#FFF8F0`, warm off-white). Per `tokens.css`, all card surfaces should use `bg-surface`. Visible difference is subtle but contributes to the "cool clinical" feel that fights the warm cookbook aesthetic.

### 🟡 X.8 · Modal `width={672}` arbitrary value (2 sites)

`WeeklyPlanner.jsx:258` and `MealTypeSelector.jsx:50` both call `<Modal width={672}>`. Default is 480. The 672px choice is the same Tailwind `max-w-2xl` width but specified numerically. Recurs in both planner modals.

This is the "named Modal sizes" Design queue item (already on the queue from prior audits). Until that ships:
- Keep `width={672}` if it's correct visually.
- Or drop to default 480 if the modals don't need extra width.

⚪ Defer to the named-modal-sizes queue item. No fix needed inside this audit's bundle.

### 🔴 X.9 · Hand-rolled selectable chip/tile patterns (4 sites, 3 files)

A recurring micro-pattern across the planner: clickable pill/chip/card that has a selected and unselected visual state, hand-rolled at each call site.

| File | Lines | Use case |
|---|---|---|
| `HouseholdSelector.jsx` | 27-42 | Toggle household member ON/OFF for planning session |
| `MealTypeSelector.jsx` | 61-95 | Toggle meal type ON/OFF in suggest modal |
| `LeftoverDetailModal.jsx` | 106-117 | "Move to a different day" day-picker |
| `WeeklyPlanner.jsx` | 184-204 | Prev/next week chevrons + week label (not a chip, but a hand-rolled control group) |

The HouseholdSelector and MealTypeSelector cases especially could be unified — both are "toggle-pill selectable" with selected = primary fill, unselected = neutral border. Candidate for a `<ChipToggle>` or `<SelectablePill>` primitive.

The LeftoverDetailModal day-picker is more of a "transient action picker" — chip-shaped but each tap commits a move and closes the modal. Could be `<Button size="sm" variant="ghost">` with `capitalize` styling.

⚪ Possible Design queue: `<ChipToggle>` primitive (binary on/off pill, primary fill when selected, neutral when not).

### 🟢 X.10 · Macro stats markup repeats (2 sites, 2 files)

`MealSlot.jsx:254-277` and `LeftoverDetailModal.jsx:75-98` both render the same per-portion macro snippet (calories, protein, carbs, fat) with the same `text-xs font-body text-amber-700` styling. Could be a `<PortionMacros>` micro-primitive or a slimmed-down `MacrosBadge` variant.

Out of scope for this audit; flag for the MacrosBadge audit when it happens.

---

## Per-file findings

Ordered smallest-to-largest as warm-up.

---

## Section 1 · MealSlotSkeleton.jsx (9 lines, 4 amber)

### 🔴 1.1 · Skeleton does not conform to LOADING.md shimmer spec

Full file:
```jsx
export function MealSlotSkeleton() {
  return (
    <div className="w-full p-3 border-2 border-amber-200/50 rounded-xl bg-white animate-pulse">
      <div className="h-3 bg-amber-100 rounded w-1/3 mb-2" />
      <div className="h-4 bg-amber-100 rounded w-3/4 mb-2" />
      <div className="h-3 bg-amber-100 rounded w-1/2" />
    </div>
  )
}
```

LOADING.md is explicit: skeletons must use the `.skeleton` class with the documented linear-gradient + 1400ms shimmer animation. Current implementation uses `animate-pulse` (Tailwind's default opacity-pulse) and `bg-amber-100` (wrong token). LOADING.md even calls this out as anti-pattern #1 ("Static gray boxes — must shimmer", and the warmth requirement: "Generic light gray… etc. Must use the warm `#E8D9C8` / `#F0E2CF` pair").

Two fix paths:

**(a) Inline-rewrite using `.skeleton` class:**
```jsx
export function MealSlotSkeleton() {
  return (
    <div className="w-full p-3 border-2 border-border rounded-xl bg-surface">
      <div className="skeleton h-3 w-1/3 mb-2" />
      <div className="skeleton h-4 w-3/4 mb-2" />
      <div className="skeleton h-3 w-1/2" />
    </div>
  )
}
```
Assumes `.skeleton` is registered in the global CSS layer (per `tokens.css` it is — bottom of the file). The wrapper keeps `bg-surface` + `border-border` to mirror the resolved card structure.

**(b) Replace with the `<Skeleton>` primitive from LOADING.md.**
LOADING.md ships a React `<Skeleton width height radius marginBottom>` component. If it's been wired into `src/components/ui/Skeleton.jsx` (per CLAUDE.md it's listed there), use it directly:
```jsx
import { Skeleton } from '../ui/Skeleton'
export function MealSlotSkeleton() {
  return (
    <div className="w-full p-3 border-2 border-border rounded-xl bg-surface">
      <Skeleton height={12} width="33%" marginBottom={8} />
      <Skeleton height={16} width="75%" marginBottom={8} />
      <Skeleton height={12} width="50%" />
    </div>
  )
}
```

Lean (b) if the `<Skeleton>` primitive exists. Falls back to (a) if it's not wired up yet.

⚪ This finding is a leading instance of the wider "skeleton-shimmer conformance pass" Design queue item (added after the auth flow audit). Other suspect skeletons: Landing's `SkeletonCard`. Worth grepping `animate-pulse` repo-wide to size the broader sweep.

---

## Section 2 · HouseholdSelector.jsx (46 lines, 3 amber)

### 🔴 2.1 · Empty-state body text uses `text-amber-700`

Line 4: `<p className="text-sm text-amber-700 font-body">`. Maps to `text-text-secondary`. Pure mechanical swap.

### 🔴 2.2 · Hand-rolled chip toggle with amber color palette throughout

Lines 27-42. Selected: `bg-amber-500 text-white shadow-md border-2 border-amber-500`. Unselected: `bg-white text-amber-800 border-2 border-amber-200 hover:border-amber-400`.

Token-mapped equivalent (minimum-effort fix, keeps hand-rolled component):
- Selected: `bg-primary text-white border-2 border-primary shadow-resting`
- Unselected: `bg-surface text-text-primary border-2 border-border hover:border-border-hover`

The `shadow-md` on selected → `shadow-resting` (warm token instead of Tailwind default cool gray).

Note: this component has no accessibility affordance for selected state. Each `<button>` lacks `aria-pressed`. Out of cohesion scope; logging for future a11y pass.

### ⚪ 2.3 · Could be a `<ChipToggle>` primitive

See X.9. Until the primitive ships, the in-place token swap above is sufficient.

---

## Section 3 · MealTypeSelector.jsx (115 lines, 5 amber)

### 🔴 3.1 · Selected-state amber palette on the meal-type option cards

Lines 65-93. Selected option: `border-amber-500 bg-amber-50` + child text `text-amber-900` + child body `text-amber-700`. Unselected hover: `hover:border-amber-300`. The 6×6 selected indicator circle uses `border-amber-500 bg-amber-500`.

Token-mapped:
- Selected card: `border-primary bg-accent-soft/40`
- Selected card title: `text-text-primary`
- Selected card body: `text-text-secondary`
- Unselected hover border: `hover:border-border-hover`
- Selected indicator: `border-primary bg-primary`

### 🟡 3.2 · Option markup could use `<Card state="selected">` + `<Checkbox>`

The current hand-rolled `<button>` carries both selection state and visual treatment. Card primitive has a `state="selected"` variant that adds a `border-primary bg-[#FDF1E3]` shadow halo + top-right checkmark badge. Checkbox primitive handles the selected-circle affordance.

Two paths:
- (a) Token-swap only (3.1 above). Keep hand-rolled. Mechanical.
- (b) Refactor to `<Card state={isSelected ? 'selected' : 'resting'}> + <Checkbox>`. Closer to design system but the Card's built-in checkmark conflicts with the inline checkbox circle — would need to drop the inline checkbox or hide Card's built-in.

Lean (a) for this bundle. Card's selected variant doesn't quite match this multi-select-tile use case; revisit if the option cards become a recurring pattern (Add-to-meal-plan sheet will likely have similar shape).

### 🟢 3.3 · "Cancel" Button uses `variant="secondary"` for a non-destructive cancel

Line 101: `<Button variant="secondary" onClick={onClose}>Cancel</Button>`. `secondary` = sage green primary action. For a Cancel pair, the canonical mapping (per Recipe Detail audit precedent) is `variant="ghost"` — primary-colored outline. Sage is used for confirm-secondary actions, not cancels.

Two-line fix: `variant="secondary"` → `variant="ghost"`.

### 🟢 3.4 · Inline SVG checkmark instead of `<Check>` icon from lucide-react

Lines 89-91. The selected indicator uses a hand-written `<svg>` with the checkmark path. The codebase imports `<Check>` from `lucide-react` (see `MealSlot.jsx`, others). Trivial swap, but worth doing for icon-system cohesion.

---

## Section 4 · DayColumn.jsx (123 lines, 12 amber)

### 🔴 4.1 · Day-row backgrounds use amber-orange gradients (today vs. default)

Lines 60-64 (desktop) and 90-94 (mobile accordion) both branch:
```
isToday
  ? 'bg-gradient-to-br from-amber-100/70 to-orange-100/50 border-amber-400/50 shadow-amber-100'
  : 'bg-gradient-to-br from-amber-50/50 to-orange-50/30 border-amber-200/30'
```

Per X.2, drop the gradient entirely:
- Today: `bg-accent-soft/60 border-2 border-primary shadow-resting` (warm + primary border)
- Default: `bg-accent-soft/40 border-2 border-border shadow-resting` (warm neutral)

Note: `shadow-amber-100` is invalid — Tailwind doesn't generate amber-colored shadow utilities. It silently falls back to no shadow. Replace with `shadow-resting` (a real token).

### 🔴 4.2 · Day label heading is `text-amber-900`, micro is `text-amber-700`

Lines 67-70 (desktop) and 100-103 (mobile):
- `<h3 className="text-base font-display font-bold text-amber-900 capitalize">` → `text-text-primary`
- `<p className="text-xs text-amber-700 font-body mt-0.5">` (desktop) / `text-sm text-amber-700` (mobile) → `text-text-secondary`

### 🔴 4.3 · "Today" pill is hand-rolled with amber fill

Lines 71-77 (desktop) and 104-108 (mobile):
```
<span className="mt-1 inline-block text-xs font-body font-semibold bg-amber-500 text-white px-1.5 py-0.5 rounded-full">
  Today
</span>
```

This is the canonical `<Badge tone="primary" variant="solid">Today</Badge>` use case — uppercase short text, pill shape, solid fill. Spec mapping (`COMPONENTS.md` §4):
```jsx
<Badge tone="primary" variant="solid">Today</Badge>
```
Badge handles the uppercase + tracking + radius automatically. Drops 5 ad-hoc classes.

The current `text-xs` (12px) is slightly larger than Badge's `text-[11px]` — visually close enough that the swap should be safe. Verify on render.

### 🟡 4.4 · Mobile accordion uses hand-rolled chevron + invisible-spacer hack

Lines 71-77 desktop renders an "invisible Today placeholder" span to preserve grid alignment when today is absent:
```jsx
<span className="mt-1 inline-block text-xs py-0.5 invisible">Today</span>
```
This is a layout hack — invisible placeholder text to maintain row height. Acceptable but worth noting.

Mobile accordion button (line 95-113) is hand-rolled — could be an IconBtn for the chevron, but the whole button is the toggle target (the user taps the full row, not just the chevron). Hand-roll is appropriate for an accordion header.

### 🔴 4.5 · Accordion hover background `hover:bg-amber-50/60`

Line 97: `hover:bg-amber-50/60` → `hover:bg-surface-hover`. Mechanical.

### 🔴 4.6 · Mobile accordion chevron container is `text-amber-700`

Line 110: `<div className="text-amber-700 flex-shrink-0 ml-2">` → `text-text-secondary` (matches the day-label micro color).

### 🟢 4.7 · `<></>` fragment with separate desktop/mobile children

Lines 57-122: file returns two siblings (`hidden md:flex` and `md:hidden`). Adds DOM weight but is the standard responsive split pattern used elsewhere. No finding.

---

## Section 5 · WeeklyMacroSummary.jsx (123 lines, 12 amber)

### 🔴 5.1 · Card background uses amber-orange gradient

Line 35: `bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 border-2 border-amber-200/50`. Per X.2: drop gradient → `bg-accent-soft/40 rounded-2xl p-6 border border-border` (or `border-2 border-accent/60` if the warmer "warning-shaped" treatment is intended; lean to `border-border` since this is informational, not a warning).

### 🔴 5.2 · Heading `text-amber-900`

Line 36: `text-lg font-display font-bold text-amber-900 mb-4` → `text-text-primary`. Mechanical.

### 🔴 5.3 · Per-member sub-card uses `bg-white border-amber-200`

Line 48: `bg-white rounded-xl p-4 border border-amber-200` → `bg-surface rounded-xl p-4 border border-border` (per X.7 for bg-white and X.1 for border).

### 🔴 5.4 · Member name uses `text-amber-900`

Line 49: `font-display font-bold text-amber-900` → `text-text-primary`.

### 🔴 5.5 · Macro row labels use `text-amber-800`

Lines 56, 72, 88, 104: `text-xs font-body text-amber-800` (4 instances) → `text-text-secondary`. Mechanical.

### 🔴 5.6 · Progress bar track uses `bg-amber-100`

Lines 62, 78, 94, 110: `w-full bg-amber-100 rounded-full h-3 overflow-hidden` (4 instances) → `bg-accent-soft/60` or `bg-border` for a neutral track. Lean `bg-border` (neutral cool-warm rather than warm-warm — provides visual contrast with the colored fill).

### 🔴 5.7 · Progress bar fill uses raw `bg-green-500` / `bg-yellow-500` / `bg-red-500` / `bg-gray-400`

See X.5. Map to `bg-success` / `bg-warning` / `bg-error` / `bg-text-tertiary`. Single function, four lines, mechanical.

### 🟡 5.8 · Progress bar is hand-rolled

The 4× progress-bar markup (track div + fill div with inline `style={{ width }}`) is a hand-rolled `<ProgressBar value={x} variant={state}>` candidate. Not on Design queue. Recurs nowhere else in this audit, so a primitive isn't urgent — flag if it recurs in TDEE or shopping progress contexts.

⚪ Possible Design queue: `<ProgressBar>` primitive with tone variants. Low priority — single instance.

### ⚪ 5.9 · `compact` prop is referenced by `DashboardDesktop.jsx`

Line 3: `compact = false` prop. Dashboard passes `compact` (boolean true). Inside this component, `compact` only affects the grid columns (line 40: `grid-cols-1` vs `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`).

The card-wrapper styling (gradient, padding, border) is identical in both modes — so on Dashboard's sidebar (where space is constrained), the same chunky `p-6 border-2` card chrome renders. Once 5.1 maps to a quieter `bg-accent-soft/40 border border-border`, this should still read well in compact mode. No additional finding.

---

## Section 6 · LeftoverDetailModal.jsx (135 lines, 8 amber)

### 🔴 6.1 · Recipe title uses `text-amber-900`

Line 63: `text-lg font-display font-bold text-amber-900` → `text-text-primary`.

### 🔴 6.2 · "Leftover from {day}" subtitle uses `text-amber-700`

Lines 65, 70: both `text-sm font-body text-amber-700` → `text-text-secondary`.

### 🔴 6.3 · Macro stats use `text-amber-800`

Lines 78, 83, 88, 93: 4× `text-sm font-body text-amber-800` → `text-text-secondary`. (Note: these are larger than MealSlot's `text-xs` macro stats — consistent within this modal.)

### 🔴 6.4 · "Move to a different day" day-pill chips use amber palette

Lines 108-114:
```jsx
className="px-3 py-1.5 text-sm font-body font-semibold bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg transition-colors capitalize disabled:opacity-50"
```

Three paths:
- (a) Token-swap to keep hand-rolled: `bg-accent-soft/60 hover:bg-accent-soft text-text-primary`. Mechanical.
- (b) Replace with `<Button size="sm" variant="ghost">` — uses primary outline + tap feedback. Each chip becomes `<Button size="sm" variant="ghost" onClick={...} className="capitalize">{slot.name}</Button>`. Semantically correct (it's an action button, not a passive label).
- (c) Surface as `<ChipToggle>` candidate (X.9). These aren't toggles though — each tap commits. So (b) fits better than (c).

Lean (b). `Button size="sm"` is the right size (36px, dense). Drops 1 hand-rolled class block. The disabled state (`disabled:opacity-50`) is handled by Button automatically.

### 🔴 6.5 · "Remove leftover" Button overrides with raw `red-*` instead of `variant="destructive"`

Lines 122-130:
```jsx
<Button
  variant="ghost"
  className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
  onClick={handleDismiss}
  disabled={removeEntry.isPending}
>
  Remove leftover
</Button>
```

The intent is "destructive action." Button has `variant="destructive"` (per COMPONENTS.md §1). Fix:
```jsx
<Button
  variant="destructive"
  className="w-full"
  onClick={handleDismiss}
  disabled={removeEntry.isPending}
>
  Remove leftover
</Button>
```
Drops all className overrides. `variant="destructive"` uses `bg-error text-white` which is solid red — visually heavier than the current ghost-red treatment.

⚪ If solid destructive feels too aggressive for this modal's quiet flow, route a `<Button variant="ghost-destructive">` request to the Design queue (already on the queue per FLOWS.md Flow 6 — and noted as never-shipped on PROJECT_NOTES.md). Solid `destructive` is the right answer until that ships.

### 🟢 6.6 · Modal `width={448}` is also a one-off (matches Modal default 480 closely)

Line 59: `<Modal open={isOpen} onClose={onClose} title="Leftover" width={448}>`. 448 vs default 480 = 32px narrower. Probably no visible difference. Drop to default 480 for consistency, or keep if there's a layout reason.

### 🟢 6.7 · `isOpen` → `open` rename

See X.6. Prop name doesn't match Modal's API.

---

## Section 7 · WeeklyPlanner.jsx (290 lines, 11 amber)

### 🔴 7.1 · Household banner uses amber palette throughout

Lines 157-178. Drift inventory:
- Wrapper: `bg-amber-50/50 rounded-2xl p-6 border-2 border-amber-200/50` → `bg-accent-soft/40 rounded-2xl p-6 border-2 border-accent/60` (or `border-border` if the warning-shaped treatment is intentional only for "needs attention" — this is informational, lean `border-border`).
- Users icon: `text-amber-700` → `text-text-secondary` (or `text-primary` if it should anchor the panel as branded).
- Heading: `text-amber-900` → `text-text-primary`.
- Add-member button:
  - Currently: `h-10 w-10 rounded-full border-2 border-amber-200 text-amber-600 hover:border-amber-400 hover:text-amber-800 hover:bg-amber-50 transition-all`.
  - Should be: `<IconBtn>` with label="Manage household members". The 40×40 size matches IconBtn exactly. Drops the entire `<button>` + className block.

```jsx
<IconBtn
  label="Manage household members"
  onClick={() => navigate('/profile')}
>
  <Plus size={16} />
</IconBtn>
```

The dashed-bordered "add another" affordance was a design choice that doesn't quite map to IconBtn (IconBtn is plain transparent ghost). If the dashed border is intentional, document as deviation and just swap colors to tokens.

### 🔴 7.2 · Hand-rolled prev/next week chevrons + week label

Lines 184-204:
```jsx
<button onClick={handlePrevWeek} className="p-0.5 text-amber-700 hover:text-amber-900 transition-colors" aria-label="Previous week">
  <ChevronLeft size={16} />
</button>
<button onClick={currentWeekOffset !== 0 ? handleToday : undefined} className="text-base font-body font-medium text-amber-800 px-1 whitespace-nowrap …">
  {formatWeekRange(weekStartDate)}
</button>
<button onClick={handleNextWeek} className="p-0.5 text-amber-700 hover:text-amber-900 transition-colors" aria-label="Next week">
  <ChevronRight size={16} />
</button>
```

Three hand-rolled buttons that should be one IconBtn + click-target label + IconBtn:
```jsx
<IconBtn label="Previous week" onClick={handlePrevWeek}>
  <ChevronLeft size={16} />
</IconBtn>
<button
  onClick={currentWeekOffset !== 0 ? handleToday : undefined}
  className={cn(
    'text-base font-body font-medium text-text-secondary px-1 whitespace-nowrap',
    currentWeekOffset !== 0 ? 'hover:text-text-primary cursor-pointer' : 'cursor-default'
  )}
>
  {formatWeekRange(weekStartDate)}
</button>
<IconBtn label="Next week" onClick={handleNextWeek}>
  <ChevronRight size={16} />
</IconBtn>
```

The middle "go to today" button stays hand-rolled (it's a text affordance, not an icon). The two IconBtns drop 4 amber instances.

### 🔴 7.3 · "Suggest My Week" Button has gradient override

Lines 211-218:
```jsx
<Button
  onClick={handleSuggestWeek}
  disabled={…}
  className="flex-shrink-0 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-sm"
>
  <Sparkles size={18} className="mr-2" />
  {isSuggesting ? 'Suggesting...' : 'Suggest My Week'}
</Button>
```

Three issues:
1. Gradient overrides Button's variant styling (X.3). Drop the className gradient.
2. Sparkles icon uses legacy `<Icon className="mr-2" />` child pattern → use `icon` prop.
3. `shadow-sm` is Tailwind default; default Button comes with `shadow-resting` via the variant — `shadow-sm` is a no-op override.

After:
```jsx
<Button
  onClick={handleSuggestWeek}
  disabled={…}
  icon={<Sparkles size={18} />}
>
  {isSuggesting ? 'Suggesting...' : 'Suggest My Week'}
</Button>
```

### 🔴 7.4 · "Add recipes to get started" hint uses `text-amber-700`

Line 207: `text-xs text-amber-700 font-body hidden sm:inline` → `text-text-secondary`. Mechanical.

### 🔴 7.5 · "No Eligible Recipes" Modal body text uses `text-amber-800`

Line 261: `<p className="text-amber-800 font-body">` → `text-text-secondary`. Note: Modal body has default styling (`text-text-secondary` per COMPONENTS.md §5); the className here is redundant if the default already matches. Drop to a plain `<p className="font-body">`.

### 🔴 7.6 · "No Eligible Recipes" Modal bypass button has gradient override

Lines 276-284: same gradient pattern as 7.3. Drop gradient, drop className entirely (default variant=primary already correct).

### 🟢 7.7 · "No Eligible Recipes" Cancel button uses `variant="secondary"`

Line 267: `<Button variant="secondary" …>Cancel</Button>`. Per 3.3, cancel actions should use `variant="ghost"`.

### 🟡 7.8 · Modal action buttons render in body, not `actions` slot

Lines 265-285 render the Cancel + Bypass Buttons inside the body content (`<div className="flex gap-3">`), instead of using Modal's `actions` prop. Modal has dedicated footer treatment for action buttons (sticky bottom on scrollable variants, proper spacing). Cosmetic in this case (the body is short enough that no scroll happens), but bypasses the design system's structure.

Refactor:
```jsx
<Modal
  open={showNoRecipesModal}
  onClose={() => setShowNoRecipesModal(false)}
  title="No Eligible Recipes Found"
  width={672}
  actions={
    <>
      <Button variant="ghost" onClick={…}>Cancel</Button>
      <Button onClick={…}>Bypass Recency Filter</Button>
    </>
  }
>
  <p className="font-body">
    All your recipes have been used recently based on your recency filter settings.
  </p>
</Modal>
```

### 🟢 7.9 · `alert()` for error states (5 instances)

Lines 110-127. Five `alert(...)` calls for error reporting from the suggest pipeline. Not a design-system finding per se — this is a hand-rolled error UX. Out of cohesion scope; flag for the toast/error-banner pass. Particularly relevant given the `<ErrorBanner>` Design queue item from the auth flow audit.

### ⚪ 7.10 · Inline `style={{ gridTemplateColumns: \`repeat(${mealTypes.length}, minmax(0, 1fr))\` }}` in DayColumn

Not a finding here (this lives in DayColumn 4.x), but worth noting: the dynamic grid template inside DayColumn.jsx:83 is legitimate inline-style — the column count is runtime-dependent. Same defensible exception flagged in Recipe Detail's macro-bar dynamic widths. Keep.

---

## Section 8 · MealSlot.jsx (304 lines, 12 amber — the densest file)

### 🔴 8.1 · Empty-slot affordance uses amber palette + hand-rolled "add row" pattern

Lines 121-134:
```jsx
<button
  onClick={handleOpenRecipes}
  className="w-full p-3 border-2 border-dashed border-amber-300 rounded-xl hover:border-amber-500 hover:bg-amber-50/50 transition-all group"
>
  <div className="flex items-center justify-center gap-2 text-amber-600 group-hover:text-amber-700">
    <Plus size={16} />
    <span className="text-sm font-body font-semibold capitalize">{mealType}</span>
  </div>
</button>
```

Token swap (in-place keep hand-rolled):
- `border-amber-300` → `border-accent/60` (or `border-border` for quieter neutral)
- `hover:border-amber-500` → `hover:border-primary`
- `hover:bg-amber-50/50` → `hover:bg-surface-hover`
- `text-amber-600 group-hover:text-amber-700` → `text-text-secondary group-hover:text-primary`

This is the canonical "dashed add-row" affordance. PROJECT_NOTES.md has it queued: "Button `dashed` modifier or `<AddRowButton />` primitive — recurs in empty states and add-row affordances." Hand-roll stays until that primitive ships.

### 🔴 8.2 · Filled-slot card uses `bg-white` and `border-amber-200/50`

Lines 186-191:
```jsx
className={`p-3 bg-white rounded-xl border-2 shadow-sm transition-all ${
  isUnavailable
    ? 'border-border/30 opacity-70 cursor-default'
    : 'border-amber-200/50 hover:shadow-md cursor-pointer'
}`}
```

- `bg-white` → `bg-surface` (per X.7).
- `border-amber-200/50` (filled, available) → `border-border` (the entire row already has a warm cookbook background; an additional warm border is doubling-up on warm tones).
- `border-border/30` (unavailable) → `border-border/40` — fine, just a slight bump for legibility.
- `shadow-sm hover:shadow-md` → `shadow-resting hover:shadow-elevated` (use design tokens, not Tailwind defaults).

This is essentially "should be a `<Card>`." Three reasons not to swap to Card here:
1. Card's `compact` prop is for media-edge content, not body-content padding adjustment.
2. The filled-slot card has rich internal structure (title row with hover-revealed actions, conditional macro display) that's tightly coupled to MealSlot's logic.
3. Card's `state="resting" / "hover"` doesn't map perfectly to "unavailable" tertiary state.

Lean to in-place token swap; document as "Card-shaped surface, hand-rolled" deviation.

### 🔴 8.3 · Meal-type label uses `text-amber-900`

Line 196: `<p className="text-sm font-body text-amber-900 leading-snug">` → `text-text-primary`.

### 🔴 8.4 · Duplicate-recipe `AlertCircle` icon uses `text-amber-500`

Line 205: `<AlertCircle size={12} className="text-amber-500" />`. Semantically this *is* a warning. Map to `text-warning` (the warm orange semantic warning token at `#D97A1F`, distinct from primary `#C8622A`).

### 🟡 8.5 · Tooltip is hand-rolled

Lines 203-210: hand-rolled tooltip on hover with `group/duptooltip` Tailwind variant. Positioned absolute, white text on `bg-text-primary` body. Functionally correct.

```jsx
<div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 bg-text-primary text-white text-xs rounded-lg opacity-0 group-hover/duptooltip:opacity-100 transition-opacity pointer-events-none z-20 shadow-lg w-max max-w-[180px] text-center leading-snug">
```

Uses tokens correctly (`bg-text-primary`, `text-white`). The `shadow-lg` is Tailwind default — could be `shadow-elevated` for token alignment. Otherwise no drift.

⚪ Possible Design queue: `<Tooltip>` primitive. Single instance in the planner audit, but tooltip is a foundational interaction primitive that's likely to recur. Worth adding to the queue.

### 🔴 8.6 · Swap button uses `text-amber-600` + `hover:bg-amber-50`

Lines 215-221: hand-rolled icon button. Tokens:
- `hover:bg-amber-50` → `hover:bg-surface-hover`
- `text-amber-600` (icon) → `text-text-secondary` or `text-primary` (icon-action affordance)

Could be `<IconBtn>` but IconBtn is 40×40 — too large for an inline-card hover-only action. Hand-roll appropriate (recurring "tiny ghost icon" pattern that's distinct from IconBtn). Document deviation.

### 🔴 8.7 · Remove button uses raw `red-*`

Lines 224-230: hand-rolled icon button.
- `hover:bg-red-50` → `hover:bg-error-soft`
- `text-red-500` → `text-error`

Same hand-roll-vs-IconBtn note as 8.6.

### 🔴 8.8 · Leftover badge uses amber palette

Lines 246-249:
```jsx
<span className="inline-flex items-center gap-1 text-xs font-body font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
  ↩ Leftover
</span>
```

Canonical `<Badge tone="primary" variant="soft">Leftover</Badge>` use case (same logic as DayColumn 4.3 "Today" badge):
```jsx
<Badge tone="primary" variant="soft" icon={<span>↩</span>}>
  Leftover
</Badge>
```
Badge soft variant maps to `bg-primary-soft text-primary`. Visually similar to current amber treatment but token-correct. The `↩` glyph stays as a leading character — or refactor to a `lucide-react` icon (`RotateCcw` or similar).

### 🔴 8.9 · Macro stats use `text-amber-700` (4 instances)

Lines 257, 262, 267, 272: 4× `text-xs font-body text-amber-700` → `text-text-secondary`. Per X.10, this is also a candidate for a shared `<PortionMacros>` primitive (defer to MacrosBadge audit).

### 🟢 8.10 · Unavailable label uses `text-text-secondary/60 italic`

Line 238. Uses correct token (`text-text-secondary`) at 60% opacity for the "Recipe unavailable" italic. Within design system style. ✓ No finding.

### 🟢 8.11 · Remainder label uses `text-text-secondary/70 italic`

Line 282. Same pattern as 8.10. ✓ No finding.

### 🟢 8.12 · `text-[10px]` for the remainder label

Line 282: `text-[10px]` is an arbitrary value. Smallest sanctioned text in COMPONENTS.md is `text-[11px]` (Badge label). This is 1px smaller. Could either bump to `text-[11px]` for cohesion or document as an intentional micro-deviation for the secondary-priority indicator.

⚪ Lean: bump to `text-[11px]`. Difference is imperceptible; consistency win.

---

## Findings sorted by leverage

**Highest leverage (fast wins, mechanical):**
- 🔴 X.1 — `amber-*` swap across all 8 files. ~67 instances. Single mapping table. Largest single mechanical fix in the audit. Touches every file.
- 🔴 X.2 — `orange-*` gradient removal (4 sites, 3 files). Drops gradients to solid token surfaces.
- 🔴 X.3 — `bg-gradient-to-r` removed from 2 Suggest Buttons. Drops to plain `variant="primary"`.
- 🔴 X.5 — `bg-green-500` / `bg-yellow-500` / `bg-red-500` / `bg-gray-400` → success/warning/error/text-tertiary (4 line edits, single file).
- 🔴 X.7 — `bg-white` → `bg-surface` (4 sites, 4 files).
- 🔴 4.3 — "Today" pill → `<Badge tone="primary" variant="solid">`.
- 🔴 8.8 — "Leftover" pill → `<Badge tone="primary" variant="soft">`.
- 🔴 7.2 — Prev/next week chevrons → `<IconBtn>` (2 sites).
- 🔴 7.1 — Add-member button → `<IconBtn>` (replaces hand-rolled 40×40 dashed-border circle, after deciding whether the dashed treatment is intentional).
- 🔴 6.5 — "Remove leftover" Button → `variant="destructive"` (drops red-* className override).
- 🔴 X.4 — Raw `red-*` for destructive icon affordances → `text-error` / `bg-error-soft`.

**Medium effort:**
- 🔴 1.1 — MealSlotSkeleton conformance to LOADING.md shimmer spec. Two-path decision (inline `.skeleton` class vs `<Skeleton>` primitive); both are small but require verifying the global CSS or primitive is wired up.
- 🟡 7.8 — "No Eligible Recipes" Modal action buttons → `actions` prop. Restructures the Modal body composition.
- 🔴 3.1 — MealTypeSelector token swap. 5 amber → tokens, plus inline-SVG → `<Check>`. Could optionally cascade into Card+Checkbox refactor (defer).
- 🔴 6.4 — "Move to a different day" pills → `<Button size="sm" variant="ghost">`. Drops a class block but worth visual verification on density.
- 🟢 X.6 — `isOpen` → `open` rename in 2 files (`MealTypeSelector`, `LeftoverDetailModal`). Trivial but cross-cutting.
- 🟢 3.3 / 7.7 — `variant="secondary"` → `variant="ghost"` for Cancel buttons (2 sites).

**Polish:**
- 🟢 3.4 — Inline SVG checkmark → `<Check>` from lucide-react.
- 🟢 6.6 — Modal `width={448}` → default 480.
- 🟢 8.12 — `text-[10px]` remainder label → `text-[11px]`.
- 🟢 4.7 — Document the responsive desktop/mobile split as a layout pattern (no fix).
- 🟢 4.4 — Note the "invisible Today placeholder" hack (no fix).

**Possible Design extensions (route to queue):**
- ⚪ `<ChipToggle>` primitive (X.9, 2.3) — selectable pill for binary on/off toggles.
- ⚪ `<ProgressBar>` primitive (5.8) — bar with success/warning/error tone variants.
- ⚪ `<Tooltip>` primitive (8.5) — hover-revealed help text.
- ⚪ `<Skeleton>` primitive availability verification (1.1) — confirm if `src/components/ui/Skeleton.jsx` actually exists per CLAUDE.md, since the wider skeleton-shimmer conformance pass depends on this.
- ⚪ `<PortionMacros>` micro-primitive (X.10) — repeats in MealSlot + LeftoverDetailModal. Could be a slimmed-down `MacrosBadge` variant. Defer to MacrosBadge audit.
- ⚪ `<AddRowButton>` primitive (8.1) — already on queue as "Button `dashed` modifier or `<AddRowButton>` primitive."
- ⚪ Button `variant="ghost-destructive"` (6.5 note) — already on queue per FLOWS.md Flow 6.

**Defer:**
- Page-level layout of `PlanDesktop.jsx` (heading size, max-width) — falls under the general desktop-layout-token Design queue work. Not part of this audit.
- Refactoring `MealSlot` filled-slot card to use `<Card>` primitive (8.2) — too tight a coupling with internal logic; document deviation.
- Page-level audit of `PlanMobile.jsx` — out of this audit's scope.
- 7.9 — `alert()` usage. Out of cohesion scope; flag for toast/error-banner UX pass.

**Cross-cutting (out of audit scope, but noted):**
- The cookbook aesthetic Design priority is the foundation that resolves much of X.1 in a more deliberate way. Per-file fixes here unblock the cohesion baseline; the Design pass can override token choices with the new cookbook tokens whenever it ships. Same posture as the auth flow audit.

**Bugs (silent or active rendering bugs):**
- None.

---

## Triage decisions to make

Six questions to answer to bundle a fix branch:

1. **Single branch or split?** This audit's surface area is much larger than auth-flow's. Three plausible bundling strategies:
   - **(a) One big branch `fix/planner-cohesion`** — covers the entire amber/orange/red/green/gradient/badge swap across all 8 files. Diff will be sizeable (~300-500 lines changed) but the changes are mechanical and reviewable.
   - **(b) Two branches: tokens-only then primitives.** First branch: pure color-token swaps + gradient removals + Modal/IconBtn refactors that are mechanical. Second branch: Badge swaps for "Today"/"Leftover" pills, Button variant swaps for cancel/destructive, MealSlotSkeleton LOADING.md conformance.
   - **(c) Three branches: tokens, primitives, MealSlotSkeleton.** Skeleton compliance gets its own branch since it's the leading instance of a wider skeleton-shimmer conformance pass.

   **Lean (a).** Single mechanical sweep with one preview pass. Matches the recipe-detail bundle precedent.

2. **MealSlotSkeleton — fix in this branch or defer to dedicated skeleton-shimmer pass?**
   - If we fix here: leading instance, demonstrates the pattern, unblocks the wider sweep.
   - If we defer: the dedicated skeleton-shimmer conformance pass (already on Design queue) covers it.

   **Lean: fix here.** Single file, 9 lines, demonstrates the pattern. The wider sweep can use this as the reference fix.

3. **`<Skeleton>` primitive — verify it exists before locking the fix?**
   CLAUDE.md lists `Skeleton` in the UI primitives. LOADING.md ships a React component. Before triaging 1.1 (b), confirm `src/components/ui/Skeleton.jsx` exists and matches LOADING.md's API. If it doesn't exist, go with path (a) of 1.1 (inline `.skeleton` class).

4. **Household banner add-member affordance — keep dashed-border circle or swap to plain IconBtn?**
   The current dashed-border 40×40 add-member circle (line 173) is a small bespoke affordance. Decision:
   - Keep dashed treatment, token-swap colors only (preserves "add" visual cue).
   - Swap entirely to plain IconBtn (loses the "add" affordance but matches design system).

   **Lean: swap to IconBtn.** The `<Plus>` icon already communicates "add"; the dashed border is redundant.

5. **"Move to a different day" pills (6.4) — keep hand-rolled chips with token swap, or refactor to `<Button size="sm" variant="ghost">`?**
   The ghost-button version is semantically correct (each tap commits, like a transient action button) and matches design system. The token-swap-only path is more conservative.

   **Lean: refactor to `<Button size="sm" variant="ghost">`.** Worth the visual-verification step.

6. **MealTypeSelector option cards (3.2) — token swap only or refactor to Card+Checkbox?**
   The Card primitive's `state="selected"` variant doesn't fit perfectly (built-in checkmark badge conflicts with the inline circle indicator). Token swap is the lower-risk path.

   **Lean: token swap only.** Defer Card refactor until/unless this option-card pattern recurs (it likely will in the Add-to-meal-plan sheet on mobile and the Suggest sheet on desktop — flag for future planner work).

---

### Recommended bundle for `fix/planner-cohesion`

Bundle as one branch hitting the high-leverage items:

**Token swaps:**
- ✅ X.1 — amber across all 8 files (~67 instances)
- ✅ X.2 — orange gradients removed (4 sites)
- ✅ X.3 — gradient overrides on 2 Suggest Buttons removed
- ✅ X.4 — red-* destructive icon colors → `error` tokens (MealSlot)
- ✅ X.5 — macro state colors → `success`/`warning`/`error`/`text-tertiary`
- ✅ X.7 — `bg-white` → `bg-surface` (4 sites)

**Primitive swaps:**
- ✅ 4.3 — "Today" hand-rolled pill → `<Badge tone="primary" variant="solid">`
- ✅ 8.8 — "Leftover" hand-rolled pill → `<Badge tone="primary" variant="soft">`
- ✅ 7.1 — Add-member button → `<IconBtn>`
- ✅ 7.2 — Prev/next chevron buttons → `<IconBtn>` (2 sites)
- ✅ 7.3 — Suggest Button → `icon` prop (drops `<Sparkles className="mr-2"/>` pattern)
- ✅ 6.5 — "Remove leftover" Button → `variant="destructive"`
- ✅ 6.4 — "Move to day" pills → `<Button size="sm" variant="ghost">`
- ✅ 7.8 — "No Eligible Recipes" Modal action buttons → `actions` prop
- ✅ 3.3 / 7.7 — Cancel buttons → `variant="ghost"`
- ✅ 3.4 — Inline SVG → `<Check>` from lucide-react
- ✅ X.6 — `isOpen` → `open` rename (2 wrapper files)

**Skeleton:**
- ✅ 1.1 — MealSlotSkeleton → `.skeleton` class or `<Skeleton>` primitive (verify primitive availability first)

**Polish riders (cheap, ship with bundle):**
- ✅ 6.6 — `width={448}` → default
- ✅ 8.12 — `text-[10px]` → `text-[11px]` on remainder label

**Deferred to follow-up branches or Design queue:**
- ⚪ Card refactor for MealTypeSelector option cards (3.2)
- ⚪ Card refactor for MealSlot filled-slot (8.2)
- ⚪ `<ProgressBar>` primitive (5.8) — keep hand-rolled progress bars with token-correct colors
- ⚪ `<Tooltip>` primitive (8.5)
- ⚪ `<ChipToggle>` primitive (X.9, 2.3)
- ⚪ `<PortionMacros>` primitive (X.10) — defer to MacrosBadge audit
- ⚪ `<AddRowButton>` primitive (8.1) — already queued
- ⚪ Button `variant="ghost-destructive"` (6.5 note) — already queued
- ⚪ Named Modal sizes (X.8) — already queued
- ⚪ `alert()` → toast/banner (7.9) — error-banner Design queue item

### Estimated bundle size

- **Files touched:** 8 (all audited files)
- **Diff size estimate:** ~350-500 lines changed (additions + deletions). The X.1 amber sweep is the bulk; primitive refactors add small focused diffs in `WeeklyPlanner.jsx`, `DayColumn.jsx`, `MealSlot.jsx`, `LeftoverDetailModal.jsx`. Skeleton compliance is ~10 lines.
- **Visual verification surfaces:** PlanDesktop (entire planner grid), PlanMobile (accordion + leftover modal), Dashboard sidebar (WeeklyMacroSummary compact mode), Dashboard main column (WeeklyPlanner). All four should be eyeball-tested with `npm run preview` before merge.

### Verification grep checks (post-fix)

After the branch is applied, verify with:
```bash
grep -rcn 'amber-' src/components/planner/   # should be 0
grep -rcn 'orange-' src/components/planner/  # should be 0
grep -rcn 'red-[0-9]' src/components/planner/  # should be 0
grep -rcn 'green-[0-9]\|yellow-[0-9]\|gray-[0-9]' src/components/planner/  # should be 0
grep -rcn 'bg-gradient-' src/components/planner/  # should be 0
grep -rcn 'bg-white' src/components/planner/  # should be 0
grep -rcn 'animate-pulse' src/components/planner/  # should be 0
```

Plus the existing `npm run build` validation step.
