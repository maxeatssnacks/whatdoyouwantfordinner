# Profile (Desktop) — Design System Cohesion Audit

**Audited file:** `src/pages/Profile.jsx`
**Audited against:** `design-system/COMPONENTS.md` v1.2.0, `design-system/tokens.css`, `design-system/FLOWS.md` Flow 6
**Date:** 2026-05-08
**Scope:** Cohesion with the design system's visual language and primitive set on desktop. Out of scope: structural deviations from FLOWS.md (the spec is significantly behind production for this flow; deviations are tracked separately).

---

## Summary

The Profile page is heavily mobile-coded for desktop rendering. The dominant failure mode is **explicit opt-out of desktop primitive variants** (`platform="mobile"` hardcoded on Buttons across the page) plus **direct Tailwind palette usage** that bypasses design tokens (`bg-amber-*` family in Meal Slots). There's also a layout question about whether `max-w-4xl mx-auto` is the right desktop container width or if Profile should use more of the viewport.

Severity tags:
- **🔴 high** — visible cohesion failure that contradicts the design system
- **🟡 medium** — bypasses primitives or tokens but renders acceptably
- **🟢 low** — polish, consistency, or minor token alignment
- **⚪ note** — observation that may need a Design system extension or PM-style decision

Total findings: 17. Bug findings (non-design): 2.

---

## Page-level findings

### 🔴 P1 · Page wrapper uses `bg-background`, token is `--color-bg`

Line: `<div className="min-h-screen bg-background pb-24 md:pb-0">`

Tailwind class is `bg-background`. The token is `--color-bg` (`#FAF6F1`). If Tailwind config maps `background` → `--color-bg`, this is fine. If `background` is not in the config (Tailwind's default `background` is white), the wrapper renders white instead of the warm cream. Verify with `grep -n "background\|bg" tailwind.config.js`.

(Note: every other Card / surface in this file uses `bg-surface`, `bg-background`, `bg-error/10`, etc. — they all rely on Tailwind config mapping correctly. If `background` isn't mapped, this isn't a Profile bug, it's a config bug, and many pages are affected.)

### 🟡 P2 · Content wrapped in `max-w-4xl mx-auto` (896px)

Line: `<div className="max-w-4xl mx-auto space-y-6">` inside the desktop content container.

Profile content is capped at 896px and centered. On a 1440px viewport, this leaves ~272px gutters on each side. This is a real desktop layout decision — is this *intentional* (the cookbook-aesthetic centered-column treatment, like Recipe Detail uses) or a *mobile-first leftover* (the page was built mobile-first and the desktop case wasn't given full layout attention)?

The design system has no spec for desktop Profile. Recipe Detail uses a similar centered-column pattern and it works there. But Profile has cards with grids inside them (Household members at `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`) — a wider container would let those grids breathe more. **This is a triage decision, not a bug.**

⚪ Possible Design system extension: a desktop-page layout token / pattern (centered-content vs. wide-content) that pages can declare which they are.

### 🟡 P3 · `max-w-7xl` outer + `max-w-4xl` inner = nested width caps

Lines: `<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 md:py-8">` then `<div className="max-w-4xl mx-auto space-y-6">`.

The outer container caps at 1280px and adds horizontal padding; the inner caps at 896px. The outer cap does nothing on screens narrower than 1280px because the inner cap is tighter. On screens wider than 1280px, the outer adds gutters before the inner centers — which is fine, but the outer is doing no work at standard desktop sizes. Either redundant or there's an intent (header alignment?) that I'm not seeing.

---

## Section 1 · Account Information Card

### 🔴 1.1 · Save button hardcodes `platform="mobile"`

Line: `<Button onClick={handleUpdateProfile} disabled={...} variant="primary" size="md" platform="mobile">`

Button spec defaults to `platform="desktop"`. Mobile renders 48px tall (`h-12`), desktop renders 44px tall (`h-11`). On a desktop page, this Save button is the mobile size. **Remove the prop entirely** to use the desktop default.

This pattern repeats throughout the file (findings 2.1, 3.1, 3.2, 4.1, 4.2). Single root cause: every `platform="mobile"` should be removed.

### 🟢 1.2 · Display Name label is hand-rolled instead of using Input's `label` prop

Lines:
```
<label className="block text-sm font-semibold text-text-primary mb-2 font-body">Display Name</label>
<div className="flex gap-2">
  <Input value={displayName} onChange={...} placeholder="Your name" className="flex-1" />
```

The Input component supports a `label` prop that renders a properly-spec'd label (`text-[13px] font-bold text-text-primary mb-1.5 tracking-[0.1px]`). The hand-rolled label uses different sizing (`text-sm` = 14px, `mb-2` = 8px, `font-semibold` not `font-bold`).

Why hand-rolled? Because the section needs a button next to the input (`<div className="flex gap-2">`), which Input's built-in label doesn't accommodate. Reasonable workaround, but the label styling has drifted from spec.

⚪ Possible Design system extension: an Input variant that supports a `trailing` action button slot, OR a documented pattern for "labeled input + adjacent button" that uses Input's label.

### 🟡 1.3 · Email "input" is hand-rolled disabled-input markup

Lines:
```
<div className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-border bg-background">
  <Mail size={20} className="text-text-secondary" />
  <span className="font-body text-text-primary">{user?.email}</span>
</div>
```

This renders email as a fake input with an icon. The Input component supports `leadingIcon`, `disabled`, and could render this exact pattern with `<Input value={user?.email} leadingIcon={<Mail />} disabled readOnly />`.

Hand-rolled version uses `border-2` (spec is `border-[1.5px]`), `rounded-xl` (spec is `rounded-sm`), `px-4 py-3` (spec is `h-11` desktop / `pl-3.5`). All three differ from Input spec. Visually, this fake-input looks chunkier and rounder than every other input on the page.

### 🟢 1.4 · Display Name label uses `text-sm font-semibold`, not Input spec's `text-[13px] font-bold`

Already counted in 1.2 — same root cause.

### ⚪ 1.5 · Inline success message duplicates the global toast

Lines:
```
{updateMessage && (<p className="mt-2 text-sm text-success font-body">{updateMessage}</p>)}
```
This renders inline below the Save button on success. But there's *also* a global toast at line ~278 (`{updateMessage && (<div className="fixed top-20 right-4 z-50 ...">`) that also fires on `updateMessage` truthy. **Both render simultaneously.** Logic bug, not a design finding — but worth fixing.

---

## Section 2 · My Household Card

### 🔴 2.1 · "Houschold" typo (×3 visible)

Lines (in this file alone): "My Household" header on line ~333. Visual screenshots show "My Houschold" — confirm by searching:
```
grep -n "Houschold" src/
```

Source-code check needed: it's possible the typo lives in a different file (a constant, the Profile flow spec heading, etc.). If the typo is in `Profile.jsx` directly: trivial fix. If it's a constant, fix at source.

### 🔴 2.2 · Add Member IconBtn looks correct on screenshot — verify desktop variant

Line: `<IconBtn label="Add member" onClick={handleAddMember}><Plus size={20} strokeWidth={2} /></IconBtn>`

I don't have IconBtn's spec in front of me, but its naming convention should mirror Button — likely a `platform` prop. Check by viewing `src/components/ui/IconBtn.jsx`. If it has a `platform` prop that defaults to desktop and Profile isn't overriding it, fine. If it doesn't have one, may need to add it to the system or accept it as desktop-as-default.

### 🟡 2.3 · "Recipe Variety Filter" wrapper card uses `bg-background rounded-xl p-4`

Lines:
```
<div className="mb-6 p-4 bg-background rounded-xl">
  <label>...</label>
  <p>...</p>
  <Select ... />
</div>
```

This is an inset Card-within-a-Card pattern done with plain divs. The visual pattern (warm bg, rounded corners, padded interior) is essentially a nested compact Card. Two options:

(a) Use `<Card compact={false}>` for the inner — but Card defaults to `bg-surface` (`#FFF8F0`), not `bg-background` (`#FAF6F1`), so visual would change.
(b) Keep as-is and accept this is an "inset region" pattern that's not formally a Card.

⚪ Possible Design system extension: an "inset" or "well" pattern for in-card grouping.

### 🟢 2.4 · Filter label uses `text-sm font-semibold`, helper text uses `text-xs`

Same drift as 1.2. Spec calls for label as `text-[13px] font-bold text-text-primary tracking-[0.1px]`.

### 🟡 2.5 · Empty-state empty-card uses `border-2 border-dashed border-border rounded-xl`

Lines:
```
<div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
```

Empty-state column is one of the cross-flow patterns (FLOWS.md line 499: `inline — icon + display title + body subhead + primary CTA`). The pattern is described as inline, not as a primitive — meaning it's expected to be hand-rolled. Markup looks roughly right (Users icon + body text + CTA). But this is exactly the kind of recurring pattern that should be a primitive `<EmptyState />` rather than re-implementing in every page that needs one.

⚪ Possible Design system extension: `<EmptyState icon title body action />` primitive.

### 🟢 2.6 · "Add Your First Member" Button has icon as leading content via `<Plus className="mr-2" />` rather than `icon` prop

Lines:
```
<Button onClick={handleAddMember} variant="primary">
  <Plus size={20} className="mr-2" />
  Add Your First Member
</Button>
```

Button spec has an `icon` prop that handles leading icon properly (sized to match font, with proper gap). Using children-rendering with manual `mr-2` works but bypasses the prop. Refactor: `<Button onClick={...} variant="primary" icon={<Plus size={20} />}>Add Your First Member</Button>`.

This pattern likely repeats elsewhere — worth grepping for `<Button` blocks with leading SVG children.

---

## Section 3 · Meal Slots Card

### 🔴 3.1 · Save button hardcodes `platform="mobile"` (again)

Same as 1.1, different button. Single fix.

### 🔴 3.2 · Collapsed preview uses `bg-amber-*`, `border-amber-*`, `text-amber-*` Tailwind palette classes

Lines:
```
<div className="hidden md:flex items-start gap-4 rounded-2xl px-5 py-4 border-2 bg-gradient-to-br from-amber-50/50 to-orange-50/30 border-amber-200/30">
  <div className="w-24 flex-shrink-0 pt-1">
    <h3 className="text-base font-display font-bold text-amber-900">Preview</h3>
    <p className="text-xs text-amber-700 font-body mt-0.5">Example day</p>
  </div>
  <div className="flex-1 grid gap-3" style={{...}}>
    {localSlots.map(slot => (
      <div className="... border-amber-300/60 bg-amber-50/40 ... text-amber-800/70">
        <Plus className="text-amber-600/50" />
        <span className="text-amber-800/70">...</span>
      </div>
    ))}
  </div>
</div>
```

**This is the most significant cohesion finding in the file.** Eight separate `amber-*` color references and one `orange-50` reference, all bypassing the design system tokens. Token candidates that *should* be used:

- `--color-accent-soft` (`#FAEBC9`) — closest to amber-100/200
- `--color-warning-soft` (`#F7DEC4`) — closest to amber-100
- `--color-warning` (`#D97A1F`) — closest to amber-700/800
- `--color-text-primary` (`#2C1A0E`) — instead of amber-900
- `--color-text-secondary` (`#7A5C44`) — instead of amber-700

The intent is clearly "warm warning/preview/amber treatment" — but it's painted with raw Tailwind palette instead of the warm cookbook palette tokens. On mobile this preview presumably uses different markup (collapsed preview is `hidden md:flex` so it's desktop-only); on desktop it looks visually distinct from every other surface in the app because amber-100 (`#FEF3C7`) is *not* the same as `--color-accent-soft` (`#FAEBC9`) or `--color-warning-soft` (`#F7DEC4`).

Heaviest single-finding to fix. **Recommend rewriting the entire preview block to use design tokens.**

### 🟡 3.3 · Drag-and-drop slot rows use `bg-background rounded-xl border-2 border-border`

Lines:
```
<div className="flex items-center gap-3 px-3 py-3 bg-background rounded-xl border-2 transition-all select-none ${
  dragOverIndex === index && dragIndex !== index ? 'border-amber-400 bg-amber-50/50' : 'border-border'
}">
```

`border-2` (Card spec is `border-[1.5px]`), `rounded-xl` (matches `--radius-xl`, fine), and the drag-over highlight uses `border-amber-400 bg-amber-50/50` — same drift as 3.2.

⚪ Drag-active visual state: there's no design system spec for "drag-over" or "drop-target" visual treatment. Likely needs a Design system extension to define.

### 🟢 3.4 · "Add Slot" button is a hand-rolled button, not the Button primitive

Lines:
```
<button type="button" onClick={handleAddSlot} disabled={...}
  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 border-dashed border-border text-sm font-semibold font-body text-text-secondary hover:border-primary hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
  <Plus size={15} strokeWidth={2} />
  Add Slot
</button>
```

This is a "ghost dashed" button — not in Button's variant set (primary / secondary / ghost / destructive). Closest is `ghost` but ghost has solid border, not dashed. The dashed-border-as-add-affordance is a recurring pattern (also visible on Empty-state CTA wrappers). Either:

(a) Add a `dashed` modifier or `add` variant to Button.
(b) Document this as a hand-rolled "add row" pattern.
(c) Use Button variant=ghost and accept the visual change.

⚪ Possible Design system extension: a Button `dashed` modifier or a separate `<AddRowButton />` primitive.

### 🟢 3.5 · Trash button is hand-rolled

Lines:
```
<button onClick={() => handleDeleteSlotClick(slot)} disabled={...}
  className="p-1 text-text-secondary/50 hover:text-error transition-colors disabled:opacity-25 flex-shrink-0">
  <Trash2 size={16} />
</button>
```

This is essentially an IconBtn with destructive intent. Should use IconBtn primitive — assuming IconBtn supports a destructive or ghost-icon variant. View `src/components/ui/IconBtn.jsx` to confirm.

### 🟢 3.6 · "Edit" pencil button (collapsed → expanded) is hand-rolled

Lines:
```
<button onClick={() => setIsCollapsed(false)}
  className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-body font-medium transition-colors">
  <Pencil size={14} />
  Edit
</button>
```

Text-link with leading icon. Doesn't fit any current Button variant cleanly. Probably should be a small Button `variant="ghost" size="sm"` with `icon={<Pencil size={14} />}`.

### 🟢 3.7 · Inline rename input is unstyled `<input>`, not the Input primitive

Lines:
```
<input autoFocus value={editingSlotName} onChange={...} onBlur={...} onKeyDown={...}
  className="flex-1 bg-transparent border-0 border-b-2 border-amber-400 focus:outline-none font-body text-base text-text-primary" />
```

Inline-rename pattern (transparent bg, bottom border only) isn't in Input's spec. This is intentional — it's a different visual archetype than Input. But: `border-amber-400` is the same Tailwind drift as 3.2. Token candidate: `--color-primary` for the active rename state.

⚪ Possible Design system extension: an InlineRename primitive or Input variant=inline.

---

## Section 4 · Member Form Modal

### 🔴 4.1 · Submit and Cancel buttons hardcode `platform="mobile"` (again)

Same as 1.1, 3.1. Single fix.

### 🟡 4.2 · Modal width=896 is a per-page override

Line: `width={896}`

Modal spec default is 480; widths 448, 640, 896 are not codified. 896 here is a deliberate choice for a member form (lots of fields). Acceptable, but: are there *standard* desktop modal widths in the system, or is every page picking? Check Recipe Detail's add-to-plan modal width, etc. If three+ pages use 896 for "form modals," it should be named.

⚪ Possible Design system extension: named modal widths (`sm: 448`, `md: 640`, `lg: 896`) with a `size` prop instead of raw `width`.

### 🟢 4.3 · Modal doesn't pass `platform`

Line: `<Modal open={...} onClose={...} title={...} width={896} actions={...}>`

Modal defaults to `platform="desktop"`. The spec note says: *"usually pass via `useMediaQuery('(min-width: 768px)')`"*. Profile renders both mobile and desktop content (mobile has a TopAppBar, desktop has its own header), so this Modal needs to switch between bottom-sheet and centered-dialog based on viewport.

Currently it always renders as desktop centered-dialog because of the default. **This is a real bug on mobile** — the Modal won't bottom-sheet, it will be centered. Likely an existing bug, not introduced by this audit.

---

## Section 5 · Slot Delete Confirmation Modal

### 🟡 5.1 · Same Modal `platform` issue as 4.3.

### 🟢 5.2 · Buttons inside use proper variants but no platform prop

Lines:
```
<Button onClick={() => confirmSlotDelete(null)} variant="destructive" disabled={...} className="flex-1">...</Button>
<Button onClick={...} variant="ghost" disabled={...} className="flex-1">Cancel</Button>
```

These don't have `platform="mobile"` — so they default to desktop. **These are correct.** This is the right pattern; the rest of the file should match.

### 🟢 5.3 · `width={448}` — see 4.2

---

## Section 6 · Household Member Delete Confirmation Modal

Same findings as Section 5. Same fix.

---

## Section 7 · Sign Out Button

### 🟢 7.1 · Custom destructive treatment via `className="w-full text-error hover:bg-error/10"`

Lines:
```
<Button onClick={handleSignOut} variant="ghost" className="w-full text-error hover:bg-error/10">
  <LogOut size={20} className="mr-2" />
  Sign Out
</Button>
```

Sign Out is a "ghost destructive" — destructive intent without the heavy primary destructive treatment. Button spec has `variant="destructive"` (filled red) and `variant="ghost"` (outlined primary), but no documented "ghost destructive." This is being hand-rolled by combining ghost with custom error colors.

Compare to FLOWS.md Flow 6 which spec'd `Sign out (ghost)` and `Delete account (ghost destructive — text only, no surface)` — confirming a "ghost destructive" treatment was anticipated by the spec but never made it into the Button component.

⚪ Possible Design system extension: Button `variant="ghost-destructive"` or a documented composition pattern.

### 🟢 7.2 · Icon as child via `mr-2`, not via `icon` prop

Same as 2.6. Same fix.

---

## Cross-cutting findings (not section-specific)

### 🟡 X.1 · Toast is hand-rolled at page level

Lines:
```
{updateMessage && (
  <div className={`fixed top-20 right-4 z-50 px-6 py-3 rounded-xl shadow-elevated font-body font-semibold ${
    updateMessage.includes('Error') || updateMessage.includes('⚠️')
      ? 'bg-error text-white'
      : 'bg-success text-white'
  }`}>
    {updateMessage}
  </div>
)}
```

Inline toast with hard-coded positioning, classes, and color logic. No Toast primitive in the design system. This pattern probably repeats on every page that has feedback messages. Recipes, Dashboard, Shopping likely have similar.

⚪ Possible Design system extension: `<Toast />` primitive, possibly a `useToast()` hook.

### 🟢 X.2 · Mixed rounded-corner radii

Profile uses `rounded-xl` (12px), `rounded-2xl` (24px), `rounded-pill`. Tokens are `--radius-xl: 16px` and `--radius-2xl: 24px`. Tailwind's default `rounded-xl` is `0.75rem = 12px` — different from your token's 16px. Without seeing tailwind.config.js I can't tell if `rounded-xl` is mapped to your token or to Tailwind's default.

Confirm with: `grep -A5 "borderRadius\|radius" tailwind.config.js`

This is likely a global config issue affecting every page, not a Profile-specific finding. **If the audit is right that radii aren't Token-mapped, that's the highest-leverage finding in the entire overhaul** — fix once, every page corrects.

### 🟢 X.3 · `tracking-[0.1px]` not consistently applied to bold body text

Spec calls for `-tracking-[0.1px]` on display text and `tracking-[0.1px]` on bold labels. Profile uses neither consistently. Low-priority polish.

### ⚪ X.4 · No skeleton/loading states for the page itself

`membersLoading` shows "Loading household members..." text. `slotsLoading` shows "Loading meal slots…" text. Both are plain `<p>` tags. Design system has Skeleton in the primitive list and LOADING.md has per-screen skeleton recipes. Worth checking LOADING.md's Profile-loading recipe (if one exists) and aligning.

---

## Findings sorted by leverage

**Highest leverage (single fix → many places):**
- 🔴 P1 (`bg-background` mapping) — config-level, affects entire app
- 🟢 X.2 (radii mapping) — config-level, affects entire app
- 🔴 1.1 / 3.1 / 4.1 (`platform="mobile"` removal) — five spots in Profile, likely repeats in other pages

**Heaviest single fix:**
- 🔴 3.2 (Meal Slots `bg-amber-*` rewrite) — substantial markup, all in one place

**Quick wins:**
- 🔴 2.1 (typo)
- 🟢 1.5 / X.1 (toast deduplication + extraction)
- 🟢 2.6 / 7.2 (Button `icon` prop refactor)

**Possible Design system extensions to route to Claude Design:**
- ⚪ EmptyState primitive (2.5)
- ⚪ Inset/well in-card grouping (2.3)
- ⚪ Toast primitive (X.1)
- ⚪ Drag-active visual treatment (3.3)
- ⚪ AddRow / dashed Button variant (3.4)
- ⚪ InlineRename Input variant (3.7)
- ⚪ Named Modal widths (4.2)
- ⚪ Ghost-destructive Button variant (7.1)
- ⚪ Desktop layout token (centered-content vs. wide-content) (P2)

**Bugs (non-design):**
- Toast double-render (1.5 / X.1 same issue, two surfaces)
- Modal not switching by viewport (4.3)
- "Houschold" typo (2.1)
- "Recipe Variety Filter" probably belongs as part of Profile Card composition, not nested in Household Card (structural — out of scope for this audit)

---

## Triage decisions to make

For each finding, decide: **Fix now / Defer / Document deviation / Route to Claude Design.**

Recommended triage order:
1. Verify the config-level findings first (P1, X.2). If `tailwind.config.js` correctly maps `bg-background` and `rounded-xl`, those findings drop. If it doesn't, fixing the config is the first branch.
2. Triage the rest as a list, fastest wins first.
3. Group remaining `platform="mobile"` removals into a single branch.
4. Meal Slots amber rewrite as its own branch.
5. Bundle Modal `platform` fix with the "extract toast" fix into a "Profile bug fixes" branch.
6. Defer Design system extensions; track them separately.
