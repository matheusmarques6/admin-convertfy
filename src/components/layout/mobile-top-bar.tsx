"use client"

import Link from "next/link"
import { Menu, Bell } from "lucide-react"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/ui/logo"
import { Icon } from "@/components/ui/icon"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSidebarStore } from "@/hooks/use-sidebar"
import { ROUTES } from "@/lib/routes"
import { useSettingsModalSafe } from "@/components/settings/settings-modal"
import { useUnifiedNotifications } from "@/hooks/use-unified-notifications"

interface MobileTopBarProps {
  user?: {
    name: string
    email: string
    avatar_url?: string
  }
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function MobileTopBar({ user: userProp }: MobileTopBarProps) {
  const { openMobile } = useSidebarStore()
  const settingsModal = useSettingsModalSafe()
  // Badge unificado (sino + relatórios) com realtime — substitui o
  // setInterval de 30s + notificationService direto que só via o sino.
  const { unreadTotal: unreadCount } = useUnifiedNotifications()

  return (
    <header
      className={cn(
        "sticky top-0 z-40 h-14 md:hidden",
        "flex items-center px-4",
        "bg-white border-b border-[rgba(0,0,0,0.08)]",
        "dark:bg-[var(--sidebar-background)] dark:border-[var(--dark-border)]"
      )}
    >
      {/* Hamburger */}
      <button
        onClick={openMobile}
        className="flex items-center justify-center w-11 h-11 -ml-2 rounded-[6px] text-gray-600 dark:text-[var(--dark-text-secondary)] hover:bg-gray-50 dark:hover:bg-[var(--dark-surface-elevated)] transition-colors"
        aria-label="Abrir menu"
      >
        <Icon icon={Menu} size={20} />
      </button>

      {/* Logo — center */}
      <div className="flex-1 flex justify-center">
        <Link href={ROUTES.ADMIN.DASHBOARD}>
          <Logo size="sm" />
        </Link>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1">
        {/* Notification bell */}
        <Link
          href={ROUTES.ADMIN.NOTIFICATIONS}
          className="relative flex items-center justify-center w-11 h-11 rounded-[6px] text-gray-600 dark:text-[var(--dark-text-secondary)] hover:bg-gray-50 dark:hover:bg-[var(--dark-surface-elevated)] transition-colors"
        >
          <Icon icon={Bell} size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 rounded-full bg-[#DC2626] text-white text-[10px] font-bold flex items-center justify-center px-1">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>

        {/* User avatar */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center justify-center w-11 h-11 rounded-[6px]">
              <Avatar className="h-8 w-8 rounded-full">
                <AvatarImage src={userProp?.avatar_url} />
                <AvatarFallback className="rounded-full bg-gray-200 text-gray-600 text-[11px] font-semibold dark:bg-[#242836] dark:text-[var(--dark-text-secondary)]">
                  {getInitials(userProp?.name || "U")}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-[8px]">
            {/* Abre o SettingsModal (não navega); fallback Link sem provider. */}
            {settingsModal ? (
              <>
                <DropdownMenuItem onClick={() => settingsModal.open("account")}>
                  Perfil
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => settingsModal.open()}>
                  Configuracoes
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem asChild>
                  <Link href={ROUTES.ADMIN.SETTINGS.PROFILE}>Perfil</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={ROUTES.ADMIN.SETTINGS.ROOT}>Configuracoes</Link>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
