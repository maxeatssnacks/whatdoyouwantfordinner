# Auth Flow — Design System Cohesion Audit

**Audited files:**
- `src/pages/Landing.jsx`
- `src/pages/Login.jsx`
- `src/pages/Signup.jsx`
- `src/pages/ForgotPassword.jsx`
- `src/pages/ResetPassword.jsx`

**Audited against:** `design-system/COMPONENTS.md` v1.2.0, `design-system/tokens.css`, `design-system/FLOWS.md` Flow 10 (Auth/Onboarding — if applicable).
**Date:** 2026-05-12
**Scope:** Cohesion of all five logged-out / auth surfaces with the design system. Bundled into one audit because they share visual language, form patterns, and brand presentation. Out of scope: `MacrosBadge` primitive internals (line 9 of Landing), `Card`/`Input`/`Button`/`PasswordToggle` internals (all are design system primitives audited elsewhere).

---

## Summary

The four form pages (Login, Signup, ForgotPassword, ResetPassword) are **almost identical in structure and very clean**. They share a centered card layout, the dual-color brand title, the same Input/Button/Card composition, and a hand-rolled error block. Drift is minimal: a recurring `platform="mobile"` prop on Inputs and Buttons that's applied unconditionally regardless of viewport, and an identical hand-rolled error block pattern that could be a primitive.

**Landing is where the meaningful drift lives.** Eight amber-* instances across the recipe card image gradient, skeleton card placeholders, and signup CTA card gradient. Plus inline `style={{}}` props for card shadows (same pattern we just removed from Recipe Detail), a dynamic Tailwind class string interpolation pattern that's a known anti-pattern, and decorative blur background blobs.

**Total findings: 17. Bug findings: 0.**

The "bug findings: 0" is notable — the auth flow code is functional and accessible. The drift is purely stylistic / structural.

The four form pages can probably be fixed in one mechanical pass (all share the same patterns). Landing requires its own focused fix prompt due to the diversity of issues.

Severity tags:
- **🔴 high** — visible cohesion failure that contradicts the design system
- **🟡 medium** — bypasses primitives or tokens but renders acceptably
- **🟢 low** — polish, consistency, or minor token alignment
- **⚪ note** — observation that may need a Design system extension or PM-style decision

---

## Cross-cutting findings (apply to all four form pages)

### 🔴 X.1 · `platform="mobile"` applied unconditionally on Inputs and Buttons

Every Input and every Button across Login, Signup, ForgotPassword, ResetPassword uses `platform="mobile"`. Counted:
- Login: 2 Inputs + 1 Button = 3 instances
- Signup: 4 Inputs + 1 Button = 5 instances
- ForgotPassword: 1 Input + 2 Buttons (form submit + "Back to Login") = 3 instances
- ResetPassword: 2 Inputs + 2 Buttons (form submit + "Request New Link") = 4 instances

**Total: 15 `platform="mobile"` instances across the auth flow.**

Same pattern we shipped fixes for on Profile (4 buttons, removed `platform="mobile"`). The prop forces mobile sizing (48px Input height instead of 44px, larger Button padding) regardless of viewport. On desktop, this makes the auth forms look chunky and out of proportion with the rest of the app.

Two fix options:
- (a) Remove `platform="mobile"` from all 15 instances. Inputs become 44px on desktop (default `md`), Buttons become 44px on desktop (default `md`). Mobile rendering loses 4px of vertical comfort.
- (b) Use `useIsMobile()` hook (already in use in `ShoppingListPage`) to dynamically pass `platform={isMobile ? "mobile" : undefined}`. Proper responsive behavior but adds a hook import to every page.

**Lean (a) for this branch.** Reasoning:
- (a) matches the precedent we set on Profile.
- (b) is the proper solution but adds complexity. Use that pattern when we have time to do it right across the codebase (deferred polish item).
- The 4px height delta on mobile is not visually breaking — it just loses a tiny comfort buffer that's also true on Profile post-fix.

⚪ Same deferred polish item from Profile: "proper responsive button sizing across the app" should be a `useIsMobile`-based pattern. The Shopping page demonstrates the pattern. Address as a dedicated pass after the desktop overhaul completes.

### 🔴 X.2 · Hand-rolled error block recurs 4× (identical)

Every form page has this exact same block when `error` is truthy:

```
{error && (
  <div className="mb-4 p-4 bg-error/10 border border-error rounded-xl">
    <p className="text-error text-sm font-body">{error}</p>
  </div>
)}
```

Four instances, byte-identical. Tokens correct (`bg-error/10`, `border-error`, `text-error`). But this is a hand-rolled error banner pattern that recurs — it should be a primitive.

⚪ Possible Design queue: `<ErrorBanner />` or `<Alert variant="error" />` primitive. This is the most consistently-needed primitive surfaced across the auth flow audit.

For this branch: keep hand-rolled. Color tokens are correct. When the primitive ships, swap.

### 🟢 X.3 · The dual-color brand title is canonical across all four form pages

Every form page has:

```
<h1 className="text-3xl font-display font-bold mb-2 leading-tight">
  <span className="text-text-primary">What Do You Want</span>
  <br />
  <span className="text-primary">For Dinner?</span>
</h1>
```

Same pattern, same tokens, same line break placement. This is **the canonical brand title that we propagated to Navbar in a previous fix and to Dashboard's greeting in another fix.** No drift, no finding — just confirmation that the pattern is locked in here too. ✓

### 🟢 X.4 · "Back to Login" / link-to-other-flow Buttons use full-width primary or ghost variants

All four form pages have a link at the bottom to another auth flow (Login ↔ Signup ↔ Forgot Password). The pattern is identical:

```
<div className="mt-6 text-center">
  <p className="text-text-secondary font-body">
    Already have an account?{' '}
    <Link to="/login" className="text-primary font-semibold hover:underline">
      Log in
    </Link>
  </p>
</p>
```

This is the same "inline text link inside body copy" pattern we flagged on Dashboard's Set Up Household banner and Recipe Detail's Source link. Same Design queue item (Button `variant="link"` or formalized inline-link spec). Hand-roll acceptable until the primitive ships. ✓

### 🟢 X.5 · Card primitive used correctly across all four form pages

Every form page wraps its content in `<Card>`. Tokens correct, composition correct. ✓ No finding.

---

## Section 1 · Landing.jsx (where the drift lives)

### 🔴 1.1 · `RecipeCardContent` image area uses `bg-gradient-to-br from-background to-amber-50`

Line 18:
```
<div className="relative w-full h-44 sm:h-56 bg-gradient-to-br from-background to-amber-50 overflow-hidden">
```

One amber gradient. The `to-amber-50` provides the fallback warm tint when the recipe image is missing. Map to `to-accent-soft/40` (the canonical warm-cookbook treatment).

Mapping: `to-amber-50` → `to-accent-soft/40`.

### 🔴 1.2 · `SkeletonCard` uses `bg-amber-100/60`, `bg-amber-100/80`, `bg-amber-100/40` for skeleton placeholders

Lines 87-94. The skeleton card uses amber-100 at varying opacities for the shimmer placeholder backgrounds:
- Image placeholder: `bg-amber-100/60`
- Title placeholder: `bg-amber-100/80`
- Description placeholder: `bg-amber-100/60`
- Badge placeholder: `bg-amber-100/60`
- Button placeholder: `bg-amber-100/40`

**This is a different semantic from the warm-cookbook accent.** These are skeleton loading shimmer states. The current LOADING.md (per CLAUDE.md, exists in `design-system/`) probably has token guidance for skeleton states. Without seeing it: the most-likely-correct token is `bg-text-secondary/10` or `bg-text-secondary/20` (gray-tinted shimmer at low opacity), OR `bg-accent-soft/40` to maintain the warm aesthetic.

Two options:
- (a) Tokenize to `bg-accent-soft` at varying opacities — maintains warm aesthetic, swaps amber for accent-soft.
- (b) Tokenize to `bg-text-secondary/10` for proper skeleton shimmer semantics — neutral gray shimmer.

**Lean (a).** Skeleton loading should match the app's aesthetic, and your aesthetic is warm-cookbook. The current amber-100 picks were probably trying to do this anyway. Use `accent-soft` at the same opacity tiers:
- `bg-amber-100/60` → `bg-accent-soft/60`
- `bg-amber-100/80` → `bg-accent-soft/80`
- `bg-amber-100/40` → `bg-accent-soft/40`

⚪ Worth checking LOADING.md for canonical skeleton state guidance before locking this fix. If LOADING.md says "use gray-tinted shimmer at 10%", override to (b). If it doesn't say, (a) is fine.

### 🔴 1.3 · Signup CTA card uses `bg-gradient-to-br from-surface to-amber-50/50`

Line 233:
```
<div className="bg-gradient-to-br from-surface to-amber-50/50 rounded-2xl sm:rounded-3xl border border-border sm:border-2 p-4 sm:p-10 shadow-sm sm:shadow-resting">
```

Same amber gradient pattern as the Recipe Detail signup CTA. Map: `to-amber-50/50` → `to-accent-soft/40` (matching the standard mapping; the `/40` is close enough to `/50` that visual difference is minimal).

Note: this card uses `shadow-sm` on mobile and `shadow-resting` on desktop. `shadow-sm` is Tailwind default (gray-tinted), not your warm `shadow-resting` token. Inconsistent.

- `to-amber-50/50` → `to-accent-soft/40`
- `shadow-sm sm:shadow-resting` → `shadow-resting sm:shadow-resting` (just `shadow-resting`)

### 🟡 1.4 · Inline `style={{ boxShadow: '0 8px 40px rgba(200, 98, 42, 0.12)' }}` on the recipe card wrapper

Lines 192-198 (loading state) and 211-218 (loaded state):
```
<div style={{ boxShadow: '0 8px 40px rgba(200,98,42,0.08)' }} className="rounded-3xl">
  <SkeletonCard />
</div>
```

and:

```
<div
  className="rounded-3xl border-2 border-border"
  style={{
    opacity: visible ? 1 : 0,
    transition: 'opacity 200ms ease',
    boxShadow: '0 8px 40px rgba(200, 98, 42, 0.12)',
  }}
>
```

Two inline style blocks. The opacity transition is **legitimate** — it drives the 200ms fade between recipe cards (state-driven dynamic value, can't be a static Tailwind class). But the `boxShadow` is hardcoded RGB-with-burnt-orange-tint that should be a token.

The shadow value `0 8px 40px rgba(200, 98, 42, 0.12)` uses `#C8622A` (your primary color) at 12% — a custom "primary-tinted hero shadow" not in your token system.

Options:
- (a) Add a `shadow-hero` or `shadow-elevated-primary` token to tailwind.config.js. Route to Design queue.
- (b) Keep inline style. Pragmatic, accepted deviation. Common pattern for one-off animated/state-driven properties.
- (c) Use existing `shadow-elevated` from your token set (if defined) as approximate replacement.

**Lean (b) for now**, with (a) routed to Design queue. The `boxShadow` value is a deliberate aesthetic (burnt-orange-tinted glow) that doesn't have a token equivalent. Keep inline, flag for the cookbook aesthetic Design session (it fits the same theme).

⚪ Possible Design queue: `shadow-hero` token (`0 8px 40px rgba(200, 98, 42, 0.12)`) for marquee surface shadows. Recurs on Landing's recipe card.

### 🔴 1.5 · "View Recipe" Button uses `<ExternalLink className="mr-1.5 sm:hidden" />` + duplicate icon for desktop

Lines 64-70:
```
<Link to={`/recipes/${recipe.id}`}>
  <Button className="w-full" size="sm">
    <ExternalLink size={14} className="mr-1.5 sm:hidden" />
    <ExternalLink size={18} className="mr-2 hidden sm:inline-flex" />
    <span className="sm:hidden">View Recipe</span>
    <span className="hidden sm:inline">View Full Recipe</span>
  </Button>
</Link>
```

This Button has **two different ExternalLink icons** (size 14 for mobile, size 18 for desktop) and **two different text strings** ("View Recipe" mobile, "View Full Recipe" desktop). All using `sm:hidden` / `hidden sm:inline` to swap based on viewport.

This is responsive complexity packed into one Button, plus the legacy `<Icon className="mr-Y" />` child pattern (twice).

Two fix paths:
- (a) Simplify to a single icon size and a single text string. Lose the mobile/desktop distinction in copy.
- (b) Use `useIsMobile()` hook to render the right icon and text — same pattern Shopping uses.
- (c) Keep the responsive class swap, but use `icon` prop. Doesn't work cleanly because the icon prop takes one static node.

**Lean (a)** — pick one icon size (`size={16}`) and one text string ("View Recipe"). Simpler, cohesive, and the copy difference between "View Recipe" and "View Full Recipe" isn't doing meaningful work.

After fix:
```
<Link to={`/recipes/${recipe.id}`}>
  <Button className="w-full" size="sm" icon={<ExternalLink size={16} />}>
    View Recipe
  </Button>
</Link>
```

### 🔴 1.6 · Feature highlights use dynamic Tailwind class interpolation `bg-${color}/10` and `text-${color}`

Lines 251-264:
```
{[
  { icon: UtensilsCrossed, color: 'primary',   title: ..., desc: ... },
  { icon: Calendar,        color: 'secondary',  title: ..., desc: ... },
  { icon: ShoppingCart,    color: 'accent',     title: ..., desc: ... },
].map(({ icon: Icon, color, title, desc }) => (
  <div key={title} ...>
    <div className={`w-10 h-10 sm:w-12 sm:h-12 bg-${color}/10 rounded-xl flex items-center justify-center flex-shrink-0`}>
      <Icon size={20} className={`text-${color}`} />
    </div>
    ...
  </div>
))}
```

**This is a documented Tailwind anti-pattern.** Tailwind's compiler scans source files for class names statically. Dynamic interpolation like `bg-${color}/10` works in development (because the JIT compiler may catch them) but fails to tree-shake reliably in production. Worse: if you ever switch to a build that doesn't ship JIT (e.g. some Tailwind v4 configs), these classes simply won't exist.

To verify: search for `bg-primary/10`, `bg-secondary/10`, `bg-accent/10` anywhere else in the codebase. If they appear elsewhere, the JIT may have caught them and ship them. If not, **these classes literally don't render on Landing.**

Two fix options:
- (a) Replace the dynamic interpolation with an explicit map. Hardcode the class strings. Verbose but Tailwind-safe.
- (b) Add `bg-primary/10 bg-secondary/10 bg-accent/10 text-primary text-secondary text-accent` to a `safelist` in tailwind.config.js. Less invasive, but creates a hidden dependency.

**Lean (a)** — explicit is better than implicit. Refactor the feature data to include full class strings instead of color names:

```
{[
  { icon: UtensilsCrossed, iconBgClass: 'bg-primary/10', iconColorClass: 'text-primary', title: 'Recipe Library', desc: '...' },
  { icon: Calendar, iconBgClass: 'bg-secondary/10', iconColorClass: 'text-secondary', title: 'Weekly Planner', desc: '...' },
  { icon: ShoppingCart, iconBgClass: 'bg-accent/10', iconColorClass: 'text-accent', title: 'Shopping List', desc: '...' },
].map(({ icon: Icon, iconBgClass, iconColorClass, title, desc }) => (
  <div key={title} ...>
    <div className={`w-10 h-10 sm:w-12 sm:h-12 ${iconBgClass} rounded-xl flex items-center justify-center flex-shrink-0`}>
      <Icon size={20} className={iconColorClass} />
    </div>
    ...
  </div>
))}
```

**Worth verifying first whether the dynamic interpolation actually breaks.** Run `npm run build` and check that the feature icons render with their background colors and icon colors. If they DO render, the JIT caught them and the fix is cosmetic (still worth doing for correctness). If they DON'T render, the fix is a real bug fix.

### 🟢 1.7 · Decorative blur background blobs use tokens correctly

Lines 178-182:
```
<div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
  <div className="absolute top-1/4 -left-32 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl" />
  <div className="absolute bottom-1/3 -right-32 w-[500px] h-[500px] bg-accent/5 rounded-full blur-3xl" />
  <div className="absolute top-2/3 left-1/3 w-64 h-64 bg-secondary/5 rounded-full blur-3xl" />
</div>
```

Tokens correct (`bg-primary/5`, `bg-accent/5`, `bg-secondary/5`). Same decorative-flair pattern as Recipes' empty state (already noted as deferred). Bespoke flourish, no design system impact. ✓ No finding.

### 🟢 1.8 · Hero heading uses `text-3xl sm:text-5xl md:text-7xl` — large responsive heading

Line 188:
```
<h1 className="text-3xl sm:text-5xl md:text-7xl font-display font-bold text-text-primary mb-1 sm:mb-4 leading-tight">
```

`text-7xl` is 72px. The largest heading in the codebase (Recipe Detail uses `text-5xl` 48px; Dashboard uses `text-4xl` 36px; COMPONENTS.md H1 spec is 28px).

Pattern is clear at this point: desktop hero headings use larger sizes per content density:
- Landing hero: 72px (3xl mobile, 5xl tablet, 7xl desktop)
- Recipe Detail title: 48px (5xl)
- Dashboard greeting: 36px (4xl)
- Card/section headings: 24-28px (2xl, default H2)

⚪ Already in Design queue: `display-hero-xl` (48px) for Recipe Detail. Landing's 72px hero is even larger. Worth a `display-hero-2xl` or `display-marquee` step in the hierarchy.

### 🟢 1.9 · Feature card icon hex color uses `bg-${color}/10` — see 1.6

(Same finding as 1.6, just noting the data structure here. Single fix covers both.)

### ⚪ 1.10 · `<MacrosBadge>` is a domain primitive not yet audited

Line 9 imports `MacrosBadge` from `../components/recipes/MacrosBadge`. This is used at line 70 of Landing. Hasn't been audited; defer to a separate primitive audit pass.

---

## Section 2 · Login.jsx, Signup.jsx, ForgotPassword.jsx, ResetPassword.jsx (the four form pages)

**Shared findings (apply to all four):** see Cross-cutting X.1, X.2, X.3, X.4, X.5 above.

### Per-page specifics:

### 🟢 2.1 · Login: page-specific fields confirmed correct

- Email Input with email regex validation ✓
- Password Input with PasswordToggle trailingIcon ✓
- Forgot Password link uses tokens (`text-primary font-semibold hover:underline`) ✓
- Bottom link to /signup uses tokens ✓

No page-specific findings.

### 🟢 2.2 · Signup: same pattern as Login + two additional fields

- Display Name Input, Email Input, Password Input + PasswordToggle, Confirm Password Input + PasswordToggle ✓
- `renderToggle` helper function defined inline at component level — slight abstraction for the password toggle. Functional, no finding.
- Validation regex matches Login (case-insensitive email pattern) ✓

No page-specific findings beyond cross-cutting.

### 🟢 2.3 · ForgotPassword: two distinct rendering states (form vs. confirmation)

- Initial state: form with one Email Input + Button submit
- Post-submit state: confirmation message with "Back to Login" Button

Both states share the same Card. The state transition is clean. ✓ No findings beyond cross-cutting.

### 🟢 2.4 · ResetPassword: two distinct rendering states (form vs. expired link)

- Initial state: form with Password + Confirm Password Inputs
- Expired state: "Link expired" message with "Request New Link" Button

`hadRecoveryHashRef` ref pattern is sensible — captures the Supabase recovery hash on first mount before Supabase clears it. ✓ No findings beyond cross-cutting.

---

## Findings sorted by leverage

**Highest leverage (fast wins, mechanical):**
- 🔴 X.1 — Remove `platform="mobile"` from 15 Inputs and Buttons across the four form pages. Same fix as Profile, replicated 15×.
- 🔴 1.1 — Landing recipe card image gradient amber → accent-soft.
- 🔴 1.2 — Landing skeleton card amber → accent-soft (5 instances).
- 🔴 1.3 — Landing signup CTA card amber → accent-soft + shadow normalization.
- 🔴 1.5 — Landing View Recipe Button simplification (drop the responsive icon/text swap; use icon prop with single ExternalLink + "View Recipe").
- 🔴 1.6 — Landing feature highlights dynamic class interpolation → explicit class strings. **Worth verifying breakage first.**

**Medium effort:**
- 🟡 1.4 — Landing inline `style={{}}` boxShadow. Either keep as-is (deferred to cookbook design session) or route to Design queue for a `shadow-hero` token.

**Polish:**
- 🟢 1.7, 1.8 — Decorative elements / heading sizes. Defer.

**Possible Design extensions to add to queue:**
- ⚪ `<ErrorBanner />` or `<Alert variant="error" />` primitive (X.2). Recurs 4× already.
- ⚪ `shadow-hero` token (1.4).
- ⚪ `display-hero-2xl` heading size (1.8).
- ⚪ `<MacrosBadge>` audit (1.10).

**Defer:**
- ⚪ X.1 deferred polish: `useIsMobile()`-based responsive button sizing across the codebase. Address after desktop overhaul as a dedicated pass.

**Cross-cutting (out of audit scope, but noted):**
- ⚪ The cookbook aesthetic direction (already flagged as top-of-queue Design item) is the foundation that resolves 1.1, 1.2, 1.3 in a more deliberate way. Per-page fixes here are still useful — they unblock the cohesion baseline, then the Design pass refines aesthetics on top.

**Bugs (non-design):**
- ⚠️ 1.6 may be a real silent rendering bug (dynamic Tailwind class interpolation). Verify with `npm run build` and visual inspection of Landing's feature highlight section before assuming it's cosmetic.

---

## Triage decisions to make

For each finding, decide: **Fix now / Defer / Document deviation / Route to Design.**

1. **Bundle structure:** Two distinct fix domains. The four form pages share one mechanical fix (X.1). Landing is its own multi-fix branch. **Recommendation: one bundled branch `fix/auth-flow-cohesion`** that does the form-page fix + the Landing fixes together. Diff will be larger than Shopping but smaller than Recipe Detail.

2. **The dynamic Tailwind interpolation (1.6) is the audit's bug-check item.** Run `npm run build` and inspect Landing's feature highlights section before locking the fix. If the icons render correctly in production, the fix is cosmetic-but-correct. If they don't render, the fix is a real bug fix.

3. **The cookbook aesthetic Design priority overlaps with 1.1, 1.2, 1.3.** Doing per-page amber → accent-soft fixes now does NOT preempt the eventual cookbook redesign — it just brings the page into cohesion baseline. The Design session can override these tokens with the new cookbook tokens whenever it ships.

4. **Recommended bundle for `fix/auth-flow-cohesion`:**
   - 🔴 X.1 — Remove `platform="mobile"` from 15 Inputs/Buttons across the four form pages.
   - 🔴 1.1 — Landing recipe card image gradient amber → accent-soft.
   - 🔴 1.2 — Landing skeleton card amber → accent-soft (verify against LOADING.md first; if it specifies neutral gray for skeletons, do that instead).
   - 🔴 1.3 — Landing signup CTA card amber → accent-soft + shadow normalization.
   - 🔴 1.5 — Landing View Recipe Button simplification.
   - 🔴 1.6 — Landing feature highlights explicit class strings (assuming the JIT issue verifies as real).

   That's 6 fixes (5 if 1.6 verifies as cosmetic and we skip it, but better to ship the explicit version regardless).

5. **Defer all others.**

6. **Out of scope:** MacrosBadge internals; Card/Input/Button/PasswordToggle internals.
