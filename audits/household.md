# Household Domain — Design System Cohesion Audit

**Audited files:**
- `src/components/household/OnboardingModal.jsx` (141 lines)
- `src/components/household/HouseholdMemberForm.jsx` (385 lines)
- `src/components/household/HouseholdMemberCard.jsx` (168 lines)

**Call sites examined:**
- `src/pages/DashboardDesktop.jsx` (~215) — renders `<OnboardingModal>`
- `src/pages/DashboardMobile.jsx` (~189) — renders `<OnboardingModal>`
- Household card and form compose through `src/pages/Profile.jsx` (not re-audited here — see `audits/profile.md`)

**Audited against:** `design-system/COMPONENTS.md` v1.2.0, `design-system/tokens.css`, `design-system/FLOWS.md` (Flow 6 — mobile Profile, the only household-adjacent flow; no dedicated desktop household flow exists), `audits/profile.md` (prior audit — covered Profile.jsx's composition of these components, not their internals), `audits/dashboard-desktop.md` (prior audit — explicitly deferred OnboardingModal at finding 6.1).

**Date:** 2026-05-12

**Scope:** Cohesion of the 3 household subcomponents with the design system. These 3 files are the last un-audited domain surfaces in the desktop overhaul. Zero amber, zero platform="mobile" drift was pre-confirmed via grep before this audit — the household domain is the cleanest in the codebase. Findings are correspondingly fewer and more targeted.

**Out of scope:**
- `src/pages/Profile.jsx` (audited in `audits/profile.md`)
- `src/components/tdee/` (TDEE calculation panel internals — `HouseholdMemberForm` renders a TDEE result section but doesn't own the calculation)
- `src/hooks/useHouseholdMembers.js`, `useProfile.js` — hook internals

---

## Summary

The household domain is the most cohesion-compliant domain in the codebase. There is no amber drift, no gradient usage, no raw `bg-white`, no `animate-pulse`. The token palette is used correctly throughout — `text-text-primary`, `text-text-secondary`, `bg-surface`, `border-border`, `text-error`, `bg-primary/5`, and `border-primary/20` all appear in the right semantic contexts.

What the audit finds instead is **primitive bypass** — places where a design-system primitive (`<Input>`, `<IconBtn>`, `<Card>`) would be the correct tool, but a hand-rolled equivalent was used instead. In one case the hand-roll introduces a silent visual bug: `hover:bg-background` on the card action buttons renders the card background the same hue as the page background on hover rather than the intended elevated surface color.

Three patterns account for all findings:

1. **`isOpen` vs Modal's `open` prop.** OnboardingModal is the third and final instance of this wrapper-name mismatch (after MealTypeSelector and LeftoverDetailModal, both fixed in `fix/planner-cohesion`). The fix here completes the 4-instance sweep.

2. **Hand-rolled form inputs.** HouseholdMemberForm uses the Input primitive for most fields but falls back to a raw `<input>` for the foods-to-avoid tag input, hand-replicating the Input className. Same anti-pattern the planner audit flagged on HouseholdSelector.

3. **Hand-rolled icon buttons.** HouseholdMemberCard's edit and delete actions, and the Trash2 inside HouseholdMemberForm's tag chip, are hand-rolled `<button>` elements instead of `<IconBtn>`. The `<IconBtn>` primitive is 40×40 accessible icon buttons with a consistent hover resting state — exactly what these sites need.

**Total findings: 9. Bug findings: 1** (`hover:bg-background` in HouseholdMemberCard — renders as page-background on hover rather than elevated surface).

Severity tags:
- **🔴 high** — visible cohesion failure or silent rendering bug
- **🟡 medium** — bypasses primitives or tokens but renders acceptably
- **🟢 low** — polish, consistency, or minor token alignment
- **⚪ note** — observation that may need a Design system extension or PM-style decision

---

## Cross-cutting findings

### 🟢 X.1 · `isOpen` → `open` rename (OnboardingModal + 2 call sites)

`OnboardingModal.jsx` accepts an `isOpen` prop and pipes it to `<Modal open={isOpen}>`. This is the same inconsistency fixed across `MealTypeSelector` and `LeftoverDetailModal` in `fix/planner-cohesion`. That branch confirmed 3 instances of the pattern; OnboardingModal is the 4th.

Call sites:
- `DashboardDesktop.jsx` (~215): `<OnboardingModal isOpen={showOnboarding} ...>`
- `DashboardMobile.jsx` (~189): `<OnboardingModal isOpen={showOnboarding} ...>`

Three-file change (OnboardingModal + 2 call sites). Mechanical.

### 🟡 X.2 · Hand-rolled action buttons that should be `<IconBtn>`

Three sites across 2 files:

| File | Line | Context |
|---|---|---|
| `HouseholdMemberCard.jsx` | ~116 | Edit (Pencil) action button |
| `HouseholdMemberCard.jsx` | ~122 | Delete (Trash2) action button |
| `HouseholdMemberForm.jsx` | ~347 | Trash2 inside foods-to-avoid tag chip |

All three are hand-rolled `<button>` elements with icon children and hover states. `<IconBtn>` is the design system's primitive for exactly this shape (40×40 accessible icon button, `label` prop for a11y, consistent ghost hover). The form's Trash2 is rendered inside a Badge child, which is unusual — that site may need a different treatment (see F.2).

---

## Per-file findings

---

## Section 1 · OnboardingModal.jsx (141 lines)

### 🟢 1.1 · `isOpen` prop name doesn't match Modal's `open` API

See X.1. `export function OnboardingModal({ isOpen, onClose })` pipes into `<Modal open={isOpen} ...>`. Rename prop to `open` and update 2 call sites. Modal's API is `open` (confirmed in COMPONENTS.md §5 and verified in the fixed planner wrappers).

### 🟡 1.2 · `width={896}` is the largest Modal width in the codebase

Line ~14: `<Modal open={isOpen} onClose={onClose} title="Welcome to What Do You Want For Dinner?" width={896}>`. 896px exceeds the next-largest (`width={672}` in WeeklyPlanner and MealTypeSelector). The Design queue item "named Modal sizes" would define `sm=480`, `md=672`, `lg=768` — 896 wouldn't fit any named size.

At 896px, the Modal will fill most of the viewport on 1024px screens and be clipped on anything narrower. The onboarding content (two steps, some form fields and descriptive text) doesn't obviously require that width — it may have been set to "feel spacious" rather than to fit content.

Two paths:
- (a) Drop to `width={672}` (the "large" size used by planning modals). Requires a render check that the form fields aren't cramped.
- (b) Leave at 896 with a code comment noting the intentional size. Defer to the named-Modal-sizes queue item.

⚪ Lean (a) unless render check shows the form needs the space. No visible width token exists for 896; it's a one-off.

### 🟢 1.3 · Step 2 "Finish" button uses `<ArrowRight>` as child, not `icon` prop

Step 2 renders:
```jsx
<Button onClick={onClose}>
  Let's Get Started!
  <ArrowRight size={20} className="ml-2" />
</Button>
```

The correct pattern (per COMPONENTS.md §1 and the planner fix) is to use Button's `icon` prop for trailing icons. The `icon` prop renders after the label text:
```jsx
<Button onClick={onClose} icon={<ArrowRight size={20} />}>
  Let's Get Started!
</Button>
```

Drops `className="ml-2"`. Mechanical.

### ⚪ 1.4 · No step indicator for the 2-step flow

OnboardingModal renders step 1 (intro + household setup) and step 2 (meal slots setup) with a `useState(1)` toggle. There's no visual "Step 1 of 2" indicator. For a 2-step modal, a simple inline counter or dots (step indicator) would orient the user.

This is a UX gap rather than a cohesion finding — the design system doesn't spec an onboarding step indicator. Flag for the household UX Design queue. No fix in this bundle.

---

## Section 2 · HouseholdMemberForm.jsx (385 lines)

### 🔴 2.1 · Raw `<input>` for foods-to-avoid field bypasses the Input primitive

Line ~347 renders a raw `<input>` for the new-food text field in the foods-to-avoid tag section:
```jsx
<input
  type="text"
  value={newFood}
  onChange={(e) => setNewFood(e.target.value)}
  onKeyDown={handleFoodKeyDown}
  placeholder="Type and press Enter..."
  className="flex-1 px-4 py-3 rounded-xl border-2 border-border bg-surface text-text-primary font-body focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
/>
```

This is the Input primitive's token-correct className manually reproduced. If a design token ever changes (border color, focus ring, padding), this field diverges silently from all other inputs. The correct fix is `<Input>` from `src/components/ui/Input.jsx`:
```jsx
<Input
  value={newFood}
  onChange={(e) => setNewFood(e.target.value)}
  onKeyDown={handleFoodKeyDown}
  placeholder="Type and press Enter..."
/>
```

The `flex-1` from the wrapper div handles sizing; `<Input>` takes `className` if `flex-1` needs to be applied to the input element itself, but typically the Input wrapper can be set to `flex-1` in the containing layout.

Note: this field also lacks an accessible `<label>` — the surrounding UI implies purpose visually but there's no `htmlFor` / `id` pair or `aria-label`. Separate a11y concern; flagged but out of cohesion scope.

### 🟡 2.2 · Hand-rolled Trash2 `<button>` rendered inside Badge children

Inside the foods-to-avoid tag rendering (~line 330), each tag chip renders a Trash2 icon `<button>` as a child of `<Badge>`. Badge is not designed to contain interactive children — it's a display primitive. The pattern is:

```jsx
<Badge key={food} tone="secondary" variant="soft">
  {food}
  <button
    type="button"
    onClick={() => removeFood(food)}
    className="ml-1 text-text-secondary hover:text-error"
  >
    <Trash2 size={12} />
  </button>
</Badge>
```

Two issues:
1. Interactive content inside a display primitive — Badge is `role="status"`/display, not a container for buttons.
2. The inline `<button>` has no `aria-label`, making the delete action inaccessible to screen readers.

Better pattern: replace the composed Badge+button with an inline chip-tag structure that separates the label span from a small `<IconBtn>` (or a minimal `<button aria-label="Remove {food}">`):
```jsx
<span key={food} className="inline-flex items-center gap-1 bg-secondary-soft text-secondary px-2 py-0.5 rounded-full text-[11px] font-semibold font-body">
  {food}
  <button
    type="button"
    aria-label={`Remove ${food}`}
    onClick={() => removeFood(food)}
    className="hover:text-error transition-colors"
  >
    <Trash2 size={10} />
  </button>
</span>
```

Or wait for the `<ChipToggle>` primitive queue item to produce a dismissible tag variant.

⚪ The token-correct chip-tag approach above is the minimum fix. IconBtn is 40×40 — too large for a 12px icon inside a small badge chip. The small inline button with `aria-label` is appropriate here.

### 🟢 2.3 · Height and weight fields use hand-rolled `<label>` instead of Input's `label` prop

Height and weight inputs (lines ~240-280) use a pattern like:
```jsx
<label className="block text-sm font-semibold text-text-primary mb-2 font-body">
  Height
</label>
<Input value={...} onChange={...} />
```

The `<Input>` primitive accepts a `label` prop that renders the label internally, ensuring the `htmlFor`/`id` association is always correct. Hand-rolling the label detaches this association:
```jsx
<Input
  label="Height"
  value={...}
  onChange={...}
/>
```

Mechanical. The rendered styling may differ slightly (Input's label style vs. the manual `font-semibold mb-2` pattern) — verify on render.

---

## Section 3 · HouseholdMemberCard.jsx (168 lines)

### 🔴 3.1 · Edit action button uses `hover:bg-background` (wrong token — silent bug)

Line ~116:
```jsx
<button
  onClick={() => onEdit(member)}
  className="p-2 hover:bg-background rounded-lg"
  aria-label="Edit member"
>
  <Pencil size={16} className="text-text-secondary" />
</button>
```

`hover:bg-background` sets the hover background to the page background color (`#FDF6EC`, the warm parchment-page color). On hover, the button appears to "disappear into the page" rather than elevate. The correct interactive surface hover token is `hover:bg-surface-hover`.

This is a **visual bug** — not just drift. The hover state exists in the code but renders incorrectly.

Fix: `hover:bg-background` → `hover:bg-surface-hover`. One token, both action buttons.

Per X.2, both action buttons (edit + delete) are also candidates for `<IconBtn>`. IconBtn's ghost hover state is `hover:bg-surface-hover` automatically.

### 🟡 3.2 · Edit and delete action buttons should be `<IconBtn>` (see X.2)

Lines ~116-127 render two hand-rolled `<button>` elements with identical structure — `p-2 rounded-lg` with an icon child and `aria-label`. This matches `<IconBtn>` exactly (40×40 ghost icon button with label for a11y):

```jsx
<IconBtn label="Edit member" onClick={() => onEdit(member)}>
  <Pencil size={16} />
</IconBtn>
<IconBtn label="Delete member" onClick={() => onDelete(member.id)}>
  <Trash2 size={16} className="text-error" />
</IconBtn>
```

The delete button correctly uses `text-error` on the icon. IconBtn preserves icon className children, so `text-error` stays. The `3.1` bug (hover:bg-background) is resolved as a side effect of switching to IconBtn.

### 🟡 3.3 · Card is a hand-rolled `<div>`, not the `<Card>` primitive

Lines ~1-10:
```jsx
<div
  className={`relative bg-surface rounded-xl p-5 border-2 border-border shadow-resting transition-all duration-200 cursor-pointer ${isHovered ? 'shadow-elevated' : ''}`}
  onMouseEnter={() => setIsHovered(true)}
  onMouseLeave={() => setIsHovered(false)}
>
```

The `<Card>` primitive (`src/components/ui/Card.jsx`) handles exactly this: `bg-surface rounded-xl border-2 border-border shadow-resting hover:shadow-elevated`. The hand-roll also wires its own `useState(isHovered)` for the shadow elevation on hover, whereas Card handles this internally.

However, the card has two decorative elements (a gradient overlay and a corner-fold decoration) that layer on top of the card surface, both using tokens correctly (`bg-border`, `to-text-primary/[0.02]`). These would need to render as Card children. The edit/delete action buttons are also positioned absolutely over the card.

Two paths:
- (a) Token-swap the `shadow-sm hover:shadow-md` (wait, the file already uses `shadow-resting` / `shadow-elevated` — tokens are correct). The hand-roll is token-correct; the only missing piece is `<Card>` encapsulation.
- (b) Refactor to `<Card state={isHovered ? 'hover' : 'resting'}>` with decorative children.

⚪ Lean (a): the hand-roll uses the correct token set everywhere. The rich decoration and absolute-positioned action buttons make a Card refactor higher-risk than the value it returns. Document as "Card-shaped surface, hand-rolled intentionally." No fix in this bundle. Same posture as MealSlot's filled-card (planner audit finding 8.2).

### ⚪ 3.4 · `rotate-1 scale-105` hover animation is bespoke

Lines ~7-8: on hover (`isHovered`), the card applies `rotate-1 scale-105`. This "tilt + grow" on hover is not in `design-system/tokens.css` motion spec. The design system documents `transition-all duration-200` for hover transitions but doesn't specify a rotation or scale affordance for cards.

Bespoke animations that are consistent with the cookbook aesthetic can be intentional — but they should be documented or moved to a token. No active finding; flag for future motion-spec pass.

---

## Findings sorted by leverage

**Highest leverage:**
- 🔴 3.1 — `hover:bg-background` → `hover:bg-surface-hover` on edit button. Silent rendering bug; 1 token change. Also fixed as side effect of 3.2.
- 🔴 2.1 — Raw `<input>` for foods-to-avoid → `<Input>` primitive. Ends silent divergence risk from future token changes.
- 🟡 3.2 — Hand-rolled edit/delete buttons → `<IconBtn>` (2 sites). Fixes the 3.1 bug as a side effect + adds `label` a11y.
- 🟢 1.1 — `isOpen` → `open` rename (OnboardingModal + 2 call sites). Completes the 4-instance sweep.

**Medium effort:**
- 🟡 2.2 — Trash2 in Badge children → standalone chip-tag + `aria-label`. Needs light design decision (chip structure vs. waiting for dismissible tag primitive).
- 🟡 1.2 — `width={896}` → `width={672}` after render check. Depends on whether form content fits the narrower modal.

**Polish:**
- 🟢 1.3 — ArrowRight as Button child → `icon` prop. 1-line change.
- 🟢 2.3 — Hand-rolled height/weight labels → Input's `label` prop. Improves a11y; verify label rendering.

**No fix / defer:**
- ⚪ 1.4 — Step indicator for 2-step onboarding flow. UX gap, not cohesion. Flag for household UX Design queue.
- ⚪ 3.3 — Card primitive refactor. Token-correct hand-roll; complex decoration makes refactor higher-risk than return.
- ⚪ 3.4 — Bespoke hover animation. Flag for motion-spec pass.

---

## Recommended bundle for `fix/household-cohesion`

Small, focused branch:

**Primitive and prop fixes:**
- ✅ 1.1 — `isOpen` → `open` rename (OnboardingModal + DashboardDesktop + DashboardMobile)
- ✅ 1.3 — ArrowRight → `icon` prop on Step 2 Button
- ✅ 2.1 — Raw `<input>` → `<Input>` primitive for foods-to-avoid field
- ✅ 3.1 + 3.2 — Hand-rolled edit/delete buttons → `<IconBtn>` (fixes hover:bg-background bug as side effect)

**Decision-gated (resolve before branching):**
- ✅ or ⏸ 1.2 — `width={896}` → `width={672}`. Do a render check on OnboardingModal step 1 and step 2 at 672px; proceed if content fits, else defer.
- ✅ or ⏸ 2.2 — Trash2-in-Badge → standalone chip-tag. Token-correct already; only fix is the accessible `aria-label` + remove from Badge children. Low effort, recommend including.

**Polish riders:**
- ✅ 2.3 — Hand-rolled height/weight labels → Input's `label` prop (verify label renders correctly)

**Deferred:**
- ⚪ 1.4 — Step indicator (UX Design queue)
- ⚪ 3.3 — Card primitive refactor (hand-roll is token-correct; defer indefinitely)
- ⚪ 3.4 — Motion-spec pass for bespoke hover animations

### Estimated bundle size

- **Files touched:** 5 (OnboardingModal.jsx, DashboardDesktop.jsx, DashboardMobile.jsx, HouseholdMemberForm.jsx, HouseholdMemberCard.jsx)
- **Diff size estimate:** ~40–60 lines changed (additions + deletions). This is the smallest fix branch in the desktop overhaul — the domain is already 90% token-correct.
- **Visual verification surfaces:** Dashboard (both desktop and mobile — OnboardingModal), Profile page (HouseholdMemberForm + HouseholdMemberCard). Test: add a new member, edit an existing member, hover edit/delete buttons, trigger onboarding (clear localStorage `hasSeenOnboarding` if needed to re-trigger).

### Verification greps (post-fix)

```bash
grep -n 'isOpen' src/components/household/OnboardingModal.jsx  # should be 0
grep -n 'isOpen' src/pages/DashboardDesktop.jsx                # should be 0
grep -n 'isOpen' src/pages/DashboardMobile.jsx                 # should be 0
grep -n 'hover:bg-background' src/components/household/        # should be 0
grep -n 'className="ml-2"' src/components/household/           # should be 0
grep -n '<input ' src/components/household/                    # should be 0 (all input tags via Input primitive)
```

---

## Closing the desktop overhaul

This is the final domain audit in the desktop cohesion pass. The audited domains and their disposition:

| Domain | Audit | Fix branch | Status |
|---|---|---|---|
| Dashboard (desktop) | `audits/dashboard-desktop.md` | `fix/dashboard-cohesion` | Shipped |
| Recipes | `audits/recipes.md` | `fix/recipes-cohesion` | Shipped |
| Recipe Detail (desktop) | `audits/recipe-detail-desktop.md` | `fix/recipe-detail-cohesion` | Shipped |
| Auth flow | `audits/auth-flow.md` | `fix/auth-flow-cohesion` | Shipped |
| Profile | `audits/profile.md` | `fix/profile-cohesion` | Shipped |
| Shopping | `audits/shopping.md` | `fix/shopping-cohesion` | Shipped |
| Planner | `audits/planner.md` | `fix/planner-cohesion` | Shipped |
| Household | `audits/household.md` | `fix/household-cohesion` | **This branch** |

**After `fix/household-cohesion` ships, the desktop overhaul is complete.**

What the overhaul accomplished:
- Eliminated ~200+ amber-* instances across the codebase (primary amber→primary/accent/text-secondary token sweep)
- Eliminated all gradient button overrides (replaced with clean `variant="primary"`)
- Replaced hand-rolled pills, badges, and chips with `<Badge>` primitive across 5+ domains
- Replaced hand-rolled icon buttons with `<IconBtn>` across 4+ domains
- Corrected `isOpen` → `open` across 4 Modal wrappers
- Brought `<MealSlotSkeleton>` to LOADING.md shimmer spec (leading instance of the skeleton-shimmer pass)
- Zeroed out `bg-white` usage across all card surfaces (→ `bg-surface`)
- Mapped semantic state colors (success/warning/error/text-tertiary) from raw Tailwind utilities to design tokens

What remains after this point:

**Mechanics (already on the queue, not blocked on overhaul):**
- Skeleton-shimmer conformance pass — `grep animate-pulse src/` to size; MealSlotSkeleton is the reference fix
- MacrosBadge primitive audit (separate queued item)
- Page-level heading scale consistency (PlanDesktop `text-3xl` vs Dashboard `text-4xl` — deferred from planner audit)
- `alert()` → toast/error-banner pass (7 sites in WeeklyPlanner.jsx alone)

**Design queue (need design decisions before implementing):**
- `<ChipToggle>` primitive (selectable binary pill)
- `<ProgressBar>` primitive (with tone variants)
- `<Tooltip>` primitive
- Named Modal sizes (`sm` / `md` / `lg`)
- Button `variant="ghost-destructive"` (already noted in FLOWS.md)
- `<AddRowButton>` primitive (dashed "add row" affordance)
- `<PortionMacros>` micro-primitive (defer to MacrosBadge audit)

**What is NOT remaining from the overhaul scope:**
- Any mobile-specific cohesion work. `PlanMobile.jsx` (337 lines), mobile-specific layouts in `planner-mobile/`, and the mobile-only presentation components are not part of the desktop overhaul and should be audited as a separate initiative when/if mobile cohesion work begins.

**Is the desktop overhaul ready to close after `fix/household-cohesion` ships?**

Yes. All 8 major desktop domains have been audited. All high-severity drift (amber, gradients, raw semantic colors, primitive bypass) has been addressed or has a clear deferred rationale. The remaining queue items are either mechanics (skeleton sweep, heading scale) or Design queue decisions — neither category blocks the "desktop surfaces are cohesion-compliant" milestone.
