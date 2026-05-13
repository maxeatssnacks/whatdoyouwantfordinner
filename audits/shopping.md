# Shopping List — Design System Cohesion Audit

**Audited files:**
- `src/pages/ShoppingListPage.jsx` (data-fetching shell + responsive branch)
- `src/components/shopping/ShoppingList.jsx` (the actual rendered shopping list UI; single-purpose composition serving only this page)
**Audited against:** `design-system/COMPONENTS.md` v1.2.0, `design-system/tokens.css`, `design-system/FLOWS.md` Flow 5 (Shopping).
**Date:** 2026-05-12
**Scope:** Cohesion of both files with the design system. Single-file responsive page with a single-purpose subcomponent — both audited together because `ShoppingList.jsx` serves only this page and isn't part of a broader domain subsystem.

---

## Summary

Shopping is the **cleanest page audited so far.** Zero amber-* drift across both files (per earlier codebase grep), correct use of primitives throughout (Card, Button, Checkbox, LoadingSpinner, TopAppBar, IconBtn), tokens used correctly, no inline styles, no hand-rolled custom CSS classes. The dominant findings here are small Button icon-prop drift, a couple of unique tokens-not-tokens (`bg-bg`, `surface-hover/80`), one custom toast pattern that differs from other pages, and the IA finding flagged from Recipe Detail visual verification about meal-plan-driven shopping list generation.

**Total findings: 7. Bug findings: 0.**

This is the page that's been most aligned with the design system since its build — likely the most recently touched component group, or written after the system stabilized.

Severity tags:
- **🔴 high** — visible cohesion failure that contradicts the design system
- **🟡 medium** — bypasses primitives or tokens but renders acceptably
- **🟢 low** — polish, consistency, or minor token alignment
- **⚪ note** — observation that may need a Design system extension or PM-style decision

---

## Page-level findings (`ShoppingListPage.jsx`)

### 🟡 P1 · Mobile branch uses `bg-bg` token; desktop uses `PageWrapper`'s default

Line 92: `<div className="min-h-screen bg-bg pb-24">`

`bg-bg` is presumably an alias for `bg-background`. Confirming the token: `grep -n "bg-bg" tailwind.config.js` would tell us if `bg-bg` is its own token or a typo/alias of `bg-background`. **Worth verifying before triage.** If `bg-bg` is undefined, this is a silent rendering bug.

If `bg-bg` is a valid alias: cosmetic inconsistency with the rest of the codebase which uses `bg-background`.

⚪ Verify Tailwind config. If `bg-bg` is defined, document as deviation or rename to `bg-background` for consistency. If not defined, fix.

### 🟢 P2 · Mobile/desktop branch sets a precedent for `useIsMobile` viewport branching

Line 23: `const isMobile = useIsMobile()`. Line 91: `if (isMobile) { return ... }`.

This is the `useMediaQuery`-style pattern that Profile's mobile button sizing finding was waiting on. **Confirmation that the pattern exists and is in use.** Profile's deferred polish can now reference this concrete model. No finding for Shopping — just noting that the precedent is now established.

### 🟢 P3 · Mobile toast is a different visual treatment from Profile/Recipes/Recipe Detail toasts

Lines 101-105:
```
{toast && (
  <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-pill bg-text-primary text-bg text-sm font-semibold font-body whitespace-nowrap shadow-elevated pointer-events-none">
    {toast}
  </div>
)}
```

This is a **bottom-center pill toast** with `bg-text-primary text-bg` (dark text-primary background, light-bg text). The Profile/Recipes/Recipe Detail toasts are **top-right green** with `bg-success text-white`. Two visually distinct toast patterns in the same product.

Both look intentional for their contexts:
- The "Copied N items" toast on Shopping is a transient confirmation, hence the dark pill (matches Android-style snackbar conventions).
- The Profile/Recipes saves use the green success toast (matches a different convention).

Note: this toast uses `text-bg` which has the same `bg-bg` question as P1 — is `text-bg` a token? Same verification.

⚪ When `<Toast />` primitive ships (already in Design queue), it should support multiple variants — `success`, `info-pill`, etc. — to formalize both patterns instead of treating them as one-offs.

---

## Component-level findings (`ShoppingList.jsx`)

### 🔴 1.1 · "Copy to Clipboard" Button uses inline icon-as-children pattern

Lines 78-86:
```
<Button
  onClick={handleCopyToClipboard}
  variant="secondary"
  className="flex items-center gap-2"
>
  {copied ? (
    <><Check size={20} /> Copied!</>
  ) : (
    <><Copy size={20} /> Copy to Clipboard</>
  )}
</Button>
```

The icon-as-children pattern repeats here. **However** — this one has a complication: the icon changes based on state (`Check` when copied, `Copy` otherwise). The `Button` `icon` prop takes a single static React node, so making this conditional through the prop would require restructuring the conditional into two separate Button instances OR refactoring the icon to a stateful expression.

Two options:
- (a) Restructure as two Button instances (one with `icon={<Check />}` for copied state, one with `icon={<Copy />}` for default state):
```
  copied ? (
    <Button onClick={handleCopyToClipboard} variant="secondary" icon={<Check size={20} />}>
      Copied!
    </Button>
  ) : (
    <Button onClick={handleCopyToClipboard} variant="secondary" icon={<Copy size={20} />}>
      Copy to Clipboard
    </Button>
  )
```
- (b) Keep as-is — defensible exception because the icon varies by state. Same call we made on Recipe Detail's "Add for slot" button.

Lean (a) for Shopping. Reasoning: the two states are simple and stable; restructuring into two Button instances is cleaner than fighting the primitive's API. Trivial diff size, big consistency win. The Recipe Detail exception was harder because the conditional had three states (`added`, `adding`, default) — Shopping only has two.

Also note `className="flex items-center gap-2"` becomes unnecessary after the refactor — Button's `icon` prop handles spacing internally.

### 🟢 1.2 · Checkbox uses `hover:bg-surface-hover/80` — is `surface-hover` a defined token?

Line 121: `className="flex group pl-2 pr-3 py-1.5 hover:bg-surface-hover/80 transition-colors"`.

Same verification question as `bg-bg`. `surface-hover` might be a defined token (parallel to `bg-surface`, `bg-background`) or might be undefined. Worth checking the Tailwind config.

⚪ Verify Tailwind config for `surface-hover`. If defined, no finding. If not, this is silent broken styling — the hover state wouldn't render.

### 🟢 1.3 · Section heading uses uppercase letter-spaced micro-label pattern

Lines 105-110:
```
<h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
  {category}
</h3>
<span className="text-xs text-text-secondary opacity-60">
  ({uncheckedCount} remaining)
</span>
```

The uppercase-tracking-wide micro-label pattern is consistent with how Profile renders its section labels ("FOODS TO AVOID" etc). Good consistency. Uses `text-xs font-semibold uppercase tracking-wide text-text-secondary` — could be formalized as `<SectionLabel>` primitive but no urgency.

⚪ Possible Design queue: `<SectionLabel />` primitive — uppercase, tracking-wide, micro typography. Recurs across Profile, Shopping, possibly others.

### 🟢 1.4 · Empty state uses Card primitive correctly

Lines 92-97. Plain Card with center-aligned text. Tokens correct (`text-text-secondary font-body text-lg`). Single line of copy. Could be the canonical "minimal empty state" — easy to absorb into the `<EmptyState />` primitive when Design ships it.

⚪ Already in Design queue: `<EmptyState />` primitive.

### 🟢 1.5 · Header layout has multiple stacked `<p>` elements — could be a `<MetaList>` pattern

Lines 53-68:
```
<p className="text-text-secondary font-body text-sm">
  Week of {startDate.toLocaleDateString(...)}
</p>
{memberNames.length > 0 && (
  <p className="text-text-secondary font-body text-sm mt-0.5">
    Cooking for: {memberNames.join(', ')}
  </p>
)}
{mealsThisWeek.length > 0 && (
  <p className="text-text-secondary font-body text-sm mt-1 leading-snug">
    <span className="font-semibold text-text-primary">Meals this week:</span>{' '}
    {mealsThisWeek.join(', ')}
  </p>
)}
```

Three stacked `<p>` elements with similar styling, varying `mt-*` for breathing room. No real finding — just a minor formatting choice. Could become a list primitive but it's working fine.

---

## Cross-cutting findings

### ⚪ X.1 · Possibly redundant "Add to shopping list" button on mobile Recipe Detail (cross-page finding)

Surfaced during Recipe Detail visual verification. The mobile Recipe Detail page has an "Add to shopping list" button at the bottom of the ingredients section. **The shopping list is auto-generated from the meal plan** — every meal added to the plan populates the shopping list with its ingredients automatically.

So: does the manual "Add to shopping list" button on mobile Recipe Detail serve a real purpose, or is it dead weight that creates a parallel/inconsistent flow?

Two interpretations:
- (a) The button is genuinely redundant. Users only need "Add to meal plan." Removing the button simplifies the IA.
- (b) The button serves a use case: "I want ingredients without scheduling the meal." E.g., for shopping-ahead, partial inventory, or recipe browsing without committing.

This is a **product/IA decision, not a design system cohesion finding.** Doesn't belong in this audit's fix scope. Already flagged in PROJECT_NOTES.md as deferred polish.

Recommended: address as part of an explicit IA cleanup pass (post desktop overhaul), or as part of the eventual Recipe Detail mobile audit if/when that gets done.

### ⚪ X.2 · No flow-spec conformance check possible — FLOWS.md describes the mobile flow, not the desktop view

Looking at FLOWS.md Flow 5 (mentioned in line 99 of ShoppingListPage.jsx as a code comment), the spec describes a mobile composition: TopAppBar, scroll container, categorized list. Desktop renders the same component without the mobile chrome. Both are token-correct; just acknowledging that Shopping has the cleanest mobile/desktop parity of any audited page so far.

⚪ Document the dual-render pattern (single component, mobile-wrapped vs desktop-wrapped) as a recommended architecture for future single-file responsive pages.

---

## Findings sorted by leverage

**Highest leverage (fast wins, mechanical):**
- 🔴 1.1 — Copy Button: refactor to two Button instances using `icon` prop. Same pattern, cleaner result.

**Verification needed before fix:**
- 🟢 P1, P3 — Verify `bg-bg` and `text-bg` are defined tokens. If they are: no fix. If they aren't: rename to `bg-background` / `text-background` (or whatever the canonical token is).
- 🟢 1.2 — Verify `bg-surface-hover` token. If defined: no fix. If not: this hover state is broken.

**Polish:**
- 🟢 1.3, 1.4, 1.5 — Sections that work fine and will absorb into design system primitives when those ship. Defer.

**Cross-cutting (out of audit scope, but noted):**
- ⚪ X.1 — Recipe Detail mobile "Add to shopping list" button: IA cleanup pass, not this audit.
- ⚪ X.2 — Documentation of the responsive-component architecture pattern.

**Design extensions to add to queue:**
- ⚪ `<SectionLabel />` primitive — uppercase, tracking-wide, micro typography
- ⚪ `<Toast />` should support multiple variants (success, info-pill) — extending existing queue item

**Defer:**
- 🟢 P2 — Note useIsMobile pattern as the established responsive branching mechanism. No fix needed.
- 🟢 All others.

**Bugs (non-design):**
- (none surfaced, pending token verification on `bg-bg` / `text-bg` / `bg-surface-hover`)

---

## Triage decisions to make

For each finding, decide: **Fix now / Defer / Document deviation / Route to Design.**

1. **Run three tailwind.config.js verifications first.** Before deciding what to fix, we need to know if `bg-bg`, `text-bg`, and `bg-surface-hover` are defined tokens. The audit can't recommend "rename to bg-background" without knowing the answer.

2. **The Shopping branch (if any) is going to be small.** Possibly just one fix (1.1 — Button icon prop refactor) plus zero-or-three token renames depending on verification results. The fix prompt would be the shortest yet.

3. **No Design extensions added that aren't already in the queue.** The findings here mostly reinforce existing queue items rather than surfacing new ones.

4. **Recommended bundle for `fix/shopping-cohesion`:**
   - 🔴 1.1 (Copy Button → two Button instances with icon prop)
   - 🟢 P1, P3, 1.2 — Token renames (if verification shows undefined tokens)

   That's 1-4 fixes depending on verification. Smallest branch yet.

5. **Defer everything else.**
