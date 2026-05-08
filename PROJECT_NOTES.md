# PROJECT_NOTES.md

Live working memory across sessions. More current than any other doc in the repo. Update at end of session — see ritual at bottom.

## Current state

- Branch: `master`, currently 27 commits ahead of `origin/master` (push pending).
- HEAD: `45c3fae` — docs: sync design system to v1.2.0 reflecting v1.1.0 → master implementation.
- Mobile UI alignment pass complete; mobile experience matches design system v1.2.0.
- Design system docs synced to v1.2.0.
- Password recovery built in-codebase (ForgotPassword, ResetPassword, AuthContext methods, routes); Supabase Dashboard redirect URL config still pending — see Open threads.

## Active work

- **Desktop overhaul.** Mobile is aligned; desktop has not received the same pass and is expected to be drifted relative to the current component library. Approach TBD — first step is an inventory of desktop pages and where they diverge from current primitives. Decisions pending: whether to extend `platform` prop pattern broadly, whether TopAppBar grows a desktop variant or desktop uses a different header, whether design-system/ needs desktop-specific specs (FLOWS.md mentions a "Desktop Verification" canvas that doesn't exist yet).

## Architectural decisions

Non-obvious choices and the reasoning behind them. Add entries when a decision deserves to outlive the chat it was made in.

- **5-tab bottom nav (Home/Plan/Recipes/Shopping/Profile)** — design system v1 spec called for 4 tabs; we shipped 5 because Profile needed a top-level destination rather than being buried. Documented as a deviation in FLOWS.md.
- **TopAppBar accepts ReactNode title** — enables the dual-color brand title on Dashboard. The component falls back to `text-text-primary` only when `typeof title === 'string'`, so JSX titles control their own color.
- **Modal `minHeight` prop** — added to support "decision-moment" sheet variants (e.g. Suggest sheet at `min-h-[50vh]`) without forking the component.
- **Three TopAppBar layout-override props** (`titleFitContent`, `titleAbsoluteCenter`, `trailingPinRight`, plus `titleClassName`) — escape hatches for per-page layout needs without polluting the base component's default behavior.

## Deferred polish

Known issues we're carrying intentionally. Each entry: what, why deferred.

- _(none recorded yet — add as they come up)_

## Open threads

Things in flight or awaiting external action.

- **Supabase Dashboard redirect URLs** — password recovery requires manual config of `http://localhost:4173/reset-password` and the production reset-password URL in the Supabase Dashboard. In-codebase work is done; Dashboard config is on Max.
- **`signUp` 500ms race** — `AuthContext.signUp` waits ~500ms after `supabase.auth.signUp` before updating `profiles.display_name` because a DB trigger creates the profile row. Brittle. Should be replaced with a real wait on the profile row appearing, but works for now.
- **Migration numbering collision** — two migrations share `010_` prefix. New migrations start at `012_`. Documented in CLAUDE.md.

## End-of-session ritual

Before wrapping a session, update this doc:

1. **Current state** — bump HEAD commit, branch status, what just shipped.
2. **Active work** — what's the next concrete thing? If you finished what was here, replace it; don't append.
3. **Architectural decisions** — add entries for non-obvious choices made this session. Skip the obvious ones.
4. **Open threads** — add new ones, remove resolved ones.
5. **Deferred polish** — add anything we noticed and chose not to fix.

Commit this doc with the rest of the session's work, or as its own commit with `docs: update project notes`.
