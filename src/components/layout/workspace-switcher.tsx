"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown } from "lucide-react"
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
 * Switcher visual no topo da sidebar. Mostra o workspace atual com
 * cor + iniciais e abre menu pra trocar. Quando colapsado, vira so
 * um quadrado clicavel com as iniciais.
 *
 * O sidebar inteiro usa o `current` workspace pra filtrar os itens
 * de navegacao — visualmente parece um sistema diferente em cada um.
 */
export function WorkspaceSwitcher({
  current,
  collapsed = false,
}: WorkspaceSwitcherProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const meta = WORKSPACES[current]

  // Fecha menu ao clicar fora
  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onClickOutside)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const goTo = (w: WorkspaceMeta) => {
    setOpen(false)
    router.push(w.homeHref)
  }

  if (collapsed) {
    return (
      <div ref={containerRef} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="mx-auto flex h-9 w-9 items-center justify-center rounded-md transition-transform hover:scale-105"
          style={{
            background: meta.color,
            color: meta.colorFg,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
          aria-label={`Workspace: ${meta.label}`}
          title={`Workspace: ${meta.label}`}
        >
          {meta.initials}
        </button>
        {open && (
          <WorkspaceMenu
            current={current}
            collapsed
            onSelect={goTo}
          />
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative px-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
          "hover:bg-white/[0.06]",
        )}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{
            background: meta.color,
            color: meta.colorFg,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          {meta.initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-white leading-tight">
            {meta.label}
          </span>
          <span className="block truncate text-[10px] text-white/50 leading-tight mt-0.5">
            {meta.description}
          </span>
        </span>
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0 text-white/50"
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 200ms",
          }}
        />
      </button>
      {open && (
        <WorkspaceMenu
          current={current}
          onSelect={goTo}
        />
      )}
    </div>
  )
}

interface WorkspaceMenuProps {
  current: WorkspaceKey
  collapsed?: boolean
  onSelect: (w: WorkspaceMeta) => void
}

function WorkspaceMenu({ current, collapsed, onSelect }: WorkspaceMenuProps) {
  return (
    <div
      className={cn(
        "absolute z-50 mt-1 overflow-hidden rounded-md",
        "bg-[#0F1117] border border-white/10 shadow-2xl",
        collapsed ? "left-full ml-2 top-0 w-56" : "left-3 right-3"
      )}
    >
      <div className="px-3 py-2 border-b border-white/[0.06]">
        <span className="text-[10px] uppercase tracking-wider text-white/45 font-medium">
          Trocar workspace
        </span>
      </div>
      <div className="p-1">
        {Object.values(WORKSPACES).map((w) => {
          const isCurrent = w.key === current
          return (
            <button
              key={w.key}
              onClick={() => onSelect(w)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded px-2 py-2 text-left transition-colors",
                isCurrent ? "bg-white/[0.08]" : "hover:bg-white/[0.06]",
              )}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                style={{
                  background: w.color,
                  color: w.colorFg,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                }}
              >
                {w.initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-white leading-tight">
                  {w.label}
                </span>
                <span className="block truncate text-[10px] text-white/50 leading-tight mt-0.5">
                  {w.description}
                </span>
              </span>
              {isCurrent && (
                <Check className="h-3.5 w-3.5 shrink-0 text-white/70" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
