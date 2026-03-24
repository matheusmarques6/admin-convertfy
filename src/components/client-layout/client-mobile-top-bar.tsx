"use client"

import Link from "next/link"
import { Menu } from "lucide-react"
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

interface ClientMobileTopBarProps {
  user?: {
    name: string
    email: string
    avatar_url?: string | null
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

export function ClientMobileTopBar({ user }: ClientMobileTopBarProps) {
  const { openMobile } = useSidebarStore()

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
        <Link href={ROUTES.CLIENT.DASHBOARD}>
          <Logo size="sm" />
        </Link>
      </div>

      {/* User avatar */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center justify-center w-11 h-11 rounded-[6px]">
            <Avatar className="h-8 w-8 rounded-full">
              <AvatarImage src={user?.avatar_url || undefined} />
              <AvatarFallback className="rounded-full bg-gray-200 text-gray-600 text-[11px] font-semibold dark:bg-[#242836] dark:text-[#8B92A5]">
                {getInitials(user?.name || "U")}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 rounded-[8px]">
          <DropdownMenuItem asChild>
            <Link href={ROUTES.CLIENT.SETTINGS}>Perfil</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={ROUTES.CLIENT.CHANGE_PASSWORD}>Alterar Senha</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
