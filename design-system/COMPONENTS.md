# WDYWFD — Component Library

React + Tailwind handoff. Generated 2026-05-04 from approved design system v1.

**Conventions assumed (matches existing codebase):**
- React 18 functional components, TypeScript optional but recommended
- Tailwind 3.x with the design tokens wired into `tailwind.config.ts` (see `tokens.json`)
- `cn()` from `clsx` + `tailwind-merge` for conditional classes
- All colors, spacing, radii, shadows reference Tailwind theme keys derived from `tokens.json` — never hardcode hex
- All components ship a `platform` prop (`'mobile' | 'desktop'`) where the brief calls for it; touch targets and density flip on this prop, not on viewport width — for SSR-safe rendering and Storybook variants

**Tailwind theme prefix used below:**
- `bg-surface`, `bg-bg`, `text-primary`, `text-secondary`, `text-tertiary`, `border-border`, `shadow-resting`, etc. — direct mapping from `--color-*` and friends.

---

## 1. Button

**File:** `components/ui/Button.tsx`

```tsx
import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";
type State = "default" | "hover" | "focus" | "pressed" | "disabled";
type Platform = "mobile" | "desktop";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> {
  variant?: Variant;
  size?: Size;
  /** Visual state override — only used for design previews / Storybook. Real apps let CSS handle hover/focus/active. */
  state?: State;
  platform?: Platform;
  icon?: ReactNode;
  fullWidth?: boolean;
}

const sizeClasses: Record<Platform, Record<Size, string>> = {
  mobile: {
    sm: "h-9 px-4 text-sm gap-1.5",
    md: "h-12 px-5 text-[15px] gap-2",       // 48px — mobile comfort
    lg: "h-14 px-7 text-[17px] gap-2.5",     // 56px
  },
  desktop: {
    sm: "h-9 px-4 text-sm gap-1.5",
    md: "h-11 px-5 text-[15px] gap-2",       // 44px
    lg: "h-13 px-7 text-[17px] gap-2.5",     // 52px
  },
};

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-primary text-white border-transparent shadow-resting " +
    "hover:bg-primary-hover " +
    "active:bg-primary-pressed active:shadow-button-pressed-inset active:translate-y-px " +
    "focus-visible:ring-3 focus-visible:ring-primary/28 " +
    "disabled:bg-[#E8D0BD] disabled:text-[#FFF2E4] disabled:shadow-none disabled:cursor-not-allowed",
  secondary:
    "bg-secondary text-white border-transparent shadow-resting " +
    "hover:bg-secondary-hover " +
    "active:bg-[#3E5530] active:shadow-button-pressed-inset active:translate-y-px " +
    "focus-visible:ring-3 focus-visible:ring-primary/28 " +
    "disabled:bg-[#CBD4C2] disabled:text-[#F3F5EE] disabled:shadow-none disabled:cursor-not-allowed",
  ghost:
    "bg-transparent text-primary border-primary " +
    "hover:bg-surface-hover " +
    "active:bg-[#EADBC4] active:text-primary-hover active:border-primary-hover active:shadow-button-pressed-inset active:translate-y-px " +
    "focus-visible:ring-3 focus-visible:ring-primary/28 " +
    "disabled:text-[#C9B49D] disabled:border-[#E0CFBB] disabled:cursor-not-allowed",
  destructive:
    "bg-error text-white border-transparent shadow-resting " +
    "hover:bg-error-hover " +
    "active:bg-error-pressed active:shadow-button-pressed-inset active:translate-y-px " +
    "focus-visible:ring-3 focus-visible:ring-error/28 " +
    "disabled:bg-[#E7C4BE] disabled:text-[#FFF1EF] disabled:shadow-none disabled:cursor-not-allowed",
};

export function Button({
  variant = "primary",
  size = "md",
  platform = "desktop",
  state,
  icon,
  fullWidth,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      data-state={state}
      className={cn(
        "inline-flex items-center justify-center font-bold tracking-[0.1px] whitespace-nowrap",
        "rounded-pill border-[1.5px]",
        "transition-all duration-fast ease-standard",
        "focus-visible:outline-none",
        sizeClasses[platform][size],
        variantClasses[variant],
        fullWidth && "w-full",
        className,
      )}
    >
      {icon && <span className="inline-flex w-4 h-4">{icon}</span>}
      {children}
    </button>
  );
}
```

**API**

| prop | type | default | notes |
|---|---|---|---|
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'destructive'` | `'primary'` | |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | sm = 36px desktop-only dense UI |
| `platform` | `'mobile' \| 'desktop'` | `'desktop'` | mobile bumps md→48 / lg→56 to clear 44pt tap target |
| `state` | `'default' \| 'hover' \| 'focus' \| 'pressed' \| 'disabled'` | — | preview-only override; real interactions use Tailwind's pseudo-classes |
| `icon` | `ReactNode` | — | leading icon, sized to match font |
| `fullWidth` | `boolean` | `false` | |

**States**: default · hover · focus (3px primary ring) · pressed (inset shadow + 1px translate) · disabled (desaturated tone). All four variants render every state.

---

## 2. Input

**File:** `src/components/ui/Input.jsx`

```jsx
import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

export const Input = forwardRef(({
  label,
  helper,
  error,
  state = 'default',
  platform = 'desktop',
  leadingIcon,
  trailingIcon,
  className,
  id,
  type = 'text',
  ...props
}, ref) => {
  const isRequired = state === 'required'
  const isDisabled = state === 'disabled'
  const isError = !!error
  const inputId = id ?? (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined)

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-[13px] font-bold text-text-primary mb-1.5 tracking-[0.1px]"
        >
          {label}
          {isRequired && <span className="text-primary ml-1">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        {leadingIcon && (
          <span className="absolute left-3 w-[18px] h-[18px] text-tertiary inline-flex items-center justify-center pointer-events-none">
            {leadingIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          disabled={isDisabled || props.disabled}
          required={isRequired}
          className={cn(
            'w-full bg-surface border-[1.5px] rounded-sm',
            'text-text-primary text-[15px] outline-none',
            'transition-all duration-fast',
            'placeholder:text-tertiary',
            platform === 'mobile' ? 'h-12' : 'h-11',
            leadingIcon ? 'pl-9' : 'pl-3.5',
            trailingIcon ? 'pr-11' : 'pr-3.5',
            isError
              ? 'border-error focus-visible:ring-2 focus-visible:ring-error'
              : 'border-border focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary',
            (isDisabled || props.disabled) && 'bg-[#F2E9DC] opacity-70 cursor-not-allowed',
            className,
          )}
          {...props}
        />
        {trailingIcon && (
          <span className="absolute right-1 inline-flex items-center justify-center">
            {trailingIcon}
          </span>
        )}
      </div>
      {(helper || isError) && (
        <div className={cn(
          'text-xs mt-1.5 leading-4 flex items-center gap-1.5',
          isError ? 'text-error' : 'text-text-secondary',
        )}>
          {isError && <ErrorDot />}
          {error || helper}
        </div>
      )}
    </div>
  )
})

Input.displayName = 'Input'

function ErrorDot() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0" fill="none" stroke="currentColor">
      <circle cx="6" cy="6" r="5.5" />
      <path d="M6 3v3.5M6 8.2v.3" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
```

**API**

| prop | type | default | notes |
|---|---|---|---|
| `label` | `string` | — | |
| `helper` | `string` | — | gray helper text below |
| `error` | `string` | — | red text below; takes priority over helper |
| `state` | `'default' \| 'focus' \| 'pressed' \| 'disabled' \| 'required'` | `'default'` | `'required'` adds asterisk to label |
| `platform` | `'mobile' \| 'desktop'` | `'desktop'` | mobile = 48px, desktop = 44px |
| `leadingIcon` | `ReactNode` | — | absolutely positioned at left; input pads `pl-9` |
| `trailingIcon` | `ReactNode` | — | absolutely positioned at right; input pads `pr-11`. Pass `<PasswordToggle>` here. |
| ...native input props | — | — | forwarded via `forwardRef` |

**States**: default · focus (primary ring + caret) · disabled (desaturated bg) · required (asterisk) · error (red border + ring + helper).

---

## 3. Card

**File:** `components/ui/Card.tsx`

```tsx
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

type State = "resting" | "hover" | "pressed" | "selected";
type Platform = "mobile" | "desktop";

export interface CardProps {
  state?: State;
  platform?: Platform;
  compact?: boolean;
  width?: number | string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({
  state = "resting", platform = "desktop", compact = false,
  width, children, className, onClick,
}: CardProps) {
  const isSelected = state === "selected";
  const isHover = state === "hover";
  const isPressed = state === "pressed";

  return (
    <div
      onClick={onClick}
      style={width ? { width } : undefined}
      data-state={state}
      className={cn(
        "relative rounded-xl overflow-hidden bg-surface transition-all duration-base ease-standard",
        platform === "mobile" ? "w-80" : "w-[340px]",
        compact ? "p-0" : platform === "mobile" ? "p-4" : "p-6",
        isSelected
          ? "border-2 border-primary bg-[#FDF1E3] shadow-card-selected"
          : isHover
            ? "border border-border-hover shadow-elevated -translate-y-0.5"
            : isPressed
              ? "border border-border shadow-pressed-inset translate-y-px"
              : "border border-border shadow-resting",
        // Desktop only — hover (no hover on touch)
        platform === "desktop" && !isSelected &&
          "hover:border-border-hover hover:shadow-elevated hover:-translate-y-0.5",
        platform === "mobile" && !isSelected &&
          "active:shadow-pressed-inset active:translate-y-px",
        className,
      )}
    >
      {isSelected && <SelectedCheck />}
      {children}
    </div>
  );
}

const SelectedCheck = () => (
  <div className="absolute top-2.5 right-2.5 z-[2] w-6 h-6 rounded-pill bg-primary text-white shadow-[0_2px_4px_rgba(44,26,14,0.2)] flex items-center justify-center">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 6.5L5 9.5 10 3.5"/>
    </svg>
  </div>
);
```

**API**

| prop | type | default | notes |
|---|---|---|---|
| `state` | `'resting' \| 'hover' \| 'pressed' \| 'selected'` | `'resting'` | hover is desktop-only; mobile uses `active:` (pressed) |
| `platform` | `'mobile' \| 'desktop'` | `'desktop'` | controls hover binding + width default + padding |
| `compact` | `boolean` | `false` | removes inner padding for media-edge content |
| `width` | `number \| string` | — | overrides default 320 (mobile) / 340 (desktop) |

**States**: resting · hover (desktop only — translateY -2, elevated shadow, hover border) · pressed (inset shadow + translateY 1) · selected (2px primary border, warm tint, 4px outer halo, top-right checkmark badge).

---

## 4. Badge

**File:** `components/ui/Badge.tsx`

```tsx
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

type Tone = "primary" | "secondary" | "accent" | "warning" | "error" | "neutral";
type Variant = "solid" | "outline" | "soft";

export interface BadgeProps {
  tone?: Tone;
  variant?: Variant;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const toneStyles: Record<Tone, Record<Variant, string>> = {
  primary: {
    solid:   "bg-primary text-white border-primary",
    outline: "bg-transparent text-primary border-primary",
    soft:    "bg-primary-soft text-primary border-transparent",
  },
  secondary: {
    solid:   "bg-secondary text-white border-secondary",
    outline: "bg-transparent text-secondary border-secondary",
    soft:    "bg-secondary-soft text-secondary border-transparent",
  },
  accent: {
    solid:   "bg-accent text-white border-accent",
    outline: "bg-transparent text-accent border-accent",
    soft:    "bg-accent-soft text-accent border-transparent",
  },
  warning: {
    solid:   "bg-warning text-white border-warning",
    outline: "bg-transparent text-warning border-warning",
    soft:    "bg-warning-soft text-warning border-transparent",
  },
  error: {
    solid:   "bg-error text-white border-error",
    outline: "bg-transparent text-error border-error",
    soft:    "bg-error-soft text-error border-transparent",
  },
  neutral: {
    solid:   "bg-text-secondary text-white border-text-secondary",
    outline: "bg-transparent text-text-secondary border-text-secondary",
    soft:    "bg-border text-text-secondary border-transparent",
  },
};

export function Badge({ tone = "primary", variant = "outline", icon, children, className }: BadgeProps) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[11px] font-bold tracking-[0.5px] uppercase",
      "px-2.5 py-[3px] rounded-pill border whitespace-nowrap",
      variant === "outline" && "border-[1.25px]",
      toneStyles[tone][variant],
      className,
    )}>
      {icon && <span className="inline-flex w-2.5 h-2.5">{icon}</span>}
      {children}
    </span>
  );
}
```

**API**

| prop | type | default |
|---|---|---|
| `tone` | `'primary' \| 'secondary' \| 'accent' \| 'warning' \| 'error' \| 'neutral'` | `'primary'` |
| `variant` | `'solid' \| 'outline' \| 'soft'` | `'outline'` |
| `icon` | `ReactNode` | — |

Used for meal types, difficulty, dietary tags. Always all-caps + 0.5px letter-spacing.

---

## 5. Modal / BottomSheet

**File:** `src/components/ui/Modal.jsx`

Same component, swaps at 768px. On mobile, renders as a bottom sheet. Desktop renders a centered dialog.

```jsx
import { useEffect } from 'react'
import { cn } from '../../lib/utils'

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  actions,
  platform = 'desktop',
  width = 480,
  scrollable = true,
  minHeight,
}) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : 'unset'
    return () => { document.body.style.overflow = 'unset' }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleEscape = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  if (!open) return null

  if (platform === 'mobile') {
    return (
      <BottomSheet
        onClose={onClose}
        title={title}
        subtitle={subtitle}
        actions={actions}
        scrollable={scrollable}
        minHeight={minHeight}
      >
        {children}
      </BottomSheet>
    )
  }

  return (
    <Backdrop onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        style={{ width }}
        className={cn(
          'bg-surface rounded-2xl shadow-modal border border-border',
          'max-w-[calc(100vw-32px)] flex flex-col',
          scrollable && 'max-h-[90vh]',
        )}
      >
        <header className={cn(
          'shrink-0 flex items-start justify-between gap-4 px-7 pt-7 pb-3',
          scrollable && 'sticky top-0 z-10 bg-surface border-b border-border',
        )}>
          <div>
            <h2 id="modal-title" className="font-display text-[24px] font-bold text-text-primary leading-7 -tracking-[0.3px]">
              {title}
            </h2>
            {subtitle && <p className="text-sm text-text-secondary mt-1">{subtitle}</p>}
          </div>
          <CloseBtn onClick={onClose} />
        </header>
        <div className={cn(
          'font-body text-[14px] text-text-secondary leading-[22px] px-7 py-3',
          scrollable ? 'flex-1 min-h-0 overflow-y-auto pb-5' : 'pb-5',
        )}>
          {children}
        </div>
        {actions && (
          <footer className={cn(
            'shrink-0 flex gap-2.5 justify-end px-7 pb-7 pt-3',
            scrollable && 'sticky bottom-0 bg-surface border-t border-border',
          )}>
            {actions}
          </footer>
        )}
      </div>
    </Backdrop>
  )
}

function BottomSheet({ onClose, title, subtitle, actions, scrollable, minHeight, children }) {
  // minHeight gives a "decision moment" treatment: floor at the given value, grow up to 82vh,
  // body scrolls if content exceeds. Implies the same chrome as scrollable=true.
  const usesChrome = scrollable || !!minHeight
  return (
    <Backdrop onClose={onClose} alignBottom>
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'w-full bg-surface rounded-t-2xl shadow-modal flex flex-col overflow-hidden',
          'animate-slide-up',
          minHeight ? 'max-h-[82vh]' : scrollable ? 'h-[82vh]' : 'max-h-[calc(100vh-20px)]',
        )}
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
          ...(minHeight && { minHeight }),
        }}
      >
        <div className="shrink-0 pt-3 pb-1 flex justify-center">
          <div className="w-9 h-1 rounded-pill bg-border" />
        </div>
        <header className={cn(
          'shrink-0 px-5 pt-2 pb-3 flex items-start justify-between gap-4',
          usesChrome && 'border-b border-border',
        )}>
          <div className="flex-1">
            <h2 className="font-display text-[22px] font-bold text-text-primary leading-7">{title}</h2>
            {subtitle && <p className="text-xs text-tertiary mt-0.5">{subtitle}</p>}
          </div>
          <CloseBtn onClick={onClose} />
        </header>
        <div className={cn(
          'flex-1 min-h-0',
          usesChrome ? 'overflow-y-auto' : 'overflow-visible',
        )}>
          {children}
        </div>
        {actions && (
          <footer className={cn(
            'shrink-0 px-5 pt-3.5 pb-5 bg-surface flex flex-col gap-2.5',
            usesChrome && 'border-t border-border shadow-footer-up',
          )}>
            {actions}
          </footer>
        )}
      </div>
    </Backdrop>
  )
}

function Backdrop({ onClose, alignBottom, children }) {
  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={cn(
        'fixed inset-0 z-50 bg-overlay flex justify-center',
        alignBottom ? 'items-end' : 'items-center p-4',
      )}
    >
      {children}
    </div>
  )
}

function CloseBtn({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Close"
      className="w-8 h-8 rounded-pill bg-bg text-text-secondary flex items-center justify-center shrink-0 hover:bg-surface-hover transition-colors"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M2 2l8 8M10 2l-8 8" />
      </svg>
    </button>
  )
}
```

**API**

| prop | type | default | notes |
|---|---|---|---|
| `open` | `boolean` | — | |
| `onClose` | `() => void` | — | |
| `platform` | `'mobile' \| 'desktop'` | `'desktop'` | usually pass via `useMediaQuery('(min-width: 768px)')` |
| `title` | `string` | — | |
| `subtitle` | `string` | — | |
| `width` | `number` | `480` | desktop only |
| `scrollable` | `boolean` | `true` | desktop: enables sticky header/footer + scrollable body. Mobile: fixed 82vh |
| `minHeight` | `string` | — | mobile only. Sets a floor height (e.g. `'50vh'`); sheet grows up to 82vh and body scrolls. Implies sticky header/footer chrome regardless of `scrollable`. |
| `actions` | `ReactNode` | — | button row rendered in footer; always `flex-col` on mobile |

**Mobile variants:**
- **default** (`scrollable=true`, no `minHeight`) — fixed 82vh with scrollable body and sticky header/footer border. For content-heavy sheets (suggest week, add-to-plan).
- **auto-height** (`scrollable=false`, no `minHeight`) — grows to fit content, no sticky chrome. For short confirmation sheets.
- **decision-moment** (`minHeight` set, e.g. `minHeight="50vh"`) — floors at `minHeight` and grows up to 82vh; body scrolls if content overflows. Implies sticky header/footer chrome. Used for the Suggest sheet where the content needs breathing room but shouldn't force a fixed tall height on small recipes.

Note: the previous `variant` enum (`stacked` / `standard` / `scrollable` / `full`) has been replaced by the `scrollable` boolean and `minHeight` string. Footer buttons are always `flex-col` on mobile in the current implementation.

---

## 6. TopAppBar

**File:** `src/components/ui/TopAppBar.jsx`

Single-row mobile app bar. The base spec is a centered title between leading and trailing slots; layout overrides exist for cases where strict centering produces visual asymmetry, and the title accepts arbitrary ReactNode content for branded/multi-color treatments.

```jsx
import { cn } from '../../lib/utils'

export function TopAppBar({
  title,
  showTitle = true,
  leading,
  trailing,
  // Renders an extra element pinned to the bar's far right edge (absolute), independent
  // of the main leading/title/trailing cluster. Used by PlanMobile to separate Sparkles
  // from the ChevronRight that stays adjacent to the centered date title.
  trailingPinRight,
  className,
  // Extra classes applied to the h1 element — use for per-page font-size overrides.
  titleClassName,
  // Shrinks title to content width and centers the whole leading+title+trailing cluster.
  // Use when all three slots are populated and you want them visually grouped (e.g. Plan).
  titleFitContent = false,
  // Absolutely centers the title against the full bar width regardless of leading/trailing
  // asymmetry. Use when leading is empty but trailing is heavy (e.g. Recipes with two icons).
  titleAbsoluteCenter = false,
}) {
  const needsRelative = titleAbsoluteCenter || !!trailingPinRight

  return (
    <div
      className={cn(
        'h-14 shrink-0 w-full bg-bg border-b border-border flex items-center px-2 font-body',
        titleFitContent && 'justify-center gap-1',
        needsRelative && 'relative',
        className,
      )}
    >
      <div
        className={
          titleFitContent
            ? 'flex items-center'
            : 'w-10 flex items-center justify-center'
        }
      >
        {leading}
      </div>

      <h1
        className={cn(
          'text-center font-display text-[18px] font-bold -tracking-[0.1px] truncate',
          // Default color only when title is a plain string. ReactNode titles
          // (e.g. dual-color brand spans) drive their own coloring via inner elements.
          typeof title === 'string' && 'text-text-primary',
          'transition-opacity duration-base',
          titleFitContent
            ? 'px-1'
            : titleAbsoluteCenter
            ? 'absolute left-1/2 -translate-x-1/2 max-w-[60%] pointer-events-none'
            : 'flex-1',
          showTitle ? 'opacity-100' : 'opacity-0',
          titleClassName,
        )}
      >
        {title}
      </h1>

      <div
        className={cn(
          'flex items-center gap-1',
          titleFitContent ? '' : titleAbsoluteCenter ? 'ml-auto' : 'justify-end min-w-10',
        )}
      >
        {trailing}
      </div>

      {trailingPinRight && (
        <div className="absolute right-2 flex items-center">
          {trailingPinRight}
        </div>
      )}
    </div>
  )
}
```

**API**

| prop | type | default | notes |
|---|---|---|---|
| `title` | `string \| ReactNode` | — | string for simple titles; ReactNode for branded treatments (e.g. dual-color spans on Dashboard) |
| `showTitle` | `boolean` | `true` | drive from scroll-position observer; Recipe Detail hides title until hero scrolls past |
| `leading` | `ReactNode` | — | typically `<IconBtn>` with back chevron, or empty |
| `trailing` | `ReactNode` | — | up to 2 `<IconBtn>` (share + overflow) |
| `trailingPinRight` | `ReactNode` | — | extra element pinned to the bar's far right edge, independent of `trailing`. Used by Plan to keep Sparkles at the corner while ChevronRight stays adjacent to the date title. |
| `titleFitContent` | `boolean` | `false` | shrinks title to content width and centers the whole cluster. Used by Plan to group chevrons + date + Sparkles. |
| `titleAbsoluteCenter` | `boolean` | `false` | absolutely centers the title against the full bar width. Used by Recipes when leading is empty but trailing has two icons, so default flex-centering would visually shift the title left. |
| `titleClassName` | `string` | — | extra classes applied to the h1 element. Use for per-page font-size overrides when long titles need to fit (Dashboard's app-name title). |

**States:** title visible / hidden (Recipe Detail). Mobile-only — desktop uses standard top nav (out of scope this batch).

**Layout decision tree:**

- Symmetric or near-symmetric leading/trailing? Use defaults. Title centers via `flex-1`.
- All three slots populated and you want them clustered tightly? Use `titleFitContent`. (Plan)
- Leading empty, trailing populated with multiple icons, title appears off-center? Use `titleAbsoluteCenter`. (Recipes)
- Need to separate one trailing icon from the others (e.g. pin one to the corner)? Use `trailingPinRight` for the corner element, `trailing` for the rest. (Plan)
- Need branded/multi-color title (e.g. dual-color brand)? Pass a ReactNode for `title`. The h1 won't force a color when title is non-string — your spans drive coloring.
- Need a different font-size for a specific page (e.g. long title that needs smaller text)? Pass `titleClassName="text-[15px]"` or similar.

**IconBtn** is exported alongside TopAppBar but is broadly useful — see section 6.5 below.

---

## 6.5. IconBtn

**File:** `src/components/ui/IconBtn.jsx`

40×40 transparent ghost icon button. The default trailing/leading slot pattern for TopAppBar. Also used inline in cards and forms wherever a small no-text action is needed (Add Member in My Household card header, Foods to Avoid + button, etc.).

```jsx
import { cn } from '../../lib/utils'

export function IconBtn({ children, onClick, label, className, disabled, type }) {
  return (
    <button
      type={type}
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className={cn(
        'w-10 h-10 rounded-pill border-none bg-transparent flex items-center justify-center cursor-pointer text-text-primary',
        'hover:bg-surface-hover active:bg-border transition-colors duration-fast',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      )}
    >
      {children}
    </button>
  )
}
```

**API**

| prop | type | default | notes |
|---|---|---|---|
| `children` | `ReactNode` | — | the icon (typically a lucide-react icon at size 18-22) |
| `onClick` | `() => void` | — | |
| `label` | `string` | — | required `aria-label` for accessibility |
| `type` | `'button' \| 'submit' \| 'reset'` | — | pass `'button'` when used inside a `<form>` to prevent accidental form submission |
| `disabled` | `boolean` | `false` | applies opacity 40 + cursor-not-allowed |
| `className` | `string` | — | extra classes (e.g. text color overrides for primary-colored variants) |

40×40 size meets the 44px tap target token at ~2px hit area on each side. Tap target is enforced by the parent context — TopAppBar's 56px height and card header padding both provide adequate spacing.

## 7. BottomTabBar

**File:** `components/nav/BottomTabBar.tsx`

```tsx
import { cn } from "@/lib/utils";

type TabId = "dashboard" | "recipes" | "shopping" | "profile";

export interface BottomTabBarProps {
  active: TabId;
  onChange: (id: TabId) => void;
}

const TABS: { id: TabId; label: string; icon: (active: boolean) => JSX.Element }[] = [
  { id: "dashboard", label: "Plan",     icon: (a) => <CalIcon  active={a} /> },
  { id: "recipes",   label: "Recipes",  icon: (a) => <BookIcon active={a} /> },
  { id: "shopping",  label: "Shopping", icon: (a) => <CartIcon active={a} /> },
  { id: "profile",   label: "Profile",  icon: (a) => <UserIcon active={a} /> },
];

export function BottomTabBar({ active, onChange }: BottomTabBarProps) {
  return (
    <nav className="w-full h-20 bg-surface border-t border-border shadow-tabbar flex font-body pb-4" /* pb-4 = 16px home indicator */>
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex-1 relative flex flex-col items-center justify-center gap-[3px] cursor-pointer",
              isActive ? "text-primary" : "text-tertiary",
            )}
          >
            {isActive && <span className="absolute top-2 w-8 h-[3px] rounded-pill bg-primary" />}
            <span className="mt-1">{t.icon(isActive)}</span>
            <span className={cn("text-[11px] tracking-[0.2px]", isActive ? "font-black" : "font-semibold")}>
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// ── Icons (each is 22×22, 1.7 stroke, currentColor) ─────────────
const CalIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="16" height="14" rx="2.5"/><path d="M7 3v4M15 3v4M3 10h16"/>
  </svg>
);
const BookIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4.5A1.5 1.5 0 015.5 3H17v15H5.5A1.5 1.5 0 014 16.5V4.5z"/><path d="M4 16.5A1.5 1.5 0 015.5 15H17v3.5"/><path d="M8 7h6M8 10h6"/>
  </svg>
);
const CartIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 4h2.5l2 11h10l2-7H7"/><circle cx="9" cy="19" r="1.3"/><circle cx="16" cy="19" r="1.3"/>
  </svg>
);
const UserIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="8" r="3.5"/><path d="M4 19c1.5-3.5 4-5 7-5s5.5 1.5 7 5"/>
  </svg>
);
```

**API**

| prop | type | default | notes |
|---|---|---|---|
| `active` | `'dashboard' \| 'recipes' \| 'shopping' \| 'profile'` | — | `'dashboard'` is labeled "Plan" |
| `onChange` | `(id) => void` | — | route on tap |

64px content + 16px home-indicator safe-area pad = 80px total. Active tab: primary color, underbar pill, font-weight 900.

---

## 8. MacrosRow (saved pattern)

**File:** `components/patterns/MacrosRow.tsx`

```tsx
import { cn } from "@/lib/utils";

export interface MacrosRowProps {
  /** Calories (kcal) */
  cal: string | number;
  /** Protein (g) */
  protein: string | number;
  /** Carbs (g) */
  carbs: string | number;
  /** Fat (g) */
  fat: string | number;
  size?: "mobile" | "desktop";
  className?: string;
}

interface Item { num: string | number; unit: string; label: string; }

export function MacrosRow({ cal, protein, carbs, fat, size = "mobile", className }: MacrosRowProps) {
  const items: Item[] = [
    { num: cal,     unit: "kcal", label: size === "desktop" ? "CALORIES" : "CAL" },
    { num: protein, unit: "g",    label: "PROTEIN" },
    { num: carbs,   unit: "g",    label: "CARBS" },
    { num: fat,     unit: "g",    label: "FAT" },
  ];

  const numCls = size === "desktop"
    ? "text-[28px] leading-[32px] -tracking-[0.4px]"
    : "text-[18px] leading-[22px] -tracking-[0.2px]";
  const unitCls = size === "desktop" ? "text-[14px]" : "text-[10px]";
  const labelCls = size === "desktop" ? "text-[10px] tracking-[1.4px] mt-1" : "text-[9px] tracking-[1px] mt-0.5";

  return (
    <div className={cn(
      "grid grid-cols-4 bg-surface border border-border rounded-lg font-body",
      size === "desktop" ? "py-3.5 px-1" : "py-2.5 px-1",
      className,
    )}>
      {items.map((it, i) => (
        <div
          key={it.label}
          className={cn(
            "text-center",
            i < 3 && "border-r border-border",
          )}
        >
          <div className={cn("font-display font-bold text-text-primary tabular-nums", numCls)}>
            {it.num}
            <span className={cn("font-semibold text-tertiary ml-px", unitCls)}>{it.unit}</span>
          </div>
          <div className={cn("font-bold text-tertiary", labelCls)}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}
```

**API**

| prop | type | default |
|---|---|---|
| `cal` | `string \| number` | — |
| `protein` | `string \| number` | — |
| `carbs` | `string \| number` | — |
| `fat` | `string \| number` | — |
| `size` | `'mobile' \| 'desktop'` | `'mobile'` |

**Rules** (saved with the pattern):
- USE: daily macro targets (Profile), per-recipe macros (Recipe Detail), 4-up nutrition summary anywhere on a phone row.
- DO NOT: add a 5th column · use proportional figures (must be tabular-nums).

---

## 9. DestructivePreview (saved pattern)

**File:** `components/patterns/DestructivePreview.tsx`

```tsx
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export interface DestructivePreviewProps {
  /** Bold lead — names the action (e.g. "Will replace 3 meals"). */
  headline: string;
  /** What specifically will change. Use ReactNode to mark replaced items. */
  detail: ReactNode;
  className?: string;
}

export function DestructivePreview({ headline, detail, className }: DestructivePreviewProps) {
  return (
    <div className={cn(
      "p-3 bg-primary-tint-2 rounded-md border border-[#F0D6BC] flex gap-2.5 items-start font-body",
      className,
    )}>
      <span className="inline-flex w-4 h-4 text-primary shrink-0 mt-0.5">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5M8 11v.01"/>
        </svg>
      </span>
      <div className="text-[13px] text-[#7A4528] leading-[18px]">
        <span className="font-bold">{headline}</span>
        {" "}
        {detail}
      </div>
    </div>
  );
}
```

**API**

| prop | type |
|---|---|
| `headline` | `string` — bold action name |
| `detail` | `ReactNode` — specifics |

**Rules** (saved with the pattern):
- USE: Add-to-meal-plan onto an occupied slot · Suggest sheet preview · any bulk overwrite.
- ALWAYS visible when relevant. Predictable beats fuzzy on destructive actions.
- Name the specific item — never "this slot".
- Warm tint, never red. Replace ≠ delete.

---

## 10. Select

**File:** `src/components/ui/Select.jsx`

Custom portal-based dropdown. Replaces native `<select>` to enable full design system color and styling control over the option list.

```jsx
import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '../../lib/utils'

export function Select({
  label,
  value,
  onChange,
  options = [],
  placeholder = 'Select...',
  error,
  platform = 'desktop',
  disabled = false,
  className,
  id,
  name,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef(null)
  const popoverRef = useRef(null)

  const selectedOption = options.find((opt) => String(opt.value) === String(value))
  const triggerLabel = selectedOption?.label ?? placeholder
  const isPlaceholder = !selectedOption

  // Position popover (with flip-up if no room below). Listens for scroll/resize.
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return
    const updatePosition = () => {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      const estPopoverHeight = Math.min(288, options.length * 44 + 8)
      const spaceBelow = window.innerHeight - rect.bottom
      const flipUp = spaceBelow < estPopoverHeight + 16 && rect.top > estPopoverHeight + 16
      setPosition({
        top: flipUp ? rect.top - estPopoverHeight - 4 : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      })
    }
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isOpen, options.length])

  const commit = (val) => {
    onChange?.(val)
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (disabled) return
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setIsOpen(true)
      }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); setIsOpen(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex((i) => Math.min(options.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlightedIndex((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightedIndex >= 0 && options[highlightedIndex]) commit(options[highlightedIndex].value)
    } else if (e.key === 'Tab') { setIsOpen(false) }
  }

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-[13px] font-bold text-text-primary mb-1.5 tracking-[0.1px]">
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        className={cn(
          'w-full bg-surface border-[1.5px] rounded-sm flex items-center text-left',
          'text-[15px] outline-none transition-colors duration-fast font-body',
          'pr-9 pl-3.5 relative',
          platform === 'mobile' ? 'h-12' : 'h-11',
          error
            ? 'border-error focus-visible:ring-2 focus-visible:ring-error'
            : 'border-border focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary',
          isOpen && !error && 'border-primary',
          disabled && 'bg-[#F2E9DC] opacity-70 cursor-not-allowed',
          isPlaceholder ? 'text-tertiary' : 'text-text-primary',
          className,
        )}
      >
        <span className="truncate flex-1">{triggerLabel}</span>
        <ChevronDown
          size={16}
          className={cn('absolute right-3 top-1/2 -translate-y-1/2 text-tertiary transition-transform duration-fast', isOpen && 'rotate-180')}
        />
      </button>
      {error && <p className="text-xs mt-1.5 leading-4 text-error">{error}</p>}

      {isOpen && typeof document !== 'undefined' && createPortal(
        <ul
          ref={popoverRef}
          role="listbox"
          style={{ position: 'fixed', top: position.top, left: position.left, width: position.width }}
          className="z-[60] max-h-72 overflow-y-auto bg-surface border border-border rounded-md shadow-elevated py-1"
        >
          {options.map((opt, idx) => {
            const isSelected = String(opt.value) === String(value)
            const isHighlighted = idx === highlightedIndex
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onClick={() => commit(opt.value)}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={cn(
                  'min-h-11 px-4 py-3 text-[15px] font-body cursor-pointer flex items-center gap-2',
                  isSelected ? 'bg-primary-tint text-primary font-bold' : isHighlighted ? 'bg-surface-hover text-text-primary' : 'text-text-primary',
                )}
              >
                <span className="flex-1 truncate">{opt.label}</span>
                {isSelected && <Check size={16} className="shrink-0 text-primary" />}
              </li>
            )
          })}
        </ul>,
        document.body,
      )}
    </div>
  )
}
```

**API**

| prop | type | default | notes |
|---|---|---|---|
| `label` | `string` | — | |
| `value` | `string \| number` | — | |
| `onChange` | `(value) => void` | — | receives raw option value, not an event |
| `options` | `{ value, label }[]` | `[]` | |
| `placeholder` | `string` | `'Select...'` | shown when no option is selected |
| `error` | `string` | — | red border + error text below |
| `platform` | `'mobile' \| 'desktop'` | `'desktop'` | mobile = 48px, desktop = 44px |
| `disabled` | `boolean` | `false` | |
| `className` | `string` | — | applied to the trigger button |
| `id` | `string` | — | auto-generated from label if omitted |
| `name` | `string` | — | passed to trigger button for form name semantics |

**Notes:** The option list renders via `createPortal` into `document.body` to escape modal/scroll container overflow clipping. Position is recalculated from `getBoundingClientRect` on every scroll and resize event; flip-up activates when insufficient room below and enough room above. Keyboard: Enter/Space/ArrowDown open; ArrowUp/ArrowDown navigate; Enter commits; Escape closes without commit; Tab closes. Tradeoff: fully custom-styled list replaces the native iOS picker on mobile.

---

## 11. Checkbox

**File:** `src/components/ui/Checkbox.jsx`

Styled checkbox backed by a visually-hidden native `<input type="checkbox">`. Uses Tailwind `peer` to drive the visible indicator from the hidden input's checked state.

```jsx
import { Check } from 'lucide-react'
import { cn } from '../../lib/utils'

export function Checkbox({ label, children, checked, onChange, disabled, className }) {
  const content =
    children ??
    (label && <span className="text-[15px] font-body text-text-primary">{label}</span>)

  return (
    <label
      className={cn(
        'inline-flex items-center gap-2 cursor-pointer',
        disabled && 'cursor-not-allowed opacity-40',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={!!checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="sr-only peer"
      />
      <span
        className={cn(
          'w-5 h-5 rounded-sm border-2 flex items-center justify-center shrink-0 transition-colors',
          checked ? 'border-primary bg-primary' : 'border-border bg-surface',
          'peer-focus-visible:shadow-ring-input',
        )}
      >
        {checked && <Check size={14} strokeWidth={3} className="text-white" />}
      </span>
      {content}
    </label>
  )
}
```

**API**

| prop | type | default | notes |
|---|---|---|---|
| `label` | `string` | — | renders as a `<span>` to the right of the box |
| `children` | `ReactNode` | — | takes precedence over `label`; use for rich label content |
| `checked` | `boolean` | — | |
| `onChange` | `(checked: boolean) => void` | — | receives the boolean value, not an event |
| `disabled` | `boolean` | — | dims the whole label + disables interaction |
| `className` | `string` | — | applied to the outer `<label>` |

---

## 12. RadioGroup

**File:** `src/components/ui/RadioGroup.jsx`

Wraps multiple visually-hidden native radio inputs with styled outer rings. Lays options in a `flex-wrap` row.

```jsx
import { cn } from '../../lib/utils'

export function RadioGroup({ label, value, onChange, options, name }) {
  const groupName = name ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : 'radio-group')

  return (
    <div>
      {label && (
        <label className="block text-[13px] font-bold text-text-primary mb-1.5 tracking-[0.1px]">
          {label}
        </label>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {options.map((opt) => {
          const isSelected = value === opt.value
          const inputId = `radio-${groupName}-${opt.value}`
          return (
            <label
              key={opt.value}
              htmlFor={inputId}
              className="flex items-center gap-2 cursor-pointer min-h-11"
            >
              <input
                type="radio"
                id={inputId}
                name={groupName}
                value={opt.value}
                checked={isSelected}
                onChange={() => onChange(opt.value)}
                className="sr-only"
              />
              <div
                className={cn(
                  'w-5 h-5 rounded-pill border-2 flex items-center justify-center shrink-0 transition-colors',
                  isSelected ? 'border-primary' : 'border-border',
                )}
              >
                {isSelected && <div className="w-2.5 h-2.5 rounded-pill bg-primary" />}
              </div>
              <span className="text-[15px] font-body text-text-primary">{opt.label}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
```

**API**

| prop | type | default | notes |
|---|---|---|---|
| `label` | `string` | — | group label rendered above options |
| `value` | `string \| number` | — | currently selected value |
| `onChange` | `(value) => void` | — | receives the selected option's value |
| `options` | `{ value, label }[]` | — | |
| `name` | `string` | — | HTML radio `name` attribute; auto-generated from `label` if omitted |

---

## 13. SegmentedControl

**File:** `src/components/ui/SegmentedControl.jsx`

Pill container with inline option buttons. The selected option gets `bg-primary text-white`. Used for binary/ternary unit toggles (ft/in vs cm, lbs vs kg in the TDEE section of Profile).

```jsx
import { cn } from '../../lib/utils'

export function SegmentedControl({ options, value, onChange, 'aria-label': ariaLabel }) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-[3px] p-[3px] bg-surface border border-border rounded-pill"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-4 py-1.5 rounded-pill text-sm font-semibold font-body transition-all duration-fast',
            value === opt.value
              ? 'bg-primary text-white shadow-sm'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
```

**API**

| prop | type | default | notes |
|---|---|---|---|
| `options` | `{ value, label }[]` | — | |
| `value` | `string \| number` | — | currently selected value |
| `onChange` | `(value) => void` | — | |
| `aria-label` | `string` | — | required for accessibility; describes the group |

---

## 14. PasswordToggle

**File:** `src/components/ui/PasswordToggle.jsx`

Eye / EyeOff icon button for toggling password field visibility. Pass into `Input`'s `trailingIcon` prop.

```jsx
import { Eye, EyeOff } from 'lucide-react'

export function PasswordToggle({ visible, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={visible ? 'Hide password' : 'Show password'}
      className="w-10 h-10 flex items-center justify-center text-tertiary hover:text-text-primary active:text-text-primary transition-colors"
    >
      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  )
}
```

**API**

| prop | type | notes |
|---|---|---|
| `visible` | `boolean` | `true` = password text visible (shows EyeOff); `false` = masked (shows Eye) |
| `onClick` | `() => void` | toggle handler |

**Usage pattern:**
```jsx
const [showPassword, setShowPassword] = useState(false)

<Input
  label="Password"
  type={showPassword ? 'text' : 'password'}
  trailingIcon={
    <PasswordToggle visible={showPassword} onClick={() => setShowPassword((s) => !s)} />
  }
/>
```

The button is 40×40 with `type="button"` to prevent accidental form submission. `aria-label` updates dynamically with the visibility state. Note: this is a standalone `<button>`, not an `IconBtn` — it uses tertiary-to-body color transition instead of `text-text-primary` at rest.

---

## Compositional notes

- **Phone frame** is design-canvas chrome only. Production renders directly into the device viewport.
- **All components are flex/grid + gap** — no inline sibling whitespace flow. Drag-reorder safe.
- **Hover states are bound to `platform="desktop"` or `md:`** — never to viewport-only media queries. Touch never hovers.
- **Tap targets**: every interactive element ≥ 44px on mobile (`tap-min-mobile` token). `Button.sm` is desktop-only.
