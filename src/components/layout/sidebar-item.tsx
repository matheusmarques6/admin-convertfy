"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface SidebarItemProps {
  icon: LucideIcon
  label: string
  href: string
  collapsed?: boolean
  badge?: number
  onClick?: () => void
}

export function SidebarItem({
  icon,
  label,
  href,
  collapsed = false,
  badge,
  onClick,
}: SidebarItemProps) {
  const pathname = usePathname()
  const active = href === "/admin/dashboard"
    ? pathname === "/admin/dashboard" || pathname === "/admin/dashboard/operational"
    : pathname.startsWith(href)

  const content = (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "relative flex items-center rounded-[8px] text-[13px] font-medium",
        "transition-all duration-150",
        collapsed
          ? "w-9 h-9 justify-center mx-auto"
          : "mx-3 gap-3 px-3 h-9",
        active
          ? "bg-[#EEF0FB] text-[#4E62D8] dark:bg-white/[0.1] dark:text-white"
          : "text-gray-600 hover:bg-gray-50 dark:text-white/80 dark:hover:bg-white/[0.05] dark:hover:text-white"
      )}
    >
      <Icon
        icon={icon}
        size={16}
        className={cn(
          "shrink-0",
          active
            ? "text-[#4E62D8] dark:text-white"
            : "text-gray-400 dark:text-white/70"
        )}
      />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && badge != null && badge > 0 && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[18px] h-[18px] rounded-full bg-[#DC2626] text-white text-[10px] font-bold flex items-center justify-center px-1">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      {collapsed && badge != null && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-[#DC2626] text-white text-[10px] font-bold flex items-center justify-center px-1">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="text-xs font-medium px-2.5 py-1.5">
          {label}
          {badge != null && badge > 0 && ` (${badge})`}
        </TooltipContent>
      </Tooltip>
    )
  }

  return content
}
