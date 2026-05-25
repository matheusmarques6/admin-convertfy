"use client"

/**
 * Pagina de detalhe do onboarding.
 * Mostra: header (cliente/loja/status/colunas), tabs (Checklist, Deliverables,
 * Briefing, Versões, Form responses).
 * Acoes: Avancar coluna, Pedir ajustes (com modal feedback), Pedir revisao de briefing.
 */

import { useEffect, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Loader2,
  CheckCircle2,
  Sparkles,
  ChevronLeft,
  ExternalLink,
  Clock,
  FileText,
  Layers,
  Upload,
  ShieldAlert,
  RefreshCw,
} from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import { TaskRow, type TaskRowData } from "@/components/tasks/task-row"
import { SubItemsList, type SubItem } from "@/components/onboarding-v2/sub-items-list"
import { ROUTES } from "@/lib/routes"
import type {
  OnboardingPipelineItem,
  OperationalPipelineColumn,
  TaskDeliverable,
  OnboardingVersion,
  OnboardingTaskLite,
  FeedbackSeverity,
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

type Tab = "checklist" | "deliverables" | "briefing" | "versions" | "form"

export function OnboardingDetailClient({ id }: { id: string }) {
  const { data, mutate, isLoading, error } = useSWR<DetailResponse>(
    `/api/onboardings/${id}`,
    fetcher,
  )
  const [tab, setTab] = useState<Tab>("checklist")
  const [goBackOpen, setGoBackOpen] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  // Atalhos via querystring (?action=force-advance / go-back) vindos do kanban
  useEffect(() => {
    const action = searchParams.get("action")
    if (action === "force-advance") {
      setOverrideOpen(true)
      router.replace(`/admin/onboarding/${id}`)
    } else if (action === "go-back") {
      setGoBackOpen(true)
      router.replace(`/admin/onboarding/${id}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
  const [advancing, setAdvancing] = useState(false)
  const toast = useToast()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="p-6">
        <p className="text-[13px] text-red-600">
          Erro ao carregar: {(error as Error)?.message ?? "desconhecido"}
        </p>
      </div>
    )
  }

  const { onboarding: onb, columns, deliverables } = data
  const currentCol = onb.current_column ?? columns.find((c) => c.id === onb.current_column_id)
  const currentIdx = columns.findIndex((c) => c.id === onb.current_column_id)
  const nextCol = currentIdx >= 0 ? columns[currentIdx + 1] : null
  // Filtra por coluna atual E version atual (apos go-back v2 evita misturar
  // com tasks v1 da mesma coluna que ficaram no historico)
  const tasksInCurrent = (onb.tasks ?? []).filter(
    (t) =>
      t.operational_column_id === onb.current_column_id &&
      ((t as unknown as { version?: number }).version ?? 1) === onb.current_version,
  )

  async function advance(override?: {
    justification: string
    items_skipped: Array<
      | { type: "checklist"; id: string; label: string }
      | { type: "deliverable"; slug: string; label: string }
    >
  }) {
    setAdvancing(true)
    try {
      const res = await fetch(`/api/onboardings/${id}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(override ? { override } : {}),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.toast({
          variant: "destructive",
          title: "Nao foi possivel avancar",
          description: j.error?.message ?? "Verifique checklist e deliverables.",
        })
      } else {
        toast.toast({ title: "Onboarding avancou de coluna" })
        mutate()
      }
    } finally {
      setAdvancing(false)
      setOverrideOpen(false)
    }
  }

  // Avatar e helpers para header
  const storeName = onb.store?.store_name ?? "Loja"
  const avatarBg = (() => {
    let h = 0
    for (let i = 0; i < storeName.length; i++)
      h = (h * 31 + storeName.charCodeAt(i)) | 0
    const pal = [
      { bg: "#EEF0FB", fg: "#4E62D8" },
      { bg: "#ECFDF5", fg: "#065F46" },
      { bg: "#FFFBEB", fg: "#92400E" },
      { bg: "#F3E8FF", fg: "#7C3AED" },
      { bg: "#FEF2F2", fg: "#991B1B" },
      { bg: "#F3F4F6", fg: "#4B5563" },
    ]
    return pal[Math.abs(h) % pal.length]
  })()
  const storeInitials = storeName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase()

  // Health score
  const elapsedHours = currentCol
    ? (Date.now() - new Date(onb.last_column_change_at).getTime()) / 3_600_000
    : 0
  const slaHours = currentCol?.sla_hours ?? 0
  const healthScore = (() => {
    if (!currentCol) return 100
    let s = 100
    if (slaHours > 0) {
      if (elapsedHours >= slaHours) s -= 40
      else if (elapsedHours >= slaHours * 0.7) s -= 15
    }
    if (onb.briefing_status === "needs_review") s -= 20
    return Math.max(0, Math.min(100, s))
  })()
  const healthTone =
    healthScore >= 80
      ? { color: "#065F46", label: "Saudável" }
      : healthScore >= 60
        ? { color: "#92400E", label: "Atenção" }
        : { color: "#991B1B", label: "Crítico" }

  const daysInStage = Math.floor(elapsedHours / 24)
  const tasksDone = tasksInCurrent.filter((t) => t.status === "completed").length
  const tasksTotal = tasksInCurrent.length

  return (
    <div className="space-y-5">
      {/* Voltar */}
      <Link
        href={ROUTES.ADMIN.ONBOARDING_V2.LIST}
        className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-500 hover:text-slate-900 dark:text-white/55 dark:hover:text-white -mt-2"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Voltar ao pipeline
      </Link>

      {/* Header card */}
      <div className="rounded-[12px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0F1117] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3.5 min-w-0">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-[12px] font-semibold shrink-0"
              style={{
                background: avatarBg.bg,
                color: avatarBg.fg,
                fontSize: 18,
                letterSpacing: "-0.02em",
              }}
            >
              {storeInitials || "?"}
            </div>
            <div className="min-w-0">
              <p className="text-[11.5px] font-medium text-slate-500 dark:text-white/55 flex items-center gap-1">
                Workflows
                <span className="text-slate-300 dark:text-white/20">/</span>
                Onboarding
                {currentCol && (
                  <>
                    <span className="text-slate-300 dark:text-white/20">/</span>
                    <span className="text-slate-700 dark:text-white/80">
                      {currentCol.name}
                    </span>
                  </>
                )}
              </p>
              <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight text-slate-900 dark:text-white mt-0.5 leading-tight">
                {storeName}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 text-[13px] text-slate-500 dark:text-white/55">
                <span>{onb.client?.name}</span>
                {onb.client?.company && (
                  <>
                    <span className="text-slate-300 dark:text-white/20">·</span>
                    <span>{onb.client.company}</span>
                  </>
                )}
                {onb.current_version > 1 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30">
                    v{onb.current_version}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setGoBackOpen(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[8px] text-[12.5px] font-semibold text-slate-700 dark:text-white/85 bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.10] hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Pedir ajustes
            </button>
            {nextCol && (
              <>
                <button
                  type="button"
                  onClick={() => setOverrideOpen(true)}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[8px] text-[12.5px] font-semibold text-amber-700 dark:text-amber-300 bg-white dark:bg-white/[0.02] border border-amber-300 dark:border-amber-500/30 hover:bg-amber-50 dark:hover:bg-amber-500/[0.08] transition-colors"
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Forçar avanço
                </button>
                <button
                  type="button"
                  onClick={() => advance()}
                  disabled={advancing}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[8px] text-[12.5px] font-semibold bg-[#1F1F1F] dark:bg-white text-white dark:text-black disabled:opacity-50 hover:opacity-90 transition-opacity shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                >
                  {advancing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Avançar etapa
                </button>
              </>
            )}
          </div>
        </div>

        {/* KPI strip embutida */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-0 mt-5 rounded-[10px] border border-slate-200 dark:border-white/[0.06] bg-slate-50/40 dark:bg-white/[0.02] overflow-hidden">
          <div className="px-4 py-3 border-r border-slate-200 dark:border-white/[0.06]">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40 mb-1">
              Health
            </p>
            <div className="flex items-baseline gap-1.5">
              <span
                className="text-[20px] font-semibold tabular-nums leading-none"
                style={{ color: healthTone.color }}
              >
                {healthScore}
              </span>
              <span
                className="text-[10.5px] font-medium"
                style={{ color: healthTone.color }}
              >
                {healthTone.label}
              </span>
            </div>
          </div>
          <div className="px-4 py-3 border-r border-slate-200 dark:border-white/[0.06]">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40 mb-1">
              Na etapa
            </p>
            <p className="text-[20px] font-semibold tabular-nums text-slate-900 dark:text-white leading-none">
              {daysInStage}d
            </p>
          </div>
          <div className="px-4 py-3 border-r border-slate-200 dark:border-white/[0.06]">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40 mb-1">
              SLA
            </p>
            <p className="text-[20px] font-semibold tabular-nums text-slate-900 dark:text-white leading-none">
              {slaHours > 0 ? `${Math.ceil(slaHours / 24)}d` : "—"}
            </p>
          </div>
          <div className="px-4 py-3 border-r border-slate-200 dark:border-white/[0.06]">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40 mb-1">
              Tarefas
            </p>
            <p className="text-[20px] font-semibold tabular-nums text-slate-900 dark:text-white leading-none">
              {tasksDone}/{tasksTotal}
            </p>
          </div>
          <div className="px-4 py-3 col-span-2 sm:col-span-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40 mb-1">
              MRR
            </p>
            <p className="text-[20px] font-semibold tabular-nums text-slate-900 dark:text-white leading-none">
              {onb.mrr_value
                ? new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                    maximumFractionDigits: 0,
                  }).format(Number(onb.mrr_value))
                : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="rounded-[8px] bg-white dark:bg-[#0F1117] border border-slate-200 dark:border-white/[0.08] p-4 overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max">
          {columns.map((c, idx) => {
            const isPast = idx < currentIdx
            const isCurrent = idx === currentIdx
            return (
              <div key={c.id} className="flex items-center gap-1.5">
                <div
                  className={
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-[5px] text-[11px] font-medium " +
                    (isCurrent
                      ? "text-white"
                      : isPast
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                        : "bg-slate-100 dark:bg-white/[0.04] text-slate-500 dark:text-white/40")
                  }
                  style={isCurrent ? { background: c.color } : undefined}
                >
                  <span
                    className={
                      "h-1.5 w-1.5 rounded-full " +
                      (isCurrent
                        ? "bg-white"
                        : isPast
                          ? "bg-emerald-500"
                          : "bg-slate-400")
                    }
                  />
                  {c.name}
                </div>
                {idx < columns.length - 1 && (
                  <ArrowRight className="h-3 w-3 text-slate-300 dark:text-white/20" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Status de entregas */}
      <div className="rounded-[12px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0F1117] p-5">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-white/45 mb-4">
          Status de entregas
        </p>
        <div className="space-y-2">
          {[
            {
              label: "Pagamento",
              icon: "$",
              status:
                (onb.effective_payment_status ?? onb.payment_status) === "paid"
                  ? { label: "Pago", tone: "pos" as const }
                  : (onb.effective_payment_status ?? onb.payment_status) ===
                      "overdue"
                    ? { label: "Atrasado", tone: "neg" as const }
                    : { label: "Pendente", tone: "warn" as const },
            },
            {
              label: "Contrato",
              icon: "📄",
              status:
                (onb.effective_contract_status ?? onb.contract_status) ===
                "signed"
                  ? { label: "Assinado", tone: "pos" as const }
                  : (onb.effective_contract_status ?? onb.contract_status) ===
                      "sent"
                    ? { label: "Enviado", tone: "warn" as const }
                    : { label: "Pendente", tone: "warn" as const },
            },
            {
              label: "Formulário",
              icon: "📝",
              status:
                onb.briefing_status === "approved"
                  ? { label: "Concluído", tone: "pos" as const }
                  : onb.form_responses
                    ? { label: "Em andamento", tone: "warn" as const }
                    : { label: "Pendente", tone: "warn" as const },
            },
          ].map((row) => {
            const pillMap = {
              pos: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
              warn: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
              neg: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
            }
            const dotMap = {
              pos: "#10B981",
              warn: "#F59E0B",
              neg: "#EF4444",
            }
            return (
              <div
                key={row.label}
                className="flex items-center justify-between py-1.5"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] bg-slate-100 dark:bg-white/[0.04] text-slate-500 dark:text-white/55 text-[12px]">
                    {row.icon}
                  </span>
                  <span className="text-[13.5px] font-medium text-slate-800 dark:text-white/90">
                    {row.label}
                  </span>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11.5px] font-semibold rounded-[5px] ${pillMap[row.status.tone]}`}
                >
                  <span
                    className="rounded-full"
                    style={{
                      height: 5,
                      width: 5,
                      background: dotMap[row.status.tone],
                    }}
                  />
                  {row.status.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Form link em destaque (copiar 1-click) */}
      <FormLinkBanner
        token={onb.form_token}
        formStatus={
          onb.briefing_confirmed_by_client
            ? "concluido"
            : onb.form_responses
              ? "em_andamento"
              : "nao_enviado"
        }
        expiresAt={onb.form_token_expires_at ?? null}
      />

      {/* Tabs */}
      <div className="rounded-[8px] bg-white dark:bg-[#0F1117] border border-slate-200 dark:border-white/[0.08]">
        <div className="flex items-center gap-1 border-b border-slate-200 dark:border-white/[0.06] px-3">
          {[
            { id: "checklist", label: "Checklist", icon: CheckCircle2 },
            { id: "deliverables", label: "Deliverables", icon: Layers },
            { id: "briefing", label: "Briefing", icon: Sparkles },
            { id: "versions", label: "Versões", icon: Clock },
            { id: "form", label: "Form do cliente", icon: FileText },
          ].map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id as Tab)}
                className={
                  "inline-flex items-center gap-1.5 h-9 px-3 text-[12px] font-medium border-b-2 transition-colors " +
                  (tab === t.id
                    ? "border-brand-500 text-brand-500 dark:text-brand-300"
                    : "border-transparent text-slate-500 dark:text-white/55 hover:text-slate-700")
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>

        <div className="p-4">
          {tab === "checklist" && (
            <ChecklistTab
              column={currentCol ?? null}
              tasks={tasksInCurrent}
              onboardingId={id}
              onMutate={mutate}
            />
          )}
          {tab === "deliverables" && (
            <DeliverablesTab
              column={currentCol ?? null}
              tasks={tasksInCurrent}
              deliverables={deliverables}
              onMutate={mutate}
              onboardingId={id}
            />
          )}
          {tab === "briefing" && (
            <BriefingTab onboarding={onb} onMutate={mutate} />
          )}
          {tab === "versions" && <VersionsTab versions={onb.versions ?? []} />}
          {tab === "form" && <FormResponsesTab onboarding={onb} />}
        </div>
      </div>

      {goBackOpen && (
        <GoBackDialog
          columns={columns}
          currentIdx={currentIdx}
          onboardingId={id}
          onClose={() => setGoBackOpen(false)}
          onDone={() => {
            setGoBackOpen(false)
            mutate()
          }}
        />
      )}

      {overrideOpen && currentCol && (
        <OverrideDialog
          column={currentCol}
          tasksInCurrent={tasksInCurrent}
          deliverables={deliverables}
          onClose={() => setOverrideOpen(false)}
          onConfirm={(justification, itemsSkipped) =>
            advance({ justification, items_skipped: itemsSkipped })
          }
          submitting={advancing}
        />
      )}
    </div>
  )
}

function OverrideDialog({
  column,
  tasksInCurrent,
  deliverables,
  onClose,
  onConfirm,
  submitting,
}: {
  column: OperationalPipelineColumn
  tasksInCurrent: (OnboardingTaskLite & { metadata?: Record<string, unknown> })[]
  deliverables: TaskDeliverable[]
  onClose: () => void
  onConfirm: (
    j: string,
    skipped: Array<
      | { type: "checklist"; id: string; label: string }
      | { type: "deliverable"; slug: string; label: string }
    >,
  ) => void
  submitting: boolean
}) {
  const [justification, setJustification] = useState("")
  // Tasks pendentes da coluna atual (cada checklist item é uma task)
  const pendingTasks = tasksInCurrent.filter((t) => t.status !== "completed")
  const anchorTask = tasksInCurrent[0] ?? null
  const taskDels = deliverables.filter(
    (d) => anchorTask && d.task_id === anchorTask.id,
  )
  const missingDeliverables = column.deliverables_template.filter((d) => {
    if (!d.required) return false
    const v = taskDels.find((x) => x.field_slug === d.slug)
    if (!v) return true
    return !v.value && !v.file_url
  })

  const skipped = [
    ...pendingTasks.map((t) => ({
      type: "checklist" as const,
      id: t.id,
      label: t.title,
    })),
    ...missingDeliverables.map((d) => ({
      type: "deliverable" as const,
      slug: d.slug,
      label: d.label,
    })),
  ]

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[500px] bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] overflow-hidden">
        <div className="px-5 py-4 border-b border-amber-200 dark:border-amber-900/30 bg-amber-50/40 dark:bg-amber-500/[0.05]">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            <h2 className="text-[15px] font-semibold text-amber-900 dark:text-amber-200">
              Forçar avanço (override)
            </h2>
          </div>
          <p className="text-[12px] text-amber-700 dark:text-amber-300">
            Pula itens pendentes com justificativa. Fica registrado em
            task_overrides com seu user_id.
          </p>
        </div>
        <div className="p-5 space-y-3">
          {skipped.length === 0 ? (
            <p className="text-[12.5px] text-emerald-700 dark:text-emerald-300">
              Tudo concluído. Não há itens pra pular.
            </p>
          ) : (
            <>
              <p className="text-[12px] font-semibold text-slate-700 dark:text-white/80">
                Itens que serão pulados ({skipped.length}):
              </p>
              <div className="max-h-[180px] overflow-y-auto space-y-1 rounded-[6px] border border-slate-200 dark:border-white/[0.08] p-2 bg-slate-50/40 dark:bg-white/[0.02]">
                {skipped.map((s) => (
                  <div
                    key={s.type + ("id" in s ? s.id : s.slug)}
                    className="flex items-center gap-2 text-[12px] text-slate-700 dark:text-white/70"
                  >
                    <span className="text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded bg-slate-200 dark:bg-white/[0.08] text-slate-600 dark:text-white/55 font-mono">
                      {s.type === "checklist" ? "ck" : "del"}
                    </span>
                    {s.label}
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80 mb-1">
                  Justificativa (obrigatória)
                </label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  rows={3}
                  placeholder="Ex: deliverable X sera entregue na proxima etapa..."
                  className="w-full px-3 py-2 text-[12.5px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
                />
              </div>
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 text-[12px] font-medium text-slate-700 hover:bg-slate-100 rounded-[6px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(justification, skipped)}
            disabled={
              submitting || (skipped.length > 0 && justification.trim().length < 10)
            }
            className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-[6px] disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Forçar avanço
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Checklist Tab ──────────────────────────────────────────────────────────
function ChecklistTab({
  column,
  tasks,
  onMutate,
}: {
  column: OperationalPipelineColumn | null
  tasks: (OnboardingTaskLite & { metadata?: Record<string, unknown> })[]
  onboardingId: string
  onMutate: () => void
}) {
  async function completeTask(taskId: string) {
    const res = await fetch(`/api/tasks/${taskId}/complete`, {
      method: "POST",
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.error ?? "Falha")
    }
    onMutate()
  }

  async function deleteTask(taskId: string) {
    const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.error ?? "Falha ao excluir")
    }
    onMutate()
  }

  if (!column) {
    return (
      <p className="text-[12px] text-slate-500 italic">Nenhuma coluna ativa.</p>
    )
  }
  if (!tasks || tasks.length === 0) {
    return (
      <div className="text-center py-6 rounded-[6px] border border-dashed border-slate-200 dark:border-white/[0.08]">
        <Loader2 className="h-4 w-4 text-slate-400 mx-auto animate-spin mb-2" />
        <p className="text-[12px] text-slate-500 dark:text-white/55">
          Instanciando tarefas dessa etapa...
        </p>
      </div>
    )
  }

  const sorted = [...tasks].sort((a, b) => {
    // Ordena por metadata.item_position (preservado do checklist_template).
    // Antes usava checklist_item_id (campo que nunca existiu) e ordem ficava
    // aleatoria. Fallback pra created_at quando item_position ausente.
    const ma = (a.metadata as Record<string, unknown> | undefined) ?? {}
    const mb = (b.metadata as Record<string, unknown> | undefined) ?? {}
    const ap =
      typeof ma.item_position === "number" ? ma.item_position : Number.POSITIVE_INFINITY
    const bp =
      typeof mb.item_position === "number" ? mb.item_position : Number.POSITIVE_INFINITY
    if (ap !== bp) return ap - bp
    const ac = (a as { created_at?: string }).created_at ?? ""
    const bc = (b as { created_at?: string }).created_at ?? ""
    return ac.localeCompare(bc)
  })
  const total = sorted.length
  const completed = sorted.filter((t) => t.status === "completed").length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-slate-600 dark:text-white/70">
          {completed} de {total} concluídas
        </p>
        <span className="text-[11px] font-mono tabular-nums text-slate-500">
          {pct}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
        <div
          className="h-full bg-brand-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="space-y-1.5">
        {sorted.map((t) => {
          const meta = (t.metadata ?? {}) as Record<string, unknown>
          const subItems = Array.isArray(meta.sub_items)
            ? (meta.sub_items as SubItem[])
            : null
          return (
            <div key={t.id}>
              <TaskRow
                task={t as unknown as TaskRowData}
                onComplete={completeTask}
                onDelete={deleteTask}
                showSource={false}
                compact={false}
              />
              {subItems && subItems.length > 0 && (
                <SubItemsList
                  taskId={t.id}
                  items={subItems}
                  onMutate={onMutate}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Deliverables Tab ────────────────────────────────────────────────────────
function DeliverablesTab({
  column,
  tasks,
  deliverables,
  onMutate,
  onboardingId,
}: {
  column: OperationalPipelineColumn | null
  tasks: OnboardingTaskLite[]
  deliverables: TaskDeliverable[]
  onMutate: () => void
  onboardingId: string
}) {
  const toast = useToast()
  const task = tasks[0] ?? null
  const fields = column?.deliverables_template ?? []
  const taskDels = deliverables.filter((d) => task && d.task_id === task.id)

  if (!column) return null
  if (fields.length === 0) {
    return (
      <p className="text-[12px] text-slate-500 italic">
        Esta coluna nao tem deliverables.
      </p>
    )
  }
  if (!task) {
    return <p className="text-[12px] text-slate-500 italic">Task pendente.</p>
  }

  async function savePatch(
    slug: string,
    patch: {
      value?: string | null
      file_url?: string | null
      file_name?: string | null
      file_size_bytes?: number | null
    },
  ) {
    if (!task) return
    const f = fields.find((x) => x.slug === slug)
    if (!f) return
    const existing = taskDels.find((d) => d.field_slug === slug)
    const url = existing
      ? `/api/tasks/${task.id}/deliverables/${existing.id}`
      : `/api/tasks/${task.id}/deliverables`
    const method = existing ? "PATCH" : "POST"
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field_slug: f.slug,
        field_label: f.label,
        field_type: f.type,
        required: f.required,
        ...patch,
      }),
    })
    if (!res.ok) {
      toast.toast({ variant: "destructive", title: "Falha ao salvar" })
      return
    }
    onMutate()
  }

  return (
    <div className="space-y-3">
      {fields.map((f) => {
        const existing = taskDels.find((d) => d.field_slug === f.slug)
        return (
          <DeliverableField
            key={f.slug}
            field={f}
            value={existing?.value ?? ""}
            existing={existing ?? null}
            onboardingId={onboardingId}
            onSave={(v) => savePatch(f.slug, { value: v })}
            onSaveFull={(p) => savePatch(f.slug, p)}
          />
        )
      })}
    </div>
  )
}

interface DeliverableFieldExtras {
  onSaveFull?: (patch: {
    value?: string | null
    file_url?: string | null
    file_name?: string | null
    file_size_bytes?: number | null
  }) => void
  existing?: { file_url: string | null; file_name: string | null } | null
  onboardingId?: string
}

function DeliverableField({
  field,
  value,
  onSave,
  existing,
  onSaveFull,
  onboardingId,
}: {
  field: {
    slug: string
    label: string
    type: string
    required: boolean
    options?: string[]
    placeholder?: string
    helpText?: string
  }
  value: string
  onSave: (v: string) => void
} & DeliverableFieldExtras) {
  const [local, setLocal] = useState(value)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const toast = useToast()

  async function commit() {
    if (local === value) return
    setSaving(true)
    try {
      await onSave(local)
    } finally {
      setSaving(false)
    }
  }

  async function uploadFile(file: File) {
    if (!onboardingId || !onSaveFull) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("scope", "deliverable")
      fd.append("ref_id", onboardingId)
      const res = await fetch("/api/upload/onboarding", {
        method: "POST",
        body: fd,
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.toast({
          variant: "destructive",
          title: "Falha no upload",
          description: j.error?.message ?? "Tente novamente.",
        })
        return
      }
      const result = j.data ?? j
      onSaveFull({
        file_url: result.path,
        file_name: result.file_name,
        file_size_bytes: result.file_size ?? null,
      })
    } finally {
      setUploading(false)
    }
  }

  const labelEl = (
    <label className="flex items-center justify-between text-[12px] font-semibold text-slate-700 dark:text-white/80">
      <span>
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </span>
      {(saving || uploading) && (
        <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
      )}
    </label>
  )

  let control: React.ReactNode

  switch (field.type) {
    case "textarea":
      control = (
        <textarea
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          placeholder={field.placeholder}
          rows={3}
          className="w-full px-3 py-2 text-[12.5px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
        />
      )
      break

    case "select":
      control = (
        <select
          value={local}
          onChange={(e) => {
            setLocal(e.target.value)
            onSave(e.target.value)
          }}
          className="w-full h-9 px-2 text-[12.5px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
        >
          <option value="">— selecionar —</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )
      break

    case "numeric":
      control = (
        <input
          type="number"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          placeholder={field.placeholder}
          className="w-full h-9 px-3 text-[12.5px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
        />
      )
      break

    case "checkbox":
      control = (
        <label className="flex items-center gap-2 cursor-pointer h-9">
          <input
            type="checkbox"
            checked={local === "true"}
            onChange={(e) => {
              const v = e.target.checked ? "true" : "false"
              setLocal(v)
              onSave(v)
            }}
            className="h-4 w-4 rounded border-slate-300 text-brand-400"
          />
          <span className="text-[12.5px] text-slate-700 dark:text-white/80">
            {field.placeholder ?? "Confirmar"}
          </span>
        </label>
      )
      break

    case "multi_checkbox": {
      const opts = field.options ?? []
      const selected = (() => {
        try {
          return JSON.parse(local || "[]") as string[]
        } catch {
          return []
        }
      })()
      function toggle(o: string) {
        const next = selected.includes(o)
          ? selected.filter((x) => x !== o)
          : [...selected, o]
        const s = JSON.stringify(next)
        setLocal(s)
        onSave(s)
      }
      control = (
        <div className="flex flex-wrap gap-1.5">
          {opts.map((o) => {
            const on = selected.includes(o)
            return (
              <button
                key={o}
                type="button"
                onClick={() => toggle(o)}
                className={
                  "inline-flex items-center gap-1 h-7 px-2.5 text-[11.5px] font-medium rounded-[5px] border " +
                  (on
                    ? "bg-brand-500 text-white border-brand-500"
                    : "bg-white dark:bg-white/[0.04] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-white/70 hover:border-slate-300")
                }
              >
                {on && <CheckCircle2 className="h-3 w-3" />}
                {o}
              </button>
            )
          })}
        </div>
      )
      break
    }

    case "upload":
      control = existing?.file_url ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-[6px] border border-emerald-200 dark:border-emerald-900/30 bg-emerald-50/40 dark:bg-emerald-500/[0.05]">
          <FileText className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <span className="text-[12px] text-emerald-800 dark:text-emerald-300 truncate flex-1">
            {existing.file_name ?? "arquivo"}
          </span>
          <button
            type="button"
            onClick={async () => {
              const res = await fetch(
                `/api/upload/onboarding?path=${encodeURIComponent(existing.file_url ?? "")}`,
              )
              const j = await res.json().catch(() => ({}))
              if (j.data?.url ?? j.url) {
                window.open(j.data?.url ?? j.url, "_blank")
              }
            }}
            className="text-[11px] font-semibold text-brand-500 hover:underline"
          >
            Abrir
          </button>
          <button
            type="button"
            onClick={() =>
              onSaveFull?.({
                file_url: null,
                file_name: null,
                file_size_bytes: null,
              })
            }
            className="text-[11px] text-slate-500 hover:text-red-600"
          >
            Remover
          </button>
        </div>
      ) : (
        <label className="flex items-center justify-center gap-1.5 h-10 px-3 rounded-[6px] border border-dashed border-slate-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.02] cursor-pointer hover:border-brand-400">
          <Upload className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-[12px] text-slate-600 dark:text-white/55">
            {uploading ? "Enviando..." : "Clique pra fazer upload"}
          </span>
          <input
            type="file"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void uploadFile(f)
            }}
          />
        </label>
      )
      break

    case "date":
      control = (
        <input
          type="date"
          value={local}
          onChange={(e) => {
            setLocal(e.target.value)
            onSave(e.target.value)
          }}
          className="w-full h-9 px-3 text-[12.5px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
        />
      )
      break

    case "url":
    default:
      control = (
        <input
          type={field.type === "url" ? "url" : "text"}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          placeholder={field.placeholder}
          className="w-full h-9 px-3 text-[12.5px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
        />
      )
  }

  return (
    <div className="space-y-1.5">
      {labelEl}
      {control}
      {field.helpText && (
        <p className="text-[11px] text-slate-500 dark:text-white/55">
          {field.helpText}
        </p>
      )}
    </div>
  )
}

// ─── Briefing Tab ────────────────────────────────────────────────────────────
function BriefingTab({
  onboarding,
  onMutate,
}: {
  onboarding: OnboardingPipelineItem
  onMutate: () => void
}) {
  const toast = useToast()
  const [requesting, setRequesting] = useState(false)
  const [resending, setResending] = useState(false)
  const b = onboarding.briefing
  const briefingError =
    b && typeof b === "object" && "error" in b
      ? (b as unknown as { error: string }).error
      : null
  const briefingHasContent = b && !briefingError && (b.about_brand || b.audience)
  const origin =
    typeof window !== "undefined" ? window.location.origin : ""
  const formUrl = `${origin}/form/${onboarding.form_token}`
  const tutorialUrl = onboarding.tutorial_token
    ? `${origin}/onboarding-help/${onboarding.tutorial_token}`
    : null

  async function requestRevision() {
    const justification = window.prompt(
      "Por que esse briefing precisa de revisao? (min 10 chars)",
    )
    if (!justification || justification.trim().length < 10) {
      if (justification !== null) {
        toast.toast({
          variant: "destructive",
          title: "Justificativa obrigatoria",
          description: "Minimo 10 caracteres.",
        })
      }
      return
    }
    setRequesting(true)
    try {
      const res = await fetch(
        `/api/onboardings/${onboarding.id}/request-briefing-revision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ justification: justification.trim() }),
        },
      )
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.toast({
          variant: "destructive",
          title: "Falha",
          description: j.error ?? "Tente novamente.",
        })
        return
      }
      toast.toast({ title: "Briefing voltou para revisao" })
      onMutate()
    } finally {
      setRequesting(false)
    }
  }

  async function resendWebhook() {
    setResending(true)
    try {
      const res = await fetch(
        `/api/onboardings/${onboarding.id}/resend-briefing-webhook`,
        { method: "POST" },
      )
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.toast({
          variant: "destructive",
          title: "Falha ao reenviar webhook",
          description: j.error?.message ?? j.error ?? "Tente novamente.",
        })
        return
      }
      toast.toast({ title: "Webhook reenviado com sucesso" })
    } catch {
      toast.toast({
        variant: "destructive",
        title: "Erro de rede",
        description: "Nao foi possivel reenviar o webhook.",
      })
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[6px] bg-brand-50/60 dark:bg-brand-500/[0.05] border border-brand-200/60 dark:border-brand-500/20 p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-[11px] font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mb-1">
              Link do formulario
            </p>
            <p className="text-[12px] font-mono text-slate-700 dark:text-white/80 truncate max-w-[400px]">
              {formUrl}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(formUrl)
                toast.toast({ title: "Link copiado" })
              }}
              className="h-7 px-2.5 text-[11px] font-semibold text-brand-500 dark:text-brand-300 bg-white dark:bg-brand-500/10 rounded-[5px] border border-brand-300 dark:border-brand-500/30 hover:bg-brand-50"
            >
              Copiar
            </button>
            <a
              href={formUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 h-7 px-2.5 text-[11px] font-semibold text-brand-500 dark:text-brand-300 hover:underline"
            >
              Abrir
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>

      {tutorialUrl && (
        <div className="rounded-[6px] bg-emerald-50/40 dark:bg-emerald-500/[0.05] border border-emerald-200/60 dark:border-emerald-500/20 p-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide mb-1">
                Link do tutorial
              </p>
              <p className="text-[12px] font-mono text-slate-700 dark:text-white/80 truncate max-w-[400px]">
                {tutorialUrl}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(tutorialUrl)
                  toast.toast({ title: "Link copiado" })
                }}
                className="h-7 px-2.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-white dark:bg-emerald-500/10 rounded-[5px] border border-emerald-300 dark:border-emerald-500/30 hover:bg-emerald-50"
              >
                Copiar
              </button>
              <a
                href={tutorialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 h-7 px-2.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:underline"
              >
                Abrir
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {briefingError ? (
        <div className="rounded-[6px] bg-red-50/40 dark:bg-red-500/[0.05] border border-red-200 dark:border-red-900/30 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400 mb-1">
            Falha na geracao do briefing
          </p>
          <p className="text-[12px] text-red-800 dark:text-red-300">
            {briefingError}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-white/55 mt-2">
            Pede pro cliente reenviar o formulario ou contate o time tecnico.
          </p>
        </div>
      ) : !briefingHasContent ? (
        <p className="text-[12.5px] text-slate-500 italic">
          Briefing ainda nao gerado. Aguardando cliente preencher o formulario.
        </p>
      ) : (
        <div className="space-y-3">
          <BriefingSection label="Sobre a marca" value={b.about_brand} />
          <BriefingSection label="Público / Audiencia" value={b.audience} />
          <BriefingSection label="Tom e linguagem" value={b.language_tone} />
          {b.visual_identity && (
            <BriefingSection
              label="Identidade visual"
              value={`Paleta: ${b.visual_identity.palette}\nFontes: ${b.visual_identity.fonts}\nReferências: ${b.visual_identity.references}`}
            />
          )}
          <BriefingSection
            label="Ofertas e diferenciais"
            value={b.offers_and_differentials}
          />
          {b.client_additions && (
            <BriefingSection
              label="Adicoes do cliente"
              value={b.client_additions}
              accent="emerald"
            />
          )}
        </div>
      )}

      {briefingHasContent && onboarding.briefing_status === "approved" && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={requestRevision}
            disabled={requesting}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30 rounded-[6px]"
          >
            {requesting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Pedir revisao do briefing
          </button>

          {onboarding.briefing_confirmed_by_client && (
            <button
              type="button"
              onClick={resendWebhook}
              disabled={resending}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold text-slate-600 bg-slate-50 dark:bg-white/5 dark:text-slate-300 border border-slate-300 dark:border-white/15 rounded-[6px] hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${resending ? "animate-spin" : ""}`} />
              {resending ? "Enviando..." : "Reenviar webhook"}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function BriefingSection({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: "emerald"
}) {
  return (
    <div
      className={
        "rounded-[6px] border p-3 " +
        (accent === "emerald"
          ? "bg-emerald-50/40 dark:bg-emerald-500/[0.05] border-emerald-200 dark:border-emerald-900/30"
          : "bg-white dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.08]")
      }
    >
      <p className="text-[10px] uppercase tracking-wide font-mono text-slate-400 dark:text-white/40 mb-1.5">
        {label}
      </p>
      <p className="text-[13px] text-slate-800 dark:text-white/85 whitespace-pre-wrap leading-relaxed">
        {value}
      </p>
    </div>
  )
}

// ─── Versions Tab ────────────────────────────────────────────────────────────
function VersionsTab({ versions }: { versions: OnboardingVersion[] }) {
  if (versions.length === 0) {
    return (
      <p className="text-[12px] text-slate-500 italic">Sem versões ainda.</p>
    )
  }
  const sorted = [...versions].sort((a, b) => b.version_number - a.version_number)
  return (
    <div className="space-y-2">
      {sorted.map((v) => (
        <div
          key={v.id}
          className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-3"
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-[12.5px] font-semibold text-slate-900 dark:text-white">
              v{v.version_number}
            </p>
            <span
              className={
                "text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded " +
                (v.status === "approved"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : v.status === "rejected_by_client"
                    ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                    : "bg-slate-100 text-slate-600 dark:bg-white/[0.06]")
              }
            >
              {v.status.replaceAll("_", " ")}
            </span>
          </div>
          {v.client_feedback && (
            <p className="text-[12px] text-slate-600 dark:text-white/70 whitespace-pre-wrap mt-1.5">
              {v.client_feedback}
            </p>
          )}
          {v.feedback_severity && (
            <p className="mt-1.5 text-[10px] uppercase tracking-wide font-mono text-slate-400">
              Severidade: {v.feedback_severity}
            </p>
          )}
          <p className="text-[10px] text-slate-400 mt-1.5">
            {new Date(v.created_at).toLocaleString("pt-BR")}
          </p>
        </div>
      ))}
    </div>
  )
}

// ─── Form Responses Tab ──────────────────────────────────────────────────────
function FormResponsesTab({
  onboarding,
}: {
  onboarding: OnboardingPipelineItem
}) {
  const r = onboarding.form_responses
  if (!r) {
    return (
      <p className="text-[12px] text-slate-500 italic">
        Cliente ainda nao preencheu o formulario.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {Object.entries(r).map(([k, v]) => (
        <div
          key={k}
          className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-3"
        >
          <p className="text-[10px] uppercase tracking-wide font-mono text-slate-400 mb-1">
            {k.replaceAll("_", " ")}
          </p>
          <p className="text-[12.5px] text-slate-800 dark:text-white/85 whitespace-pre-wrap">
            {typeof v === "string" ? v : JSON.stringify(v, null, 2)}
          </p>
        </div>
      ))}
    </div>
  )
}

// ─── Go Back Dialog ──────────────────────────────────────────────────────────
function GoBackDialog({
  columns,
  currentIdx,
  onboardingId,
  onClose,
  onDone,
}: {
  columns: OperationalPipelineColumn[]
  currentIdx: number
  onboardingId: string
  onClose: () => void
  onDone: () => void
}) {
  const [targetSlug, setTargetSlug] = useState<string>("")
  const [feedback, setFeedback] = useState("")
  const [severity, setSeverity] = useState<FeedbackSeverity>("medium")
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()
  const candidates = columns.slice(0, currentIdx)

  async function submit() {
    if (!targetSlug || feedback.trim().length < 10) {
      toast.toast({
        variant: "destructive",
        title: "Campos obrigatorios",
        description: "Selecione coluna destino e escreva o feedback (min 10 chars).",
      })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/onboardings/${onboardingId}/go-back`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_column_slug: targetSlug,
          feedback,
          severity,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.toast({
          variant: "destructive",
          title: "Falha",
          description: j.error?.message ?? "Tente novamente.",
        })
        return
      }
      toast.toast({ title: "Onboarding voltou pra coluna anterior" })
      onDone()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[480px] bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] overflow-hidden">
        <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
            Pedir ajustes
          </h2>
          <p className="mt-0.5 text-[12px] text-slate-500 dark:text-white/55">
            Volta o onboarding pra uma coluna anterior. Uma nova versão sera criada.
          </p>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80 mb-1">
              Voltar pra coluna
            </label>
            <select
              value={targetSlug}
              onChange={(e) => setTargetSlug(e.target.value)}
              className="w-full h-9 px-2 text-[12px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
            >
              <option value="">— selecionar —</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80 mb-1">
              Severidade
            </label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as FeedbackSeverity)}
              className="w-full h-9 px-2 text-[12px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
            >
              <option value="small">Ajuste pequeno</option>
              <option value="medium">Ajuste médio</option>
              <option value="rework_part">Retrabalho parcial</option>
              <option value="rework_all">Retrabalho completo</option>
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80 mb-1">
              Feedback (visível pra equipe)
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
              placeholder="O que precisa ser ajustado..."
              className="w-full px-3 py-2 text-[12.5px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 text-[12px] font-medium text-slate-700 hover:bg-slate-100 rounded-[6px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-[6px] disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <ArrowLeft className="h-3.5 w-3.5" />
            Pedir ajustes
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── FormLinkBanner: link tokenizado em destaque ────────────────────────

function FormLinkBanner({
  token,
  formStatus,
  expiresAt,
}: {
  token: string
  formStatus: "nao_enviado" | "em_andamento" | "concluido"
  expiresAt: string | null
}) {
  const toast = useToast()
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const url = `${origin}/form/${token}`

  const statusInfo = {
    nao_enviado: {
      label: "Não enviado",
      tone: "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-white/55",
      icon: <FileText className="h-3 w-3" />,
    },
    em_andamento: {
      label: "Cliente preenchendo",
      tone: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    concluido: {
      label: "Cliente concluiu",
      tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
  }[formStatus]

  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
      })
    : null

  return (
    <div className="rounded-[6px] bg-brand-50/60 dark:bg-brand-500/[0.05] border border-brand-200 dark:border-brand-500/20 p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-brand-500 dark:text-brand-300">
              Link do formulário do cliente
            </p>
            <span
              className={
                "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-[3px] " +
                statusInfo.tone
              }
            >
              {statusInfo.icon}
              {statusInfo.label}
            </span>
            {expiresLabel && (
              <span className="text-[10px] text-slate-500 dark:text-white/55">
                · expira {expiresLabel}
              </span>
            )}
          </div>
          <p className="text-[12px] font-mono text-slate-700 dark:text-white/80 truncate">
            {url}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(url)
              toast.toast({ title: "Link copiado", description: url })
            }}
            className="h-8 px-3 text-[12px] font-semibold text-brand-500 dark:text-brand-300 bg-white dark:bg-brand-500/10 rounded-[5px] border border-brand-300 dark:border-brand-500/30 hover:bg-brand-50"
          >
            Copiar link
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 h-8 px-3 text-[12px] font-semibold text-brand-500 dark:text-brand-300 hover:underline"
          >
            Abrir
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  )
}
