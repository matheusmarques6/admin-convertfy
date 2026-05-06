"use client"

import * as React from "react"
import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import {
  Search,
  LayoutDashboard,
  Users,
  Store,
  Rocket,
  Kanban,
  CalendarDays,
  Zap,
  ClipboardList,
  Calendar,
  DollarSign,
  BarChart3,
  Wrench,
  Settings,
  UserPlus,
  Plus,
  FileText,
  Briefcase,
  HeartHandshake,
  Inbox,
  Workflow,
  Building2,
  Phone,
  type LucideIcon,
} from "lucide-react"
import { Icon as IconWrapper } from "@/components/ui/icon"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { DialogTitle } from "@/components/ui/dialog"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommandItem {
  name: string
  href: string
  icon: LucideIcon
  group: string
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const navigationItems: CommandItem[] = [
  { name: "Dashboard", href: "/admin/operacional/dashboard", icon: LayoutDashboard, group: "Navegação" },
  { name: "Clientes", href: "/admin/clients", icon: Users, group: "Navegação" },
  { name: "Lojas", href: "/admin/stores", icon: Store, group: "Navegação" },
  { name: "Onboarding", href: "/admin/onboarding", icon: Rocket, group: "Navegação" },
  { name: "Pipeline", href: "/admin/pipeline", icon: Kanban, group: "Navegação" },
  { name: "Campanhas", href: "/admin/campaigns", icon: CalendarDays, group: "Navegação" },
  { name: "Automações", href: "/admin/automations", icon: Zap, group: "Navegação" },
  { name: "Board", href: "/admin/board", icon: ClipboardList, group: "Navegação" },
  { name: "Reuniões", href: "/admin/meetings", icon: Calendar, group: "Navegação" },
  { name: "Financeiro", href: "/admin/financial", icon: DollarSign, group: "Navegação" },
  { name: "Relatórios", href: "/admin/reports", icon: BarChart3, group: "Navegação" },
  { name: "Ferramentas", href: "/admin/tools", icon: Wrench, group: "Navegação" },
  { name: "Configurações", href: "/admin/settings", icon: Settings, group: "Navegação" },

  // Comercial
  { name: "Comercial — Dashboard", href: "/admin/comercial/dashboard", icon: LayoutDashboard, group: "Comercial" },
  { name: "Comercial — Pipelines", href: "/admin/comercial/pipelines", icon: Briefcase, group: "Comercial" },
  { name: "Comercial — Leads", href: "/admin/comercial/leads", icon: UserPlus, group: "Comercial" },
  { name: "Comercial — Reports", href: "/admin/comercial/reports", icon: BarChart3, group: "Comercial" },

  // Operacional
  { name: "Operacional — Dashboard", href: "/admin/operacional/dashboard", icon: LayoutDashboard, group: "Operacional" },
  { name: "Operacional — Pipelines CS", href: "/admin/operacional/pipelines", icon: HeartHandshake, group: "Operacional" },
  { name: "Operacional — Saude", href: "/admin/health", icon: HeartHandshake, group: "Operacional" },
  { name: "Operacional — Automacoes", href: "/admin/operacional/automacoes", icon: Workflow, group: "Operacional" },
  { name: "Operacional — Canais (WhatsApp)", href: "/admin/operacional/canais", icon: Phone, group: "Operacional" },
  { name: "Operacional — Reports", href: "/admin/operacional/reports", icon: BarChart3, group: "Operacional" },

  // Compartilhado
  { name: "Inbox (mensagens)", href: "/admin/inbox", icon: Inbox, group: "Atendimento" },
]

const actionItems: CommandItem[] = [
  { name: "Novo Cliente", href: "/admin/clients/new", icon: UserPlus, group: "Ações Rápidas" },
  { name: "Nova Campanha", href: "/admin/campaigns", icon: Plus, group: "Ações Rápidas" },
  { name: "Nova Automação", href: "/admin/automations/new", icon: Zap, group: "Ações Rápidas" },
  { name: "Novo Relatório", href: "/admin/reports/new", icon: FileText, group: "Ações Rápidas" },
  { name: "Agendar Reunião", href: "/admin/meetings", icon: Calendar, group: "Ações Rápidas" },
  { name: "Novo lead (Comercial)", href: "/admin/comercial/leads", icon: UserPlus, group: "Ações Rápidas" },
]

const allItems: CommandItem[] = [...navigationItems, ...actionItems]

// ---------------------------------------------------------------------------
// Context for useCommandPalette hook
// ---------------------------------------------------------------------------

interface CommandPaletteContextValue {
  open: () => void
  isOpen: boolean
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null)

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext)
  if (!ctx) {
    throw new Error("useCommandPalette must be used within a <CommandPalette /> provider")
  }
  return ctx
}

/** Safe version that returns null when used outside the provider */
export function useCommandPaletteSafe(): CommandPaletteContextValue | null {
  return useContext(CommandPaletteContext)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette({ children }: { children?: React.ReactNode }) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const open = useCallback(() => setIsOpen(true), [])

  // ---- Filter items based on query ----
  const filtered = React.useMemo(() => {
    if (!query.trim()) return allItems
    const lower = query.toLowerCase()
    return allItems.filter((item) => item.name.toLowerCase().includes(lower))
  }, [query])

  // ---- Group filtered items ----
  const groups = React.useMemo(() => {
    const map = new Map<string, CommandItem[]>()
    for (const item of filtered) {
      const existing = map.get(item.group) || []
      existing.push(item)
      map.set(item.group, existing)
    }
    return map
  }, [filtered])

  // ---- Flat list for keyboard navigation ----
  const flatList = React.useMemo(() => {
    const items: CommandItem[] = []
    for (const group of groups.values()) {
      items.push(...group)
    }
    return items
  }, [groups])

  // ---- Reset state on open/close ----
  useEffect(() => {
    if (isOpen) {
      setQuery("")
      setActiveIndex(0)
      // Focus input after dialog opens
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [isOpen])

  // ---- Clamp activeIndex when filtered list changes ----
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  // ---- Global keyboard shortcut: Cmd+K / Ctrl+K ----
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  // ---- Navigate to item ----
  const selectItem = useCallback(
    (item: CommandItem) => {
      setIsOpen(false)
      router.push(item.href)
    },
    [router]
  )

  // ---- Keyboard navigation inside the palette ----
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        if (flatList.length > 0) {
          setActiveIndex((prev) => (prev + 1) % flatList.length)
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        if (flatList.length > 0) {
          setActiveIndex((prev) => (prev - 1 + flatList.length) % flatList.length)
        }
      } else if (e.key === "Enter") {
        e.preventDefault()
        if (flatList[activeIndex]) {
          selectItem(flatList[activeIndex])
        }
      }
    },
    [flatList, activeIndex, selectItem]
  )

  // ---- Scroll active item into view ----
  useEffect(() => {
    const activeEl = listRef.current?.querySelector(`[data-index="${activeIndex}"]`)
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" })
    }
  }, [activeIndex])

  const contextValue = React.useMemo<CommandPaletteContextValue>(
    () => ({ open, isOpen }),
    [open, isOpen]
  )

  // ---- Compute flat index for each item ----
  let flatIdx = 0

  return (
    <CommandPaletteContext.Provider value={contextValue}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          className={cn(
            "p-0 gap-0 overflow-hidden rounded-xl border border-white/10",
            "bg-[#0f1117] text-white shadow-2xl",
            "sm:max-w-[540px] top-[30%] translate-y-[-30%]"
          )}
          onKeyDown={handleKeyDown}
        >
          {/* Accessible title (visually hidden) */}
          <VisuallyHidden>
            <DialogTitle>Paleta de comandos</DialogTitle>
          </VisuallyHidden>

          {/* Search input */}
          <div className="flex items-center border-b border-white/10 px-4">
            <IconWrapper icon={Search} size={16} className="mr-3 text-zinc-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar páginas, ações..."
              className={cn(
                "flex h-12 w-full bg-transparent py-3 text-sm text-white",
                "placeholder:text-zinc-500 outline-none",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
              autoComplete="off"
              spellCheck={false}
            />
            <kbd className="ml-2 hidden shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 sm:inline-block">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <ScrollArea className="max-h-[320px]">
            <div ref={listRef} className="px-2 py-2">
              {flatList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                  <IconWrapper icon={Search} customSize={32} className="mb-3 text-zinc-600" />
                  <p className="text-sm">Nenhum resultado encontrado</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Tente buscar com outros termos
                  </p>
                </div>
              ) : (
                Array.from(groups.entries()).map(([groupName, items]) => (
                  <div key={groupName} className="mb-2 last:mb-0">
                    <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      {groupName}
                    </div>
                    {items.map((item) => {
                      const idx = flatIdx++
                      const isActive = idx === activeIndex
                      return (
                        <button
                          key={item.href}
                          data-index={idx}
                          onClick={() => selectItem(item)}
                          onMouseEnter={() => setActiveIndex(idx)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                            "text-zinc-300 outline-none",
                            isActive
                              ? "bg-white/10 text-white"
                              : "hover:bg-white/5"
                          )}
                        >
                          <IconWrapper icon={item.icon} size={16} className="text-zinc-400" />
                          <span className="truncate">{item.name}</span>
                          {isActive && (
                            <kbd className="ml-auto hidden shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 sm:inline-block">
                              Enter
                            </kbd>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[11px] text-zinc-500">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[10px]">&uarr;</kbd>
                <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[10px]">&darr;</kbd>
                <span className="ml-0.5">navegar</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[10px]">Enter</kbd>
                <span className="ml-0.5">selecionar</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[10px]">Esc</kbd>
                <span className="ml-0.5">fechar</span>
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </CommandPaletteContext.Provider>
  )
}
