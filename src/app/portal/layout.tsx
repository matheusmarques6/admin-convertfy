"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import {
  LayoutDashboard,
  BarChart3,
  Send,
  GitBranch,
  Store,
  FileText,
  Settings,
  LogOut,
  Menu,
  ChevronDown,
  Plus,
  Package,
  Plug,
  Search,
  Bell,
  X,
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
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { PortalThemeToggle } from "@/components/portal/theme-toggle"
import { InvoiceBanner } from "@/components/portal/invoice-banner"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

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
  { name: "Dashboard", href: "/portal/dashboard", icon: LayoutDashboard },
  { name: "Analytics", href: "/portal/analytics", icon: BarChart3 },
  { name: "Campanhas", href: "/portal/campaigns", icon: Send },
  { name: "Flows", href: "/portal/flows", icon: GitBranch },
  { name: "Integrações", href: "/portal/integrations", icon: Plug },
  { name: "Rastreamento", href: "/portal/tracking", icon: Package },
]

// Account-scoped navigation (client-level, not store-level)
const accountNavigation = [
  { name: "Faturas", href: "/portal/invoices", icon: FileText },
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [stores, setStores] = useState<PortalStore[]>([])
  const [activeStore, setActiveStore] = useState<PortalStore | null>(null)
  const [branding, setBranding] = useState<Branding>({
    name: "Convertfy",
    logo_url: null,
    primary_color: "#05AFF2",
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
      <div className="flex h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-2 border-[#05AFF2]/20" />
            <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-[#05AFF2]" />
          </div>
          <span className="text-sm text-zinc-500">Carregando...</span>
        </div>
      </div>
    )
  }

  // If not authenticated, redirect to login
  if (!user) {
    router.push("/portal/login")
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-2 border-[#05AFF2]/20" />
          <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-[#05AFF2]" />
        </div>
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

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className="portal-layout min-h-screen bg-[#0a0a0a]"
        style={branding.primary_color !== "#05AFF2" ? {
          "--portal-primary": branding.primary_color,
          "--portal-primary-foreground": "#ffffff",
        } as React.CSSProperties : undefined}
      >
        {/* Desktop Sidebar */}
        <aside
          className={cn(
            "hidden lg:fixed lg:inset-y-0 lg:flex lg:flex-col z-40 transition-all duration-300 ease-in-out",
            sidebarCollapsed ? "lg:w-[72px]" : "lg:w-[260px]"
          )}
        >
          <div className="flex flex-col flex-grow bg-[#0f0f0f] border-r border-zinc-800/50">
            {/* Logo & Collapse Toggle */}
            <div className="flex h-16 items-center justify-between px-4 border-b border-zinc-800/50">
              <Link href="/portal/dashboard" className="flex items-center gap-3">
                {sidebarCollapsed ? (
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#05AFF2] to-[#0284C7] flex items-center justify-center">
                    <span className="text-white text-sm font-bold">C</span>
                  </div>
                ) : (
                  <Image
                    src="/images/logo da convertfy com escrito branco.png"
                    alt="Convertfy"
                    width={160}
                    height={40}
                    className="h-8 w-auto object-contain"
                    priority
                  />
                )}
              </Link>
              {!sidebarCollapsed && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarCollapsed(true)}
                  className="h-8 w-8 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Store Switcher */}
            {stores.length > 0 && (
              <div className={cn("p-3 border-b border-zinc-800/50", sidebarCollapsed && "px-2")}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        "flex items-center gap-3 w-full rounded-lg transition-all duration-200 text-left group",
                        sidebarCollapsed
                          ? "justify-center p-2 hover:bg-zinc-800/50"
                          : "px-3 py-2.5 hover:bg-zinc-800/50"
                      )}
                    >
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center flex-shrink-0 ring-1 ring-zinc-700">
                        <Store className="h-4 w-4 text-zinc-300" />
                      </div>
                      {!sidebarCollapsed && (
                        <>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-100 truncate">{activeStore?.name || "Selecionar loja"}</p>
                            <p className="text-xs text-zinc-500 truncate">{activeStore?.platform || ""}</p>
                          </div>
                          <ChevronDown className="h-4 w-4 text-zinc-500 group-hover:text-zinc-400 flex-shrink-0" />
                        </>
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="bottom" align="start" className="w-[232px] bg-zinc-900 border-zinc-800">
                    <DropdownMenuLabel className="text-xs text-zinc-500 font-medium">Suas Lojas</DropdownMenuLabel>
                    {stores.map((store) => (
                      <DropdownMenuItem
                        key={store.id}
                        onClick={() => handleStoreChange(store)}
                        className={cn(
                          "cursor-pointer",
                          activeStore?.id === store.id && "bg-zinc-800"
                        )}
                      >
                        <Store className="mr-2 h-4 w-4 text-zinc-400" />
                        <span className="truncate text-zinc-200">{store.name}</span>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator className="bg-zinc-800" />
                    <DropdownMenuItem asChild className="cursor-pointer">
                      <Link href="/portal/stores/new" className="text-[#05AFF2]">
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar loja
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 overflow-y-auto">
              {!sidebarCollapsed && (
                <p className="px-3 mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Menu Principal</p>
              )}
              <div className="space-y-1">
                {storeNavigation.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                  
                  if (sidebarCollapsed) {
                    return (
                      <Tooltip key={item.name}>
                        <TooltipTrigger asChild>
                          <Link
                            href={item.href}
                            className={cn(
                              "flex items-center justify-center w-full h-10 rounded-lg transition-all duration-200",
                              isActive
                                ? "bg-[#05AFF2]/10 text-[#05AFF2]"
                                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                            )}
                          >
                            <item.icon className="h-5 w-5" />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="bg-zinc-900 border-zinc-800 text-zinc-200">
                          {item.name}
                        </TooltipContent>
                      </Tooltip>
                    )
                  }

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-[#05AFF2]/10 text-[#05AFF2] border border-[#05AFF2]/20"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                      )}
                    >
                      <item.icon className="h-5 w-5" aria-hidden="true" />
                      <span>{item.name}</span>
                    </Link>
                  )
                })}
              </div>

              {/* Divider */}
              <div className="my-4 border-t border-zinc-800/50" />

              {/* Account-scoped items */}
              {!sidebarCollapsed && (
                <p className="px-3 mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Conta</p>
              )}
              <div className="space-y-1">
                {accountNavigation.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                  const showBadge = item.href === "/portal/invoices" && invoiceStatus?.hasOverdue
                  
                  if (sidebarCollapsed) {
                    return (
                      <Tooltip key={item.name}>
                        <TooltipTrigger asChild>
                          <Link
                            href={item.href}
                            className={cn(
                              "flex items-center justify-center w-full h-10 rounded-lg transition-all duration-200 relative",
                              isActive
                                ? "bg-[#05AFF2]/10 text-[#05AFF2]"
                                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                            )}
                          >
                            <item.icon className="h-5 w-5" />
                            {showBadge && (
                              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                            )}
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="bg-zinc-900 border-zinc-800 text-zinc-200">
                          {item.name}
                        </TooltipContent>
                      </Tooltip>
                    )
                  }

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-[#05AFF2]/10 text-[#05AFF2] border border-[#05AFF2]/20"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                      )}
                    >
                      <item.icon className="h-5 w-5" aria-hidden="true" />
                      <span className="flex-1">{item.name}</span>
                      {showBadge && (
                        <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      )}
                    </Link>
                  )
                })}
              </div>
            </nav>

            {/* Footer: User Profile */}
            <div className="p-3 border-t border-zinc-800/50">
              {sidebarCollapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setSidebarCollapsed(false)}
                      className="flex items-center justify-center w-full h-10 rounded-lg hover:bg-zinc-800/50 transition-all"
                    >
                      <Avatar className="h-8 w-8 ring-2 ring-zinc-700">
                        {user.avatar_url && <AvatarImage src={user.avatar_url} alt={user.name} />}
                        <AvatarFallback className="bg-gradient-to-br from-[#05AFF2] to-[#0284C7] text-white text-xs font-semibold">
                          {getInitials(user.name)}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    {user.name}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-zinc-800/50 transition-all duration-200 text-left group">
                      <Avatar className="h-9 w-9 ring-2 ring-zinc-700">
                        {user.avatar_url && <AvatarImage src={user.avatar_url} alt={user.name} />}
                        <AvatarFallback className="bg-gradient-to-br from-[#05AFF2] to-[#0284C7] text-white text-xs font-semibold">
                          {getInitials(user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-100 truncate">{user.name}</p>
                        <p className="text-xs text-zinc-500 truncate">{user.clientName}</p>
                      </div>
                      <ChevronDown className="h-4 w-4 text-zinc-500 group-hover:text-zinc-400 flex-shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="start" className="w-[232px] bg-zinc-900 border-zinc-800">
                    <DropdownMenuLabel>
                      <div>
                        <p className="font-medium text-zinc-100">{user.name}</p>
                        <p className="text-xs text-zinc-500">{user.email}</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-zinc-800" />
                    <DropdownMenuItem asChild className="cursor-pointer">
                      <Link href="/portal/stores" className="text-zinc-200">
                        <Store className="mr-2 h-4 w-4 text-zinc-400" />
                        Gerenciar Lojas
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-zinc-800" />
                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-400 focus:text-red-400">
                      <LogOut className="mr-2 h-4 w-4" />
                      Sair
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </aside>

        {/* Mobile Header */}
        <div className="lg:hidden">
          <div className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center gap-3 border-b border-zinc-800/50 bg-[#0f0f0f]/95 backdrop-blur-md px-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(true)}
              className="h-9 w-9 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <div className="flex-1">
              <span className="text-sm font-semibold text-zinc-100">{getPageTitle()}</span>
            </div>

            <PortalThemeToggle className="h-9 w-9 text-zinc-400 hover:text-zinc-200" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <Avatar className="h-8 w-8 ring-2 ring-zinc-700">
                    {user.avatar_url && <AvatarImage src={user.avatar_url} alt={user.name} />}
                    <AvatarFallback className="bg-gradient-to-br from-[#05AFF2] to-[#0284C7] text-white text-xs font-semibold">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-zinc-900 border-zinc-800">
                <DropdownMenuLabel>
                  <div>
                    <p className="font-medium text-zinc-100">{user.name}</p>
                    <p className="text-xs text-zinc-500">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-zinc-800" />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-400 focus:text-red-400">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
            <div className="fixed inset-y-0 left-0 w-[280px] bg-[#0f0f0f] border-r border-zinc-800/50 overflow-y-auto">
              {/* Logo */}
              <div className="flex h-16 items-center justify-between px-4 border-b border-zinc-800/50">
                <Image
                  src="/images/logo da convertfy com escrito branco.png"
                  alt="Convertfy"
                  width={140}
                  height={35}
                  className="h-7 w-auto object-contain"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileMenuOpen(false)}
                  className="h-8 w-8 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Store Switcher */}
              {stores.length > 0 && (
                <div className="p-3 border-b border-zinc-800/50">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-zinc-800/50 transition-all duration-200 text-left group">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center flex-shrink-0 ring-1 ring-zinc-700">
                          <Store className="h-4 w-4 text-zinc-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-100 truncate">{activeStore?.name || "Selecionar"}</p>
                          <p className="text-xs text-zinc-500 truncate">{activeStore?.platform || ""}</p>
                        </div>
                        <ChevronDown className="h-4 w-4 text-zinc-500" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="bottom" align="start" className="w-[248px] bg-zinc-900 border-zinc-800">
                      <DropdownMenuLabel className="text-xs text-zinc-500">Suas Lojas</DropdownMenuLabel>
                      {stores.map((store) => (
                        <DropdownMenuItem
                          key={store.id}
                          onClick={() => handleStoreChange(store)}
                          className={cn("cursor-pointer", activeStore?.id === store.id && "bg-zinc-800")}
                        >
                          <Store className="mr-2 h-4 w-4 text-zinc-400" />
                          <span className="truncate text-zinc-200">{store.name}</span>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator className="bg-zinc-800" />
                      <DropdownMenuItem asChild className="cursor-pointer">
                        <Link href="/portal/stores/new" className="text-[#05AFF2]">
                          <Plus className="mr-2 h-4 w-4" />
                          Adicionar loja
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}

              {/* Navigation */}
              <nav className="px-3 py-4">
                <p className="px-3 mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Menu Principal</p>
                <div className="space-y-1">
                  {storeNavigation.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                          isActive
                            ? "bg-[#05AFF2]/10 text-[#05AFF2] border border-[#05AFF2]/20"
                            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                        <span>{item.name}</span>
                      </Link>
                    )
                  })}
                </div>

                <div className="my-4 border-t border-zinc-800/50" />

                <p className="px-3 mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Conta</p>
                <div className="space-y-1">
                  {accountNavigation.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                    const showBadge = item.href === "/portal/invoices" && invoiceStatus?.hasOverdue
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                          isActive
                            ? "bg-[#05AFF2]/10 text-[#05AFF2] border border-[#05AFF2]/20"
                            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                        <span className="flex-1">{item.name}</span>
                        {showBadge && (
                          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        )}
                      </Link>
                    )
                  })}
                </div>
              </nav>

              {/* User Profile */}
              <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-zinc-800/50 bg-[#0f0f0f]">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <Avatar className="h-9 w-9 ring-2 ring-zinc-700">
                    {user.avatar_url && <AvatarImage src={user.avatar_url} alt={user.name} />}
                    <AvatarFallback className="bg-gradient-to-br from-[#05AFF2] to-[#0284C7] text-white text-xs font-semibold">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-100 truncate">{user.name}</p>
                    <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  onClick={handleLogout}
                  className="w-full mt-2 justify-start text-red-400 hover:text-red-400 hover:bg-red-500/10"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair da conta
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main
          className={cn(
            "transition-all duration-300 ease-in-out",
            sidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-[260px]"
          )}
        >
          {/* Desktop Header */}
          <header className="hidden lg:flex sticky top-0 z-30 h-14 items-center justify-between border-b border-zinc-800/50 bg-[#0a0a0a]/80 backdrop-blur-md px-6">
            <div className="flex items-center gap-4">
              {sidebarCollapsed && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarCollapsed(false)}
                  className="h-8 w-8 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              )}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                <Search className="h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  className="bg-transparent border-none outline-none text-sm text-zinc-300 placeholder:text-zinc-600 w-48"
                />
                <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-zinc-700 bg-zinc-800 px-1.5 text-[10px] font-medium text-zinc-400">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <PortalThemeToggle className="h-9 w-9 text-zinc-400 hover:text-zinc-200" />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 relative"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#05AFF2]" />
              </Button>
            </div>
          </header>

          {/* Page Content */}
          <div className="min-h-[calc(100vh-3.5rem)] pt-14 lg:pt-0">
            <div className="p-4 lg:p-6">
              <InvoiceBanner />
              {children}
            </div>
          </div>
        </main>
      </div>
    </TooltipProvider>
  )
}
