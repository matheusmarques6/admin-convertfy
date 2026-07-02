"use client"

import { useEffect, useState } from "react"
import { InvoiceBanner } from "@/components/portal/invoice-banner"
import { ClientSidebar, ClientSidebarMobileDrawer } from "@/components/client-layout/client-sidebar"
import { ClientMobileTopBar } from "@/components/client-layout/client-mobile-top-bar"

interface PortalShellUser {
  name: string
  email: string
  clientName: string
  avatar_url: string | null
}

export function PortalShell({
  user,
  children,
}: {
  user: PortalShellUser
  children: React.ReactNode
}) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatar_url)

  // ── Avatar changed event ────────────────────────────────────────────────
  useEffect(() => {
    const handleAvatarChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ avatar_url: string | null }>).detail
      setAvatarUrl(detail.avatar_url)
    }
    window.addEventListener("portal-avatar-changed", handleAvatarChanged)
    return () => window.removeEventListener("portal-avatar-changed", handleAvatarChanged)
  }, [])

  const sidebarUser = {
    name: user.name,
    email: user.email,
    clientName: user.clientName,
    avatar_url: avatarUrl,
  }

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
