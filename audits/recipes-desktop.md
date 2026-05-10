# Recipes (Desktop) — Design System Cohesion Audit

**Audited file:** `src/pages/Recipes.jsx`
**Also referenced:** `src/components/recipes/RecipeFilters.jsx` (for context — not in scope)
**Audited against:** `design-system/COMPONENTS.md` v1.2.0, `design-system/tokens.css`, FLOWS.md (no flow exists for Recipes browse)
**Date:** 2026-05-08
**Scope:** Cohesion of `Recipes.jsx` page-level glue with the design system. Out of scope: `RecipeForm.jsx` (separate audit later), `RecipeCard.jsx` (separate audit later), `RecipeFilters.jsx` (already mostly clean, see notes).

---

## Summary

Recipes is in noticeably better shape than Profile was. The page composes correctly from real primitives in most places — `Button`, `Modal`, `ConfirmDialog`, `LoadingSpinner`, `TopAppBar`, `IconBtn`, `RecipeCard`, `RecipeFilters`. The dominant drift is in **page-level glue UI**: a hand-rolled search input, a hand-rolled view toggle that should be `SegmentedControl`, an amber-* pending slot banner, and the same `Button` icon-prop pattern from Profile. Total findings: 11. Bug findings: 2.

Notable: there is **no flow spec for the Recipes browse experience** in FLOWS.md. The page exists in production but its composition has never been canonicalized in the design system. This audit measures against COMPONENTS.md and tokens; FLOWS.md has nothing to compare to.

Severity tags:
- **🔴 high** — visible cohesion failure that contradicts the design system
- **🟡 medium** — bypasses primitives or tokens but renders acceptably
- **🟢 low** — polish, consistency, or minor token alignment
- **⚪ note** — observation that may need a Design system extension or PM-style decision

---

## Page-level findings

### 🟡 P1 · `cookbook-bg` is a custom CSS class outside the design system

Line: `<div className="cookbook-bg -mx-4 px-4 -my-2 py-2 sm:-mx-8 sm:px-8 sm:-my-4 sm:py-4">`

`cookbook-bg` is defined in `src/index.css`:
```
.cookbook-bg {
  background-image: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(44,26,14,.01) 2px, rgba(44,26,14,.01) 4px),
                    repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(44,26,14,.01) 2px, rgba(44,26,14,.01) 4px);
}
```

A repeating-linear-gradient grid texture for a paper/cookbook feel. Two observations:
- (a) The class is **only used on Recipes.jsx** (grep confirmed). Either it's a unique Recipes treatment that should be documented as a design-system pattern (the warm cookbook texture *is* part of your aesthetic), or it's an experimental one-off that should be deleted.
- (b) The class uses a hex literal (`rgba(44,26,14,.01)`) which is `--color-text-primary` at 1% alpha. This is fine — it just isn't tokenized.

⚪ Possible Design system decision: either codify `cookbook-bg` as a documented texture pattern (and use it on other "library/collection" surfaces — Shopping List? Profile?) or delete it. Don't leave it in limbo.

### 🟢 P2 · Same nested width caps as Profile (`max-w-7xl` outer, no inner cap here — only Profile has the inner cap)

Recipes uses `max-w-7xl mx-auto` (1280px) without a nested inner cap. So at desktop width, content uses up to 1280px. The 4-column grid at xl breakpoint actually uses this width well. **This appears to be the right pattern for grid-heavy desktop pages.** Profile's `max-w-4xl` inner cap is the actual oddity, not this.

Worth noting for the eventual page-width design system decision (deferred from Profile audit P2): grid pages probably want full container width; form/profile pages probably want narrower centered.

---

## Section 1 · Toast (top of page)

### 🟡 1.1 · Hand-rolled toast — same as Profile

Lines:
```
{toast && (
  <div className="fixed top-20 right-4 z-50 max-w-sm px-6 py-4 rounded-xl shadow-elevated font-body font-semibold bg-success text-white leading-relaxed">
    {toast}
  </div>
)}
```

Inline toast with hard-coded positioning. Uses tokens correctly (`bg-success`, `shadow-elevated`, `rounded-xl`) — but it's still hand-rolled. Same finding as Profile X.1. Same Design queue item already filed.

⚪ Already in Design queue: `<Toast />` primitive.

---

## Section 2 · Desktop header (Filters / Add Recipe row)

### 🔴 2.1 · Filters Button uses `<Filter className="mr-2" />` child instead of `icon` prop

Lines:
```
<Button
  onClick={() => setIsFiltersOpen(!isFiltersOpen)}
  variant="ghost"
  className="relative"
>
  <Filter size={20} className="mr-2" />
  Filters
  {activeFilterCount > 0 && (
    <span className="absolute -top-1 -right-1 ...">
      {activeFilterCount}
    </span>
  )}
</Button>
```

Same as Profile 2.6 / 7.2. Refactor: `icon={<Filter size={20} />}`. The activeFilterCount badge stays as a child (it's a positioned element, not a leading icon).

### 🔴 2.2 · Add Recipe Button uses `<Plus className="mr-2" />` child

Lines:
```
<Button onClick={() => setIsFormOpen(true)}>
  <Plus size={20} className="mr-2" />
  Add Recipe
</Button>
```

Same fix: `icon={<Plus size={20} />}`. Trivial.

---

## Section 3 · Pending slot banner

### 🔴 3.1 · The pending slot banner uses `bg-amber-*` Tailwind palette throughout

Lines:
```
<div className="mb-5 flex items-center gap-3 px-4 py-3 bg-amber-50 border-2 border-amber-300 rounded-xl">
  <div className="flex-1 min-w-0">
    <p className="text-sm font-body font-semibold text-amber-900">
      Adding {formatSlotLabel(pendingSlot.date, pendingSlot.mealType)}
    </p>
    <p className="text-xs font-body text-amber-700 mt-0.5">
      Click any recipe below to add it to this slot.
    </p>
  </div>
  <button
    onClick={() => navigate('/dashboard')}
    className="flex items-center gap-1.5 text-xs font-body font-semibold text-amber-700 hover:text-amber-900 flex-shrink-0"
  >
    <ArrowLeft size={14} />
    Cancel
  </button>
</div>
```

Six amber-* references on the same banner. Same drift as Profile's Meal Slots collapsed preview (which we just fixed). Token mapping should follow the same pattern:
- `bg-amber-50` → `bg-accent-soft/40` (or `bg-accent-soft/50` for a slightly stronger fill)
- `border-amber-300` → `border-accent/60`
- `text-amber-900` → `text-text-primary`
- `text-amber-700` → `text-text-secondary`
- `hover:text-amber-900` → `hover:text-text-primary`

This is the second instance of the same drift pattern. Pattern is real — likely repeats in Dashboard, possibly Plan/PlanMobile. Worth grepping codebase-wide for `bg-amber-` after this fix.

### 🟢 3.2 · The Cancel button is hand-rolled

Within the banner:
```
<button
  onClick={() => navigate('/dashboard')}
  className="flex items-center gap-1.5 text-xs font-body font-semibold text-amber-700 hover:text-amber-900 flex-shrink-0"
>
  <ArrowLeft size={14} />
  Cancel
</button>
```

Could be `<Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />}>Cancel</Button>` — same pattern as Profile's Edit pencil fix (3.6). Sm size is desktop-only, but the banner is mobile+desktop, so this one's tricky: at sm sizing on mobile, you'd violate the 44px tap target.

Two options:
- (a) Use `size="md"` (44px on desktop, 48px on mobile) — but visually heavier than the surrounding compact banner.
- (b) Keep hand-rolled and accept this as a banner-style in-context affordance, document as deviation.

Lean (b) — banner Cancel is a tertiary action embedded in compact context. Refactoring to Button would change the visual rhythm. But the amber colors still need to swap to tokens (3.1).

---

## Section 4 · Search input

### 🔴 4.1 · Hand-rolled search input bypasses Input primitive

Lines:
```
<div className="relative mb-5">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" size={18} />
  <input
    type="text"
    value={filters.search}
    onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
    placeholder="Search recipes..."
    className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-border bg-surface text-text-primary font-body focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
  />
  {filters.search && (
    <button
      onClick={() => setFilters(prev => ({ ...prev, search: '' }))}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
    >
      <X size={16} />
    </button>
  )}
</div>
```

Hand-rolled "Input with leading icon and trailing X." The Input primitive supports `leadingIcon` and `trailingIcon` props for exactly this case. Refactor candidate:

```
<Input
  value={filters.search}
  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
  placeholder="Search recipes..."
  leadingIcon={<Search size={18} />}
  trailingIcon={
    filters.search && (
      <button
        onClick={() => setFilters(prev => ({ ...prev, search: '' }))}
        className="text-text-secondary hover:text-text-primary"
      >
        <X size={16} />
      </button>
    )
  }
/>
```

Drift in the hand-rolled version vs. Input spec:
- `border-2` (spec is `border-[1.5px]`)
- `rounded-xl` (spec is `rounded-sm`)
- `py-2.5` (spec is `h-11` for desktop)
- Custom focus ring instead of spec's `focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary`

The trailingIcon prop expects a clickable element to be passed in directly — Input's spec shows `<PasswordToggle>` as the canonical example. A clear-text-button is the same pattern. **This is a clean Input primitive use.**

### 🟢 4.2 · After fix, the trailing X clear button is still hand-rolled markup

The X button itself doesn't fit any Button variant cleanly — it's a 16px text-only icon button inside an input. Using IconBtn would be 40px (too big). Using Button size="sm" would be 36px (still too big). This is a legitimate hand-roll case.

⚪ Possible Design system extension: `<Input clearable />` prop that handles the X clear button internally, common pattern for search inputs.

---

## Section 5 · View Toggle (All Recipes / My Recipes)

### 🔴 5.1 · Hand-rolled view toggle is a textbook SegmentedControl use case

Lines:
```
<div className="flex gap-1 p-1 bg-surface rounded-xl border-2 border-border w-fit mb-6 shadow-sm">
  <button
    onClick={() => setView('all')}
    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold font-body transition-all ${
      view === 'all'
        ? 'bg-primary text-white shadow-sm'
        : 'text-text-secondary hover:text-text-primary'
    }`}
  >
    <Globe size={15} />
    All Recipes
  </button>
  <button
    onClick={() => setView('mine')}
    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold font-body transition-all ${
      view === 'mine'
        ? 'bg-primary text-white shadow-sm'
        : 'text-text-secondary hover:text-text-primary'
    }`}
  >
    <User size={15} />
    My Recipes
  </button>
</div>
```

The SegmentedControl primitive renders this exact pattern:
- Pill container with inline option buttons
- Selected gets `bg-primary text-white`
- Hover state on unselected
- Border, padding, gap all spec'd

Drift:
- Recipes uses `rounded-xl` outer + `rounded-lg` inner; spec uses `rounded-pill` for both
- Recipes uses `border-2 border-border`; spec uses `border border-border`
- Recipes uses `p-1`; spec uses `p-[3px]`
- Recipes uses `px-4 py-2`; spec uses `px-4 py-1.5`
- Recipes adds `shadow-sm`; spec doesn't

**One real complication:** Recipes' view toggle has icons (Globe, User) on each option. SegmentedControl's API doesn't currently support icons:
```
options: { value: string|number, label: string }[]
```

Two paths forward:
- (a) Use SegmentedControl as-is, drop the icons. Cleanest fix. Lose the visual distinction between "globe = all" and "user = mine."
- (b) Extend SegmentedControl in the design system to support `options: { value, label, icon? }[]`. More work, but icons are a common segmented-control pattern in the wild.
- (c) Keep hand-rolled, accept the drift, document it.

⚪ Strong Design queue candidate: `SegmentedControl` accepts optional `icon` per option.

Recommended near-term: option (a). Visual change, but small one — and SegmentedControl with `bg-primary text-white` selected state is recognizable enough that "All Recipes / My Recipes" labels carry the meaning without icons.

### 🟢 5.2 · `shadow-sm` on the toggle wrapper is Tailwind default, not a design token

`shadow-sm` is `0 1px 2px 0 rgb(0 0 0 / 0.05)` (Tailwind default). Your token list has `shadow-resting` (`0 1px 3px rgba(44, 26, 14, .08)`). Different values, different aesthetics — Tailwind's is gray, yours is warm brown.

Drops if 5.1 is fixed (SegmentedControl spec doesn't have shadow on the wrapper).

---

## Section 6 · Recipes Grid + Empty State

### 🟢 6.1 · Recipes grid uses `gap-6` (24px) — matches `--space-6` token

Line: `<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">`

Correct. `gap-6` maps to your custom 24px in tailwind.config.js. ✓

### 🟢 6.2 · Empty state has decorative blur element using `bg-primary/5`

Lines:
```
<div className="relative mb-6">
  <BookOpen size={80} className="mx-auto text-primary/20" strokeWidth={1.5} />
  <div className="absolute inset-0 flex items-center justify-center">
    <div className="w-16 h-16 bg-primary/5 rounded-full blur-xl"></div>
  </div>
</div>
```

The `blur-xl` decorative halo behind the icon is a cute touch but it's bespoke — no equivalent in any other empty state in the design system. Either:
- (a) Document it as part of the empty state pattern (and use it everywhere empty states appear)
- (b) Remove for visual consistency with other empty states
- (c) Accept it as Recipes-specific flair and document the deviation

⚪ Already in Design queue: `<EmptyState />` primitive (from Profile audit 2.5). When that ships, this question gets resolved as part of the spec.

### 🔴 6.3 · Empty state buttons use `<X className="mr-2" />` child pattern

Lines:
```
<Button onClick={...} variant="secondary">
  <X size={20} className="mr-2" />
  Clear All Filters
</Button>
```

and:

```
<Button onClick={() => setIsFormOpen(true)} size="lg">
  <Plus size={20} className="mr-2" />
  Add Your First Recipe
</Button>
```

Same as 2.1, 2.2. Use `icon` prop. Trivial.

---

## Section 7 · Modal

### 🟢 7.1 · Modal lacks `platform` prop (same as Profile)

Line: `<Modal open={isFormOpen} onClose={handleGuardedClose} title="Add New Recipe" width={896}>`

Same as Profile 4.3 / 5.1. Same likely existing-bug-but-untriggered status. Same recommendation: not a Recipes-specific fix.

### 🟢 7.2 · Modal width=896 (same magic number as Profile)

Same as Profile 4.2. Already in Design queue: named modal sizes.

### ⚪ 7.3 · The discard-changes flow uses ConfirmDialog (not Modal)

Lines:
```
<ConfirmDialog
  isOpen={showDiscardConfirm}
  title="Unsaved Changes"
  message="You have unsaved changes. If you leave, your progress will be lost."
  cancelLabel="Keep Editing"
  confirmLabel="Discard Changes"
  onCancel={() => setShowDiscardConfirm(false)}
  onConfirm={handleDiscard}
/>
```

ConfirmDialog is a separate primitive that I haven't audited (not in COMPONENTS.md slices I have). Profile uses raw Modal for its Slot Delete and Member Delete confirmations. **Inconsistency:** two pages, two different primitives, both for "destructive confirmation modal."

⚪ Possible Design queue item: clarify when to use Modal vs. ConfirmDialog. Or consolidate ConfirmDialog into Modal as a `variant="confirm"`. Or audit ConfirmDialog's spec separately.

---

## Cross-cutting findings

### 🟢 X.1 · `text-success` used correctly — token-mapped

The toast renders `bg-success text-white` and `--color-success: #5C7A4A` is tokenized. ✓

### 🟢 X.2 · Mobile TopAppBar uses `titleAbsoluteCenter` prop (a layout-override)

Line:
```
<TopAppBar
  titleAbsoluteCenter
  title={pageTitle}
  trailing={<>...</>}
/>
```

This is one of the three documented TopAppBar layout-override props from PROJECT_NOTES.md. Used because trailing has TWO IconBtns (Filters + Add Recipe), which would push the title off-center. Correct usage. ✓

### 🟢 X.3 · The trailing IconBtn count badge for Filters

Mobile TopAppBar trailing:
```
<IconBtn label="Filters" onClick={() => setIsFiltersOpen(!isFiltersOpen)}>
  <span className="relative inline-flex">
    <Filter size={20} strokeWidth={1.8} />
    {activeFilterCount > 0 && (
      <span className="absolute -top-1 -right-1.5 w-4 h-4 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center">
        {activeFilterCount}
      </span>
    )}
  </span>
</IconBtn>
```

Hand-rolled count badge inside an IconBtn. Same pattern repeats on desktop in 2.1. The badge is bespoke — a small absolute-positioned circle with count text. Across the app, count badges might appear elsewhere (cart counts, notification dots, unread message counts). Not in current scope but worth flagging as a possible primitive.

⚪ Possible Design queue item: `<Badge>` count variant or notification dot pattern.

---

## Findings sorted by leverage

**Highest leverage (fast wins, mechanical):**
- 🔴 2.1, 2.2, 6.3 — Three Button `icon` prop refactors. Trivial.
- 🔴 3.1 — Pending slot banner amber → tokens. Mechanical class swap, same pattern as Profile fix.
- 🔴 5.1 — View toggle → SegmentedControl. Larger refactor, drops icons.
- 🔴 4.1 — Search input → Input primitive with leadingIcon/trailingIcon.

**Medium effort:**
- (none — most fixes are class swaps or primitive substitutions)

**Possible Design extensions to add to queue:**
- ⚪ SegmentedControl with optional per-option icons (5.1)
- ⚪ Input with `clearable` prop for search-input X-button pattern (4.2)
- ⚪ `<Badge>` count variant or notification dot (X.3)
- ⚪ ConfirmDialog vs Modal — clarify or consolidate (7.3)
- ⚪ `cookbook-bg` — codify or delete (P1)

**Defer:**
- 🟢 3.2 — Banner Cancel button (legitimate hand-roll case for compact context)
- 🟢 6.2 — Empty state decorative blur (resolves with EmptyState primitive)
- 🟢 7.1, 7.2 — Modal platform + width (Profile-level decisions still pending)

**Bugs (non-design):**
- (none surfaced — Recipes is functionally healthier than Profile was)

---

## Triage decisions to make

For each finding, decide: **Fix now / Defer / Document deviation / Route to Design.**

Recommended triage order (much shorter than Profile because the surface is smaller):
1. Bundle the trivial Button `icon` prop refactors (2.1, 2.2, 6.3) into the same fix branch.
2. Pending slot banner amber → tokens (3.1) is the second instance of the same pattern from Profile. Decide if you want to fix Recipes alone, or fix amber across the codebase in one branch. Worth running `grep -rn "bg-amber-\|border-amber-\|text-amber-" src/` first to see how widespread.
3. View toggle → SegmentedControl (5.1) is the most consequential refactor. Decide on the icons question now (drop them vs. defer until Design extends the primitive).
4. Search input → Input primitive (4.1) is structurally the right move; small risk of behavior change worth a visual verification.
5. Defer Design extensions; track in queue.
