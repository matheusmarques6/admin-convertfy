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
        "relative mx-2 flex items-center gap-3 rounded-[6px] text-sm font-medium",
        "transition-colors duration-150 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
        "min-h-[36px] md:min-h-[36px]",
        collapsed ? "w-10 h-10 justify-center mx-auto" : "px-3 py-2",
        active
          ? "bg-[#EEF0FB] text-[#4E62D8] dark:bg-[rgba(123,140,234,0.12)] dark:text-[#7B8CEA]"
          : "text-gray-600 hover:bg-gray-50 dark:text-[#8B92A5] dark:hover:bg-[#242836]"
      )}
    >
      <Icon
        icon={icon}
        size={20}
        className={cn(
          "shrink-0",
          active
            ? "text-[#4E62D8] dark:text-[#7B8CEA]"
            : "text-gray-400 dark:text-[#5C6378]"
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
