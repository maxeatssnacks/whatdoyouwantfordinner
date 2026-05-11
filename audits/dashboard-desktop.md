# Dashboard (Desktop) — Design System Cohesion Audit

**Audited file:** `src/pages/DashboardDesktop.jsx`
**Composes from:** `WeeklyPlanner`, `WeeklyMacroSummary`, `RecipeCard`, `OnboardingModal`, `Button` — internal components of `WeeklyPlanner` and `WeeklyMacroSummary` are **out of scope** for this audit and deferred to a future Plan audit.
**Audited against:** `design-system/COMPONENTS.md` v1.2.0, `design-system/tokens.css`, `design-system/FLOWS.md` Flow 1 (mobile, used only as a *reference for canonical desktop equivalents*, not as a conformance target).
**Date:** 2026-05-12
**Scope:** Cohesion of `DashboardDesktop.jsx` page-level composition with the design system. Out of scope: `src/components/planner/*` (will be audited as part of the Plan page work, since planner/ also powers `/plan`), `OnboardingModal`, `RecipeCard`.

---

## Summary

Dashboard's composition reflects a deliberate two-column desktop layout — left rail (Quick Actions sidebar + sticky Macro Summary), main column (greeting + household banner + WeeklyPlanner). The architecture is sound. The drift is concentrated in three places:

1. **The greeting is single-color**, missing the canonical dual-color "name highlighted" treatment used on mobile and in the brand title.
2. **The household setup banner uses `bg-amber-*` palette throughout** — same drift pattern caught on Profile and Recipes.
3. **Four Quick Actions Buttons use the legacy `<Icon className="mr-2" />` child pattern** instead of the Button `icon` prop.

Plus several lower-severity items: hand-rolled dismiss button on the banner, a `<hr>` instead of design-system separator pattern, an inline "Set Up Household" button hand-rolled as `<button>` inside the banner.

**No flow-spec conformance issues to file.** Dashboard desktop diverges from FLOWS.md Flow 1 by design (mobile has Hero/QuickActions/UpNext/ThisWeek/Favorites; desktop has Sidebar/Greeting/Banner/WeeklyCalendar). Per the architectural decision in PROJECT_NOTES.md, desktop is not held to mobile-first flow specs.

Total findings: **9**. Bug findings: **0**.

Severity tags:
- **🔴 high** — visible cohesion failure that contradicts the design system
- **🟡 medium** — bypasses primitives or tokens but renders acceptably
- **🟢 low** — polish, consistency, or minor token alignment
- **⚪ note** — observation that may need a Design system extension or PM-style decision

---

## Page-level findings

### 🟢 P1 · Max width is `max-w-[1440px]` arbitrary value, not a design system token

Line: `<div className="max-w-[1440px] mx-auto px-4 py-6 md:py-8">`

Dashboard uses `max-w-[1440px]` as a one-off (Tailwind arbitrary value). Profile uses `max-w-7xl` + nested `max-w-4xl`. Recipes uses `max-w-7xl`. Three pages, three different width strategies.

For reference:
- `max-w-7xl` = 1280px (Tailwind default)
- `max-w-[1440px]` = 1440px (arbitrary)
- `max-w-4xl` = 896px (Tailwind default)

Dashboard's 1440px gives the two-column layout room to breathe — the sidebar is 288px (`w-72`) and the calendar grid needs significant width to render 5 columns (day + 4 meal slots). 1280px would be tight. So **the choice is probably correct** but it's bespoke.

⚪ Already in Design queue: desktop layout token (centered-content vs. wide-content). When that ships, Dashboard becomes `max-w-content-wide` or similar; until then, the arbitrary value is acceptable. Worth noting that we now have three pages observed and three different max-widths — pattern is forming.

### 🟢 P2 · Vertical padding pattern `py-6 md:py-8` vs Profile `py-6` vs Recipes `py-6` (after sm: refinement)

Minor inconsistency in vertical breathing room. Not a blocker. Drops if a layout token is introduced.

---

## Section 1 · Sidebar (left rail)

### 🔴 1.1 · Four Quick Actions Buttons use legacy `<Icon className="mr-2" />` child pattern

`SidebarContent` renders three Buttons (Add Recipe, Shopping List, Browse Recipes) each with this shape:

```
<Button className="w-full justify-start py-3" variant="primary">
  <Plus size={18} className="mr-2 flex-shrink-0" />
  Add Recipe
</Button>
```

Plus the "I have no idea what I'm having tonight" Button at line 53-60, which doesn't have an icon but does use `className="w-full text-sm text-left"` for layout.

Three icon-prop Button refactors needed:

```
<Button
  className="w-full justify-start py-3"
  variant="primary"
  icon={<Plus size={18} />}
>
  Add Recipe
</Button>
```

Same for Shopping List (`icon={<ShoppingCart size={18} />}`) and Browse Recipes (`icon={<BookOpen size={18} />}`). The `flex-shrink-0` on the original icons becomes irrelevant — Button's internal icon container handles that.

Same finding as Profile 2.6, Recipes 2.1/2.2/6.3. This is the third instance of the same drift pattern. Pattern is real and consistent across the codebase.

### 🟡 1.2 · `py-3` override on Buttons fights the Button height tokens

Each Button uses `className="w-full justify-start py-3"`. The `py-3` is 12px top/bottom, which gives a 48px total height for the Button (12 + 24 text height + 12) — close to but not identical to Button's spec size tokens.

Button spec heights:
- `sm`: 36px desktop / 40px mobile
- `md`: 44px desktop / 48px mobile (default)
- `lg`: 48px desktop / 52px mobile

A default-size (md) Button with custom `py-3` is creating a quasi-`lg` button. The intent seems to be "make these chunky sidebar tiles," which is reasonable, but it's bypassing the size token system.

Two options:
- (a) Use `size="lg"` and drop `py-3` — gets you 48px desktop, 52px mobile, system-correct.
- (b) Keep `py-3` and document as deviation if "chunky sidebar tile" is a distinct visual.

Lean (a). The current size is essentially `lg` already; just say so.

### 🟢 1.3 · `justify-start` on Buttons is a layout-mode mismatch

Button spec aligns content centered by default (the entire Button is `flex items-center justify-center`). The sidebar Buttons override with `justify-start` to left-align content because they're tile-shaped (full width). This is functional but unusual — every other Button in the codebase centers its content.

Either:
- (a) Define a Button variant (e.g., `variant="tile"`) for full-width left-aligned action buttons. Design queue candidate.
- (b) Accept the className override and document it.

⚪ Possible Design queue: Button `tile` or `block` variant for full-width left-aligned use cases. Recurs in sidebar/menu patterns.

### 🟢 1.4 · `<hr className="border-border my-3" />` separator is hand-rolled

Line 49 inside SidebarContent: `<hr className="border-border my-3" />`.

There's no Divider/Separator primitive in COMPONENTS.md (or I haven't seen one). Hand-rolled `<hr>` is fine and the styling uses the right token, but it's a recurring micro-pattern.

⚪ Possible Design queue: `<Divider />` primitive — simple, but recurs across sidebars, menus, dropdowns, modals.

### 🟢 1.5 · "Suggested Tonight" mini-section uses bespoke composition

Lines 62-67:
```
{showSuggestion && suggestedRecipe && (
  <div className="pt-1">
    <p className="text-sm font-body font-semibold text-text-secondary mb-2">Suggested Tonight</p>
    <RecipeCard recipe={suggestedRecipe} />
  </div>
)}
```

This is a small inline label + a RecipeCard. The label uses tokens correctly (`text-text-secondary`, `font-body`, `font-semibold`). No findings — this is correct composition.

Minor observation: this is the only place in the codebase using `pt-1` for vertical rhythm. Could be `mt-2` or `space-y-2` on the parent. Inconsequential.

---

## Section 2 · Macro Summary card (sidebar bottom)

### ⚪ 2.1 · `WeeklyMacroSummary compact` prop

Lines 156-162:
```
{macroData.activeMembers.length > 0 && macroData.entries.length > 0 && (
  <WeeklyMacroSummary
    entries={macroData.entries}
    householdMembers={macroData.activeMembers}
    compact
  />
)}
```

`WeeklyMacroSummary` is a `planner/` component. It's rendered with a `compact` prop variant. Internal styling of `WeeklyMacroSummary` (which has 11 amber-* instances per the earlier grep) is **out of scope** for this audit — defer to the Plan audit.

Observation only: the `compact` prop is being used here. We don't know from this file what `compact` does. When the Plan audit happens, verify that `compact` is a stable, documented variant and not a brittle inline mode.

---

## Section 3 · Greeting (main column header)

### 🔴 3.1 · Greeting is single-color, missing the canonical dual-color name highlight

Lines 165-172:
```
<div>
  <h1 className="text-4xl font-display font-bold text-text-primary mb-1">
    Good {greeting}, {displayName}!
  </h1>
  <p className="text-text-secondary font-body text-base">
    {plannedMeals} {plannedMeals === 1 ? 'meal' : 'meals'} planned this week
    {macroProgress !== null && ` · ${macroProgress}% of macro goals`}
  </p>
</div>
```

Mobile renders this greeting with the name in `text-primary` (burnt orange) and the greeting prefix in `text-text-primary`. Desktop renders the entire string single-color in `text-text-primary`. This is the same pattern as the Navbar brand title fix we just shipped.

The fix mirrors Navbar:
```
<h1 className="text-4xl font-display font-bold mb-1">
  <span className="text-text-primary">Good {greeting},</span>
  {' '}
  <span className="text-primary">{displayName}!</span>
</h1>
```

This is the **tactical fix flagged in PROJECT_NOTES.md** — already known, just needs to be applied.

Note: the comma placement. Mobile likely renders "Good morning, Max!" with "Max!" colored orange, or "Good morning," in dark and "Max!" in orange. The exact span boundary is worth verifying against DashboardMobile.jsx before locking the JSX. Worth a quick `grep -n "Good" src/components/dashboard-mobile/Greeting.jsx` before triage.

### 🟢 3.2 · Heading size `text-4xl` (36px) — bigger than primary spec H1 (28px display)

COMPONENTS.md Typography section defines display H1 as 28px. Dashboard's `text-4xl` is 36px. This is a one-off heading size.

Two interpretations:
- (a) Dashboard's desktop greeting is intentionally larger than the mobile equivalent because it's a marquee surface. Document as deviation.
- (b) The typography spec needs a larger display-heading variant for hero-style headings. Design queue.

⚪ Worth surfacing to Design: should desktop hero headings use a larger display size than mobile? If yes, formalize as `display-hero` or similar.

### 🟢 3.3 · Subhead uses inline string concatenation with `·` separator

Line 169-171:
```
{plannedMeals} {plannedMeals === 1 ? 'meal' : 'meals'} planned this week
{macroProgress !== null && ` · ${macroProgress}% of macro goals`}
```

The `·` (middle dot) separator is a recurring micro-pattern in the codebase. Used in cards, headers, meta rows. Renders fine. No finding — just an observation that this is now a third place using the same pattern.

---

## Section 4 · Household Setup banner

### 🔴 4.1 · Banner uses `bg-amber-*` palette throughout — same drift as Recipes pending banner and Profile Meal Slots preview

Lines 175-198. Six amber-* references:
- `bg-amber-50` (background)
- `border-amber-200` (border)
- `text-amber-600` (icon — Users)
- `text-amber-900` (heading "Set up your household")
- `text-amber-800` (body "to get accurate leftover and serving calculations.")
- `text-amber-700` + `hover:text-amber-900` (inline "Set Up Household" link)
- `text-amber-500` + `hover:text-amber-700` (dismiss X button)

Token mapping should follow the same pattern as Recipes 3.1 and Profile's Meal Slots fix:
- `bg-amber-50` → `bg-accent-soft/40`
- `border-amber-200` → `border-accent/60`
- `text-amber-600` (icon) → `text-text-secondary` or `text-warning` (semantic question — see below)
- `text-amber-900` → `text-text-primary`
- `text-amber-800` → `text-text-secondary`
- `text-amber-700` + `hover:text-amber-900` → `text-text-secondary hover:text-text-primary`
- `text-amber-500` + `hover:text-amber-700` (dismiss) → `text-text-secondary hover:text-text-primary`

**Semantic question on the Users icon.** This banner is *informational*, not a warning — it's nudging the user to complete setup, not alerting them to a problem. So `text-text-secondary` is probably right for the icon. If you intend this banner to read as semantically "warning" (you really should do this), then `text-warning` would be the choice. Lean informational.

This is the **fourth** instance of the same amber → accent-soft pattern in three audits. The pattern is canonical at this point.

### 🟢 4.2 · Banner border is `border` (1px) not `border-2` (2px)

Notable: the previous Profile banner fix mapped to `border-2 border-accent/60` and Recipes did the same. This banner uses `border` (1px). Slight visual inconsistency between banner treatments across pages.

Two options:
- (a) Use `border-2 border-accent/60` to match other amber-derived banners. Consistency win.
- (b) Use `border border-accent/60` to match Dashboard's existing visual weight. Per-page consistency.

Lean (a). Pattern consistency across pages > pattern consistency within one page.

### 🟡 4.3 · "Set Up Household" link is a hand-rolled `<button>` inside `<Link>`

Lines 184-188:
```
<Link to="/profile" className="ml-2 inline-block">
  <button className="text-amber-700 font-semibold underline underline-offset-2 hover:text-amber-900 transition-colors">
    Set Up Household
  </button>
</Link>
```

Two issues:
- (a) `<button>` inside `<a>` (which `<Link>` becomes) is invalid HTML. The `<button>` should be a `<span>` or just text. Browsers handle it but accessibility tools flag it.
- (b) The visual treatment is "underlined text link inside banner" — recurs as a pattern. Could be a Button `variant="link"` or just an inline `<Link>` styled with the right tokens.

Recommended fix:
```
<Link
  to="/profile"
  className="ml-2 inline font-semibold text-text-primary underline underline-offset-2 hover:text-primary transition-colors"
>
  Set Up Household
</Link>
```

Drops the invalid nested `<button>`. Uses tokens. Matches the link-inside-text pattern.

⚪ Possible Design queue: Button `variant="link"` or formalized inline-text-link styling spec. Recurs in banners, body copy, modals.

### 🟢 4.4 · Dismiss button is hand-rolled — legitimate hand-roll case

Lines 190-196:
```
<button
  onClick={handleDismissHouseholdBanner}
  className="flex-shrink-0 text-amber-500 hover:text-amber-700 transition-colors"
  aria-label="Dismiss"
>
  <X size={16} />
</button>
```

Same situation as the Recipes pending banner Cancel button (Recipes 3.2). Compact tertiary affordance inside a banner; doesn't fit IconBtn (40px) or Button size="sm" (36px) sizing. Hand-roll acceptable. Color swap to tokens needed (see 4.1).

Has correct `aria-label="Dismiss"` — accessibility good.

---

## Section 5 · WeeklyPlanner composition

### ⚪ 5.1 · `<WeeklyPlanner onMacroDataChange={setMacroData} />`

Line 201. `WeeklyPlanner` is the planner/ root component — out of scope for this audit per the scope decision above. Internal cohesion of WeeklyPlanner, DayColumn, MealSlot, etc. will be addressed in the Plan audit.

Observation: the prop interface here (`onMacroDataChange`) is the contract between Dashboard and the planner subsystem. Dashboard owns the macro summary card; planner emits data up to it. Clean separation. No finding.

---

## Section 6 · OnboardingModal

### ⚪ 6.1 · `<OnboardingModal isOpen={showOnboarding} onComplete={...} />`

OnboardingModal is its own component, not audited here. Will need a separate audit pass when household onboarding flow is reviewed. For now: out of scope.

Note: the `isOpen` prop name is inconsistent with Modal's `open` prop (used in Profile and Recipes). Possibly a different primitive or an older API. Worth flagging for the eventual OnboardingModal audit.

---

## Cross-cutting findings

### 🟢 X.1 · `localStorage` for banner-dismissed state

Line 73-75 and 113-116. The household banner dismissal persists via `localStorage`. Pattern is fine; no design system implications. Observed only because it's a notable architecture pattern worth knowing about.

### 🟢 X.2 · `getGreeting()` helper returns time-of-day string only

Lines 119, 167. Confirmed: greeting helper returns "morning" / "afternoon" / "evening" (no "Good" prefix and no name). The greeting is constructed inline as `Good {greeting}, {displayName}!`. This is what makes 3.1's fix straightforward — the dynamic parts (`greeting` and `displayName`) are already isolated variables, so the dual-color span split is trivial.

---

## Findings sorted by leverage

**Highest leverage (fast wins, mechanical):**
- 🔴 1.1 — Four Button icon-prop refactors. Trivial. Same pattern shipped 3x already.
- 🔴 3.1 — Greeting dual-color split. Mechanical; same pattern as Navbar fix.
- 🔴 4.1 — Household banner amber → tokens. Same pattern as Recipes 3.1 and Profile Meal Slots fix.

**Medium effort:**
- 🟡 1.2 — Button `py-3` override → `size="lg"`. Small refactor, verify visual match.
- 🟡 4.3 — Invalid nested `<button>` inside `<Link>` → just `<Link>` with link styling. Small but worth doing right (accessibility + token alignment).

**Polish:**
- 🟢 1.3, 1.4, 1.5 — Sidebar polish (Button `justify-start`, `<hr>`, "Suggested Tonight" rhythm). Defer.
- 🟢 3.2 — Heading size deviation. Defer to Design.
- 🟢 4.2 — Banner border-2 vs border-1 consistency. Trivial; bundle with 4.1.
- 🟢 4.4 — Dismiss button hand-roll (color swap only, hand-roll stays).

**Possible Design extensions to add to queue:**
- ⚪ Desktop layout token (centered-content vs wide-content) — already queued, now confirmed third use.
- ⚪ Button `tile` or `block` variant (full-width left-aligned).
- ⚪ `<Divider />` primitive.
- ⚪ Larger display-hero heading size (`display-hero` 36px) — or document `text-4xl` as the desktop hero pattern.
- ⚪ Button `variant="link"` for inline text links inside body copy.
- ⚪ OnboardingModal naming consistency (`isOpen` vs `open`).

**Defer (out of audit scope):**
- planner/ directory (WeeklyPlanner, DayColumn, MealSlot, etc.) — will be audited as part of Plan page work.
- WeeklyMacroSummary internals — same.
- OnboardingModal internals — separate audit.
- RecipeCard — already noted from Recipes audit, separate pass.

**Bugs (non-design):**
- (none surfaced)

---

## Triage decisions to make

For each finding, decide: **Fix now / Defer / Document deviation / Route to Design.**

Recommended triage order:
1. **Bundle the three high-leverage fixes (1.1, 3.1, 4.1) into a single branch `fix/dashboard-desktop-cohesion`.** All three are mechanical and well-understood patterns. Same shape as Profile and Recipes branches.
2. **Bundle the medium effort items (1.2, 4.3) into the same branch if you want fewer branches**, or split into a polish branch if you prefer tight scope.
3. **Verify the greeting comma placement against DashboardMobile.jsx before locking 3.1.** One quick grep.
4. **Route Design extensions to the queue.** Don't try to build any in this audit.
5. **Out-of-scope items**: planner/, OnboardingModal, RecipeCard — leave alone.
