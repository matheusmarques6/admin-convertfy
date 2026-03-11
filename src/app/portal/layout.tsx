"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import {
  LayoutGrid,
  BarChart3,
  Send,
  GitBranch,
  Store,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  Bell,
  ChevronDown,
  Plus,
  Package,
  Plug,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { PortalThemeToggle } from "@/components/portal/theme-toggle"
import { InvoiceBanner } from "@/components/portal/invoice-banner"

interface PortalUser {
  id: string
  name: string
  email: string
  avatar_url: string | null
  clientName: string
  clientId: string
  mustChangePassword: boolean
}

interface Branding {
  name: string
  logo_url: string | null
  primary_color: string
}

interface PortalStore {
  id: string
  name: string
  platform: string
}

// Store-scoped navigation (depends on active store)
const storeNavigation = [
  { name: "Início", href: "/portal/dashboard", icon: LayoutGrid },
  { name: "Análise", href: "/portal/analytics", icon: BarChart3 },
  { name: "Campanhas", href: "/portal/campaigns", icon: Send },
  { name: "Automações", href: "/portal/flows", icon: GitBranch },
  { name: "Integrações", href: "/portal/integrations", icon: Plug },
  { name: "Rastreamento", href: "/portal/tracking", icon: Package },
]

// Account-scoped navigation (client-level, not store-level)
const accountNavigation = [
  { name: "Faturas", href: "/portal/invoices", icon: CreditCard },
  { name: "Configurações", href: "/portal/settings", icon: Settings },
]

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<PortalUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [stores, setStores] = useState<PortalStore[]>([])
  const [activeStore, setActiveStore] = useState<PortalStore | null>(null)
  const [branding, setBranding] = useState<Branding>({
    name: "Convertfy",
    logo_url: null,
    primary_color: "#3b82f6",
  })
  const [invoiceStatus, setInvoiceStatus] = useState<{ hasOverdue: boolean } | null>(null)
  // Check authentication using browser Supabase client
  useEffect(() => {
    const checkAuth = async () => {
      // Skip auth check for login, change-password and auth callback pages
      if (pathname === "/portal/login" || pathname === "/portal/change-password" || pathname.startsWith("/portal/auth/")) {
        setLoading(false)
        return
      }

      try {
        const supabase = createClient()

        // Get current session from browser
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !authUser) {
          console.log("[Portal Layout] No auth user found")
          window.location.href = "/portal/login"
          return
        }

        // Verify portal user via API (which uses admin client to bypass RLS)
        const response = await fetch("/api/portal/auth/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: authUser.id }),
        })

        if (!response.ok) {
          console.log("[Portal Layout] User is not a portal user")
          await supabase.auth.signOut()
          window.location.href = "/portal/login"
          return
        }

        const data = await response.json()

        // Check if user needs to change password
        if (data.mustChangePassword && pathname !== "/portal/change-password") {
          window.location.href = "/portal/change-password"
          return
        }

        setUser({
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          avatar_url: data.user.avatar_url || null,
          clientName: data.user.clientName,
          clientId: data.user.clientId,
          mustChangePassword: data.mustChangePassword,
        })

        // Fetch organization branding
        try {
          const brandingRes = await fetch("/api/portal/branding")
          if (brandingRes.ok) {
            const brandingData = await brandingRes.json()
            if (brandingData.data) {
              setBranding(brandingData.data)
            }
          }
        } catch {
          // Keep default branding on error
        }

        // Fetch stores for store switcher
        try {
          const storesRes = await fetch("/api/portal/stores")
          if (storesRes.ok) {
            const storesData = await storesRes.json()
            const storeList = (storesData.stores || []).map((s: { id: string; store_name?: string; name?: string; platform: string }) => ({
              id: s.id,
              name: s.store_name || s.name || "Sem nome",
              platform: s.platform,
            }))
            setStores(storeList)
            if (storeList.length > 0) {
              // Restore persisted store selection
              let savedStoreId: string | null = null
              try { savedStoreId = localStorage.getItem("portal_active_store") } catch { /* ignore */ }
              const saved = savedStoreId ? storeList.find((st: PortalStore) => st.id === savedStoreId) : null
              setActiveStore(saved || storeList[0])
            }
          }
        } catch {
          // Ignore store fetch errors
        }
      } catch (error) {
        console.error("Auth check failed:", error)
        window.location.href = "/portal/login"
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [pathname])

  // Listen for avatar changes from settings page to keep sidebar in sync
  useEffect(() => {
    const handleAvatarChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ avatar_url: string | null }>).detail
      setUser((prev) => prev ? { ...prev, avatar_url: detail.avatar_url } : null)
    }
    window.addEventListener("portal-avatar-changed", handleAvatarChanged)
    return () => window.removeEventListener("portal-avatar-changed", handleAvatarChanged)
  }, [])

  // Listen for invoice status from banner component to show badge in sidebar
  useEffect(() => {
    const handleInvoiceStatus = (e: Event) => {
      const detail = (e as CustomEvent<{ show: boolean; overdueCount?: number }>).detail
      if (detail.show) {
        setInvoiceStatus({ hasOverdue: (detail.overdueCount ?? 0) > 0 })
      } else {
        setInvoiceStatus(null)
      }
    }
    window.addEventListener("invoice-status-loaded", handleInvoiceStatus)
    return () => window.removeEventListener("invoice-status-loaded", handleInvoiceStatus)
  }, [])

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch (error) {
      console.error("Logout error:", error)
    } finally {
      window.location.href = "/portal/login"
    }
  }

  const handleStoreChange = (store: PortalStore) => {
    setActiveStore(store)
    // Persist store selection so pages can read it
    try { localStorage.setItem("portal_active_store", store.id) } catch { /* ignore */ }
    // Reload current page to refresh data with new store context
    window.location.reload()
  }

  // Show login, change-password and auth callback pages without layout
  if (pathname === "/portal/login" || pathname === "/portal/change-password" || pathname.startsWith("/portal/auth/")) {
    return <>{children}</>
  }

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
          <span className="text-sm text-muted-foreground">Carregando...</span>
        </div>
      </div>
    )
  }

  // If not authenticated, redirect to login
  if (!user) {
    router.push("/portal/login")
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
      </div>
    )
  }

  // Get current page title
  const getPageTitle = () => {
    const allNav = [...storeNavigation, ...accountNavigation]
    const navItem = allNav.find(item => pathname === item.href || pathname.startsWith(item.href + "/"))
    if (navItem) return navItem.name
    if (pathname.startsWith("/portal/stores")) return "Lojas"
    return "Portal"
  }

  // Sidebar content shared between desktop and mobile
  const SidebarNav = ({ labelPrefix = "desktop", onLinkClick }: { labelPrefix?: string; onLinkClick?: () => void }) => {
    const renderNavItem = (item: typeof storeNavigation[number], showBadge?: boolean) => {
      const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
      return (
        <Link
          key={item.name}
          href={item.href}
          onClick={onLinkClick}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "group relative flex items-center gap-3 h-10 px-3 rounded-lg text-sm font-medium transition-all duration-200",
            isActive
              ? "bg-gradient-to-r from-violet-500/10 to-purple-500/10 text-slate-900 dark:text-white"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white"
          )}
        >
          {isActive && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-gradient-to-b from-violet-500 to-purple-500 rounded-r-full" />
          )}
          <div className={cn(
            "flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200",
            isActive
              ? "bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25"
              : "bg-slate-100 dark:bg-white/[0.06] group-hover:bg-slate-200 dark:group-hover:bg-white/[0.1]"
          )}>
            <item.icon
              className={cn(
                "h-[18px] w-[18px] flex-shrink-0 transition-colors duration-200",
                isActive
                  ? "text-white"
                  : "text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200"
              )}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </div>
          <span className="flex-1">{item.name}</span>
          {showBadge && invoiceStatus && (
            <span
              role="status"
              aria-label="Faturas pendentes"
              className={cn(
                "h-2 w-2 rounded-full bg-red-500 flex-shrink-0",
                invoiceStatus.hasOverdue && "motion-safe:animate-pulse"
              )}
            />
          )}
        </Link>
      )
    }

    return (
      <>
        {/* Store-scoped items */}
        <div className="space-y-1" role="group" aria-labelledby={`nav-menu-label-${labelPrefix}`}>
          {storeNavigation.map((item) => renderNavItem(item))}
        </div>

        {/* Spacer */}
        <div className="flex-1 min-h-4" />

        {/* Account-scoped items */}
        <div className="pt-4 border-t border-slate-200/80 dark:border-white/[0.08]" role="group" aria-labelledby={`nav-account-label-${labelPrefix}`}>
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Conta</p>
          <div className="space-y-1">
            {accountNavigation.map((item) =>
              renderNavItem(item, item.href === "/portal/invoices")
            )}
          </div>
        </div>
      </>
    )
  }

  // Footer section shared between desktop and mobile
  const SidebarFooter = () => (
    <div className="shrink-0 border-t border-slate-200/80 dark:border-white/[0.08] p-3 space-y-3">
      {/* Store Switcher */}
      {stores.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 w-full p-2.5 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100/50 dark:from-white/[0.04] dark:to-white/[0.02] hover:from-slate-100 hover:to-slate-50 dark:hover:from-white/[0.06] dark:hover:to-white/[0.04] border border-slate-200/60 dark:border-white/[0.08] transition-all duration-200 text-left group outline-none">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-500/20">
                <Store className="h-4 w-4 text-white" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold">Loja</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{activeStore?.name || "Selecionar"}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500 flex-shrink-0 transition-transform group-hover:translate-y-0.5" strokeWidth={2} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56 mb-1 rounded-xl shadow-xl border-slate-200/80 dark:border-white/[0.1]">
            <DropdownMenuLabel className="text-xs text-muted-foreground font-semibold">Suas Lojas</DropdownMenuLabel>
            {stores.map((store) => (
              <DropdownMenuItem
                key={store.id}
                onClick={() => handleStoreChange(store)}
                className={cn("rounded-lg", activeStore?.id === store.id && "bg-violet-50 dark:bg-violet-500/10")}
              >
                <Store className="mr-2 h-4 w-4" strokeWidth={1.75} />
                <span className="truncate">{store.name}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="rounded-lg">
              <Link href="/portal/stores/new">
                <Plus className="mr-2 h-4 w-4" strokeWidth={1.75} />
                Adicionar loja
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Account Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-3 w-full p-2 rounded-xl hover:bg-slate-100/80 dark:hover:bg-white/[0.06] transition-all duration-200 text-left group outline-none">
            <Avatar className="h-9 w-9 shrink-0 ring-2 ring-slate-200/80 dark:ring-white/10">
              {user.avatar_url && <AvatarImage src={user.avatar_url} alt={user.name} />}
              <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xs font-semibold">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{user.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56 mb-1 rounded-xl shadow-xl border-slate-200/80 dark:border-white/[0.1]">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-semibold">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="rounded-lg">
            <Link href="/portal/stores">
              <Store className="mr-2 h-4 w-4" strokeWidth={1.75} />
              Gerenciar Lojas
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-500/10 rounded-lg">
            <LogOut className="mr-2 h-4 w-4" strokeWidth={1.75} />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )

  return (
    <div
      className="portal-layout min-h-screen bg-[#F8F9FB] dark:bg-[#0B0E14]"
      style={branding.primary_color !== "#3b82f6" ? {
        "--portal-primary": branding.primary_color,
        "--portal-primary-foreground": "#ffffff",
      } as React.CSSProperties : undefined}
    >
      {/* Desktop Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col z-40">
        <div className="flex flex-col h-screen bg-white dark:bg-[#0C0E14] border-r border-slate-200/80 dark:border-white/[0.06]">
          {/* Logo */}
          <div className="flex h-16 items-center px-5 shrink-0 border-b border-slate-200/60 dark:border-white/[0.06]">
            <Link href="/portal/dashboard" className="flex items-center gap-3">
              {/* Logo Icon */}
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="currentColor" fillOpacity="0.3"/>
                  <path d="M8 12c0-2.21 1.79-4 4-4s4 1.79 4 4-1.79 4-4 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                  <path d="M16 8l2-2M16 16l2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <span className="text-lg font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                Convertfy
              </span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 flex flex-col px-3 py-5 overflow-y-auto">
            <SidebarNav labelPrefix="desktop" />
          </nav>

          {/* Footer: Store Switcher + Account Menu */}
          <SidebarFooter />
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden">
        <div className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center gap-3 border-b border-slate-200/80 dark:border-slate-700/40 bg-white/95 dark:bg-[#0C0E14]/95 backdrop-blur-md px-4">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-600 dark:text-slate-300">
                <Menu className="h-5 w-5" strokeWidth={1.75} />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-white dark:bg-[#0C0E14] border-r border-slate-200/80 dark:border-white/[0.06]">
              <div className="flex flex-col h-full">
                {/* Logo */}
                <div className="flex h-16 items-center px-5 shrink-0 border-b border-slate-200/60 dark:border-white/[0.06]">
                  <Link href="/portal/dashboard" className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="currentColor" fillOpacity="0.3"/>
                        <path d="M8 12c0-2.21 1.79-4 4-4s4 1.79 4 4-1.79 4-4 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                        <path d="M16 8l2-2M16 16l2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <span className="text-lg font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                      Convertfy
                    </span>
                  </Link>
                </div>

                {/* Navigation */}
                <nav className="flex-1 flex flex-col px-3 py-5 overflow-y-auto">
                  <SidebarNav labelPrefix="mobile" onLinkClick={() => setMobileMenuOpen(false)} />
                </nav>

                {/* Footer */}
                <SidebarFooter />
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex-1">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{getPageTitle()}</span>
          </div>

          <PortalThemeToggle className="h-9 w-9 text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-100" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Avatar className="h-8 w-8">
                  {user.avatar_url && <AvatarImage src={user.avatar_url} alt={user.name} />}
                  <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white text-xs font-semibold">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-xl">
              <DropdownMenuLabel>
                <div>
                  <p className="font-semibold">{user.name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600 rounded-lg">
                <LogOut className="mr-2 h-4 w-4" strokeWidth={1.75} />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main Content */}
      <main className="lg:pl-64">
        {/* Desktop Header */}
        <header className="hidden lg:flex sticky top-0 z-30 h-14 items-center justify-between border-b border-slate-200/80 dark:border-slate-700/40 bg-white/90 dark:bg-[#0C0E14]/90 backdrop-blur-md px-8">
          <div className="flex items-center gap-3">
            <h1 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">{user.clientName}</h1>
            {activeStore && (
              <>
                <span className="text-slate-300 dark:text-slate-600">/</span>
                <span className="text-[13px] text-slate-500 dark:text-slate-400">{activeStore.name}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <PortalThemeToggle className="h-9 w-9 text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-100" />
            <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-100">
              <Bell className="h-[18px] w-[18px]" strokeWidth={1.5} />
            </Button>
          </div>
        </header>

        {/* Invoice Urgency Banner */}
        <InvoiceBanner />

        {/* Page Content */}
        <div className="p-6 pt-20 lg:pt-6 lg:px-8">{children}</div>
      </main>
    </div>
  )
}
