# WDYWFD — Loading State Spec

Explicit shimmer values. **Engineers must not substitute static skeletons** — the warmth of the moving highlight is part of the brand feel.

---

## Shimmer animation

| Property | Value |
|---|---|
| **Direction** | Left-to-right sweep (`background-position` from `200% 0` → `-200% 0`) |
| **Duration** | `1400ms` |
| **Easing** | `cubic-bezier(0.4, 0.0, 0.2, 1.0)` (ease-in-out) |
| **Iteration** | `infinite` |
| **Color stop 0%** | `#E8D9C8` (= `--color-border`) |
| **Color stop 50%** | `#F0E2CF` (warm highlight, ~6% lighter than base) |
| **Color stop 100%** | `#E8D9C8` |
| **Background size** | `200% 100%` |
| **Border radius** | `6px` (= `--radius-xs`) |
| **prefers-reduced-motion** | Disable animation; render the base `#E8D9C8` solid. |

### CSS

```css
@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    #E8D9C8 0%,
    #F0E2CF 50%,
    #E8D9C8 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1400ms cubic-bezier(0.4, 0, 0.2, 1) infinite;
  border-radius: 6px;
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
    background: #E8D9C8;
  }
}
```

### React component

```tsx
import { cn } from "@/lib/utils";

export interface SkeletonProps {
  /** Width — number = px, string = any CSS unit. Default '100%'. */
  width?: number | string;
  /** Height — px. Default 12. */
  height?: number;
  /** Border radius — px. Default 6 (token: --radius-xs). */
  radius?: number;
  /** Bottom margin — px. Default 0. */
  marginBottom?: number;
  className?: string;
}

export function Skeleton({
  width = "100%", height = 12, radius = 6, marginBottom = 0, className,
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("skeleton", className)}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height,
        borderRadius: radius,
        marginBottom,
      }}
    />
  );
}
```

---

## Skeleton placement rules

1. **Mirror the resolved layout.** Skeletons must occupy the same height and approximate width that the real content will. No layout shift on resolve.
2. **Skeleton groups maintain the same gap as their resolved siblings** — use the parent's flex/grid `gap`.
3. **Don't shimmer photos as a flat gray block** — match the recipe-photo placeholder treatment (8px diagonal stripe in `#E8D9C8` / `#DFCCB6`) so loading states look intentional, not broken.
4. **Cap concurrent skeletons.** Above-the-fold only on first paint; below-the-fold sections render skeletons only when scrolled into view.
5. **Resolve in chunks, not all-at-once.** Hero first, then sections, so the screen feels alive.

---

## Per-screen skeleton recipes

### Dashboard — loading

| Block | Skeleton shape |
|---|---|
| Hero photo | striped placeholder (RecipePhoto component, no animation) — 360×280 |
| Hero title | `<Skeleton w={260} h={26} mb={8} />` |
| Hero meta row | `<Skeleton w={160} h={12} mb={16} />` |
| Hero CTA | `<Skeleton w={180} h={48} radius={9999} />` (pill) |
| Quick actions row | 3× `<Skeleton w="100%" h={64} radius={16} />` in a flex row, gap 8 |
| Up Next title | `<Skeleton w={120} h={16} mb={12} />` |
| Up Next cards | 2× card-shaped: `<Skeleton w={240} h={160} radius={16} />` in horizontal scroll |
| Week strip | 7× small column: `<Skeleton w="100%" h={56} radius={10} />` in grid-cols-7 |

### Planner — loading

| Block | Skeleton shape |
|---|---|
| Week pills row | 7× `<Skeleton w={36} h={28} radius={9999} />` (header is real text) |
| Day section header | real text — preserves day labels |
| SlotCard skeleton (filled) | `<Skeleton w="100%" h={68} radius={10} />` — same height as resolved card |
| SlotCard skeleton (empty) | render the actual empty SlotCard (already a placeholder) |
| FAB | render real `Suggest my week` button — never skeletonize primary CTAs |

### Other flows

Recipe Detail, Add Recipe, Shopping List, and Profile **do not have loading variants in the v1 batch** — they're either driven by route params with cached data (Recipe Detail) or local state (the rest). If engineering needs them later, follow the same rules above.

---

## What NOT to do

- ❌ Static gray boxes — must shimmer.
- ❌ A single full-page skeleton blob. Always section-shaped.
- ❌ Generic light gray (`#E5E7EB` etc). Must use the warm `#E8D9C8` / `#F0E2CF` pair — these tokens are part of the brand surface family.
- ❌ Faster animation. The 1.4s timing matches the warmth; quicker reads as "broken".
- ❌ Skeletonize primary CTAs (Suggest, Save, Start cooking). Buttons are always real even when their data is loading — the button can be `disabled` instead.
