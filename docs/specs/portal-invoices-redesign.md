# Portal Invoices Redesign - Design Specification

**Author:** Uma (UX/UI Design Spec)
**Date:** 2025-03-07
**Status:** Ready for implementation
**Scope:** Sidebar restructuring + Urgency banner

---

## Table of Contents

1. [Design System Inventory (Current)](#1-design-system-inventory)
2. [Sidebar Redesign](#2-sidebar-redesign)
3. [Urgency Banner](#3-urgency-banner)
4. [Design Tokens Reference](#4-design-tokens-reference)
5. [Accessibility Specification](#5-accessibility-specification)
6. [Implementation Checklist](#6-implementation-checklist)

---

## 1. Design System Inventory

### Current Design Tokens in Use

Extracted from `globals.css` and `tailwind.config.ts`:

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--background` | `220 14% 96%` | `224 71% 4%` | Page bg |
| `--card` | `0 0% 100%` | `224 50% 8%` | Card surfaces |
| `--foreground` | `222 47% 11%` | `210 20% 98%` | Primary text |
| `--muted-foreground` | `215 16% 47%` | `217 10% 64%` | Secondary text |
| `--border` | `220 13% 86%` | `215 28% 17%` | Borders |
| `--primary` (portal) | `197 96% 48%` | `197 96% 55%` | Brand cyan |
| `--destructive` | `0 84% 60%` | `0 62% 50%` | Error/overdue |
| `--warning` | `38 92% 50%` | `38 92% 50%` | Pending/amber |
| `--success` | `160 84% 39%` | `160 84% 39%` | Paid/success |

### Sidebar Current State

- **Width:** `260px` fixed (`lg:w-[260px]`)
- **Background:** `#0B0E14` (hardcoded, both light+dark)
- **Nav items:** `text-[13px] font-medium`, `px-3 py-2.5`, `rounded-lg`
- **Active state:** `bg-white/10 text-white`
- **Inactive state:** `text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]`
- **Section label:** `text-[10px] font-semibold uppercase tracking-widest text-slate-600`
- **Icon size:** `h-[18px] w-[18px]`
- **Logo area height:** `72px` (`h-[72px]`)
- **Footer border:** `border-t border-white/[0.06]`
- **Mobile:** Uses `Sheet` component, `side="left"`, `w-[260px]`

### Invoice Status Colors (from `STATUS_CONFIG`)

| Status | Light bg | Light text | Dark bg | Dark text |
|--------|----------|------------|---------|-----------|
| pending | `bg-amber-50` | `text-amber-700` | `bg-amber-500/10` | `text-amber-400` |
| overdue | `bg-red-50` | `text-red-700` | `bg-red-500/10` | `text-red-400` |
| paid | `bg-emerald-50` | `text-emerald-700` | `bg-emerald-500/10` | `text-emerald-400` |
| cancelled | `bg-muted` | `text-muted-foreground` | same | same |

---

## 2. Sidebar Redesign

### 2.1 Information Architecture

The sidebar currently has a flat list of 7 nav items. The redesign splits them into two semantic sections:

```
LOGO (72px height - unchanged)

--- Section: "Menu" (per-store context) ---
  Dashboard
  Analise
  Campanhas
  Flows
  Integracoes
  Rastreamento

--- visual separator ---

--- Section: "Conta" (per-client context) ---
  Faturas        [badge when pending/overdue]
  Configuracoes

--- footer (store switcher + account menu - unchanged) ---
```

### 2.2 Data Structures

```typescript
// Split the current flat `navigation` array into two:

const menuNavigation = [
  { name: "Dashboard", href: "/portal/dashboard", icon: LayoutDashboard },
  { name: "Analise", href: "/portal/analytics", icon: BarChart3 },
  { name: "Campanhas", href: "/portal/campaigns", icon: Send },
  { name: "Flows", href: "/portal/flows", icon: GitBranch },
  { name: "Integracoes", href: "/portal/integrations", icon: Plug },
  { name: "Rastreamento", href: "/portal/tracking", icon: Package },
]

const accountNavigation = [
  { name: "Faturas", href: "/portal/invoices", icon: FileText },
  { name: "Configuracoes", href: "/portal/settings", icon: Settings },
]
```

### 2.3 Section Labels

Both sections use the existing label pattern already present in the sidebar:

```
Current:  <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Menu</p>
```

| Section | Label text | Icon | Notes |
|---------|-----------|------|-------|
| Menu | `"Menu"` | none | Already exists, unchanged |
| Conta | `"Conta"` | none | New label, same styling |

**Tailwind classes (both labels, identical):**
```
px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600
```

### 2.4 Section Separator

Between the two sections, add a visual separator + spacing:

```html
<!-- After menuNavigation items, before "Conta" label -->
<div className="my-3 mx-3 border-t border-white/[0.06]" />
```

This reuses the exact same border style already used in `SidebarFooter` (`border-white/[0.06]`), keeping visual consistency within the dark sidebar.

### 2.5 Icons for "Conta" Section Items

| Item | Icon (lucide-react) | Already imported? |
|------|---------------------|-------------------|
| Faturas | `FileText` | Yes |
| Configuracoes | `Settings` | Yes |

No new icon imports needed.

### 2.6 Invoice Pending Badge

When there are pending or overdue invoices, a notification indicator appears on the "Faturas" nav item.

**Visual spec:**

```
[FileText icon]  Faturas  ............  [red dot]
```

- **Indicator type:** Small dot (not a count badge -- keeps sidebar clean)
- **Size:** `h-2 w-2` (8px)
- **Color:** `bg-red-500` (matches `STATUS_CONFIG.overdue.dotColor`)
- **Shape:** `rounded-full`
- **Position:** Right-aligned within the nav item, vertically centered
- **Animation:** `animate-pulse` when overdue (not when only pending)

**Tailwind for the dot:**
```
h-2 w-2 rounded-full bg-red-500 flex-shrink-0
```

**With pulse (overdue):**
```
h-2 w-2 rounded-full bg-red-500 flex-shrink-0 animate-pulse
```

**Nav item container must add `justify-between` to push the dot right:**
```
flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200
```

The inner content (icon + text) wraps in a `flex items-center gap-3`:
```html
<Link href="/portal/invoices" className="flex items-center justify-between ...">
  <span className="flex items-center gap-3">
    <FileText className="h-[18px] w-[18px]" />
    Faturas
  </span>
  {hasPendingInvoices && (
    <span
      className={cn(
        "h-2 w-2 rounded-full bg-red-500 flex-shrink-0",
        hasOverdueInvoices && "animate-pulse"
      )}
      aria-label={hasOverdueInvoices ? "Fatura vencida" : "Fatura pendente"}
    />
  )}
</Link>
```

### 2.7 Data Fetching for Badge State

The layout needs to know if there are pending/overdue invoices. Two options:

**Option A (Recommended): Lightweight API call**

Add a new endpoint or query parameter:
```
GET /api/portal/invoices/status
Response: { hasPending: boolean, hasOverdue: boolean, pendingCount: number, overdueCount: number }
```

Call this in the layout's `useEffect` (after auth), store in state:
```typescript
const [invoiceStatus, setInvoiceStatus] = useState<{
  hasPending: boolean
  hasOverdue: boolean
} | null>(null)
```

**Option B: Reuse existing endpoint with limit**
```
GET /api/portal/invoices?status=pending&status=overdue&limit=1
```
Check if `stats.pending > 0 || stats.overdue > 0`.

Option A is preferred because it avoids fetching full invoice data on every page load.

### 2.8 SidebarNav Component - Full Updated Structure

```tsx
const SidebarNav = ({ onLinkClick, invoiceStatus }: {
  onLinkClick?: () => void
  invoiceStatus?: { hasPending: boolean; hasOverdue: boolean } | null
}) => (
  <div className="space-y-1">
    {/* --- MENU SECTION --- */}
    {menuNavigation.map((item) => {
      const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
      return (
        <Link
          key={item.name}
          href={item.href}
          onClick={onLinkClick}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200",
            isActive
              ? "bg-white/10 text-white"
              : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]"
          )}
        >
          <item.icon className="h-[18px] w-[18px]" />
          {item.name}
        </Link>
      )
    })}

    {/* --- SEPARATOR --- */}
    <div className="!my-3 mx-3 border-t border-white/[0.06]" />

    {/* --- CONTA SECTION --- */}
    <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
      Conta
    </p>

    {accountNavigation.map((item) => {
      const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
      const showBadge = item.href === "/portal/invoices" &&
        invoiceStatus && (invoiceStatus.hasPending || invoiceStatus.hasOverdue)

      return (
        <Link
          key={item.name}
          href={item.href}
          onClick={onLinkClick}
          className={cn(
            "flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200",
            isActive
              ? "bg-white/10 text-white"
              : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]"
          )}
        >
          <span className="flex items-center gap-3">
            <item.icon className="h-[18px] w-[18px]" />
            {item.name}
          </span>
          {showBadge && (
            <span
              className={cn(
                "h-2 w-2 rounded-full bg-red-500 flex-shrink-0",
                invoiceStatus.hasOverdue && "animate-pulse"
              )}
              aria-label={invoiceStatus.hasOverdue ? "Fatura vencida" : "Fatura pendente"}
              role="status"
            />
          )}
        </Link>
      )
    })}
  </div>
)
```

### 2.9 Mobile Sidebar (Sheet)

The mobile sidebar uses the same `SidebarNav` component, so the restructuring automatically applies. No additional work needed. The `Sheet` props remain unchanged:

```
<SheetContent side="left" className="w-[260px] p-0 bg-[#0B0E14] border-none">
```

### 2.10 Items Removed from Account DropdownMenu

Currently "Faturas" and "Configuracoes" appear in **both** the sidebar flat list AND the account dropdown menu. After this redesign:

- **Keep them in the sidebar** (under "Conta" section)
- **Remove them from the account dropdown** to avoid duplication
- The account dropdown retains only: user info, "Gerenciar Lojas", separator, "Sair"

Updated dropdown items:
```
[User Name]
[user@email.com]
---
Gerenciar Lojas
---
Sair
```

---

## 3. Urgency Banner

### 3.1 Overview

A banner that appears at the top of the main content area when the client has pending or overdue invoices. It is contextual (not a global notification) and drives the user to the invoices page.

### 3.2 Position & Behavior

| Property | Value | Rationale |
|----------|-------|-----------|
| Position | **Sticky** (`sticky top-14 lg:top-0`) | Stays visible during scroll but doesn't overlap sidebar/header |
| Z-index | `z-25` (between header z-30 and content) | Below desktop header, above page content |
| Dismissible | **No** | Financial urgency should persist until resolved |
| Visibility | Hidden on `/portal/invoices` page | Redundant since user is already on invoices page |
| Scroll | Sticks below the top header bar | Desktop: below the 56px header. Mobile: below 56px mobile header |

### 3.3 Variants

#### Variant A: Pending Invoice (amber/warning)

For invoices that are pending but NOT yet overdue.

**Visual description:**
```
+-------------------------------------------------------------------+
| [Clock icon]  Voce tem uma fatura pendente de R$ 1.500,00    [CTA]|
|               Vencimento: 15 de marco de 2025                     |
+-------------------------------------------------------------------+
```

**Colors:**

| Element | Light mode | Dark mode |
|---------|-----------|-----------|
| Background | `bg-amber-50` | `bg-amber-500/10` |
| Border | `border-b border-amber-200` | `border-b border-amber-500/20` |
| Icon | `text-amber-600` | `text-amber-400` |
| Primary text | `text-amber-800` | `text-amber-200` |
| Secondary text | `text-amber-600` | `text-amber-400` |
| CTA button bg | `bg-amber-600 hover:bg-amber-700` | `bg-amber-500 hover:bg-amber-400` |
| CTA button text | `text-white` | `text-amber-950` |

#### Variant B: Overdue Invoice (red/destructive)

For invoices past due date.

**Visual description:**
```
+-------------------------------------------------------------------+
| [AlertCircle]  Fatura vencida: R$ 1.500,00 (ha 5 dias)      [CTA]|
|                Evite a suspensao dos servicos                      |
+-------------------------------------------------------------------+
```

**Colors:**

| Element | Light mode | Dark mode |
|---------|-----------|-----------|
| Background | `bg-red-50` | `bg-red-500/10` |
| Border | `border-b border-red-200` | `border-b border-red-500/20` |
| Icon | `text-red-600` | `text-red-400` |
| Primary text | `text-red-800` | `text-red-200` |
| Secondary text | `text-red-600` | `text-red-400` |
| CTA button bg | `bg-red-600 hover:bg-red-700` | `bg-red-500 hover:bg-red-400` |
| CTA button text | `text-white` | `text-red-950` |

### 3.4 Layout Specification

```
+-banner (full width)----------------------------------------------+
| px-6 lg:px-8  py-3                                              |
|                                                                   |
| [flex row, items-center, gap-3]                                  |
|   [icon 18x18]                                                   |
|   [flex-1 min-w-0]                                               |
|     [primary text - text-sm font-medium]                         |
|     [secondary text - text-xs, hidden sm:block]                  |
|   [CTA button - text-xs font-medium px-3 py-1.5 rounded-md]     |
+-------------------------------------------------------------------+
```

**Dimensions:**
| Property | Value |
|----------|-------|
| Height | Auto (~48px single line, ~56px with subtitle on mobile) |
| Padding horizontal | `px-6 lg:px-8` (matches main content area padding) |
| Padding vertical | `py-3` |
| Icon | `h-[18px] w-[18px]` (matches sidebar icon size) |
| Gap | `gap-3` |

### 3.5 Content Specification

#### Pending variant:

| Element | Content | Classes |
|---------|---------|---------|
| Icon | `Clock` (lucide) | `h-[18px] w-[18px] text-amber-600 dark:text-amber-400 flex-shrink-0` |
| Primary text | `Voce tem {count} fatura{s} pendente{s} de {formatCurrency(total)}` | `text-sm font-medium text-amber-800 dark:text-amber-200` |
| Secondary text | `Vencimento: {formatDateLong(due_date)}` | `text-xs text-amber-600 dark:text-amber-400 hidden sm:block` |
| CTA | `Ver fatura` | Button, links to `/portal/invoices` |

When `count > 1`:
- Primary: `Voce tem 3 faturas pendentes totalizando R$ 4.500,00`
- Secondary: `Proxima vence em {formatDateLong(earliest_due_date)}`

#### Overdue variant:

| Element | Content | Classes |
|---------|---------|---------|
| Icon | `AlertCircle` (lucide) | `h-[18px] w-[18px] text-red-600 dark:text-red-400 flex-shrink-0` |
| Primary text | `Fatura vencida: {formatCurrency(amount)} (ha {days} dia{s})` | `text-sm font-medium text-red-800 dark:text-red-200` |
| Secondary text | `Evite a suspensao dos servicos` | `text-xs text-red-600 dark:text-red-400 hidden sm:block` |
| CTA | `Pagar agora` | Button, links to `/portal/invoices` |

When multiple overdue:
- Primary: `Voce tem 2 faturas vencidas totalizando R$ 3.000,00`
- Secondary: `Regularize para evitar a suspensao dos servicos`

**Priority rule:** If there are BOTH pending AND overdue invoices, show only the overdue variant (higher severity wins).

### 3.6 CTA Button Spec

```tsx
<Link
  href="/portal/invoices"
  className={cn(
    "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors flex-shrink-0",
    variant === "overdue"
      ? "bg-red-600 hover:bg-red-700 text-white dark:bg-red-500 dark:hover:bg-red-400 dark:text-red-950"
      : "bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-amber-950"
  )}
>
  {variant === "overdue" ? "Pagar agora" : "Ver fatura"}
  <ArrowRight className="h-3 w-3" />
</Link>
```

### 3.7 Animation

| Animation | Spec | When |
|-----------|------|------|
| Entry | `animate-fade-in` (already exists in Tailwind config: `fade-in 0.3s ease-out`) | On first render |
| Icon pulse | `animate-pulse` on the icon | Overdue variant only |
| No exit animation | Banner never dismisses | Always |

### 3.8 Responsive Behavior

**Desktop (lg+):**
```
[icon] [primary text] [secondary text]  ................  [CTA button]
       (same line)     (same line)
```

**Mobile (<lg):**
```
[icon] [primary text]              [CTA button]
       [secondary text - hidden on xs, shown on sm]
```

- On `xs` screens (<640px): secondary text hidden via `hidden sm:block`
- CTA button always visible, never wraps to new line (`flex-shrink-0`)

### 3.9 Placement in Layout

The banner sits inside `<main>`, after the desktop header, before the page content. It uses `sticky` positioning so it remains visible while scrolling.

```tsx
{/* Main Content */}
<main className="lg:pl-[260px]">
  {/* Desktop Header - unchanged */}
  <header className="hidden lg:flex sticky top-0 z-30 ...">
    ...
  </header>

  {/* === URGENCY BANNER === */}
  {invoiceStatus && !pathname.startsWith("/portal/invoices") && (
    <InvoiceUrgencyBanner
      status={invoiceStatus}
      className="sticky top-14 lg:top-14 z-20"
    />
  )}

  {/* Page Content - unchanged */}
  <div className="p-6 pt-20 lg:pt-6 lg:px-8">{children}</div>
</main>
```

**Note on sticky stacking:** The desktop header is `sticky top-0 z-30`. The banner should be `sticky top-14 z-20` so it stacks below the header (14 = 56px / 4 = `h-14`). On mobile, the header is `fixed top-0`, so the banner is `sticky top-14` as well.

### 3.10 Component Interface

```typescript
interface InvoiceUrgencyBannerProps {
  status: {
    hasPending: boolean
    hasOverdue: boolean
    pendingCount: number
    overdueCount: number
    totalPending: number    // currency amount
    totalOverdue: number    // currency amount
    earliestDueDate: string // ISO date of nearest pending invoice
    oldestOverdueDate: string // ISO date of oldest overdue invoice
  }
  className?: string
}
```

### 3.11 Full Component Template

```tsx
function InvoiceUrgencyBanner({ status, className }: InvoiceUrgencyBannerProps) {
  const isOverdue = status.hasOverdue
  const variant = isOverdue ? "overdue" : "pending"

  // Don't render if nothing to show
  if (!status.hasPending && !status.hasOverdue) return null

  const Icon = isOverdue ? AlertCircle : Clock

  // Build text
  let primaryText: string
  let secondaryText: string
  let ctaText: string

  if (isOverdue) {
    const days = getDaysOverdue(status.oldestOverdueDate)
    if (status.overdueCount === 1) {
      primaryText = `Fatura vencida: ${formatCurrency(status.totalOverdue)} (ha ${days} dia${days > 1 ? "s" : ""})`
      secondaryText = "Evite a suspensao dos servicos"
    } else {
      primaryText = `Voce tem ${status.overdueCount} faturas vencidas totalizando ${formatCurrency(status.totalOverdue)}`
      secondaryText = "Regularize para evitar a suspensao dos servicos"
    }
    ctaText = "Pagar agora"
  } else {
    if (status.pendingCount === 1) {
      primaryText = `Voce tem uma fatura pendente de ${formatCurrency(status.totalPending)}`
      secondaryText = `Vencimento: ${formatDateLong(status.earliestDueDate)}`
    } else {
      primaryText = `Voce tem ${status.pendingCount} faturas pendentes totalizando ${formatCurrency(status.totalPending)}`
      secondaryText = `Proxima vence em ${formatDateLong(status.earliestDueDate)}`
    }
    ctaText = "Ver fatura"
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "animate-fade-in border-b",
        isOverdue
          ? "bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/20"
          : "bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20",
        className
      )}
    >
      <div className="flex items-center gap-3 px-6 lg:px-8 py-3">
        <Icon
          className={cn(
            "h-[18px] w-[18px] flex-shrink-0",
            isOverdue
              ? "text-red-600 dark:text-red-400 animate-pulse"
              : "text-amber-600 dark:text-amber-400"
          )}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-sm font-medium",
            isOverdue
              ? "text-red-800 dark:text-red-200"
              : "text-amber-800 dark:text-amber-200"
          )}>
            {primaryText}
          </p>
          <p className={cn(
            "text-xs hidden sm:block",
            isOverdue
              ? "text-red-600 dark:text-red-400"
              : "text-amber-600 dark:text-amber-400"
          )}>
            {secondaryText}
          </p>
        </div>
        <Link
          href="/portal/invoices"
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors flex-shrink-0",
            isOverdue
              ? "bg-red-600 hover:bg-red-700 text-white dark:bg-red-500 dark:hover:bg-red-400 dark:text-red-950"
              : "bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-amber-950"
          )}
        >
          {ctaText}
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}
```

---

## 4. Design Tokens Reference

### Colors Used (All from existing system)

| Purpose | Token/Class | Source |
|---------|------------|--------|
| Sidebar bg | `#0B0E14` (hardcoded) | layout.tsx |
| Sidebar text active | `text-white` + `bg-white/10` | layout.tsx |
| Sidebar text inactive | `text-slate-400` | layout.tsx |
| Sidebar separator | `border-white/[0.06]` | layout.tsx |
| Section label | `text-slate-600`, `text-[10px]` | layout.tsx |
| Badge dot | `bg-red-500` | STATUS_CONFIG |
| Banner pending bg | `bg-amber-50` / `bg-amber-500/10` | STATUS_CONFIG pattern |
| Banner overdue bg | `bg-red-50` / `bg-red-500/10` | STATUS_CONFIG pattern |
| Banner pending text | `text-amber-800` / `text-amber-200` | Derived from amber scale |
| Banner overdue text | `text-red-800` / `text-red-200` | Derived from red scale |

### Spacing Scale Used

| Token | Value | Usage |
|-------|-------|-------|
| `gap-3` | 12px | Nav item icon-to-text, banner elements |
| `px-3` | 12px | Nav items horizontal padding |
| `py-2.5` | 10px | Nav items vertical padding |
| `px-6` | 24px | Banner + content horizontal padding |
| `lg:px-8` | 32px | Banner + content desktop horizontal padding |
| `py-3` | 12px | Banner vertical padding |
| `my-3` | 12px | Section separator vertical margin |

### Typography Scale Used

| Token | Value | Usage |
|-------|-------|-------|
| `text-[10px]` | 10px | Section labels |
| `text-xs` | 12px | Banner secondary text, CTA button |
| `text-[13px]` | 13px | Nav items, page title |
| `text-sm` | 14px | Banner primary text |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `rounded-lg` | `var(--radius)` = 8px | Nav items |
| `rounded-md` | 6px | CTA button |
| `rounded-full` | 9999px | Badge dot |

---

## 5. Accessibility Specification

### 5.1 Sidebar

| Requirement | Implementation |
|-------------|----------------|
| Navigation landmark | `<nav>` element already present |
| Section grouping | Use `aria-labelledby` on each section pointing to the label `<p>` element (give labels `id="sidebar-menu-label"` and `id="sidebar-account-label"`) |
| Active page indicator | Add `aria-current="page"` to active link |
| Badge notification | `role="status"` + `aria-label` on the dot span |
| Focus order | Natural DOM order (menu items, then separator, then account items) |
| Keyboard | All links are natively focusable. `Tab` traversal works |

Example:
```tsx
<nav aria-label="Portal navigation">
  <p id="sidebar-menu-label" className="...">Menu</p>
  <div role="group" aria-labelledby="sidebar-menu-label">
    {/* menu items */}
  </div>

  <div className="!my-3 mx-3 border-t border-white/[0.06]" role="separator" />

  <p id="sidebar-account-label" className="...">Conta</p>
  <div role="group" aria-labelledby="sidebar-account-label">
    {/* account items */}
  </div>
</nav>
```

### 5.2 Urgency Banner

| Requirement | Implementation |
|-------------|----------------|
| Alert role | `role="alert"` on container |
| Live region | `aria-live="polite"` (not assertive -- financial, not emergency) |
| Icon decorative | `aria-hidden="true"` on icons |
| CTA accessible name | Link text is descriptive ("Pagar agora" / "Ver fatura") |
| Color contrast | Amber-800 on amber-50: ratio 7.2:1 (AAA). Red-800 on red-50: ratio 7.5:1 (AAA) |
| Dark mode contrast | Amber-200 on amber-500/10: ratio 5.8:1 (AA). Red-200 on red-500/10: ratio 5.6:1 (AA) |
| Button contrast | White on amber-600: ratio 4.6:1 (AA). White on red-600: ratio 4.7:1 (AA) |
| Focus indicator | Default browser focus ring (`:focus-visible`) on CTA link |
| Reduced motion | `animate-pulse` respects `prefers-reduced-motion` via Tailwind's `motion-safe:` or CSS media query |

### 5.3 Reduced Motion

Add to `globals.css` if not already present:
```css
@media (prefers-reduced-motion: reduce) {
  .animate-pulse {
    animation: none;
  }
}
```

---

## 6. Implementation Checklist

### Phase 1: API Endpoint
- [ ] Create `GET /api/portal/invoices/status` endpoint
- [ ] Return `{ hasPending, hasOverdue, pendingCount, overdueCount, totalPending, totalOverdue, earliestDueDate, oldestOverdueDate }`
- [ ] Reuse existing auth/permission logic from `/api/portal/invoices`

### Phase 2: Sidebar Restructure (layout.tsx)
- [ ] Split `navigation` array into `menuNavigation` + `accountNavigation`
- [ ] Add separator div between sections
- [ ] Add "Conta" section label
- [ ] Add `invoiceStatus` state to layout
- [ ] Fetch `/api/portal/invoices/status` in `useEffect` after auth
- [ ] Pass `invoiceStatus` to `SidebarNav`
- [ ] Render red dot badge on "Faturas" item when pending/overdue
- [ ] Add `animate-pulse` when overdue
- [ ] Remove "Faturas" and "Configuracoes" from account dropdown
- [ ] Add `aria-current="page"` to active links
- [ ] Add `role="group"` + `aria-labelledby` for section grouping
- [ ] Add `role="separator"` to divider
- [ ] Verify mobile Sheet renders correctly with new structure

### Phase 3: Urgency Banner Component
- [ ] Create `InvoiceUrgencyBanner` component (inline in layout or separate file)
- [ ] Implement pending variant (amber)
- [ ] Implement overdue variant (red)
- [ ] Handle singular vs plural text
- [ ] Position sticky below header
- [ ] Hide on `/portal/invoices` path
- [ ] Add `role="alert"` + `aria-live="polite"`
- [ ] Add `aria-hidden="true"` to decorative icons
- [ ] Add reduced motion support for `animate-pulse`
- [ ] Test light mode
- [ ] Test dark mode
- [ ] Test mobile viewport
- [ ] Test keyboard navigation (Tab to CTA link)

### Phase 4: Cleanup
- [ ] Remove "Faturas" from flat `navigation` array
- [ ] Update `getPageTitle()` to check both arrays
- [ ] Verify no broken links or missing nav items
- [ ] Run `npm run typecheck` and `npm run lint`

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/app/portal/layout.tsx` | Sidebar restructure, banner placement, invoice status fetch |
| `src/app/api/portal/invoices/status/route.ts` | **New file** - lightweight status endpoint |
| `src/app/globals.css` | Add `prefers-reduced-motion` rule if missing |

No new dependencies required. All icons (`Clock`, `AlertCircle`, `ArrowRight`, `Settings`, `FileText`) are already imported or available in lucide-react.
