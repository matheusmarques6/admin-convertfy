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
  /** Cor de acento do workspace ativo (CSS color string). */
  accentColor?: string
}

export function SidebarItem({
  icon,
  label,
  href,
  collapsed = false,
  badge,
  onClick,
  accentColor,
}: SidebarItemProps) {
  const pathname = usePathname()
  // Match exato pra dashboards de cada workspace, prefix pro resto
  const isExactMatch =
    href === "/admin/dashboard" ||
    href === "/admin/comercial/dashboard" ||
    href === "/admin/operacional/dashboard"
  const active = isExactMatch
    ? pathname === href
    : pathname === href || pathname.startsWith(href + "/")

  // Quando workspace tem cor, usa ela com bg sutil e texto branco;
  // senao mantem fallback original.
  const activeBg = accentColor ? `${accentColor}26` : undefined // ~15% alpha hex
  const activeBarColor = accentColor
  const activeFg = accentColor ? "#FFFFFF" : undefined

  const content = (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "relative flex items-center rounded-md text-[13px] font-medium",
        "transition-all duration-150",
        collapsed
          ? "w-9 h-9 justify-center mx-auto"
          : "mx-3 gap-3 px-3 h-9",
        active
          ? "text-white"
          : "text-white/70 hover:bg-white/[0.05] hover:text-white",
      )}
      style={
        active
          ? {
              background: activeBg ?? "rgba(255,255,255,0.08)",
              color: activeFg ?? "#FFFFFF",
            }
          : undefined
      }
    >
      {/* Barra colorida lateral quando ativo (so na versao expandida) */}
      {active && !collapsed && activeBarColor && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: -12,
            top: 6,
            bottom: 6,
            width: 3,
            background: activeBarColor,
            borderTopRightRadius: 3,
            borderBottomRightRadius: 3,
          }}
        />
      )}
      <Icon
        icon={icon}
        size={16}
        className={cn(
          "shrink-0",
          active ? "text-white" : "text-white/60",
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
        <TooltipContent
          side="right"
          sideOffset={8}
          className="text-xs font-medium px-2.5 py-1.5"
        >
          {label}
          {badge != null && badge > 0 && ` (${badge})`}
        </TooltipContent>
      </Tooltip>
    )
  }

  return content
}
