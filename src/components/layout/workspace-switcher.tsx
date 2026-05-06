"use client"

import { useRouter } from "next/navigation"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
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
 * Switcher de workspace estilo Linear/Vercel — card clicavel no topo
 * da sidebar com dropdown elegante. Acessibilidade gratis via Radix
 * (focus trap, escape, click-outside, ARIA).
 *
 * Trigger expandido: avatar quadrado 36px com icone + label/descricao
 * em duas linhas + chevron. Hover bg sutil.
 *
 * Trigger colapsado: somente o quadrado 36px clicavel; dropdown
 * abre lateralmente.
 *
 * Dropdown: header "Workspaces" minusculo + 3 items com avatar +
 * label/descricao + check do ativo. Animacao slide+fade do Radix.
 */
export function WorkspaceSwitcher({
  current,
  collapsed = false,
}: WorkspaceSwitcherProps) {
  const router = useRouter()
  const meta = WORKSPACES[current]
  const TriggerIcon = meta.icon
  const goTo = (w: WorkspaceMeta) => router.push(w.homeHref)

  return (
    <div className={collapsed ? "flex justify-center" : "px-3"}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          {collapsed ? (
            <button
              aria-label={`Workspace atual: ${meta.label}`}
              title={`${meta.label} — clique para trocar`}
              className="group flex h-9 w-9 items-center justify-center rounded-md transition-all outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              style={{
                background: meta.color,
                color: "#FFFFFF",
                boxShadow: "0 1px 2px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1)",
              }}
            >
              <TriggerIcon className="h-4 w-4" />
            </button>
          ) : (
            <button
              aria-label="Trocar workspace"
              className={cn(
                "group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors outline-none",
                "hover:bg-white/[0.05] focus-visible:bg-white/[0.05] focus-visible:ring-1 focus-visible:ring-white/20",
              )}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                style={{
                  background: meta.color,
                  color: "#FFFFFF",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1)",
                }}
              >
                <TriggerIcon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block truncate leading-tight text-white"
                  style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em" }}
                >
                  {meta.label}
                </span>
                <span
                  className="block truncate leading-tight text-white/50 mt-0.5"
                  style={{ fontSize: 11 }}
                >
                  {meta.description}
                </span>
              </span>
              <ChevronsUpDown
                className="h-3.5 w-3.5 shrink-0 text-white/40 group-hover:text-white/70 transition-colors"
              />
            </button>
          )}
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align={collapsed ? "start" : "start"}
            side={collapsed ? "right" : "bottom"}
            sideOffset={collapsed ? 12 : 6}
            alignOffset={collapsed ? 0 : 0}
            className={cn(
              "z-50 w-[260px] overflow-hidden rounded-lg p-1.5",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
              "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
              "data-[side=bottom]:slide-in-from-top-1 data-[side=right]:slide-in-from-left-1",
            )}
            style={{
              background: "#0E1015",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow:
                "0 12px 32px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            <DropdownMenu.Label
              className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40"
            >
              Workspaces
            </DropdownMenu.Label>
            <div className="space-y-0.5">
              {Object.values(WORKSPACES).map((w) => {
                const Icon = w.icon
                const active = w.key === current
                return (
                  <DropdownMenu.Item
                    key={w.key}
                    onSelect={() => goTo(w)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-left outline-none transition-colors",
                      "data-[highlighted]:bg-white/[0.06]",
                      active && "bg-white/[0.04]",
                    )}
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                      style={{
                        background: w.color,
                        color: "#FFFFFF",
                        boxShadow:
                          "0 1px 2px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1)",
                      }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate leading-tight text-white"
                        style={{
                          fontSize: 12.5,
                          fontWeight: active ? 600 : 500,
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {w.label}
                      </span>
                      <span
                        className="block truncate leading-tight text-white/45 mt-0.5"
                        style={{ fontSize: 10.5 }}
                      >
                        {w.description}
                      </span>
                    </span>
                    {active && (
                      <Check
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: w.color }}
                      />
                    )}
                  </DropdownMenu.Item>
                )
              })}
            </div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}
