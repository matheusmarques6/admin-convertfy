"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  LogOut,
  Sun,
  Moon,
  UserCircle,
  ChevronUp,
  Settings,
  Bell,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/lib/hooks/use-toast"
import { ROUTES } from "@/lib/routes"
import { useReportNotifications } from "@/hooks/use-report-notifications"

interface SidebarUserProps {
  user?: {
    name: string
    email: string
    avatar_url?: string
  }
  collapsed?: boolean
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function SidebarUser({ user, collapsed = false }: SidebarUserProps) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const { unreadCount: notificationsUnread } = useReportNotifications()

  async function handleLogout() {
    setIsLoggingOut(true)
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push(ROUTES.LOGIN)
      router.refresh()
    } catch {
      toast({
        variant: "destructive",
        title: "Erro ao sair",
        description: "Tente novamente",
      })
    } finally {
      setIsLoggingOut(false)
    }
  }

  const avatarEl = (
    <Avatar className="h-7 w-7 shrink-0 rounded-full">
      <AvatarImage src={user?.avatar_url} />
      <AvatarFallback className="rounded-full bg-gray-200 text-gray-600 text-[10px] font-semibold dark:bg-white/15 dark:text-white">
        {getInitials(user?.name || "U")}
      </AvatarFallback>
    </Avatar>
  )

  const trigger = (
    <DropdownMenuTrigger asChild>
      <button
        className={cn(
          "flex items-center w-full rounded-[8px] transition-colors duration-150 outline-none",
          "hover:bg-gray-50 dark:hover:bg-white/[0.05]",
          collapsed ? "justify-center p-1.5 mx-auto" : "gap-2.5 mx-3 px-3 py-3"
        )}
      >
        {avatarEl}
        {!collapsed && (
          <>
            <div className="text-left overflow-hidden flex-1 min-w-0">
              <p className="text-[13px] font-medium text-gray-700 dark:text-white truncate leading-tight">
                {user?.name || "Usuario"}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-white/60 truncate leading-tight mt-px">
                {user?.email}
              </p>
            </div>
            <ChevronUp className="h-3 w-3 text-gray-400 dark:text-white/50 shrink-0" />
          </>
        )}
      </button>
    </DropdownMenuTrigger>
  )

  const dropdownContent = (
    <DropdownMenuContent
      side={collapsed ? "right" : "top"}
      align={collapsed ? "start" : "center"}
      className="w-52 rounded-[8px]"
      sideOffset={8}
    >
      <DropdownMenuLabel className="font-normal px-3 py-2">
        <p className="text-sm font-medium">{user?.name || "Usuario"}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild className="rounded-md mx-1 px-2">
        <Link href={ROUTES.ADMIN.SETTINGS.PROFILE}>
          <Icon icon={UserCircle} size={16} className="mr-2 text-muted-foreground" />
          Perfil
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className="rounded-md mx-1 px-2">
        <Link href={ROUTES.ADMIN.SETTINGS.ROOT}>
          <Icon icon={Settings} size={16} className="mr-2 text-muted-foreground" />
          Configurações
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className="rounded-md mx-1 px-2">
        <Link href={ROUTES.ADMIN.NOTIFICATIONS} className="flex items-center w-full">
          <Icon icon={Bell} size={16} className="mr-2 text-muted-foreground" />
          <span className="flex-1">Notificações</span>
          {notificationsUnread > 0 && (
            <span className="ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
              {notificationsUnread > 99 ? "99+" : notificationsUnread}
            </span>
          )}
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <div className="mx-1 px-2 py-1.5 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Tema</span>
        <button
          className="relative flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </button>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="rounded-md mx-1 px-2 text-red-500 focus:text-red-500 focus:bg-red-500/10"
      >
        <LogOut className="mr-2 h-4 w-4" />
        Sair
      </DropdownMenuItem>
    </DropdownMenuContent>
  )

  if (collapsed) {
    return (
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="text-xs font-medium">
            {user?.name || "Usuario"}
          </TooltipContent>
        </Tooltip>
        {dropdownContent}
      </DropdownMenu>
    )
  }

  return (
    <DropdownMenu>
      {trigger}
      {dropdownContent}
    </DropdownMenu>
  )
}
