"use client"

/**
 * OnboardingDrawer — painel lateral (slide-in da direita) acionado pelo
 * clique no card do kanban. Substitui o navigate pra /admin/onboarding/[id]
 * (que continua existindo via "Abrir pagina completa").
 *
 * Conteudo (referencia print Urban Classe enviado pelo Bruno):
 *  - Header: Nome loja · subtitle (status humano) · X (fechar)
 *  - Progress bar grossa (N de M tarefas concluidas)
 *  - "Etapa <coluna> · ha Xd"
 *  - Grid 2x2: Responsavel/Prazo da etapa · Plano/Canal
 *  - Checklist da etapa (tasks da coluna atual com checkbox)
 *  - Entregaveis obrigatorios (deliverables c/ value/file)
 *  - Footer: "Abrir pagina completa" + "Avancar pra proxima etapa"
 */

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import {
  X,
  ArrowRight,
  Loader2,
  Check,
  Clock,
  ExternalLink,
  Copy,
  FileText,
  Link as LinkIcon,
  Upload,
} from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import { ROUTES } from "@/lib/routes"
import type {
  OnboardingPipelineItem,
  OperationalPipelineColumn,
  TaskDeliverable,
  OnboardingTaskLite,
} from "@/types/onboarding-pipeline"

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error?.message ?? `HTTP ${r.status}`)
  return j
}

interface DetailResponse {
  onboarding: OnboardingPipelineItem & {
    tasks?: (OnboardingTaskLite & { metadata?: Record<string, unknown> })[]
  }
  columns: OperationalPipelineColumn[]
  deliverables: TaskDeliverable[]
}

const PLATFORM_LABEL: Record<string, string> = {
  klaviyo: "Klaviyo",
  omnisend: "Omnisend",
  mailchimp: "Mailchimp",
  activecampaign: "ActiveCampaign",
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  vtex: "VTEX",
}

function avatarColorFromName(name: string): { bg: string; fg: string } {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  const palette = [
    { bg: "#EEF0FB", fg: "#4E62D8" },
    { bg: "#ECFDF5", fg: "#065F46" },
    { bg: "#FFFBEB", fg: "#92400E" },
    { bg: "#F3E8FF", fg: "#7C3AED" },
    { bg: "#FEF2F2", fg: "#991B1B" },
    { bg: "#F3F4F6", fg: "#4B5563" },
  ]
  return palette[Math.abs(hash) % palette.length]
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
}

function daysAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const d = Math.floor(ms / 86_400_000)
  if (d === 0) {
    const h = Math.floor(ms / 3_600_000)
    return h <= 0 ? "agora" : `há ${h}h`
  }
  return `há ${d}d`
}

function briefingSentence(
  status: string | undefined | null,
  hasForm: boolean,
): string {
  if (status === "approved") return "Briefing aprovado, indo pra design"
  if (status === "generated_pending_review") return "Cliente revisando briefing"
  if (status === "generating") return "Gerando briefing com IA…"
  if (status === "needs_review") return "Briefing precisa de revisão"
  if (status === "form_partially_filled" || hasForm)
    return "Cliente preencheu o formulário"
  return "Aguardando preenchimento do formulário"
}

export function OnboardingDrawer({
  onboardingId,
  open,
  onClose,
  onMutate,
}: {
  onboardingId: string | null
  open: boolean
  onClose: () => void
  onMutate?: () => void
}) {
  const { data, mutate, isLoading, error } = useSWR<DetailResponse>(
    open && onboardingId ? `/api/onboardings/${onboardingId}` : null,
    fetcher,
  )
  const [advancing, setAdvancing] = useState(false)
  const toast = useToast()

  // ESC fecha
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  // Lock scroll do body
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  const onb = data?.onboarding
  const columns = useMemo(() => data?.columns ?? [], [data?.columns])
  const deliverables = useMemo(() => data?.deliverables ?? [], [data?.deliverables])

  const currentColumn = useMemo(
    () => columns.find((c) => c.id === onb?.current_column_id) ?? null,
    [columns, onb?.current_column_id],
  )
  const nextColumn = useMemo(() => {
    if (!currentColumn) return null
    const next = columns.find((c) => c.position === currentColumn.position + 1)
    return next ?? null
  }, [columns, currentColumn])

  const tasksInColumn = useMemo(
    () =>
      (onb?.tasks ?? []).filter(
        (t) => t.operational_column_id === onb?.current_column_id,
      ),
    [onb?.tasks, onb?.current_column_id],
  )
  const tasksDone = tasksInColumn.filter((t) => t.status === "completed").length
  const tasksTotal = tasksInColumn.length
  const pct = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0

  const requiredDeliverables = useMemo(() => {
    if (!currentColumn) return []
    return currentColumn.deliverables_template.filter((d) => d.required)
  }, [currentColumn])

  async function handleAdvance() {
    if (!onb) return
    setAdvancing(true)
    try {
      const res = await fetch(`/api/onboardings/${onb.id}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.toast({
          variant: "destructive",
          title: "Não foi possível avançar",
          description:
            j.error?.message ?? "Verifique checklist e entregáveis.",
        })
        return
      }
      toast.toast({ title: "Avançou pra próxima etapa" })
      mutate()
      onMutate?.()
    } finally {
      setAdvancing(false)
    }
  }

  function copyFormLink() {
    if (!onb) return
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    const url = `${origin}/form/${onb.form_token}`
    navigator.clipboard.writeText(url)
    toast.toast({ title: "Link copiado", description: url })
  }

  if (!open || !onboardingId) return null

  return (
    <div className="fixed inset-0 z-50 flex" aria-modal="true" role="dialog">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/60"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <div className="ml-auto relative h-full w-full max-w-[480px] bg-white dark:bg-[#0F1117] shadow-2xl border-l border-black/[0.08] dark:border-white/[0.08] flex flex-col animate-cf-slidein">
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        )}

        {error && !isLoading && (
          <div className="flex-1 flex items-center justify-center p-6 text-center">
            <p className="text-[13px] text-rose-600 dark:text-rose-400">
              Erro ao carregar: {(error as Error).message}
            </p>
          </div>
        )}

        {onb && currentColumn && !isLoading && (
          <>
            <DrawerHeader
              storeName={onb.store?.store_name ?? "Loja"}
              clientName={onb.client?.name ?? null}
              clientCompany={onb.client?.company ?? null}
              version={onb.current_version}
              statusSentence={briefingSentence(
                onb.briefing_status,
                !!onb.form_responses,
              )}
              onClose={onClose}
            />

            {/* Progress + stage info */}
            <div className="px-5 py-4 border-b border-black/[0.04] dark:border-white/[0.06]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-white/55 uppercase tracking-wide">
                  Progresso da etapa
                </span>
                <span className="text-[12px] font-semibold text-slate-700 dark:text-white/85 tabular-nums">
                  {tasksDone} de {tasksTotal}
                </span>
              </div>
              <div className="bg-slate-100 dark:bg-white/[0.06] overflow-hidden rounded-full">
                <div
                  className="h-[6px] rounded-full transition-all duration-300"
                  style={{
                    width: `${pct}%`,
                    background: pct === 100 ? "#10B981" : "#4E62D8",
                  }}
                />
              </div>
              <p className="mt-2 text-[12px] text-slate-500 dark:text-white/55">
                <span
                  className="inline-block h-[7px] w-[7px] rounded-full mr-1.5 align-middle"
                  style={{ background: currentColumn.color }}
                  aria-hidden
                />
                <span className="font-medium text-slate-700 dark:text-white/80">
                  {currentColumn.name}
                </span>
                <span className="text-slate-400 dark:text-white/35">
                  {" · "}
                  {daysAgo(onb.last_column_change_at)}
                </span>
              </p>
            </div>

            {/* Grid 2x2 metadados */}
            <div className="grid grid-cols-2 gap-x-5 gap-y-4 px-5 py-4 border-b border-black/[0.04] dark:border-white/[0.06]">
              <MetaCell
                label="Responsável"
                value={
                  tasksInColumn[0]?.assignee_role ??
                  currentColumn.default_assignee_role ??
                  "—"
                }
              />
              <MetaCell
                label="Prazo da etapa"
                value={
                  currentColumn.sla_hours > 0
                    ? `${Math.ceil(currentColumn.sla_hours / 24)} dias`
                    : "—"
                }
                icon={<Clock className="h-3 w-3" strokeWidth={2} />}
              />
              <MetaCell
                label="Plano"
                value={onb.plan ?? "—"}
              />
              <MetaCell
                label="Canal / Plataforma"
                value={
                  PLATFORM_LABEL[(onb.store?.platform ?? "").toLowerCase()] ??
                  onb.store?.platform ??
                  "—"
                }
              />
            </div>

            {/* Scroll area: checklist + deliverables */}
            <div className="flex-1 overflow-y-auto">
              {tasksInColumn.length > 0 && (
                <Section
                  title="Checklist da etapa"
                  count={`${tasksDone}/${tasksTotal}`}
                >
                  <ul className="space-y-1.5">
                    {tasksInColumn.map((t) => (
                      <ChecklistRow key={t.id} task={t} />
                    ))}
                  </ul>
                </Section>
              )}

              {requiredDeliverables.length > 0 && (
                <Section
                  title="Entregáveis obrigatórios"
                  count={`${
                    deliverables.filter(
                      (d) =>
                        requiredDeliverables.some(
                          (r) => r.slug === d.field_slug,
                        ) &&
                        (d.value || d.file_url),
                    ).length
                  }/${requiredDeliverables.length}`}
                >
                  <ul className="space-y-1.5">
                    {requiredDeliverables.map((field) => {
                      const d = deliverables.find(
                        (x) => x.field_slug === field.slug,
                      )
                      return (
                        <DeliverableRow
                          key={field.slug}
                          label={field.label}
                          type={field.type}
                          value={d?.value ?? null}
                          fileUrl={d?.file_url ?? null}
                          fileName={d?.file_name ?? null}
                        />
                      )
                    })}
                  </ul>
                </Section>
              )}

              {/* Atalhos */}
              <div className="px-5 py-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyFormLink}
                  className="cf-btn-ghost inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-[6px]"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copiar link do form
                </button>
                <Link
                  href={ROUTES.ADMIN.ONBOARDING_V2.DETAIL(onb.id)}
                  className="cf-btn-ghost inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-[6px]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir página completa
                </Link>
              </div>
            </div>

            {/* Footer: Avancar pra proxima etapa */}
            <div className="border-t border-black/[0.08] dark:border-white/[0.08] px-5 py-3 bg-slate-50/60 dark:bg-white/[0.02]">
              <button
                type="button"
                onClick={handleAdvance}
                disabled={advancing || !nextColumn}
                className="w-full inline-flex items-center justify-center gap-1.5 h-10 px-4 text-[13px] font-semibold bg-[#1F1F1F] dark:bg-white text-white dark:text-black rounded-[6px] disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {advancing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {nextColumn
                  ? `Avançar pra ${nextColumn.name}`
                  : "Etapa final"}
              </button>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes cf-slidein {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-cf-slidein {
          animation: cf-slidein 220ms cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  )
}

// ─── DrawerHeader ───────────────────────────────────────────────────────

function DrawerHeader({
  storeName,
  clientName,
  clientCompany,
  version,
  statusSentence,
  onClose,
}: {
  storeName: string
  clientName: string | null
  clientCompany: string | null
  version: number
  statusSentence: string
  onClose: () => void
}) {
  const avatar = avatarColorFromName(storeName)
  return (
    <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08] flex items-start gap-3">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-[8px] font-semibold shrink-0"
        style={{
          background: avatar.bg,
          color: avatar.fg,
          fontSize: 13,
          letterSpacing: "-0.02em",
        }}
        aria-hidden
      >
        {getInitials(storeName).slice(0, 2) || "?"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="text-[16px] font-semibold tracking-tight text-slate-900 dark:text-white truncate">
            {storeName}
          </h2>
          {version > 1 && (
            <span
              className="cf-pill cf-warn shrink-0"
              style={{ padding: "1px 6px", fontSize: 10 }}
            >
              v{version}
            </span>
          )}
        </div>
        {(clientName || clientCompany) && (
          <p className="text-[12px] text-slate-500 dark:text-white/55 truncate mt-0.5">
            {clientName}
            {clientName && clientCompany && (
              <span className="text-slate-300 dark:text-white/25"> · </span>
            )}
            {clientCompany}
          </p>
        )}
        <p className="text-[11.5px] text-slate-600 dark:text-white/65 mt-1.5 cf-anim-statusin">
          {statusSentence}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        className="cf-focusable shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-[6px] text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-white/40 dark:hover:text-white/80 dark:hover:bg-white/[0.06] transition-colors"
      >
        <X className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  )
}

// ─── MetaCell ───────────────────────────────────────────────────────────

function MetaCell({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon?: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-semibold text-slate-400 dark:text-white/45 uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className="text-[12.5px] font-medium text-slate-800 dark:text-white/90 flex items-center gap-1.5 truncate">
        {icon && (
          <span className="text-slate-400 dark:text-white/40 shrink-0">
            {icon}
          </span>
        )}
        <span className="truncate">{value}</span>
      </p>
    </div>
  )
}

// ─── Section ────────────────────────────────────────────────────────────

function Section({
  title,
  count,
  children,
}: {
  title: string
  count?: string
  children: React.ReactNode
}) {
  return (
    <div className="px-5 py-4 border-b border-black/[0.04] dark:border-white/[0.06]">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-[12.5px] font-semibold text-slate-700 dark:text-white/85">
          {title}
        </h3>
        {count && (
          <span className="text-[11px] font-medium text-slate-500 dark:text-white/55 tabular-nums">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── ChecklistRow ───────────────────────────────────────────────────────

function ChecklistRow({
  task,
}: {
  task: OnboardingTaskLite & { metadata?: Record<string, unknown> }
}) {
  const done = task.status === "completed"
  return (
    <li className="flex items-start gap-2 text-[12.5px] leading-snug">
      <span
        className={
          "shrink-0 mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-[4px] border " +
          (done
            ? "bg-emerald-500 border-emerald-500 text-white"
            : "bg-white dark:bg-[#1A1D27] border-slate-300 dark:border-white/[0.18]")
        }
        aria-hidden
      >
        {done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      </span>
      <span
        className={
          "min-w-0 flex-1 " +
          (done
            ? "text-slate-400 line-through dark:text-white/35"
            : "text-slate-700 dark:text-white/80")
        }
      >
        {task.title}
        {task.assignee_role && (
          <span className="text-slate-400 dark:text-white/35 ml-1">
            · {task.assignee_role}
          </span>
        )}
      </span>
    </li>
  )
}

// ─── DeliverableRow ─────────────────────────────────────────────────────

function DeliverableRow({
  label,
  type,
  value,
  fileUrl,
  fileName,
}: {
  label: string
  type: string
  value: string | null
  fileUrl: string | null
  fileName: string | null
}) {
  const filled = !!(value || fileUrl)
  const icon =
    type === "upload" ? (
      <Upload className="h-3 w-3" strokeWidth={2} />
    ) : type === "url" ? (
      <LinkIcon className="h-3 w-3" strokeWidth={2} />
    ) : (
      <FileText className="h-3 w-3" strokeWidth={2} />
    )
  return (
    <li className="flex items-start gap-2 text-[12px] leading-snug">
      <span
        className={
          "shrink-0 mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-[4px] " +
          (filled
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
            : "bg-slate-100 text-slate-400 dark:bg-white/[0.06] dark:text-white/40")
        }
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={
            "font-medium " +
            (filled
              ? "text-slate-700 dark:text-white/80"
              : "text-slate-500 dark:text-white/50")
          }
        >
          {label}
        </p>
        {filled && (
          <p className="text-[11px] text-slate-500 dark:text-white/45 truncate mt-0.5">
            {fileUrl ? (
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-brand-500 dark:hover:text-brand-300 underline-offset-2 hover:underline truncate"
              >
                {fileName ?? fileUrl}
              </a>
            ) : (
              value
            )}
          </p>
        )}
      </div>
    </li>
  )
}
