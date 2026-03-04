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
  Bell,
  ChevronUp,
  ChevronsUpDown,
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

// PRD v2.1: Main navigation items
const navigation = [
  { name: "Dashboard", href: "/portal/dashboard", icon: LayoutDashboard },
  { name: "Análise", href: "/portal/analytics", icon: BarChart3 },
  { name: "Campanhas", href: "/portal/campaigns", icon: Send },
  { name: "Flows", href: "/portal/flows", icon: GitBranch },
  { name: "Integrações", href: "/portal/integrations", icon: Plug },
  { name: "Rastreamento", href: "/portal/tracking", icon: Package },
  { name: "Faturas", href: "/portal/invoices", icon: FileText },
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
    const navItem = navigation.find(item => pathname === item.href || pathname.startsWith(item.href + "/"))
    if (navItem) return navItem.name
    if (pathname.startsWith("/portal/integrations")) return "Integrações"
    if (pathname.startsWith("/portal/tracking")) return "Rastreamento"
    if (pathname.startsWith("/portal/settings")) return "Configurações"
    if (pathname.startsWith("/portal/invoices")) return "Faturas"
    if (pathname.startsWith("/portal/stores")) return "Lojas"
    return "Portal"
  }

  // Sidebar content shared between desktop and mobile
  const SidebarNav = ({ onLinkClick }: { onLinkClick?: () => void }) => (
    <div className="space-y-1">
      {navigation.map((item) => {
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

    </div>
  )

  // Footer section shared between desktop and mobile
  const SidebarFooter = () => (
    <div className="border-t border-white/[0.06] p-3 space-y-1">
      {/* Store Switcher */}
      {stores.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-white/[0.06] transition-all duration-200 text-left group">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <Store className="h-4 w-4 text-slate-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-white/90 truncate">{activeStore?.name || "Selecionar loja"}</p>
                <p className="text-[11px] text-slate-500 truncate">{activeStore?.platform || ""}</p>
              </div>
              <ChevronsUpDown className="h-3.5 w-3.5 text-slate-500 group-hover:text-slate-400 flex-shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-[232px]">
            <DropdownMenuLabel className="text-xs text-slate-500">Lojas</DropdownMenuLabel>
            {stores.map((store) => (
              <DropdownMenuItem
                key={store.id}
                onClick={() => handleStoreChange(store)}
                className={cn(activeStore?.id === store.id && "bg-slate-100")}
              >
                <Store className="mr-2 h-4 w-4" />
                <span className="truncate">{store.name}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/portal/stores/new">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar loja
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Account Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-white/[0.06] transition-all duration-200 text-left group">
            <Avatar className="h-8 w-8">
              {user.avatar_url && <AvatarImage src={user.avatar_url} alt={user.name} />}
              <AvatarFallback className="bg-gradient-to-br from-[#0284C7] to-[#05AFF2] text-white text-[11px] font-semibold">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-white/90 truncate">{user.name}</p>
              <p className="text-[11px] text-slate-500 truncate">{user.clientName}</p>
            </div>
            <ChevronUp className="h-3.5 w-3.5 text-slate-500 group-hover:text-slate-400 flex-shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-[232px]">
          <DropdownMenuLabel>
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/portal/settings">
              <Settings className="mr-2 h-4 w-4" />
              Configurações
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/portal/invoices">
              <FileText className="mr-2 h-4 w-4" />
              Faturas
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/portal/stores">
              <Store className="mr-2 h-4 w-4" />
              Gerenciar Lojas
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
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
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-[260px] lg:flex-col z-40">
        <div className="flex flex-col flex-grow bg-[#0B0E14] overflow-hidden">
          {/* Logo */}
          <div className="flex h-[72px] items-center px-5">
            <Link href="/portal/dashboard" className="flex items-center gap-3">
              <Image
                src="/images/logo da convertfy com escrito branco.png"
                alt="Convertfy"
                width={220}
                height={56}
                className="h-14 w-auto object-contain"
                priority
              />
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 pt-2">
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Menu</p>
            <SidebarNav />
          </nav>

          {/* Footer: Store Switcher + Account Menu */}
          <SidebarFooter />
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden">
        <div className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center gap-3 border-b border-slate-200/80 dark:border-slate-700/40 bg-white/95 dark:bg-[#151922]/95 backdrop-blur-sm px-4">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-600 dark:text-slate-300">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[260px] p-0 bg-[#0B0E14] border-none">
              <div className="flex flex-col h-full">
                {/* Logo */}
                <div className="flex h-[72px] items-center px-5">
                  <Image
                    src="/images/logo da convertfy com escrito branco.png"
                    alt="Convertfy"
                    width={220}
                    height={56}
                    className="h-14 w-auto object-contain"
                  />
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-3 pt-2">
                  <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Menu</p>
                  <SidebarNav onLinkClick={() => setMobileMenuOpen(false)} />
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
                  <AvatarFallback className="bg-gradient-to-br from-[#0284C7] to-[#05AFF2] text-white text-[11px] font-semibold">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div>
                  <p className="font-medium">{user.name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/portal/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Configurações
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/portal/invoices">
                  <FileText className="mr-2 h-4 w-4" />
                  Faturas
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main Content */}
      <main className="lg:pl-[260px]">
        {/* Desktop Header */}
        <header className="hidden lg:flex sticky top-0 z-30 h-14 items-center justify-between border-b border-slate-200/80 dark:border-slate-700/40 bg-white/80 dark:bg-[#151922]/80 backdrop-blur-md px-8">
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
              <Bell className="h-[18px] w-[18px]" />
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6 pt-20 lg:pt-6 lg:px-8">{children}</div>
      </main>
    </div>
  )
}
