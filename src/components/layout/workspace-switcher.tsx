"use client"

/**
 * WorkspaceTabs — switcher de workspaces em ABAS de ícone (design
 * ago/2026, shell variante C). Substitui o dropdown antigo: troca em
 * 1 clique, os 3 sistemas sempre visíveis.
 *
 * Gate por função: workspace sem NENHUM item permitido aparece com
 * cadeado e desabilitado (antes o switcher deixava entrar num
 * workspace vazio). A régua é a MESMA da sidebar (filterNavGroups).
 */

import { useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { usePermissions } from "@/lib/hooks/use-permissions"
import { useWorkspace, WORKSPACES, type WorkspaceKey } from "@/hooks/use-workspace"
import {
  firstAllowedItem,
  workspaceAllowed,
  type NavPermissionCtx,
} from "./nav-config"

const WS_ORDER: WorkspaceKey[] = ["comercial", "operacional", "geral"]

export function useNavPermissionCtx(): NavPermissionCtx | null {
  const { permissions, canAccess, isLoading } = usePermissions()
  return useMemo(() => {
    if (isLoading || !permissions) return null
    return {
      canAccess,
      isAdmin: permissions.isAdmin,
      roles: permissions.roles,
      storeAccessCount: permissions.storeAccess.length,
    }
  }, [permissions, canAccess, isLoading])
}

/**
 * Hook compartilhado (abas + atalhos ⌥1-3): navega pro 1º item
 * permitido do workspace — a home do workspace pode ser vetada pra
 * função (ex.: designer não vê o Dashboard operacional, mas vê Lojas).
 */
export function useWorkspaceNavigation() {
  const router = useRouter()
  const ctx = useNavPermissionCtx()

  const goTo = (ws: WorkspaceKey): boolean => {
    if (!ctx || !workspaceAllowed(ws, ctx)) return false
    const item = firstAllowedItem(ws, ctx)
    if (!item) return false
    router.push(item.href)
    return true
  }

  return { ctx, goTo }
}

interface WorkspaceTabsProps {
  current: WorkspaceKey
}

export function WorkspaceTabs({ current }: WorkspaceTabsProps) {
  const router = useRouter()
  const { ctx, goTo } = useWorkspaceNavigation()

  // Prefetch dos destinos permitidos — troca de workspace instantânea.
  useEffect(() => {
    if (!ctx) return
    for (const ws of WS_ORDER) {
      if (ws === current) continue
      const item = firstAllowedItem(ws, ctx)
      if (item) router.prefetch(item.href)
    }
  }, [ctx, current, router])

  return (
    <div
      className="flex gap-0.5 rounded-lg p-[3px] bg-[var(--sidebar-track)]"
      role="tablist"
      aria-label="Workspaces"
    >
      {WS_ORDER.map((ws, i) => {
        const meta = WORKSPACES[ws]
        const allowed = ctx ? workspaceAllowed(ws, ctx) : false
        const on = ws === current
        const tab = (
          <button
            key={ws}
            role="tab"
            aria-selected={on}
            disabled={!allowed}
            onClick={() => {
              if (allowed && !on) goTo(ws)
            }}
            className={cn(
              "flex-1 h-[30px] rounded-md flex items-center justify-center",
              "transition-colors duration-150 outline-none",
              on
                ? "bg-[var(--sidebar-tab-on)] shadow-sm dark:shadow-none"
                : allowed
                  ? "text-[var(--sidebar-muted-foreground)] hover:text-[var(--sidebar-foreground)]"
                  : "opacity-40 cursor-not-allowed",
            )}
          >
            {on ? (
              <span
                className="flex text-[var(--ws-accent)] dark:text-[var(--ws-accent-dark)]"
                style={{
                  ["--ws-accent" as string]: meta.color,
                  ["--ws-accent-dark" as string]: meta.colorDark,
                }}
              >
                <Icon icon={meta.icon} customSize={15} />
              </span>
            ) : allowed ? (
              <Icon icon={meta.icon} customSize={15} />
            ) : (
              <Icon icon={Lock} customSize={13} />
            )}
          </button>
        )
        return (
          <Tooltip key={ws}>
            <TooltipTrigger asChild>{tab}</TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6} className="text-xs font-medium">
              {allowed
                ? `${meta.label} (⌥${i + 1})`
                : `${meta.label} — sem acesso com esta função`}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

/**
 * Compat: alguns pontos ainda importam WorkspaceSwitcher pelo nome
 * antigo. O visual agora é o de abas.
 */
export function WorkspaceSwitcher({ current }: { current: WorkspaceKey; collapsed?: boolean }) {
  return <WorkspaceTabs current={current} />
}
