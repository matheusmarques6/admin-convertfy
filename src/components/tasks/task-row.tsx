"use client"

/**
 * TaskRow — linha de task unificada.
 *
 * Usado em:
 *  - /admin/onboarding/[id] aba Checklist
 *
 * Mostra (alta densidade, inspirado em DealCard/Linear):
 *  - Avatar com inicial do client/loja (cor por hash)
 *  - Title (semibold) + SLA badge dinamico
 *  - Subtitle: store_name · stage_name
 *  - Footer: tempo relativo + role badge
 *  - Acoes inline no hover: marcar concluida, abrir origem, 3-dots (excluir)
 */

import { useMemo, useState } from "react"
import Link from "next/link"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Sparkles,
  RefreshCw,
  Briefcase,
  Mail,
  FileText,
  MoreHorizontal,
  Trash2,
} from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"

export interface TaskRowData {
  id: string
  title: string
  description?: string | null
  status: string
  priority?: string | null
  due_date?: string | null
  sla_hours?: number | null
  source_type?: string | null
  source_id?: string | null
  source_metadata?: Record<string, unknown> | null
  assignee_id?: string | null
  assignee_role?: string | null
  onboarding_id?: string | null
  operational_column_id?: string | null
  metadata?: Record<string, unknown> | null
  assignee?: {
    id: string
    name?: string | null
    email?: string | null
    avatar_url?: string | null
  } | null
}

interface TaskRowProps {
  task: TaskRowData
  onComplete?: (taskId: string) => Promise<void> | void
  /** Custom delete handler. Se omitido, TaskRow chama DELETE automatico
   *  baseado no source_type (tasks ou productivity_tasks). */
  onDelete?: (taskId: string) => Promise<void> | void
  /** Mostrar source label (badge antes do title). Default true; false em /admin/onboarding/[id] (redundante) */
  showSource?: boolean
  /** Compacto = sem footer com role (uso em Onboarding detail) */
  compact?: boolean
}

// ─── Helpers ────────────────────────────────────────────────────────────

function avatarColorFromName(name: string): { bg: string; fg: string } {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  const palette = [
    { bg: "#FECACA", fg: "#991B1B" },
    { bg: "#FED7AA", fg: "#9A3412" },
    { bg: "#FEF3C7", fg: "#92400E" },
    { bg: "#BBF7D0", fg: "#166534" },
    { bg: "#BFDBFE", fg: "#1E40AF" },
    { bg: "#C7D2FE", fg: "#3730A3" },
    { bg: "#DDD6FE", fg: "#5B21B6" },
    { bg: "#FBCFE8", fg: "#9D174D" },
    { bg: "#F5D0FE", fg: "#86198F" },
  ]
  return palette[Math.abs(hash) % palette.length]
}

function getInitial(s: string): string {
  return s.trim().charAt(0).toUpperCase() || "?"
}

interface SourceConfig {
  label: string
  icon: typeof Sparkles
  color: string
}

const SOURCE_CONFIG: Record<string, SourceConfig> = {
  onboarding: { label: "Onboarding", icon: Sparkles, color: "brand" },
  acompanhamento: { label: "Acompanhamento", icon: RefreshCw, color: "blue" },
  project: { label: "Projeto", icon: Briefcase, color: "slate" },
  crm: { label: "CRM", icon: Mail, color: "emerald" },
  manual: { label: "Manual", icon: FileText, color: "amber" },
}

function getSourceConfig(sourceType: string | null | undefined): SourceConfig {
  if (!sourceType) return SOURCE_CONFIG.manual
  return SOURCE_CONFIG[sourceType] ?? SOURCE_CONFIG.manual
}

/** Diff em horas, negativo = passado */
function hoursUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 3_600_000
}

function relativeLabel(iso: string): string {
  const h = hoursUntil(iso)
  const abs = Math.abs(h)
  if (h < 0) {
    if (abs < 1) return `vencida ${Math.round(abs * 60)}min atrás`
    if (abs < 24) return `vencida ${Math.floor(abs)}h atrás`
    return `vencida ${Math.floor(abs / 24)}d atrás`
  }
  if (abs < 1) return `em ${Math.round(abs * 60)}min`
  if (abs < 24) return `em ${Math.floor(abs)}h`
  if (abs < 168) return `em ${Math.floor(abs / 24)}d`
  const date = new Date(iso)
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

function slaTone(deadline: string | null | undefined): {
  tone: "ok" | "warn" | "danger"
  label: string
  pct?: number
} {
  if (!deadline) return { tone: "ok", label: "sem prazo" }
  const h = hoursUntil(deadline)
  if (h < 0) return { tone: "danger", label: "vencida" }
  if (h < 8) return { tone: "danger", label: `${Math.floor(h)}h restantes` }
  if (h < 24) return { tone: "warn", label: `${Math.floor(h)}h restantes` }
  if (h < 72) return { tone: "warn", label: `${Math.floor(h / 24)}d restantes` }
  return { tone: "ok", label: `${Math.floor(h / 24)}d restantes` }
}

function getHref(task: TaskRowData): string | null {
  if (task.source_type === "onboarding" && task.onboarding_id) {
    return `/admin/onboarding/${task.onboarding_id}`
  }
  if (task.source_type === "crm" && task.source_id) {
    return `/admin/inbox/${task.source_id}`
  }
  return null
}

// ─── Componente ─────────────────────────────────────────────────────────

export function TaskRow({
  task,
  onComplete,
  onDelete,
  showSource = true,
  compact = false,
}: TaskRowProps) {
  const toast = useToast()
  const [completing, setCompleting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const isDone = task.status === "completed"
  const meta = (task.source_metadata ?? {}) as {
    store_name?: string
    client_name?: string
    stage_name?: string
    stage_color?: string
  }
  const sourceCfg = useMemo(() => getSourceConfig(task.source_type), [task.source_type])
  const SourceIcon = sourceCfg.icon

  const initial = useMemo(() => {
    const name =
      meta.store_name ?? meta.client_name ?? task.title ?? "Task"
    return getInitial(name)
  }, [meta.store_name, meta.client_name, task.title])
  const avatarColors = useMemo(
    () => avatarColorFromName(meta.store_name ?? task.title),
    [meta.store_name, task.title],
  )

  const sla = slaTone(task.due_date)
  const subtitleParts: string[] = []
  if (meta.store_name) subtitleParts.push(meta.store_name)
  if (meta.stage_name) subtitleParts.push(meta.stage_name)
  const subtitle = subtitleParts.join(" · ")

  const href = getHref(task)

  async function handleComplete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!onComplete || completing) return
    setCompleting(true)
    try {
      await onComplete(task.id)
    } catch (err) {
      toast.toast({
        variant: "destructive",
        title: "Falha ao concluir",
        description: (err as Error).message,
      })
    } finally {
      setCompleting(false)
    }
  }

  async function handleDelete() {
    if (deleting) return
    if (
      !window.confirm(
        `Excluir a tarefa "${task.title}"?\n\nEssa ação não pode ser desfeita.`,
      )
    )
      return
    setDeleting(true)
    try {
      if (onDelete) {
        await onDelete(task.id)
      } else {
        // Auto-delete baseado em source_type
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: "DELETE",
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error ?? "Falha ao excluir")
        }
        toast.toast({ title: "Tarefa excluída" })
      }
    } catch (err) {
      toast.toast({
        variant: "destructive",
        title: "Falha ao excluir",
        description: (err as Error).message,
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className={
        "group relative flex items-start gap-3 px-3 py-2.5 rounded-[6px] border bg-white dark:bg-[#1A1D27] transition-all " +
        (isDone
          ? "border-emerald-200/60 bg-emerald-50/40 dark:bg-emerald-500/[0.05] dark:border-emerald-900/30"
          : sla.tone === "danger"
            ? "border-rose-200 dark:border-rose-900/40 hover:border-rose-300"
            : "border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.14] hover:shadow-[0_2px_8px_rgba(15,23,42,0.04)]")
      }
    >
      {/* Checkbox / status icon */}
      <button
        type="button"
        onClick={handleComplete}
        disabled={!onComplete || completing}
        className="shrink-0 mt-0.5"
        aria-label={isDone ? "Reabrir" : "Marcar concluída"}
      >
        {completing ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        ) : isDone ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <Circle className="h-4 w-4 text-slate-300 dark:text-white/30 hover:text-brand-300" />
        )}
      </button>

      {/* Avatar com inicial */}
      <div
        className="shrink-0 flex h-8 w-8 items-center justify-center rounded-[5px] font-bold text-[12px]"
        style={{ background: avatarColors.bg, color: avatarColors.fg }}
        aria-hidden
      >
        {initial}
      </div>

      {/* Conteudo */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {showSource && (
                <SourceBadge
                  icon={SourceIcon}
                  label={sourceCfg.label}
                  color={sourceCfg.color}
                />
              )}
              <h4
                className={
                  "text-[13px] leading-tight truncate " +
                  (isDone
                    ? "line-through text-slate-500 font-medium"
                    : "text-slate-900 dark:text-white font-semibold")
                }
              >
                {task.title}
              </h4>
            </div>
            {subtitle && (
              <p className="text-[11.5px] text-slate-500 dark:text-white/55 truncate mt-0.5">
                {subtitle}
              </p>
            )}
            {!compact && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px]">
                {task.assignee_role && !task.assignee_id && (
                  <span className="text-slate-500 dark:text-white/55 inline-flex items-center gap-1">
                    <span className="font-mono uppercase tracking-wide text-[10px]">
                      {task.assignee_role}
                    </span>
                    <span className="text-brand-400 dark:text-brand-300 font-medium">
                      · disponivel pra pegar
                    </span>
                  </span>
                )}
                {task.assignee?.name && (
                  <span className="text-slate-600 dark:text-white/65 inline-flex items-center gap-1">
                    {task.assignee.name}
                  </span>
                )}
                {task.due_date && !isDone && (
                  <span
                    className={
                      "inline-flex items-center gap-1 " +
                      (sla.tone === "danger"
                        ? "text-rose-600 dark:text-rose-400 font-semibold"
                        : sla.tone === "warn"
                          ? "text-amber-600 dark:text-amber-400 font-semibold"
                          : "text-slate-500 dark:text-white/55")
                    }
                  >
                    {sla.tone === "danger" ? (
                      <AlertTriangle className="h-3 w-3" />
                    ) : (
                      <Clock className="h-3 w-3" />
                    )}
                    {relativeLabel(task.due_date)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Ações sempre visíveis */}
          <div className="flex items-center gap-1 shrink-0">
            {href && (
              <Link
                href={href}
                onClick={(e) => e.stopPropagation()}
                className="h-7 w-7 inline-flex items-center justify-center text-slate-400 hover:text-brand-400 dark:hover:text-brand-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] rounded-[5px]"
                aria-label="Abrir origem"
                title="Abrir origem"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleDelete()
              }}
              aria-label="Excluir tarefa"
              title="Excluir tarefa"
              className="h-7 w-7 inline-flex items-center justify-center text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-[5px]"
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Mais ações"
                  className="h-7 w-7 inline-flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white/80 hover:bg-slate-100 dark:hover:bg-white/[0.06] rounded-[5px]"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={4}
                  onClick={(e) => e.stopPropagation()}
                  className="z-50 min-w-[180px] rounded-[6px] border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#1A1D27] shadow-[0_8px_24px_rgba(15,23,42,0.12)] py-1"
                >
                  {href && (
                    <DropdownMenu.Item
                      onSelect={() => {
                        window.location.href = href
                      }}
                      className="flex cursor-pointer items-center gap-2 rounded-[4px] mx-1 px-2 py-2 outline-none text-slate-700 dark:text-white/80 data-[highlighted]:bg-slate-50 dark:data-[highlighted]:bg-white/[0.04]"
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-[12px] font-medium">Abrir origem</span>
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Item
                    onSelect={handleDelete}
                    className="flex cursor-pointer items-center gap-2 rounded-[4px] mx-1 px-2 py-2 outline-none text-rose-600 dark:text-rose-400 data-[highlighted]:bg-rose-50 dark:data-[highlighted]:bg-rose-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-[12px] font-medium">Excluir</span>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </div>
    </div>
  )
}

function SourceBadge({
  icon: Icon,
  label,
  color,
}: {
  icon: typeof Sparkles
  label: string
  color: string
}) {
  const colorClasses: Record<string, string> = {
    brand: "bg-brand-100 text-brand-500 dark:bg-brand-500/15 dark:text-brand-300",
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
    slate: "bg-slate-100 text-slate-700 dark:bg-white/[0.08] dark:text-white/65",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  }
  return (
    <span
      className={
        "inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[3px] " +
        (colorClasses[color] ?? colorClasses.slate)
      }
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  )
}

// ─── Group header (renderizado em listagens agrupadas) ──────────────────

export function TaskGroupHeader({
  sourceType,
  count,
}: {
  sourceType: string
  count: number
}) {
  const cfg = getSourceConfig(sourceType)
  const Icon = cfg.icon
  return (
    <div className="flex items-center gap-2 pt-2 pb-1.5 px-1">
      <span
        className={
          "flex h-5 w-5 items-center justify-center rounded-[4px] " +
          (cfg.color === "brand"
            ? "bg-brand-100 text-brand-400 dark:bg-brand-500/15 dark:text-brand-300"
            : cfg.color === "blue"
              ? "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400"
              : cfg.color === "emerald"
                ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
                : cfg.color === "amber"
                  ? "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
                  : "bg-slate-100 text-slate-600 dark:bg-white/[0.08] dark:text-white/65")
        }
      >
        <Icon className="h-3 w-3" />
      </span>
      <h3 className="text-[12px] font-bold uppercase tracking-wider text-slate-700 dark:text-white/80">
        {cfg.label}
      </h3>
      <span className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-white/40">
        {count}
      </span>
    </div>
  )
}
