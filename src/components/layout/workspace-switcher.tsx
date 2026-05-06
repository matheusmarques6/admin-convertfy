"use client"

import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  WORKSPACES,
  type WorkspaceKey,
  type WorkspaceMeta,
} from "@/hooks/use-workspace"

interface WorkspaceSwitcherProps {
  current: WorkspaceKey
  collapsed?: boolean
}

/**
 * Switcher minimalista no topo da sidebar.
 *
 * Expandido: segmented control horizontal estilo Linear/Vercel — 3 abas
 * compactas com icone + label. Click leva direto pro home do workspace.
 *
 * Colapsado: stack vertical de 3 icones com tooltip ao hover.
 *
 * Sem descricao embaixo, sem dropdown, sem chevron — direto e visual.
 */
export function WorkspaceSwitcher({
  current,
  collapsed = false,
}: WorkspaceSwitcherProps) {
  const router = useRouter()
  const goTo = (w: WorkspaceMeta) => router.push(w.homeHref)

  const items = Object.values(WORKSPACES)

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={100}>
        <div
          className="mx-auto flex flex-col items-center gap-1 p-1 rounded-md"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          {items.map((w) => {
            const Icon = w.icon
            const active = w.key === current
            return (
              <Tooltip key={w.key}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => goTo(w)}
                    aria-label={`Workspace ${w.label}`}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded transition-all",
                      active
                        ? "shadow-sm"
                        : "text-white/55 hover:text-white hover:bg-white/[0.06]"
                    )}
                    style={
                      active
                        ? {
                            background: w.color,
                            color: "#FFFFFF",
                          }
                        : undefined
                    }
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10} className="text-xs">
                  {w.label}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </TooltipProvider>
    )
  }

  return (
    <div className="px-3">
      <div
        className="grid grid-cols-3 gap-0.5 p-1 rounded-md"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.04)",
        }}
        role="tablist"
        aria-label="Selecionar workspace"
      >
        {items.map((w) => {
          const Icon = w.icon
          const active = w.key === current
          return (
            <button
              key={w.key}
              role="tab"
              aria-selected={active}
              onClick={() => goTo(w)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 py-1.5 rounded transition-all",
                active
                  ? "text-white"
                  : "text-white/55 hover:text-white/80 hover:bg-white/[0.04]"
              )}
              style={
                active
                  ? {
                      background: w.color,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                    }
                  : undefined
              }
              title={w.description}
            >
              <Icon className="h-3.5 w-3.5" />
              <span
                className="leading-none"
                style={{
                  fontSize: 10,
                  fontWeight: active ? 600 : 500,
                  letterSpacing: "0.01em",
                }}
              >
                {w.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
