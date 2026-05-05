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

**File:** `components/ui/Input.tsx`

```tsx
import { cn } from "@/lib/utils";
import { InputHTMLAttributes, ReactNode } from "react";

type State = "default" | "focus" | "pressed" | "disabled" | "required";
type Platform = "mobile" | "desktop";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  helper?: string;
  error?: string;
  state?: State;
  platform?: Platform;
  leadingIcon?: ReactNode;
}

export function Input({
  label, helper, error, state = "default",
  platform = "desktop", leadingIcon,
  className, id, ...rest
}: InputProps) {
  const isRequired = state === "required";
  const isError = !!error;
  const inputId = id ?? `input-${label?.toLowerCase().replace(/\s+/g, "-")}`;

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
      <div
        className={cn(
          "flex items-center bg-surface border-[1.5px] rounded-sm transition-all duration-fast",
          platform === "mobile" ? "h-12" : "h-11",
          leadingIcon ? "pl-3 pr-3.5" : "px-3.5",
          isError ? "border-error focus-within:shadow-ring-error"
                  : "border-border focus-within:border-primary focus-within:shadow-ring-input",
          state === "disabled" && "bg-[#F2E9DC] opacity-70",
        )}
      >
        {leadingIcon && (
          <span className="w-[18px] h-[18px] mr-2.5 text-tertiary inline-flex items-center justify-center">
            {leadingIcon}
          </span>
        )}
        <input
          id={inputId}
          disabled={state === "disabled"}
          required={isRequired}
          className={cn(
            "flex-1 bg-transparent outline-none text-[15px] leading-none",
            "placeholder:text-tertiary text-text-primary",
            className,
          )}
          {...rest}
        />
      </div>
      {(helper || error) && (
        <div className={cn(
          "text-xs mt-1.5 leading-4 flex items-center gap-1.5",
          error ? "text-error" : "text-text-secondary",
        )}>
          {error && <ErrorDot />}
          {error || helper}
        </div>
      )}
    </div>
  );
}

const ErrorDot = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0">
    <circle cx="6" cy="6" r="5.5" fill="none" stroke="currentColor" />
    <path d="M6 3v3.5M6 8.2v.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
```

**API**

| prop | type | default | notes |
|---|---|---|---|
| `label` | `string` | — | |
| `helper` | `string` | — | gray helper text below |
| `error` | `string` | — | red text below; takes priority over helper |
| `state` | `'default' \| 'focus' \| 'pressed' \| 'disabled' \| 'required'` | `'default'` | `'required'` adds asterisk to label |
| `platform` | `'mobile' \| 'desktop'` | `'desktop'` | mobile = 48px, desktop = 44px |
| `leadingIcon` | `ReactNode` | — | |
| ...native input props | — | — | |

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

**File:** `components/ui/Modal.tsx`

Same component, swaps at 768px. On mobile, renders as a bottom sheet with 4 layout variants.

```tsx
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

type Platform = "mobile" | "desktop";
/** Mobile sheet variants — desktop ignores this. */
type Variant = "stacked" | "standard" | "scrollable" | "full";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  platform?: Platform;
  variant?: Variant;
  title: string;
  subtitle?: string;
  width?: number;
  actions?: ReactNode;       // button row — children of footer
  children: ReactNode;
}

export function Modal({
  open, onClose, platform = "desktop",
  variant = "stacked", title, subtitle, width = 520,
  actions, children,
}: ModalProps) {
  if (!open) return null;
  if (platform === "mobile") {
    return (
      <BottomSheet
        onClose={onClose} variant={variant}
        title={title} subtitle={subtitle} actions={actions}
      >{children}</BottomSheet>
    );
  }
  return (
    <Backdrop onClose={onClose}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="modal-title"
        style={{ width }}
        className="bg-surface rounded-2xl shadow-modal border border-border p-7 max-w-[calc(100vw-32px)]"
      >
        <header className="flex justify-between items-start gap-4 mb-3">
          <div>
            <h2 id="modal-title" className="font-display text-[24px] font-bold text-text-primary leading-7 -tracking-[0.3px]">
              {title}
            </h2>
            {subtitle && <p className="text-sm text-text-secondary mt-1">{subtitle}</p>}
          </div>
          <CloseBtn onClick={onClose} />
        </header>
        <div className="font-body text-[14px] text-text-secondary leading-[22px] mb-5">
          {children}
        </div>
        {actions && <footer className="flex gap-2.5 justify-end">{actions}</footer>}
      </div>
    </Backdrop>
  );
}

interface SheetInnerProps {
  onClose: () => void;
  variant: Variant;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

function BottomSheet({ onClose, variant, title, subtitle, actions, children }: SheetInnerProps) {
  const isFull   = variant === "full";
  const isScroll = variant === "scrollable";
  const isRow    = variant === "standard" || isScroll || isFull;

  return (
    <Backdrop onClose={onClose} alignBottom>
      <div
        role="dialog" aria-modal="true"
        className={cn(
          "w-full bg-surface rounded-t-2xl shadow-modal flex flex-col overflow-hidden",
          isFull   && "h-[92vh]",
          isScroll && "h-[82vh]",
          (variant === "stacked" || variant === "standard") && "max-h-[calc(100vh-20px)]",
        )}
      >
        <header className={cn(
          "shrink-0 pt-3 pb-2.5",
          (isScroll || isFull) && "border-b border-border",
        )}>
          <div className="w-10 h-1 rounded-pill bg-border mx-auto mb-2.5" />
          <div className="px-5 flex justify-between items-start gap-4">
            <div className="flex-1">
              <h2 className="font-display text-[22px] font-bold text-text-primary leading-7">{title}</h2>
              {subtitle && <p className="text-xs text-tertiary mt-0.5">{subtitle}</p>}
            </div>
            <CloseBtn onClick={onClose} />
          </div>
        </header>
        <div className={cn(
          "flex-1 min-h-0",
          (isScroll || isFull) ? "overflow-y-auto" : "overflow-visible",
        )}>
          {children}
        </div>
        {actions && (
          <footer className={cn(
            "shrink-0 px-5 pt-3.5 pb-5 bg-surface flex gap-2.5",
            isRow ? "flex-row" : "flex-col",
            (isScroll || isFull) && "border-t border-border shadow-footer-up",
          )}>
            {actions}
          </footer>
        )}
      </div>
    </Backdrop>
  );
}

function Backdrop({ onClose, alignBottom, children }: { onClose: () => void; alignBottom?: boolean; children: ReactNode }) {
  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={cn(
        "fixed inset-0 z-50 bg-overlay flex justify-center",
        alignBottom ? "items-end" : "items-center p-4",
      )}
    >
      {children}
    </div>
  );
}

function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Close"
      className="w-8 h-8 rounded-pill border-none bg-bg text-text-secondary cursor-pointer flex items-center justify-center shrink-0 hover:bg-surface-hover"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M2 2l8 8M10 2l-8 8"/>
      </svg>
    </button>
  );
}
```

**API**

| prop | type | default | notes |
|---|---|---|---|
| `open` | `boolean` | — | |
| `onClose` | `() => void` | — | |
| `platform` | `'mobile' \| 'desktop'` | `'desktop'` | usually pass via `useMediaQuery('(min-width: 768px)')` |
| `variant` | `'stacked' \| 'standard' \| 'scrollable' \| 'full'` | `'stacked'` | mobile only |
| `title` | `string` | — | |
| `subtitle` | `string` | — | |
| `width` | `number` | `520` | desktop only |
| `actions` | `ReactNode` | — | button row, rendered in footer |

**Mobile variants:**
- `stacked` — auto-height; footer buttons stack column. For destructive/single-primary flows.
- `standard` — auto-height; footer buttons side-by-side. For 2-button confirms.
- `scrollable` — fixed 82vh with scrollable body and sticky header/footer.
- `full` — fixed 92vh, near-fullscreen. (Note: Add Recipe is a full-page route on mobile, not a `full` modal.)

---

## 6. TopAppBar

**File:** `components/nav/TopAppBar.tsx`

Single-row mobile app bar that replaces the legacy stacked navbars.

```tsx
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export interface TopAppBarProps {
  title: string;
  /** When true, title hides until the page is scrolled past the hero. Set via parent's IntersectionObserver. */
  showTitle?: boolean;
  leading?: ReactNode;        // back button etc.
  trailing?: ReactNode;       // up to 2 icon buttons
  className?: string;
}

export function TopAppBar({ title, showTitle = true, leading, trailing, className }: TopAppBarProps) {
  return (
    <div className={cn(
      "h-14 shrink-0 w-full bg-bg border-b border-border flex items-center px-2 font-body",
      className,
    )}>
      <div className="w-10 flex items-center justify-center">{leading}</div>
      <h1
        className={cn(
          "flex-1 text-center font-display text-[18px] font-bold text-text-primary -tracking-[0.1px] truncate",
          "transition-opacity duration-base",
          showTitle ? "opacity-100" : "opacity-0",
        )}
      >
        {title}
      </h1>
      <div className="flex items-center justify-end gap-1 min-w-10">{trailing}</div>
    </div>
  );
}

export function IconBtn({
  children, onClick, label,
}: { children: ReactNode; onClick?: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="w-10 h-10 rounded-pill border-none bg-transparent flex items-center justify-center cursor-pointer text-text-primary hover:bg-surface-hover active:bg-border"
    >
      {children}
    </button>
  );
}
```

**API**

| prop | type | default | notes |
|---|---|---|---|
| `title` | `string` | — | |
| `showTitle` | `boolean` | `true` | drive from scroll-position observer; Recipe Detail hides title until hero scrolls past |
| `leading` | `ReactNode` | — | typically `<IconBtn>` with back chevron |
| `trailing` | `ReactNode` | — | up to 2 `<IconBtn>` (share + overflow) |

**States:** title visible / hidden (Recipe Detail). Mobile-only — desktop uses standard top nav (out of scope this batch).

---

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

## Compositional notes

- **Phone frame** is design-canvas chrome only. Production renders directly into the device viewport.
- **All components are flex/grid + gap** — no inline sibling whitespace flow. Drag-reorder safe.
- **Hover states are bound to `platform="desktop"` or `md:`** — never to viewport-only media queries. Touch never hovers.
- **Tap targets**: every interactive element ≥ 44px on mobile (`tap-min-mobile` token). `Button.sm` is desktop-only.
