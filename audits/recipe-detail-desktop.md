# Recipe Detail (Desktop) — Design System Cohesion Audit

**Audited file:** `src/pages/RecipeDetailDesktop.jsx`
**Composes from:** `PageWrapper`, `Button`, `Badge`, `Modal`, `LoadingSpinner`, `RecipeForm`, `ConfirmDialog` — internals of `RecipeForm` are **out of scope** (already flagged for separate audit).
**Audited against:** `design-system/COMPONENTS.md` v1.2.0, `design-system/tokens.css`, `design-system/FLOWS.md` (no flow spec exists for Recipe Detail desktop).
**Date:** 2026-05-12
**Scope:** Cohesion of `RecipeDetailDesktop.jsx` page-level composition with the design system. Out of scope: `RecipeForm.jsx` (separate audit), `Badge` and `ConfirmDialog` internals (separate primitive audits if needed).

---

## Summary

Recipe Detail is the largest and most feature-rich page in the desktop overhaul to date. It has the deepest amber-* drift (12 instances across multiple distinct UI patterns) and introduces several findings we haven't seen before:

1. **Gradient buttons** (`bg-gradient-to-r from-amber-500 to-orange-500`) — used as the primary "Add to Meal Plan" CTA in two places. This is a new visual pattern that doesn't appear anywhere else in the codebase.
2. **Inline `style={{}}` prop on a Button** — the "Update Serving Size" button uses an inline style object with hardcoded padding and border-radius. First time we've seen JSX inline styles.
3. **A hand-rolled +/- servings stepper** with amber borders. New micro-pattern.
4. **A hand-rolled `<textarea>` for notes** with amber focus ring and a soft amber gradient card background. The textarea bypasses any Input/Textarea primitive entirely.
5. **A hand-rolled custom heart-favorite button** at 56×56px with hover-scale animation.
6. **A custom CSS class `cookbook-divider`** used twice — undocumented divider treatment.
7. **A custom bullet character `✦`** used inline for ingredient list bullets.

Plus the familiar patterns: 5 Button icon-prop drift instances (`<Icon className="mr-2" />`), admin-note banner uses amber palette, picker modal uses amber for selected state.

**Total findings: 18. Bug findings: 0.**

The amber drift is genuinely diverse here: some is the same warm-cookbook accent pattern we've been mapping to `accent-soft`, some looks like it might be intentional "highlight" state for selected pickers (amber-500 backgrounds), and the gradient buttons read as a deliberate visual treatment for "add to plan" — they're the most prominent CTAs on the page.

Severity tags:
- **🔴 high** — visible cohesion failure that contradicts the design system
- **🟡 medium** — bypasses primitives or tokens but renders acceptably
- **🟢 low** — polish, consistency, or minor token alignment
- **⚪ note** — observation that may need a Design system extension or PM-style decision

---

## Page-level findings

### 🟢 P1 · Max width `max-w-7xl` — matches Recipes pattern

Line: `<div className="max-w-7xl mx-auto">`

1280px — same as Recipes. Profile uses `max-w-4xl` nested in `max-w-7xl`; Dashboard uses `max-w-[1440px]`. Recipe Detail aligns with Recipes' grid-page width. Fine. Waits on the desktop layout token from Design.

### 🟡 P2 · `<PageWrapper>` is the only audited page using this primitive

Recipe Detail wraps in `<PageWrapper>`. Profile, Recipes, and Dashboard render directly inside the page. PageWrapper is a layout primitive we haven't audited; it likely handles top-nav offset, page-level padding, or both. Worth investigating during a future infrastructure audit pass — for now, accept as-is.

⚪ Future audit: `PageWrapper` cohesion check. Probably stable.

---

## Section 1 · Toast

### 🟡 1.1 · Hand-rolled toast — same as Profile and Recipes

Lines 459-463:
```
{toast && (
  <div className="fixed top-20 right-4 z-50 max-w-sm px-6 py-4 rounded-xl shadow-elevated font-body font-semibold bg-success text-white leading-relaxed">
    {toast}
  </div>
)}
```

Third instance. Same as Profile X.1 and Recipes 1.1. Tokens correct; pattern hand-rolled. Already in Design queue: `<Toast />` primitive.

---

## Section 2 · Admin Note banner

### 🔴 2.1 · Admin note banner uses `bg-amber-*` and `bg-green-*` palettes for status states

Lines 467-499. The banner switches between green (approved) and amber (needs changes) based on `recipe.status`. The amber side mirrors the same drift we've fixed elsewhere:

Amber side (`recipe.status !== 'published'`):
- `bg-amber-50`
- `border-amber-300`
- `text-amber-900` (heading)
- `text-amber-800` (body)
- `text-amber-700` + `hover:text-amber-900` (Dismiss link)

Green side (`recipe.status === 'published'`):
- `bg-green-50`
- `border-green-300`
- `text-green-900` (heading)
- `text-green-800` (body)
- `text-green-700` + `hover:text-green-900` (Dismiss link)

**The amber side maps cleanly to our established pattern:**
- `bg-amber-50` → `bg-accent-soft/40`
- `border-amber-300` → `border-accent/60`
- `text-amber-900` → `text-text-primary`
- `text-amber-800` → `text-text-secondary`
- `text-amber-700` + `hover:text-amber-900` → `text-text-secondary hover:text-text-primary`

**The green side is harder.** There's no canonical "success" surface treatment in your design tokens that's not `bg-success` (full-saturation green for toasts) or `text-success`. The semantic intent here is "approved/positive" which is a real semantic. Options:

- (a) Map green to your existing `success` token: `bg-success/10`, `border-success/30`, `text-success` etc. This is the semantically-correct mapping — green-50 → low-opacity success surface, green-300 → mid-opacity success border, green-900 → text-success.
- (b) Introduce `success-soft` as a token (parallel to `accent-soft`, `warning-soft`). Route to Design.
- (c) Keep green-* hex for now and document.

Lean (a) for this audit cycle — `success` token already exists, just use it at varying opacities. Document the pattern as the canonical "approved/positive banner" treatment.

This is a **two-color banner** which makes the fix prompt more involved than prior amber banners. Tight focus needed.

### 🟢 2.2 · Dismiss link is hand-rolled `<button>` with `underline` class

Lines 489-499:
```
<button
  onClick={() => dismissAdminNote.mutate(id)}
  className={`flex-shrink-0 text-xs font-body font-semibold underline ${
    recipe.status === 'published'
      ? 'text-green-700 hover:text-green-900'
      : 'text-amber-700 hover:text-amber-900'
  }`}
>
  Dismiss
</button>
```

Same "underlined text-link inside banner" pattern as Dashboard's Set Up Household link. Same Design queue item (Button `variant="link"`). Same finding — this hand-roll resolves when Design adds the variant. For now, color swap to tokens as part of 2.1.

---

## Section 3 · Header (title, description, favorite button, tags, meta)

### 🟢 3.1 · Hand-rolled 56×56 favorite/heart button

Lines 516-524:
```
<button
  onClick={handleToggleFavorite}
  className="w-14 h-14 rounded-full bg-surface border-2 border-border flex items-center justify-center hover:bg-background hover:scale-105 transition-all shadow-md"
>
  <Heart
    size={28}
    className={isFavorited ? 'fill-primary text-primary' : 'text-text-secondary'}
  />
</button>
```

This is a 56×56 circular icon button (`w-14 h-14`). IconBtn primitive is 40×40 (size="lg") at most. Use cases:
- (a) Extend IconBtn with a `size="xl"` variant for prominent floating-style icon buttons. Design queue.
- (b) Accept this hand-roll as the canonical "favorite hero button" treatment.

The button uses tokens correctly (`bg-surface`, `border-border`, `bg-background` hover, `shadow-md`). `hover:scale-105` is a Tailwind transform — not a token but standard. `shadow-md` is Tailwind default, not your `shadow-resting` token (1px 3px rgba(44,26,14,.08)). Minor.

⚪ Possible Design queue: IconBtn `size="xl"` (56×56) for marquee actions like favorite hero buttons.

### 🟡 3.2 · `text-5xl` heading on recipe title — exceeds spec H1 again

Line 508-510: `<h1 className="text-5xl font-display font-bold text-text-primary leading-tight mb-2">`.

`text-5xl` = 48px. COMPONENTS.md H1 spec is 28px. Dashboard's greeting was `text-4xl` (36px) — already flagged as deviation. Recipe Detail goes even larger (48px).

This is consistent with the "marquee surface" intent — page-level hero headings get larger sizes than the spec H1. **Pattern is forming:** desktop hero headings use larger sizes per content density:
- Dashboard greeting: 36px
- Recipe Detail title: 48px

Either:
- (a) Document a `display-hero` (36px) and `display-hero-xl` (48px) — formalize per-page-type hero sizes.
- (b) Accept that page-level hero headings have per-page latitude.

⚪ Already in Design queue: `display-hero` heading size. This adds an `xl` variant.

### 🟢 3.3 · Description renders sanitized HTML with utility-class injection

Lines 511-516:
```
<div
  className="text-xl text-text-secondary font-body leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ol]:list-decimal [&_ol]:ml-5 [&_ul]:list-disc [&_ul]:ml-5 [&_li]:mb-1 [&_strong]:font-bold [&_em]:italic"
  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderContent(recipe.description)) }}
/>
```

The `[&_p]:mb-2 ...` pattern is Tailwind's arbitrary selector syntax for styling children injected via dangerouslySetInnerHTML. Verbose but functional. Recurs at line 678-682 for instructions (very similar pattern). This is the right approach given DOMPurify-sanitized HTML; only finding is that the same long className string appears twice and could be DRYed via a utility class or shared constant.

⚪ Possible refactor (out of audit scope): extract the prose styling into a CSS class like `.recipe-prose` in tokens.css.

### 🟢 3.4 · Tags use `<Badge tone="secondary">`

Lines 530-534:
```
{recipe.cuisine_type && <Badge tone="secondary">{recipe.cuisine_type}</Badge>}
{recipe.dietary_tags?.map((tag) => (
  <Badge key={tag} tone="secondary">{tag}</Badge>
))}
```

Correct use of Badge primitive. ✓ No finding.

### 🔴 3.5 · Hand-rolled +/- servings stepper with amber borders

Lines 552-577. The stepper has two buttons (decrease/increase) each shaped:
```
<button
  onClick={() => handleServingsChange(effectiveServings - 1)}
  disabled={effectiveServings <= 1 || isPastMeal}
  className="w-6 h-6 rounded-full border-2 border-amber-300 bg-white flex items-center justify-center hover:bg-amber-50 hover:border-amber-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
  aria-label="Decrease servings"
>
  <Minus size={11} />
</button>
```

Six amber references between the two buttons. Plus they're 24×24 (`w-6 h-6`) — below the smallest IconBtn size and not within Button size tokens. This is a true micro-button pattern for inline numeric steppers.

Token mapping:
- `border-amber-300` → `border-accent/60`
- `hover:bg-amber-50` → `hover:bg-accent-soft/40`
- `hover:border-amber-500` → `hover:border-accent`
- `bg-white` → `bg-surface`

Drift fixable with mechanical color swap. The hand-roll itself (24×24 stepper button) is a legitimate one-off — no primitive supports this size. Worth flagging for Design.

⚪ Possible Design queue: `<Stepper />` primitive or numeric input with +/- controls. Recurs in servings, quantity selectors, etc.

### 🔴 3.6 · "Update Serving Size" button uses inline `style={{}}` prop

Lines 581-591:
```
<button
  onClick={handleSaveServings}
  disabled={updateEntryServings.isPending}
  style={{
    padding: '4px 12px',
    borderRadius: '6px',
    transition: 'opacity 150ms ease',
  }}
  className="bg-primary hover:bg-primary-hover text-white font-body font-semibold text-base disabled:opacity-50 whitespace-nowrap flex-shrink-0"
>
  {updateEntryServings.isPending ? 'Saving…' : 'Update Serving Size'}
</button>
```

The inline `style` prop is a code smell — it bypasses Tailwind and the design system entirely. Hardcoded `padding: '4px 12px'`, `borderRadius: '6px'`, `transition: 'opacity 150ms ease'`. Should be a Button primitive:

```
<Button
  onClick={handleSaveServings}
  disabled={updateEntryServings.isPending}
  size="sm"
  variant="primary"
  className="whitespace-nowrap"
>
  {updateEntryServings.isPending ? 'Saving…' : 'Update Serving Size'}
</Button>
```

That replaces the hand-rolled `<button>` with a real `Button size="sm"` primitive. Drops the inline style entirely; Button's spec handles padding, radius, and transitions.

Note: at 32px height (sm), this button is shorter than the surrounding 24px stepper buttons but visually proportional to inline-meta context. Worth verifying.

### 🟢 3.7 · `text-text-secondary/40` opacity drift

Lines 595, 600: `<span className="text-text-secondary/40 select-none">·</span>`

The middle-dot separator uses `text-text-secondary/40` (40% opacity). Acceptable but worth noting this is a third place using `·` separator (Dashboard subhead, Recipes meta, here). Pattern is forming.

### 🟢 3.8 · "Source" link styled as `text-primary hover:underline`

Lines 615-623:
```

  href={recipe.source_url}
  target="_blank"
  rel="noopener noreferrer"
  className="flex items-center gap-1.5 text-primary hover:underline font-semibold"
>
  <ExternalLink size={16} />
  <span>Source</span>
</a>
```

Another "inline text link" pattern. Same Design queue item (Button `variant="link"`). No fix needed in this branch — same family as the Dismiss link above.

---

## Section 4 · `cookbook-divider`

### 🟡 4.1 · `<div className="cookbook-divider"></div>` is a custom CSS class

Lines 629 and 727: `<div className="cookbook-divider"></div>`

This is presumably defined in `src/index.css` (haven't seen the definition). Used twice on this page only. Same situation as `cookbook-bg` from the Recipes audit — a bespoke CSS class that may or may not be part of the design system.

Run: `grep -n "cookbook-divider" src/index.css` to see the definition.

Two paths:
- (a) Codify as a design-system pattern (along with `cookbook-bg`).
- (b) Replace with a real `<Divider />` primitive (already in Design queue).
- (c) Document and leave.

⚪ Already in Design queue: `<Divider />` primitive. When that ships, `cookbook-divider` either gets absorbed or stays as a flavor variant.

---

## Section 5 · Image

### 🟢 5.1 · Hero image card uses tokens correctly

Lines 632-639. `border-4 border-border shadow-resting` — both tokenized. ✓ No finding.

---

## Section 6 · Macros Card

### 🟢 6.1 · Macros card composition uses tokens

Lines 651-720. The macros card uses `bg-gradient-to-br from-surface to-background` (tokenized gradient), `border-2 border-border`, `shadow-resting`, `rounded-2xl`. Heading composition with `<div className="w-1 h-6 bg-primary rounded-full"></div>` accent bar is a bespoke decoration pattern but uses the primary token. The proportional macro bar uses tokens (`bg-secondary`, `bg-accent`, `bg-primary` for protein/carbs/fat). All semantic colors used correctly.

Stat row uses display-size text. All token-driven. ✓ No finding.

### 🟢 6.2 · `<div className="w-1 h-6 bg-primary rounded-full"></div>` accent bar is bespoke

Used three times on this page (line 659, 736, 678) as a section-heading accent. Visual is a small vertical primary-colored bar before the section heading. Bespoke decoration.

Either:
- (a) Document as a "section-heading accent" pattern; reuse on other pages.
- (b) Accept as Recipe Detail flair and document deviation.

⚪ Possible Design queue: `<SectionHeading />` or `<HeadingAccent />` primitive. Recurs in card headers.

---

## Section 7 · Ingredients + Instructions (two-column grid)

### 🟢 7.1 · Ingredients use bespoke `✦` bullet character

Lines 750, 768, 776: `<span className="text-primary font-bold mt-0.5 flex-shrink-0">✦</span>`

A four-pointed star Unicode character used as a custom bullet. Recurs in the ingredient list. Bespoke but charming, uses `text-primary`. No design system impact; pure flavor.

### 🟡 7.2 · `<span className="text-sm font-body font-normal text-amber-600 ml-1">` for "scaled × X" indicator

Line 738:
```
{scaleFactor !== 1 && (
  <span className="text-sm font-body font-normal text-amber-600 ml-1">
    (scaled × {Math.round(scaleFactor * 100) / 100})
  </span>
)}
```

Single amber instance. Semantic: "this list is scaled from the original recipe — note this." This is **closer to `warning` semantically** than `accent` — it's an attention/notice indicator, not decorative warmth.

Token mapping:
- `text-amber-600` → `text-warning` (semantic match — "scaled value, take note")

OR

- `text-amber-600` → `text-text-secondary` (informational, deemphasized)

Lean `text-text-secondary`. It's not really a warning, it's an informational secondary marker. The visual contrast is plenty even without warning-orange.

### 🟢 7.3 · Ingredient macro nutrient inline display

Lines 753-757:
```
<span className="ml-2 text-sm text-text-secondary">
  — {ingredient.calories} cal | <span className="text-secondary">{ingredient.protein}g P</span> | <span className="text-accent">{ingredient.carbs}g C</span> | <span className="text-primary">{ingredient.fat}g F</span>
</span>
```

Inline macro display per ingredient. Uses your `secondary` (protein), `accent` (carbs), `primary` (fat) tokens — matching the macros card's color logic. Consistent. ✓ No finding.

---

## Section 8 · My Notes card

### 🔴 8.1 · Notes card uses `bg-gradient-to-br from-amber-50/60 to-surface` + amber border

Lines 795-799:
```
<div className="bg-gradient-to-br from-amber-50/60 to-surface rounded-2xl p-8 border-2 border-amber-200/50 mb-8 shadow-resting">
```

Three amber references. Same warm-cookbook accent pattern. Token mapping:
- `from-amber-50/60` → `from-accent-soft/40`
- `border-amber-200/50` → `border-accent/40`

The gradient `to-surface` stays as-is (already tokenized).

### 🔴 8.2 · `<div className="w-1 h-6 bg-amber-400 rounded-full"></div>` accent bar uses amber

Line 803: heading accent bar in the Notes card uses `bg-amber-400` instead of the other accent bars on this page that use `bg-primary` (lines 659, 678).

The intent: visually differentiate Notes from other sections. The Notes card is the "personal/private" section vs. the macros/ingredients/instructions which are "recipe content."

Mapping:
- `bg-amber-400` → `bg-accent` (your warm cookbook accent token, which is golden-yellow `#E8A838`)

This maintains the visual differentiation (gold vs. burnt orange) while using tokens. ✓

### 🔴 8.3 · Hand-rolled `<textarea>` with amber focus ring

Lines 813-820:
```
<textarea
  value={noteText ?? ''}
  onChange={(e) => setNoteText(e.target.value)}
  onBlur={handleNoteBlur}
  placeholder="Add your personal notes — substitutions you tried, tweaks that worked, family ratings..."
  rows={4}
  className="w-full px-4 py-3 rounded-xl border-2 border-amber-200/60 bg-white/80 text-text-primary font-body text-base focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300 resize-none placeholder:text-text-secondary/50"
/>
```

Three amber instances on a hand-rolled textarea. The Input primitive only handles `<input>` elements (single line). A `<Textarea />` primitive doesn't exist in COMPONENTS.md.

This is a real gap in the design system. A Textarea is a different element from Input but should follow the same spec — same border, radius, focus ring, padding tokens.

Two options:
- (a) Fix amber colors with tokens, keep hand-rolled. Mapping:
  - `border-amber-200/60` → `border-accent/40` or `border-border` (depending on intent — "this is a notes-context input" vs "this is a generic input")
  - `bg-white/80` → `bg-surface/80`
  - `focus:ring-amber-300` → `focus:ring-primary` (match Input spec focus state)
  - `focus:border-amber-300` → `focus:border-primary`
- (b) Build `<Textarea />` primitive. Design queue.

Lean **(a) for this branch, (b) for queue**. Notes-context border can be `border-accent/40` to maintain the warm-amber visual but tokenized. Focus state should match Input's `focus:ring-primary` for consistency.

⚪ Possible Design queue: `<Textarea />` primitive matching Input spec but multiline.

### 🟢 8.4 · "Saved" indicator uses `text-success`

Line 826: `{noteSaved && !noteSaving && <span className="text-success">Saved</span>}` — `text-success` used correctly. ✓ No finding.

---

## Section 9 · Action buttons (Edit / Add to Plan / Delete)

### 🔴 9.1 · Five Button instances use legacy `<Icon className="mr-2" />` child pattern

Lines 737, 749, 760, 770, 783 and 800, 808. Counting:

1. Edit Recipe (line 737): `<Edit size={20} className="mr-2" />`
2. Add for {slot} (line 760): `<Calendar size={20} className="mr-2" />` (and `<Check size={20} className="mr-2" />` for added state)
3. Add to Meal Plan (line 770): `<Calendar size={20} className="mr-2" />`
4. Delete (line 783): `<Trash2 size={20} className="mr-2" />`
5. Get Started Free (signup CTA at line 808): `<UserPlus size={18} className="mr-2" />`

All need the `icon` prop refactor. Same pattern shipped 4x previously. Mechanical.

### 🔴 9.2 · "Add for slot" button uses gradient: `bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600`

Line 758-761:
```
<Button
  onClick={handleAddForSlot}
  disabled={adding || added}
  className="flex-1 min-w-[200px] bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
>
```

**This is a new and meaningful pattern.** The "Add to Meal Plan" button is the most prominent CTA on the page, and it uses a gradient (amber → orange) for visual prominence. It also appears on the picker modal (line 868-870).

Three interpretations:
- (a) **Drift.** Pre-design-system code reached for a hand-rolled gradient instead of using the primary button color. Should be replaced with `variant="primary"` (which gives `bg-primary` — burnt orange single-tone).
- (b) **Intentional emphasis.** The "Add to Meal Plan" CTA is deliberately styled more prominently than `variant="primary"` because it's the page's most important action. Should be formalized as a Button variant — e.g., `variant="prominent"` or `variant="cta"`.
- (c) **Brand expression.** The amber→orange gradient is a brand color treatment. Could become a token (e.g., `--gradient-prominent`).

**Lean (a).** Reasoning:
- The gradient `from-amber-500 to-orange-500` doesn't use any design tokens. `amber-500` is `#F59E0B`, `orange-500` is `#F97316` — both Tailwind defaults, neither matches your `primary` (`#C8622A` burnt orange) or `accent` (`#E8A838` golden).
- Your `primary` IS a saturated warm color that reads as a strong CTA on its own. The gradient was likely a pre-design-system flourish that's now duplicating the primary's role.
- Replacing with `variant="primary"` simplifies the call-to-action language: one prominent button style across the whole product.

This is a real triage decision worth confirming with you in triage. If you want to preserve "more emphasis than primary," we'd need a new Button variant.

**Fix if going (a):** Replace `className="flex-1 min-w-[200px] bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"` with just `className="flex-1 min-w-[200px]"`. The Button uses its default `variant="primary"` automatically.

### 🔴 9.3 · Picker modal's "Add to Meal Plan" submit button uses the same gradient

Line 868-870:
```
<Button
  onClick={handlePickerAdd}
  disabled={!pickerDay || adding || added}
  className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
>
```

Same drift, same fix as 9.2. Bundle together.

---

## Section 10 · Signup CTA (logged-out)

### 🔴 10.1 · Signup CTA card uses `bg-gradient-to-br from-surface to-amber-50/40`

Lines 791-802:
```
{!user && (
  <div className="mb-8 p-6 bg-gradient-to-br from-surface to-amber-50/40 rounded-2xl border-2 border-border flex flex-col sm:flex-row items-center gap-4">
```

One amber gradient — `to-amber-50/40` → `to-accent-soft/40`. Single mapping. The card uses `border-border` (tokenized) and the rest of the composition is fine.

This is the only amber drift outside the recipe-content surface. It's decorative warmth — `accent-soft` is the right mapping. ✓ Easy fix.

---

## Section 11 · Picker Modal (day + meal type selectors)

### 🔴 11.1 · Day picker buttons use amber for selected state

Lines 843-849:
```
<button
  key={day.name}
  onClick={() => setPickerDay(day.name)}
  className={`py-2 px-1 rounded-xl text-xs font-body font-semibold transition-colors text-center ${
    pickerDay === day.name
      ? 'bg-amber-500 text-white'
      : 'bg-background text-text-secondary hover:bg-amber-50 hover:text-amber-800'
  }`}
>
```

Selected day: `bg-amber-500 text-white`. Hover unselected: `bg-amber-50 hover:text-amber-800`. Same amber-as-selected pattern recurs on the meal type picker below it.

This is a **selection state**, not decoration. The selected state should arguably be `bg-primary` (your strong selection color, burnt orange, used in SegmentedControl). Mapping:
- `bg-amber-500` → `bg-primary` (selected)
- `hover:bg-amber-50` → `hover:bg-accent-soft/40` (hover-unselected background)
- `hover:text-amber-800` → `hover:text-text-primary` (hover-unselected text)

Visual change: selected days go from yellow-orange to burnt orange. Matches SegmentedControl, matches the "Add Recipe" button, matches the rest of the primary-color usage in the app.

### 🔴 11.2 · Meal type picker buttons use the same amber selected-state pattern

Lines 862-872:
```
<button
  key={mt}
  onClick={() => setPickerMealType(mt)}
  className={`px-3 py-1.5 rounded-full text-sm font-body font-semibold transition-colors capitalize ${
    pickerMealType === mt
      ? 'bg-amber-500 text-white'
      : 'bg-background text-text-secondary hover:bg-amber-50 hover:text-amber-800'
  }`}
>
```

Same fix as 11.1. Bundle.

### 🟢 11.3 · Day picker is a 4-column grid, but week is 7 days

Line 840: `<div className="grid grid-cols-4 gap-2">` with 7 day buttons. The grid wraps to 4 + 3 layout. Tolerable but slightly awkward.

Options:
- (a) `grid-cols-7` for a single row.
- (b) Keep 4-column grid; accept the wrap.

Out of scope as design cohesion — this is a layout choice, not a token issue. Worth flagging as polish.

### 🟢 11.4 · Picker modal width=448

Line 837: `<Modal open={showPickerModal} ... width={448}>`

448 is `max-w-md` in Tailwind defaults — a "small modal" size. Same situation as Profile and Recipes — named Modal sizes are in the Design queue. Accept for now.

---

## Section 12 · Modals (Edit + Delete Confirm)

### 🟢 12.1 · Edit Modal uses width=896 — matches Profile/Recipes

Line 818: `<Modal open={isEditOpen} onClose={handleGuardedEditClose} title="Edit Recipe" width={896}>`. Same width as Profile and Recipes Edit modals. Consistent within the codebase. Still awaiting named Modal sizes.

### 🟢 12.2 · Delete Confirmation Modal uses width=448

Line 829: `<Modal open={showDeleteConfirm} ... title="Delete Recipe" width={448}>`. Small confirmation modal. Same waiting on named sizes.

### 🟢 12.3 · Delete confirmation uses raw Modal — not ConfirmDialog

Lines 829-841. Compare to the Edit Discard confirmation (line 822) which uses `<ConfirmDialog>`. **Inconsistency within this same file:** some confirmations use ConfirmDialog, others use raw Modal. Profile uses raw Modal; Recipes uses ConfirmDialog. **Now this file uses both.**

⚪ Already in Design queue: ConfirmDialog vs Modal clarification or consolidation. Confirmed: this is becoming a real design system question that needs answering.

---

## Cross-cutting findings

### 🟢 X.1 · `text-success` used correctly for "Saved" indicator

Line 826. Already noted. ✓

### 🟢 X.2 · Three `cookbook-divider` instances across the codebase suggest a real pattern

Recipes has `cookbook-bg`, Recipe Detail has `cookbook-divider` (×2). The "cookbook" prefix suggests a deliberate flavor namespace for paper/library texturing. Worth Design's attention.

⚪ Already in Design queue: `cookbook-bg` codify-or-delete. Extending: `cookbook-*` namespace as a flavor design language.

---

## Findings sorted by leverage

**Highest leverage (fast wins, mechanical):**
- 🔴 9.1 — Five Button icon-prop refactors. Trivial. Same pattern shipped 4x.
- 🔴 10.1 — Signup CTA gradient → tokens (single amber → accent-soft mapping). Trivial.
- 🔴 11.1 + 11.2 — Picker modal amber selected-state → primary tokens (clean visual semantics improvement).
- 🔴 8.1 + 8.2 — Notes card surfaces (amber gradient → accent-soft gradient, amber-400 accent bar → bg-accent).
- 🔴 3.5 — Servings stepper amber → tokens.
- 🔴 2.1 — Admin note banner two-color amber/green → tokens (more involved; green side needs the success token treatment).

**Medium effort:**
- 🔴 3.6 — Inline `style={{}}` button → `Button size="sm" variant="primary"`. Replaces hand-rolled button with primitive.
- 🔴 8.3 — Notes textarea amber → tokens. Replaces hand-rolled focus ring with `focus:ring-primary`. Keeps hand-rolled textarea (no Textarea primitive yet).
- 🔴 9.2 + 9.3 — Gradient "Add to Plan" buttons → `variant="primary"`. **Triage decision required:** is the gradient intentional emphasis, or drift? If drift, simple swap. If intentional, route to Design for a new variant.
- 🟡 7.2 — "Scaled × X" indicator amber-600 → text-text-secondary.

**Possible Design extensions to add to queue:**
- ⚪ IconBtn `size="xl"` (56×56) for marquee actions.
- ⚪ `<Stepper />` primitive or numeric input with +/- controls.
- ⚪ `<Textarea />` primitive matching Input spec but multiline.
- ⚪ `<SectionHeading />` or `<HeadingAccent />` primitive (small vertical accent bar).
- ⚪ `display-hero-xl` (48px) heading size for page-level recipe-detail-style heroes.
- ⚪ Button `variant="prominent"` or `variant="cta"` if the gradient pattern is intentional.

**Defer:**
- 🟢 P2 — PageWrapper internals (infrastructure audit).
- 🟢 3.1 — Favorite hero button hand-roll (resolves with IconBtn xl).
- 🟢 3.2 — text-5xl heading (resolves with display-hero-xl).
- 🟢 3.3 — Description prose styling (refactor to .recipe-prose class in tokens.css).
- 🟢 4.1 — cookbook-divider (resolves with Divider primitive or cookbook-* namespace).
- 🟢 6.2 — Section-heading accent bars (resolves with SectionHeading primitive).
- 🟢 7.1 — `✦` bullet character (flavor, no fix).
- 🟢 11.3 — Day picker 4-col grid (layout choice, out of cohesion scope).
- 🟢 12.3 — ConfirmDialog vs Modal inconsistency (Design queue decision, not a per-page fix).
- 🟢 X.2 — `cookbook-*` namespace (Design queue).

**Bugs (non-design):**
- (none surfaced)

---

## Triage decisions to make

For each finding, decide: **Fix now / Defer / Document deviation / Route to Design.**

This page is large enough that the bundle decisions matter more than on previous pages. Some considerations:

1. **The gradient buttons (9.2, 9.3) are the audit's biggest open question.** Triage call: drift or intentional emphasis? If drift, easy bundle into the main fix branch. If intentional, defer until Design adds a variant.

2. **The admin note banner (2.1) is a two-color fix.** Amber side maps cleanly; green side needs `success` token treatment. This is a slightly more involved fix prompt than the prior banners — worth its own focus block within the branch.

3. **The inline style button (3.6) and the textarea (8.3) are both "replace hand-rolled with proper styling" fixes.** Easy to bundle. But the textarea will continue to be a hand-rolled `<textarea>` (no Textarea primitive) — we're only fixing colors, not the underlying element.

4. **Recommended bundle for `fix/recipe-detail-desktop-cohesion`:**
   - 🔴 2.1 (admin note banner — both amber and green sides → tokens)
   - 🔴 3.5 (servings stepper amber → tokens)
   - 🔴 3.6 (inline style button → Button size="sm")
   - 🔴 7.2 ("scaled × X" indicator amber → text-secondary)
   - 🔴 8.1 + 8.2 + 8.3 (entire Notes card amber → tokens)
   - 🔴 9.1 (five Button icon-prop refactors)
   - 🔴 9.2 + 9.3 (gradient buttons — **assuming triage decides "drift, swap to variant=primary"**)
   - 🔴 10.1 (signup CTA gradient amber → accent-soft)
   - 🔴 11.1 + 11.2 (picker modal selected state amber → primary)
   - 🟢 2.2 (Dismiss link color swap, atomic with 2.1)

   That's 11 bundled fixes spanning ~12 amber-* removals and a major Button refactor. Largest branch yet.

5. **Defer everything else** — wait for Design extensions or accept as flavor.

6. **Out of scope**: RecipeForm internals (separate audit), PageWrapper (infrastructure audit), Badge/ConfirmDialog internals.
