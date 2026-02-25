"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { AmbientBackground } from "@/components/ui/ambient-background"

interface PortalUser {
  id: string
  name: string
  email: string
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

// PRD v2.1: 4 main navigation items
const navigation = [
  { name: "Dashboard", href: "/portal/dashboard", icon: LayoutDashboard },
  { name: "Análise", href: "/portal/analytics", icon: BarChart3 },
  { name: "Campanhas", href: "/portal/campaigns", icon: Send },
  { name: "Flows", href: "/portal/flows", icon: GitBranch },
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
      // Skip auth check for login and change-password pages
      if (pathname === "/portal/login" || pathname === "/portal/change-password") {
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
            const storeList = (storesData.stores || []).map((s: { id: string; name: string; platform: string }) => ({
              id: s.id,
              name: s.name,
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

  // Show login and change-password pages without layout
  if (pathname === "/portal/login" || pathname === "/portal/change-password") {
    return <>{children}</>
  }

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  // If not authenticated, redirect to login
  if (!user) {
    router.push("/portal/login")
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  // Sidebar content shared between desktop and mobile
  const SidebarNav = ({ onLinkClick }: { onLinkClick?: () => void }) => (
    <>
      {navigation.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={onLinkClick}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.name}
          </Link>
        )
      })}
    </>
  )

  // Footer section shared between desktop and mobile
  const SidebarFooter = () => (
    <div className="border-t p-3 space-y-2">
      {/* Store Switcher */}
      {stores.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Store className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{activeStore?.name || "Selecionar loja"}</p>
                <p className="text-xs text-muted-foreground truncate">{activeStore?.platform || ""}</p>
              </div>
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-[232px]">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Lojas</DropdownMenuLabel>
            {stores.map((store) => (
              <DropdownMenuItem
                key={store.id}
                onClick={() => handleStoreChange(store)}
                className={cn(activeStore?.id === store.id && "bg-muted")}
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
          <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.clientName}</p>
            </div>
            <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-[232px]">
          <DropdownMenuLabel>
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
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
      className="min-h-screen bg-background relative"
      style={branding.primary_color !== "#3b82f6" ? {
        "--portal-primary": branding.primary_color,
        "--portal-primary-foreground": "#ffffff",
      } as React.CSSProperties : undefined}
    >
      <AmbientBackground />

      {/* Desktop Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow border-r bg-card">
          {/* Logo */}
          <div className="flex h-16 items-center gap-2 px-6 border-b">
            {branding.logo_url ? (
              <img src={branding.logo_url} alt={branding.name} className="h-8 w-8 rounded-lg object-contain" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">{branding.name.charAt(0)}</span>
              </div>
            )}
            <div>
              <span className="font-semibold">{branding.name}</span>
              <span className="text-xs text-muted-foreground block">Portal do Cliente</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            <SidebarNav />
          </nav>

          {/* Footer: Store Switcher + Account Menu */}
          <SidebarFooter />
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden">
        <div className="fixed top-0 left-0 right-0 z-40 flex h-16 items-center gap-4 border-b bg-card px-4">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <div className="flex flex-col h-full">
                {/* Logo */}
                <div className="flex h-16 items-center gap-2 px-6 border-b">
                  {branding.logo_url ? (
                    <img src={branding.logo_url} alt={branding.name} className="h-8 w-8 rounded-lg object-contain" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                      <span className="text-primary-foreground font-bold text-sm">{branding.name.charAt(0)}</span>
                    </div>
                  )}
                  <div>
                    <span className="font-semibold">{branding.name}</span>
                    <span className="text-xs text-muted-foreground block">Portal do Cliente</span>
                  </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-3 py-4 space-y-1">
                  <SidebarNav onLinkClick={() => setMobileMenuOpen(false)} />
                </nav>

                {/* Footer */}
                <SidebarFooter />
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex-1">
            <span className="font-semibold">{branding.name}</span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div>
                  <p className="font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
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
      <main className="lg:pl-64">
        {/* Desktop Header */}
        <header className="hidden lg:flex sticky top-0 z-30 h-16 items-center justify-between border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 px-6">
          <div>
            <h1 className="text-lg font-semibold">{user.clientName}</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon">
              <Bell className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6 pt-20 lg:pt-6">{children}</div>
      </main>
    </div>
  )
}
