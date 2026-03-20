"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import {
  Home,
  Send,
  Workflow,
  Store,
  FileText,
  Settings,
  LogOut,
  Menu,
  Bell,
  ChevronsUpDown,
  Plus,
  Package,
  Plug,
  ChevronDown,
  LucideIcon,
  X,
} from "lucide-react"
import { motion, LayoutGroup, AnimatePresence } from "framer-motion"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { PortalThemeToggle } from "@/components/portal/theme-toggle"
import { InvoiceBanner } from "@/components/portal/invoice-banner"
import { Logo } from "@/components/ui/logo"

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

interface NavItem {
  name: string
  href: string
  icon: LucideIcon
  group: string
  description?: string
}

const NAV_GROUPS = [
  { key: "principal", label: "" },
  { key: "conta", label: "Conta" },
] as const

const storeNavigation: NavItem[] = [
  { name: "Dashboard", href: "/client/dashboard", icon: Home, group: "principal", description: "Visão geral" },
  { name: "Campanhas", href: "/client/campaigns", icon: Send, group: "principal", description: "Calendário" },
  { name: "Flows", href: "/client/flows", icon: Workflow, group: "principal", description: "Automações" },
  { name: "Integrações", href: "/client/integrations", icon: Plug, group: "principal", description: "Conexões" },
  { name: "Rastreamento", href: "/client/tracking", icon: Package, group: "principal", description: "Pedidos" },
]

const accountNavigation: NavItem[] = [
  { name: "Faturas", href: "/client/invoices", icon: FileText, group: "conta", description: "Pagamentos" },
  { name: "Configurações", href: "/client/settings", icon: Settings, group: "conta", description: "Perfil" },
]

const allNavigation = [...storeNavigation, ...accountNavigation]

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

  useEffect(() => {
    const checkAuth = async () => {
      if (pathname === "/client/login" || pathname === "/client/change-password" || pathname.startsWith("/client/auth/")) {
        setLoading(false)
        return
      }

      try {
        const supabase = createClient()
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !authUser) {
          console.log("[Portal Layout] No auth user found")
          window.location.href = "/client/login"
          return
        }

        const response = await fetch("/api/portal/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: authUser.id }),
        })

        if (!response.ok) {
          console.log("[Portal Layout] User is not a portal user")
          await supabase.auth.signOut()
          window.location.href = "/client/login"
          return
        }

        const data = await response.json()

        if (data.mustChangePassword && pathname !== "/client/change-password") {
          window.location.href = "/client/change-password"
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
        window.location.href = "/client/login"
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [pathname])

  useEffect(() => {
    const handleAvatarChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ avatar_url: string | null }>).detail
      setUser((prev) => prev ? { ...prev, avatar_url: detail.avatar_url } : null)
    }
    window.addEventListener("portal-avatar-changed", handleAvatarChanged)
    return () => window.removeEventListener("portal-avatar-changed", handleAvatarChanged)
  }, [])

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
      window.location.href = "/client/login"
    }
  }

  const handleStoreChange = (store: PortalStore) => {
    setActiveStore(store)
    try { localStorage.setItem("portal_active_store", store.id) } catch { /* ignore */ }
    window.location.reload()
  }

  if (pathname === "/client/login" || pathname === "/client/change-password" || pathname.startsWith("/client/auth/")) {
    return <>{children}</>
  }

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

  if (!user) {
    router.push("/client/login")
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
      </div>
    )
  }

  const getPageTitle = () => {
    const navItem = allNavigation.find(item => pathname === item.href || pathname.startsWith(item.href + "/"))
    if (navItem) return navItem.name
    if (pathname.startsWith("/client/stores")) return "Lojas"
    return "Portal"
  }

  function checkActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/")
  }

  const groupedNavigation = NAV_GROUPS.map(group => ({
    ...group,
    items: allNavigation.filter(item => item.group === group.key),
  })).filter(group => group.items.length > 0)

  function renderNavItem(item: NavItem, onLinkClick?: () => void) {
    const active = checkActive(item.href)
    const Icon = item.icon
    const showBadge = item.href === "/client/invoices" && invoiceStatus

    return (
      <Link
        key={item.name}
        href={item.href}
        onClick={onLinkClick}
        className={cn(
          "group relative flex items-center gap-3 h-10 px-3 rounded-xl text-[13px] transition-all duration-200",
          active
            ? "text-white font-medium"
            : "text-[#8b95a5] hover:text-white hover:bg-white/[0.06]"
        )}
      >
        {active && (
          <motion.div
            layoutId="portal-nav-active"
            className="absolute inset-0 rounded-xl bg-white/[0.10] ring-1 ring-white/[0.08]"
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          />
        )}
        <div className={cn(
          "relative z-10 flex items-center justify-center w-7 h-7 rounded-lg transition-colors duration-200",
          active ? "bg-white/[0.12]" : "bg-transparent group-hover:bg-white/[0.06]"
        )}>
          <Icon className="h-[16px] w-[16px]" strokeWidth={1.8} />
        </div>
        <span className="relative z-10 truncate">{item.name}</span>
        {showBadge && (
          <span
            role="status"
            aria-label="Faturas pendentes"
            className={cn(
              "relative z-10 ml-auto h-2 w-2 rounded-full bg-red-500 shrink-0",
              invoiceStatus.hasOverdue && "motion-safe:animate-pulse"
            )}
          />
        )}
      </Link>
    )
  }

  const SidebarNav = ({ onLinkClick }: { onLinkClick?: () => void }) => (
    <LayoutGroup>
      <nav className="py-2 space-y-1">
        {groupedNavigation.map((group, idx) => (
          <div key={group.key} className={cn(idx > 0 && "mt-5")}>
            {group.label && (
              <p className="px-3 mb-2 text-[10px] font-semibold tracking-[0.1em] text-[#4a5568] uppercase">
                {group.label}
              </p>
            )}
            {!group.label && idx > 0 && (
              <div className="h-px bg-white/[0.06] mx-2 mb-3" />
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => renderNavItem(item, onLinkClick))}
            </div>
          </div>
        ))}
      </nav>
    </LayoutGroup>
  )

  const StoreSwitcher = () => {
    if (stores.length === 0) return null
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-all duration-200 text-left outline-none group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shrink-0 ring-1 ring-white/[0.06]">
              <Store className="h-4 w-4 text-primary" strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-[#e6edf3] truncate leading-tight">{activeStore?.name || "Selecionar loja"}</p>
              <p className="text-[10px] text-[#6e7681] truncate leading-tight capitalize">{activeStore?.platform || ""}</p>
            </div>
            <ChevronsUpDown className="h-3 w-3 text-[#4a5568] group-hover:text-[#8b95a5] shrink-0 transition-colors" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56 rounded-xl p-1">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2">Lojas</DropdownMenuLabel>
          {stores.map((store) => (
            <DropdownMenuItem
              key={store.id}
              onClick={() => handleStoreChange(store)}
              className={cn("rounded-lg px-2.5 py-2", activeStore?.id === store.id && "bg-accent")}
            >
              <Store className="mr-2.5 h-4 w-4 text-muted-foreground" />
              <span className="truncate">{store.name}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="rounded-lg px-2.5 py-2">
            <Link href="/client/stores/new">
              <Plus className="mr-2.5 h-4 w-4 text-muted-foreground" />
              Adicionar loja
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const AccountMenu = ({ side = "top" as "top" | "right" }: { side?: "top" | "right" }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-all duration-200 text-left outline-none group">
          <Avatar className="h-8 w-8 shrink-0 rounded-lg ring-1 ring-white/[0.08]">
            {user.avatar_url && <AvatarImage src={user.avatar_url} alt={user.name} />}
            <AvatarFallback className="rounded-lg bg-gradient-to-br from-[#1a2332] to-[#0d1520] text-[#c9d1d9] text-[10px] font-semibold">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-[#e6edf3] truncate leading-tight">{user.name}</p>
            <p className="text-[10px] text-[#6e7681] truncate leading-tight">{user.clientName}</p>
          </div>
          <ChevronDown className="h-3 w-3 text-[#4a5568] group-hover:text-[#8b95a5] shrink-0 transition-colors" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="start" className="w-56 rounded-xl p-1">
        <DropdownMenuLabel className="font-normal px-3 py-2.5">
          <p className="text-sm font-semibold">{user.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="rounded-lg px-2.5 py-2">
          <Link href="/client/stores">
            <Store className="mr-2.5 h-4 w-4 text-muted-foreground" />
            Gerenciar Lojas
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="rounded-lg px-2.5 py-2 text-red-400 focus:text-red-400 focus:bg-red-500/10">
          <LogOut className="mr-2.5 h-4 w-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div
      className="portal-layout min-h-screen bg-slate-50 dark:bg-[#0a0d12]"
      style={branding.primary_color !== "#3b82f6" ? {
        "--portal-primary": branding.primary_color,
        "--portal-primary-foreground": "#ffffff",
      } as React.CSSProperties : undefined}
    >
      {/* Desktop Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-[260px] lg:flex-col z-40">
        <div className="flex flex-col flex-grow sidebar-container overflow-hidden">
          {/* Logo & Brand */}
          <div className="flex h-16 items-center px-5">
            <Link href="/client/dashboard" className="flex items-center">
              <Logo size="lg" />
            </Link>
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 px-3 mt-1">
            <SidebarNav />
          </ScrollArea>

          {/* Footer */}
          <div className="mt-auto shrink-0 px-3 pb-3">
            <div className="h-px bg-white/[0.06] mx-1 mb-3" />
            <div className="space-y-1">
              <StoreSwitcher />
              <AccountMenu />
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden">
        <div className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center gap-3 border-b border-slate-200/60 dark:border-white/[0.06] bg-white/90 dark:bg-[#0a0d12]/90 backdrop-blur-xl px-4">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-slate-600 dark:text-slate-400">
                <Menu className="h-5 w-5" strokeWidth={1.5} />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0 bg-[#0d1117] border-none">
              <div className="flex flex-col h-full">
                {/* Logo */}
                <div className="flex h-16 items-center justify-between px-5">
                  <Logo size="lg" />
                </div>

                {/* Navigation */}
                <ScrollArea className="flex-1 px-3">
                  <SidebarNav onLinkClick={() => setMobileMenuOpen(false)} />
                </ScrollArea>

                {/* Footer */}
                <div className="mt-auto shrink-0 px-3 pb-3">
                  <div className="h-px bg-white/[0.06] mx-1 mb-3" />
                  <div className="space-y-1">
                    <StoreSwitcher />
                    <AccountMenu side="right" />
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{getPageTitle()}</span>
          </div>

          <PortalThemeToggle className="h-9 w-9 rounded-xl text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-100" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl">
                <Avatar className="h-8 w-8 rounded-lg">
                  {user.avatar_url && <AvatarImage src={user.avatar_url} alt={user.name} />}
                  <AvatarFallback className="rounded-lg bg-slate-100 dark:bg-[#21262d] text-slate-600 dark:text-[#c9d1d9] text-[11px] font-semibold">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl p-1">
              <DropdownMenuLabel className="px-3 py-2.5">
                <p className="font-semibold text-sm">{user.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{user.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="rounded-lg px-2.5 py-2 text-red-400 focus:text-red-400 focus:bg-red-500/10">
                <LogOut className="mr-2.5 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main Content */}
      <main className="lg:pl-[260px]">
        {/* Desktop Header */}
        <header className="hidden lg:flex sticky top-0 z-30 h-14 items-center justify-between border-b border-slate-200/60 dark:border-white/[0.06] bg-white/80 dark:bg-[#0a0d12]/80 backdrop-blur-xl px-8">
          <div className="flex items-center gap-3">
            <h1 className="text-[14px] font-semibold text-slate-800 dark:text-slate-100">{user.clientName}</h1>
            {activeStore && (
              <>
                <span className="text-slate-300 dark:text-slate-700">/</span>
                <span className="text-[13px] text-slate-500 dark:text-slate-500">{activeStore.name}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <PortalThemeToggle className="h-8 w-8 rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-all" />
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.05]">
              <Bell className="h-[18px] w-[18px]" strokeWidth={1.5} />
            </Button>
          </div>
        </header>

        {/* Invoice Urgency Banner */}
        <InvoiceBanner />

        {/* Page Content */}
        <div className="p-5 pt-20 lg:pt-6 lg:px-8 lg:pb-8">{children}</div>
      </main>
    </div>
  )
}
