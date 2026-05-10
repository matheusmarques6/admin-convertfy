"use client"

import { useState } from "react"
import {
  Search,
  Plus,
  Settings,
  ChevronDown,
  Rocket,
  Users,
  MessageSquare,
  LifeBuoy,
  LayoutDashboard,
  X,
} from "lucide-react"
import type { OperationalPipeline } from "@/types/operational-pipeline"
import { OperationalSettingsDialog } from "./operational-settings-dialog"

const ICON_MAP = {
  rocket: Rocket,
  users: Users,
  "message-square": MessageSquare,
  "life-buoy": LifeBuoy,
  "layout-kanban": LayoutDashboard,
} as const

interface Props {
  pipeline: OperationalPipeline
  taskCount: number
  totalTasks: number
  search: string
  onSearchChange: (v: string) => void
  priorityFilter: string
  onPriorityChange: (v: string) => void
  assigneeFilter: string
  onAssigneeChange: (v: string) => void
  clientFilter: string
  onClientChange: (v: string) => void
  storeFilter: string
  onStoreChange: (v: string) => void
  owners: Array<{ id: string; name: string; avatar_url: string | null }>
  clients: Array<{ id: string; name: string }>
  stores: Array<{ id: string; store_name: string }>
  onNewTask: () => void
  onPipelineUpdated: () => void
  onClearFilters: () => void
}

export function OperationalHeader({
  pipeline,
  taskCount,
  totalTasks,
  search,
  onSearchChange,
  priorityFilter,
  onPriorityChange,
  assigneeFilter,
  onAssigneeChange,
  clientFilter,
  onClientChange,
  storeFilter,
  onStoreChange,
  owners,
  clients,
  stores,
  onNewTask,
  onPipelineUpdated,
  onClearFilters,
}: Props) {
  const hasActiveFilters =
    !!search ||
    !!priorityFilter ||
    !!assigneeFilter ||
    !!clientFilter ||
    !!storeFilter
  const [settingsOpen, setSettingsOpen] = useState(false)
  const Icon =
    ICON_MAP[pipeline.icon as keyof typeof ICON_MAP] ?? LayoutDashboard

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 px-5 py-2.5 bg-white dark:bg-[#0F1117] border-b border-black/[0.06] dark:border-white/[0.08]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-[6px] shrink-0"
            style={{ background: `${pipeline.color}1A`, color: pipeline.color }}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <h1 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white truncate">
            {pipeline.name}
          </h1>
          {pipeline.description && (
            <span className="hidden lg:inline text-[12px] text-slate-500 dark:text-white/45 truncate">
              · {pipeline.description}
            </span>
          )}
          <span className="text-[11px] font-medium text-slate-400 dark:text-white/40 tabular-nums shrink-0 ml-1">
            {taskCount}
          </span>
        </div>

        <div className="relative w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-white/40" />
          <input
            type="text"
            placeholder="Buscar tasks..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-8 rounded-[6px] pl-8 pr-7 text-[12px] bg-slate-50 dark:bg-white/[0.04] text-slate-900 dark:text-white/90 border border-black/[0.06] dark:border-white/[0.06] placeholder:text-slate-400 dark:placeholder:text-white/30 focus:outline-none focus:border-slate-300 dark:focus:border-white/20"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-white/40 dark:hover:text-white/70"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="relative">
          <select
            value={priorityFilter}
            onChange={(e) => onPriorityChange(e.target.value)}
            className="appearance-none h-8 pl-3 pr-7 text-[12px] font-medium rounded-[6px] bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-white/80 border border-black/[0.06] dark:border-white/[0.06] hover:bg-white dark:hover:bg-[#1A1D27] cursor-pointer focus:outline-none"
          >
            <option value="">Todas prioridades</option>
            <option value="urgent">Urgente</option>
            <option value="high">Alta</option>
            <option value="medium">Média</option>
            <option value="low">Baixa</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-slate-400 dark:text-white/40" />
        </div>

        {owners.length > 1 && (
          <div className="relative">
            <select
              value={assigneeFilter}
              onChange={(e) => onAssigneeChange(e.target.value)}
              className="appearance-none h-8 pl-3 pr-7 text-[12px] font-medium rounded-[6px] bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-white/80 border border-black/[0.06] dark:border-white/[0.06] hover:bg-white dark:hover:bg-[#1A1D27] cursor-pointer focus:outline-none"
            >
              <option value="">Todos responsáveis</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-slate-400 dark:text-white/40" />
          </div>
        )}

        {clients.length > 0 && (
          <div className="relative">
            <select
              value={clientFilter}
              onChange={(e) => onClientChange(e.target.value)}
              className="appearance-none h-8 pl-3 pr-7 text-[12px] font-medium rounded-[6px] bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-white/80 border border-black/[0.06] dark:border-white/[0.06] hover:bg-white dark:hover:bg-[#1A1D27] cursor-pointer focus:outline-none"
            >
              <option value="">Todos clientes</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-slate-400 dark:text-white/40" />
          </div>
        )}

        {stores.length > 0 && (
          <div className="relative">
            <select
              value={storeFilter}
              onChange={(e) => onStoreChange(e.target.value)}
              className="appearance-none h-8 pl-3 pr-7 text-[12px] font-medium rounded-[6px] bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-white/80 border border-black/[0.06] dark:border-white/[0.06] hover:bg-white dark:hover:bg-[#1A1D27] cursor-pointer focus:outline-none"
            >
              <option value="">Todas lojas</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.store_name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-slate-400 dark:text-white/40" />
          </div>
        )}

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Configurar pipeline"
          aria-label="Configurar pipeline"
          className="inline-flex items-center justify-center h-8 w-8 rounded-[6px] bg-white dark:bg-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.08] text-slate-700 dark:text-white/80 border border-black/[0.08] dark:border-white/[0.10] transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={onNewTask}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova task
        </button>
      </div>

      {hasActiveFilters && (
        <div className="flex items-center justify-between gap-3 px-5 py-1.5 bg-slate-50/60 dark:bg-white/[0.02] border-b border-black/[0.04] dark:border-white/[0.04]">
          <span
            className="text-[11px] font-medium text-slate-500 dark:text-white/55 tabular-nums"
            aria-live="polite"
          >
            {taskCount} de {totalTasks}{" "}
            {totalTasks === 1 ? "task" : "tasks"} ·{" "}
            {[
              search && `busca: "${search}"`,
              priorityFilter && `prio: ${priorityFilter}`,
              assigneeFilter && "responsável",
              clientFilter && "cliente",
              storeFilter && "loja",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <button
            type="button"
            onClick={onClearFilters}
            className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            Limpar filtros
          </button>
        </div>
      )}

      <OperationalSettingsDialog
        open={settingsOpen}
        pipeline={pipeline}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          onPipelineUpdated()
        }}
      />
    </>
  )
}
