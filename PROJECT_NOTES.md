# PROJECT_NOTES.md

Live working memory across sessions. More current than any other doc in the repo. Update at end of session — see ritual at bottom.

## Current state

- Branch: `master`, even with `origin/master`.
- HEAD after most recent push: `4fc2366` — docs: add CLAUDE.md design-system pointers and PROJECT_NOTES.md.
- Mobile UI alignment pass complete; mobile experience matches design system v1.2.0.
- Design system docs synced to v1.2.0.
- Password recovery built in-codebase; Supabase Dashboard redirect URL config still pending — see Open threads.
- Desktop overhaul methodology established (audit → triage → execute, one page at a time, against design system cohesion not flow-spec conformance).
- Profile desktop audit complete at `audits/profile-desktop.md`.
- Profile triage complete; fix list locked, branch about to start.

## Active work

- **Branch about to open: `fix/profile-desktop-cohesion`.** Bundles 7 cohesion fixes on `src/pages/Profile.jsx`:
  - Remove `platform="mobile"` from desktop Buttons (4 spots; defaults to desktop)
  - Match label spec on hand-rolled labels (`text-[13px] font-bold mb-1.5 tracking-[0.1px]`)
  - Convert hand-rolled Email field to Input primitive with `leadingIcon`, `disabled`, `readOnly`
  - Remove duplicate inline success message (toast already renders globally)
  - Refactor Buttons to use `icon` prop instead of child `<Plus className="mr-2" />`
  - Rewrite Meal Slots amber-* Tailwind palette colors to use design tokens (accent-soft for surfaces, text-secondary/text-primary for text, etc.)
  - Replace hand-rolled Edit pencil button with `<Button variant="ghost" size="sm" icon={<Pencil />}>Edit</Button>`
- After branch lands: continue desktop overhaul to next page. Recommended order: Recipes list (likely close to compliant) → Recipe Detail (likely already compliant, audit-only) → Dashboard → Shopping → Auth flow.

## Architectural decisions

Non-obvious choices and the reasoning behind them. Add entries when a decision deserves to outlive the chat it was made in.

- **5-tab bottom nav (Home/Plan/Recipes/Shopping/Profile)** — design system v1 spec called for 4 tabs; we shipped 5 because Profile needed a top-level destination rather than being buried. Documented as a deviation in FLOWS.md.
- **TopAppBar accepts ReactNode title** — enables the dual-color brand title on Dashboard. The component falls back to `text-text-primary` only when `typeof title === 'string'`, so JSX titles control their own color.
- **Modal `minHeight` prop** — added to support "decision-moment" sheet variants (e.g. Suggest sheet at `min-h-[50vh]`) without forking the component.
- **Three TopAppBar layout-override props** (`titleFitContent`, `titleAbsoluteCenter`, `trailingPinRight`, plus `titleClassName`) — escape hatches for per-page layout needs without polluting the base component's default behavior.
- **Mobile and desktop have different IAs by design.** Mobile uses 5-tab BottomTabBar; desktop uses 3-link top Navbar (Recipes, Shopping, profile avatar dropdown). The same destinations don't translate cleanly between platforms; forcing parity would compromise both. Routes like `/plan` exist on desktop but are not surfaced in nav — orphaned by design, deferred.
- **Desktop overhaul scope: cohesion with design system, not conformance to flow spec.** FLOWS.md is mobile-first and significantly behind production for several flows (Profile especially — TDEE moved to member edit, household members rendered as grid not list, etc.). Audits measure desktop pages against the visual language and primitive set, not against flow-spec composition. Desktop has no flow-spec chapter; the implied "Desktop Verification.html" canvas is referenced but doesn't exist as a doc.

## Deferred polish

Known issues we're carrying intentionally. Each entry: what, why deferred.

- **Hand-rolled toast on Profile** — until `<Toast />` primitive ships from Claude Design, leave the page-level toast as-is. Don't extract to a half-spec'd local component.
- **Hand-rolled Trash button on Profile (Meal Slots)** — IconBtn doesn't currently support a destructive variant. Until Design adds one, hand-rolled stays. Don't expand IconBtn in the Profile cohesion branch.
- **Hand-rolled "Add Slot" dashed button on Profile** — no current Button variant supports dashed border. Wait for Design's dashed/AddRow primitive.
- **Hand-rolled InlineRename input on Profile (Meal Slots)** — distinct visual archetype from Input. Wait for Design's InlineRename or Input variant.
- **Page-width layout decisions on Profile (`max-w-4xl mx-auto`, nested `max-w-7xl` outer)** — defer until other desktop pages audited. Decision needs cross-page context.
- **`tracking-[0.1px]` polish across Profile** — pure polish; revisit at end of desktop overhaul.
- **Skeleton loading states on Profile** — currently plain `<p>Loading...</p>`. LOADING.md may have a Profile recipe to align with; not urgent.
- **Hand-rolled label/section header markup on Profile (after the bundled fix)** — the bundled cohesion branch fixes the most visible label drift; some lower-priority spec mismatches remain. Polish-pass material.
- **Mobile button sizing on Profile (4 buttons)** — `Display Name Save`, `Meal Slots Save`, and the two Modal action buttons in Profile.jsx render at desktop sizing (44px) on mobile after the cohesion fix removed `platform="mobile"`. Tap target still meets the 44px minimum but loses the 4px comfort buffer the design system spec'd. Proper fix is `useMediaQuery`-based platform prop, which is its own pattern decision (route to Claude Design when convenient).
- **Desktop Navbar brand title was single-color — being fixed in next branch** — found during Recipes visual verification. The desktop top nav rendered "What Do You Want For Dinner?" in single-color primary, but the mobile experience and Dashboard's TopAppBar both use the canonical dual-color treatment (`text-text-primary` for "What Do You Want" + `text-primary` for "For Dinner?"). Affects every desktop page since Navbar is global. Being fixed in `fix/desktop-navbar-brand-title` immediately after Recipes branch lands.

## Claude Design extension queue

Extension requests surfaced by the Profile audit. Route to Claude Design as a separate workstream when ready.

- `<EmptyState />` primitive — recurs across Dashboard, Planner, Shopping, Profile.
- Button `dashed` modifier or `<AddRowButton />` primitive — recurs in empty states and add-row affordances.
- `<InlineRename />` primitive or Input variant — for list-management UIs.
- Named Modal sizes (`sm/md/lg`) instead of raw `width` props.
- Button `variant="ghost-destructive"` — was spec'd in FLOWS.md Flow 6 but never made it into Button.
- `<Toast />` primitive + possibly `useToast()` hook — page-level toasts currently hand-rolled.
- Inset/well in-card grouping pattern — for grouped controls within a Card.
- Drag-active visual state — canonical treatment for drag-over / drop-target.
- IconBtn destructive variant — for trash/delete buttons that need destructive intent.
- Desktop layout token (centered-content vs. wide-content) — to formalize per-page max-width decisions.

## Open threads

Things in flight or awaiting external action.

- **Supabase Dashboard redirect URLs** — password recovery requires manual config of `http://localhost:4173/reset-password` and the production reset-password URL in the Supabase Dashboard. In-codebase work is done; Dashboard config is on Max.
- **`signUp` 500ms race** — `AuthContext.signUp` waits ~500ms after `supabase.auth.signUp` before updating `profiles.display_name` because a DB trigger creates the profile row. Brittle. Should be replaced with a real wait on the profile row appearing, but works for now.
- **Migration numbering collision** — two migrations share `010_` prefix. New migrations start at `012_`. Documented in CLAUDE.md.
- **Recipe Variety Filter IA** — currently nested inside the Household card on Profile, but conceptually it's a global preference, not household-scoped. Move to its own section (or to a future Preferences card) in a structural pass. Out of scope for cohesion audit.
- **CLAUDE.md `*-mobile/` convention claim is incomplete** — CLAUDE.md says mobile compositions live in `*-mobile/` subdirectories with desktop in the parents. The actual pattern is more nuanced: some pages have an explicit Page/PageMobile/PageDesktop three-file split (Dashboard, Plan, RecipeDetail), some have single-file responsive (Profile, Recipes, Shopping, auth flow), and some `*-mobile/` domain folders exist while their desktop counterparts share the parent folder. Update CLAUDE.md to reflect this when convenient.

## End-of-session ritual

Before wrapping a session, update this doc:

1. **Current state** — bump HEAD commit, branch status, what just shipped.
2. **Active work** — what's the next concrete thing? If you finished what was here, replace it; don't append.
3. **Architectural decisions** — add entries for non-obvious choices made this session. Skip the obvious ones.
4. **Open threads** — add new ones, remove resolved ones.
5. **Deferred polish** — add anything we noticed and chose not to fix.
6. **Claude Design extension queue** — add anything we want Design to build.

Commit this doc with the rest of the session's work, or as its own commit with `docs: update project notes`.
