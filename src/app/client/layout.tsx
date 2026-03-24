"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { InvoiceBanner } from "@/components/portal/invoice-banner"
import { ClientSidebar, ClientSidebarMobileDrawer } from "@/components/client-layout/client-sidebar"
import { ClientMobileTopBar } from "@/components/client-layout/client-mobile-top-bar"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PortalUser {
  id: string
  name: string
  email: string
  avatar_url: string | null
  clientName: string
  clientId: string
  mustChangePassword: boolean
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<PortalUser | null>(null)
  const [loading, setLoading] = useState(true)

  // ── Auth check ──────────────────────────────────────────────────────────
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
      } catch (error) {
        console.error("Auth check failed:", error)
        window.location.href = "/client/login"
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [pathname])

  // ── Avatar changed event ────────────────────────────────────────────────
  useEffect(() => {
    const handleAvatarChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ avatar_url: string | null }>).detail
      setUser((prev) => prev ? { ...prev, avatar_url: detail.avatar_url } : null)
    }
    window.addEventListener("portal-avatar-changed", handleAvatarChanged)
    return () => window.removeEventListener("portal-avatar-changed", handleAvatarChanged)
  }, [])

  // ── Public pages (login, change-password, auth callback) ────────────────
  if (pathname === "/client/login" || pathname === "/client/change-password" || pathname.startsWith("/client/auth/")) {
    return <>{children}</>
  }

  // ── Loading state ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#FCFCFD] dark:bg-[#0F1117]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[#4E8FFF]/20 border-t-[#4E8FFF]" />
          <span className="text-sm text-gray-400 dark:text-[#5C6378]">Carregando...</span>
        </div>
      </div>
    )
  }

  // ── Not authenticated ───────────────────────────────────────────────────
  if (!user) {
    router.push("/client/login")
    return (
      <div className="flex h-screen items-center justify-center bg-[#FCFCFD] dark:bg-[#0F1117]">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[#4E8FFF]/20 border-t-[#4E8FFF]" />
      </div>
    )
  }

  // ── User data for sidebar components ────────────────────────────────────
  const sidebarUser = {
    name: user.name,
    email: user.email,
    clientName: user.clientName,
    avatar_url: user.avatar_url,
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-[#FCFCFD] dark:bg-[#0F1117]">
      {/* Sidebar — desktop/tablet (hidden on mobile) */}
      <div className="hidden md:block shrink-0">
        <ClientSidebar user={sidebarUser} />
      </div>

      {/* Sidebar mobile drawer */}
      <ClientSidebarMobileDrawer user={sidebarUser} />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar — only < 768px */}
        <ClientMobileTopBar user={sidebarUser} />

        {/* Invoice urgency banner */}
        <InvoiceBanner />

        {/* Page content with responsive padding */}
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="shrink-0 pt-2 pb-4 px-4 text-center">
          <p className="text-xs text-gray-400 dark:text-[#5C6378]">
            Powered by <span className="font-medium text-gray-500 dark:text-[#8B92A5]">Convertfy</span> · &copy; {new Date().getFullYear()}
          </p>
        </footer>
      </div>
    </div>
  )
}
