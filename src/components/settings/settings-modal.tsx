"use client"

/**
 * SettingsModal — Configurações como modal global (estilo ⌘K, maior).
 *
 * Estado 100% na URL via query param `?settings=<key>`, SEM mudar o
 * pathname: abrir Configurações não navega, então o workspace ativo da
 * sidebar e o estado da página de fundo ficam intactos, e F5 reabre o
 * modal na mesma seção. Os demais query params da página (ex.: ?tab=)
 * são PRESERVADOS no abrir/fechar (merge de URLSearchParams).
 *
 * As seções vêm do registry settings-sections.ts (fonte única com o hub
 * /admin/settings, que segue existindo como página cheia/fallback);
 * seções `kind: "page-link"` (gate server-side) navegam pra página cheia.
 * Gating adminOnly client-side via canSeeSection + usePermissions.
 *
 * Casca visual replica a CommandPalette (rounded-xl, border-white/10,
 * bg-[#0f1117], footer com kbds) em tamanho maior; o painel de conteúdo
 * usa bg-background para os componentes theme-aware das seções.
 */

import * as React from "react"
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowUpRight, Search, Settings as SettingsIcon } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Icon as IconWrapper } from "@/components/ui/icon"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { cn } from "@/lib/utils"
import { usePermissions } from "@/lib/hooks/use-permissions"
import {
  canSeeSection,
  findSettingsSection,
  SETTINGS_SECTIONS,
} from "./settings-sections"
import { SETTINGS_SECTION_COMPONENTS } from "./settings-section-components"

export const SETTINGS_PARAM = "settings"

// ── Helpers puros de URL (exportados para teste) ───────────────────────

/** Search string (sem "?") com o param de settings setado, preservando os demais. */
export function withSettingsParam(search: string, key: string): string {
  const sp = new URLSearchParams(search)
  sp.set(SETTINGS_PARAM, key)
  return sp.toString()
}

/** Search string (sem "?") com o param de settings removido, preservando os demais. */
export function withoutSettingsParam(search: string): string {
  const sp = new URLSearchParams(search)
  sp.delete(SETTINGS_PARAM)
  return sp.toString()
}

// ── Context ────────────────────────────────────────────────────────────

interface SettingsModalContextValue {
  /** Abre o modal (na seção dada, ou na primeira visível). */
  open: (sectionKey?: string) => void
  close: () => void
  isOpen: boolean
}

const SettingsModalContext = createContext<SettingsModalContextValue | null>(null)

export function useSettingsModalSafe(): SettingsModalContextValue | null {
  return useContext(SettingsModalContext)
}

// ── Provider + Modal ───────────────────────────────────────────────────

export function SettingsModalProvider({ children }: { children: React.ReactNode }) {
  return (
    // useSearchParams exige boundary de Suspense; o fallback rende os
    // children sem o modal (contexto null → entradas caem no href).
    <Suspense fallback={<>{children}</>}>
      <SettingsModalInner>{children}</SettingsModalInner>
    </Suspense>
  )
}

function SettingsModalInner({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentKey = searchParams.get(SETTINGS_PARAM)
  const currentSection = findSettingsSection(currentKey)
  const isOpen = currentSection !== null

  const navigate = useCallback(
    (search: string) => {
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false })
    },
    [router, pathname],
  )

  const open = useCallback(
    (sectionKey?: string) => {
      const key =
        findSettingsSection(sectionKey ?? null)?.key ?? SETTINGS_SECTIONS[0].key
      navigate(withSettingsParam(searchParams.toString(), key))
    },
    [navigate, searchParams],
  )

  const close = useCallback(() => {
    navigate(withoutSettingsParam(searchParams.toString()))
  }, [navigate, searchParams])

  const ctx = useMemo<SettingsModalContextValue>(
    () => ({ open, close, isOpen }),
    [open, close, isOpen],
  )

  return (
    <SettingsModalContext.Provider value={ctx}>
      {children}
      <Dialog open={isOpen} onOpenChange={(o) => (o ? open() : close())}>
        <DialogContent
          className={cn(
            "p-0 gap-0 overflow-hidden rounded-xl border border-white/10",
            "bg-[#0f1117] text-white shadow-2xl",
            "sm:max-w-[980px] w-[calc(100vw-2rem)] h-[82dvh] max-h-[82dvh]",
            "flex flex-col",
          )}
        >
          <VisuallyHidden>
            <DialogTitle>Configurações</DialogTitle>
          </VisuallyHidden>
          {isOpen && currentSection && (
            <SettingsModalBody
              activeKey={currentSection.key}
              onSelect={(key) => open(key)}
              onNavigateOut={(href) => {
                close()
                router.push(href)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </SettingsModalContext.Provider>
  )
}

// ── Corpo do modal (nav + conteúdo) ────────────────────────────────────

function SettingsModalBody({
  activeKey,
  onSelect,
  onNavigateOut,
}: {
  activeKey: string
  onSelect: (key: string) => void
  onNavigateOut: (href: string) => void
}) {
  const { permissions } = usePermissions()
  const [query, setQuery] = useState("")

  const visibleSections = useMemo(
    () => SETTINGS_SECTIONS.filter((s) => canSeeSection(s, permissions)),
    [permissions],
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return visibleSections
    return visibleSections.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q),
    )
  }, [visibleSections, query])

  const active = findSettingsSection(activeKey)
  const ActiveComponent = active ? SETTINGS_SECTION_COMPONENTS[active.key] : null

  const selectSection = (key: string) => {
    const section = findSettingsSection(key)
    if (!section) return
    if (section.kind === "page-link") {
      onNavigateOut(section.href)
    } else {
      onSelect(key)
    }
  }

  // ↑/↓ navegam a lista filtrada; Enter seleciona (mesma gramática do ⌘K).
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return
    if (filtered.length === 0) return
    e.preventDefault()
    const idx = Math.max(0, filtered.findIndex((s) => s.key === activeKey))
    if (e.key === "ArrowDown") selectSection(filtered[(idx + 1) % filtered.length].key)
    else if (e.key === "ArrowUp")
      selectSection(filtered[(idx - 1 + filtered.length) % filtered.length].key)
    else selectSection(filtered[idx].key)
  }

  return (
    <>
      {/* Header — mesma anatomia da ⌘K */}
      <div className="flex items-center border-b border-white/10 px-4 shrink-0">
        <IconWrapper icon={SettingsIcon} size={16} className="mr-3 text-zinc-400" />
        <span className="text-sm font-medium text-white mr-4">Configurações</span>
        <div className="flex items-center flex-1 min-w-0">
          <IconWrapper icon={Search} customSize={14} className="mr-2 text-zinc-500 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar seção..."
            className={cn(
              "flex h-12 w-full bg-transparent py-3 text-sm text-white",
              "placeholder:text-zinc-500 outline-none",
            )}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <kbd className="ml-2 hidden shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 sm:inline-block">
          ESC
        </kbd>
      </div>

      {/* Corpo: nav escura à esquerda + conteúdo theme-aware à direita */}
      <div className="flex flex-1 min-h-0">
        <nav className="w-56 shrink-0 border-r border-white/10 py-2 px-2 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-xs text-zinc-500">Nenhuma seção encontrada</p>
          ) : (
            filtered.map((section) => {
              const isActive = section.key === activeKey
              return (
                <button
                  key={section.key}
                  onClick={() => selectSection(section.key)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors",
                    "text-zinc-300 outline-none text-left",
                    isActive ? "bg-white/10 text-white" : "hover:bg-white/5",
                  )}
                >
                  <IconWrapper
                    icon={section.icon}
                    customSize={15}
                    className="text-zinc-400 shrink-0"
                  />
                  <span className="truncate flex-1">{section.title}</span>
                  {section.kind === "page-link" && (
                    <IconWrapper
                      icon={ArrowUpRight}
                      customSize={12}
                      className="text-zinc-500 shrink-0"
                    />
                  )}
                </button>
              )
            })
          )}
        </nav>

        <div className="flex-1 min-w-0 bg-background text-foreground">
          <ScrollArea className="h-full">
            <div className="p-6">
              {ActiveComponent ? (
                <ActiveComponent />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Esta seção abre em página própria.
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Footer — mesma gramática da ⌘K */}
      <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[11px] text-zinc-500 shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[10px]">&uarr;</kbd>
            <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[10px]">&darr;</kbd>
            <span className="ml-0.5">navegar</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[10px]">Esc</kbd>
            <span className="ml-0.5">fechar</span>
          </span>
        </div>
        <a
          href={active?.href ?? "/admin/settings"}
          className="flex items-center gap-1 hover:text-zinc-300 transition-colors"
        >
          <IconWrapper icon={ArrowUpRight} customSize={12} />
          Abrir em página cheia
        </a>
      </div>
    </>
  )
}
