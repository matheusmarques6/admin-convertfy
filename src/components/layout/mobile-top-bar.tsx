"use client"

import { useState, useEffect, useCallback } from "react"
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
import { useAuthStore } from "@/lib/store"
import { notificationService } from "@/lib/services"
import { ROUTES } from "@/lib/routes"

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
  const { user } = useAuthStore()
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchCount = useCallback(async () => {
    if (!user?.id) return
    try {
      const count = await notificationService.getUnreadCount(user.id)
      setUnreadCount(count)
    } catch {
      // silent
    }
  }, [user?.id])

  useEffect(() => {
    fetchCount()
    const interval = setInterval(fetchCount, 30000)
    return () => clearInterval(interval)
  }, [fetchCount])

  return (
    <header
      className={cn(
        "sticky top-0 z-40 h-14 md:hidden",
        "flex items-center px-4",
        "bg-white border-b border-[rgba(0,0,0,0.08)]",
        "dark:bg-[#1A1D27] dark:border-[rgba(255,255,255,0.08)]"
      )}
    >
      {/* Hamburger */}
      <button
        onClick={openMobile}
        className="flex items-center justify-center w-11 h-11 -ml-2 rounded-[6px] text-gray-600 dark:text-[#8B92A5] hover:bg-gray-50 dark:hover:bg-[#242836] transition-colors"
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
          className="relative flex items-center justify-center w-11 h-11 rounded-[6px] text-gray-600 dark:text-[#8B92A5] hover:bg-gray-50 dark:hover:bg-[#242836] transition-colors"
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
                <AvatarFallback className="rounded-full bg-gray-200 text-gray-600 text-[11px] font-semibold dark:bg-[#242836] dark:text-[#8B92A5]">
                  {getInitials(userProp?.name || "U")}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-[8px]">
            <DropdownMenuItem asChild>
              <Link href={ROUTES.ADMIN.SETTINGS.PROFILE}>Perfil</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={ROUTES.ADMIN.SETTINGS.ROOT}>Configuracoes</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
