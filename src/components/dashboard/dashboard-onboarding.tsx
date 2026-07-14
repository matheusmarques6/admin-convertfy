"use client"

import { useMemo } from "react"
import { Info } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip"

// ─── Types ────────────────────────────────────────────────

interface OnboardingProp {
  id: string
  storeName: string
  phase: string
  days: number
  isNew?: boolean
  isLate?: boolean
}

interface DashboardOnboardingProps {
  loading?: boolean
  onboardings?: OnboardingProp[]
}

interface OnboardingStore {
  name: string
  phase: Phase
  days: number
  badge?: "novo" | "atrasado"
}

// As 7 fases correspondem 1:1 aos slugs das colunas do pipeline de onboarding
// (operational_pipeline_columns em onboarding-bootstrap.service.ts).
type Phase =
  | "entrada"
  | "cliente_formulario"
  | "preview_producao"
  | "preview_aprovacao"
  | "emails_finais"
  | "implementacao"
  | "cliente_ativo"

interface PhaseConfig {
  label: string
  color: string
}

// ─── Phase config ─────────────────────────────────────────

const PHASE_ORDER: Phase[] = [
  "entrada",
  "cliente_formulario",
  "preview_producao",
  "preview_aprovacao",
  "emails_finais",
  "implementacao",
  "cliente_ativo",
]

const PHASES: Record<Phase, PhaseConfig> = {
  entrada: { label: "Entrada", color: "#6B7280" },
  cliente_formulario: { label: "Formulário", color: "#4E62D8" },
  preview_producao: { label: "Preview (Prod.)", color: "#7C3AED" },
  preview_aprovacao: { label: "Preview (Aprov.)", color: "#A855F7" },
  emails_finais: { label: "E-mails Finais", color: "#F59E0B" },
  implementacao: { label: "Implementação", color: "#0EA5E9" },
  cliente_ativo: { label: "Go Live", color: "#10B981" },
}

// ─── Helpers ──────────────────────────────────────────────

function getDaysColor(days: number): string {
  if (days > 7) return "text-red-600 dark:text-red-400"
  if (days > 5) return "text-amber-600 dark:text-amber-400"
  return "text-gray-500 dark:text-white/60 dark:text-gray-400 dark:text-white/50"
}

// ─── Skeleton ─────────────────────────────────────────────

function SkeletonState() {
  return (
    <div className="space-y-4">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      </div>

      {/* KPI row skeleton */}
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2 py-3">
            <div className="h-5 w-10 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-3 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        ))}
      </div>

      {/* Pipeline bar skeleton */}
      <div className="h-2 w-full animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />

      {/* Legend skeleton */}
      <div className="flex gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-3 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="space-y-0 border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)]">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between border-b border-[rgba(0,0,0,0.04)] py-2.5 dark:border-[rgba(255,255,255,0.04)]"
          >
            <div className="h-3.5 w-28 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-3 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-3 w-8 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        ))}
      </div>

      {/* Footer skeleton */}
      <div className="h-3 w-44 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
    </div>
  )
}

// ─── KPI Cell ─────────────────────────────────────────────

function KpiCell({
  label,
  value,
  isRed,
  isLast,
}: {
  label: string
  value: string | number
  isRed?: boolean
  isLast?: boolean
}) {
  return (
    <div
      className={cn(
        "px-4 py-3",
        !isLast && "border-r border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]"
      )}
    >
      <div
        className={cn(
          "text-[20px] font-semibold font-mono tabular-nums",
          isRed
            ? "text-red-600 dark:text-red-400"
            : "text-gray-900 dark:text-white dark:text-[#EAEDF3]"
        )}
      >
        {value}
      </div>
      <div className="text-[11px] text-gray-400 dark:text-white/50 dark:text-gray-500 dark:text-white/60">
        {label}
      </div>
    </div>
  )
}

// ─── DashboardOnboarding (exported) ───────────────────────

function mapPhase(raw: string): Phase {
  const s = (raw || "").toLowerCase().trim()
  // Match direto pelo slug real da coluna do pipeline.
  const direct: Record<string, Phase> = {
    entrada: "entrada",
    cliente_formulario: "cliente_formulario",
    preview_producao: "preview_producao",
    preview_aprovacao: "preview_aprovacao",
    emails_finais: "emails_finais",
    implementacao: "implementacao",
    cliente_ativo: "cliente_ativo",
  }
  if (direct[s]) return direct[s]
  // Fallbacks para status genéricos que possam chegar em current_phase/status.
  if (s === "completed" || s.includes("live") || s.includes("ativo")) return "cliente_ativo"
  if (s.includes("aprov")) return "preview_aprovacao"
  if (s.includes("preview") || s.includes("producao")) return "preview_producao"
  if (s.includes("form")) return "cliente_formulario"
  if (s.includes("implement")) return "implementacao"
  if (s.includes("email") || s.includes("final")) return "emails_finais"
  return "entrada"
}

export function DashboardOnboarding({ loading = false, onboardings }: DashboardOnboardingProps) {
  // Derive stores from real data or fallback to mock
  const stores: OnboardingStore[] = useMemo(() => {
    if (onboardings && onboardings.length > 0) {
      return onboardings.map((ob) => ({
        name: ob.storeName,
        phase: mapPhase(ob.phase),
        days: ob.days,
        badge: ob.isNew ? "novo" as const : ob.isLate ? "atrasado" as const : undefined,
      }))
    }
    return []
  }, [onboardings])

  // Derive KPIs from real stores
  const kpi = useMemo(() => {
    const inProgress = stores.length
    const avgDays = stores.length > 0
      ? Math.round(stores.reduce((sum, s) => sum + s.days, 0) / stores.length)
      : 0
    const overdue = stores.filter((s) => s.badge === "atrasado").length
    return {
      inProgress,
      avgTime: `${avgDays}d`,
      completed30d: 0,
      overdue,
    }
  }, [stores])

  // Derive pipeline from real stores
  const pipelineSegments = useMemo(() => {
    const counts: Record<Phase, number> = {
      entrada: 0,
      cliente_formulario: 0,
      preview_producao: 0,
      preview_aprovacao: 0,
      emails_finais: 0,
      implementacao: 0,
      cliente_ativo: 0,
    }
    for (const s of stores) {
      counts[s.phase]++
    }
    return PHASE_ORDER
      .filter((phase) => counts[phase] > 0)
      .map((phase) => ({ phase, count: counts[phase] }))
  }, [stores])

  const totalPipeline = pipelineSegments.reduce((s, seg) => s + seg.count, 0)

  return (
    <div
      className={cn(
        "rounded-[6px] border border-[rgba(0,0,0,0.08)] bg-white dark:bg-[#1A1D27] p-6",
        "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]"
      )}
    >
      {loading ? (
        <SkeletonState />
      ) : (
        <>
          {/* ── Header ── */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <h3 className="text-[14px] font-medium text-gray-700 dark:text-white/90 dark:text-gray-300">
                Onboarding
              </h3>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-gray-300 hover:text-gray-500 dark:text-white/60 dark:text-[#5C6378] dark:hover:text-[#8B92A5] transition-colors">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[280px] text-xs leading-relaxed">
                    Acompanhe o progresso dos onboardings ativos. Cada loja passa pelas fases: Entrada, Formulário, Preview (produção e aprovação), E-mails Finais, Implementação e Go Live. Lojas atrasadas são destacadas.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <button
              type="button"
              className="text-[12px] font-medium text-[#4E62D8] hover:underline dark:text-[#7B8CEA]"
            >
              Ver board
            </button>
          </div>

          {/* ── KPI Row ── */}
          <div className="mb-4 grid grid-cols-4">
            <KpiCell label="Em andamento" value={kpi.inProgress} />
            <KpiCell label="Tempo médio" value={kpi.avgTime} />
            <KpiCell label="Concluídos 30d" value={kpi.completed30d} />
            <KpiCell
              label="Atrasados"
              value={kpi.overdue}
              isRed={kpi.overdue > 0}
              isLast
            />
          </div>

          {/* ── Pipeline Bar ── */}
          <div className="mb-2 flex h-2 w-full overflow-hidden rounded-full">
            {pipelineSegments.map((seg) => (
              <div
                key={seg.phase}
                style={{
                  width: `${(seg.count / totalPipeline) * 100}%`,
                  backgroundColor: PHASES[seg.phase].color,
                }}
              />
            ))}
          </div>

          {/* ── Pipeline Legend ── */}
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1">
            {pipelineSegments.map((seg) => (
              <div key={seg.phase} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: PHASES[seg.phase].color }}
                />
                <span className="text-[11px] text-gray-500 dark:text-white/60 dark:text-gray-400 dark:text-white/50">
                  {PHASES[seg.phase].label}
                </span>
                <span className="text-[11px] font-mono tabular-nums text-gray-400 dark:text-white/50 dark:text-gray-500 dark:text-white/60">
                  {seg.count}
                </span>
              </div>
            ))}
          </div>

          {/* ── Store Table ── */}
          <div className="border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)]">
            {stores.map((store) => (
              <div
                key={store.name}
                className="flex items-center justify-between border-b border-[rgba(0,0,0,0.04)] py-2.5 dark:border-[rgba(255,255,255,0.04)]"
              >
                {/* Left: store name + badge */}
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-gray-900 dark:text-white dark:text-[#EAEDF3]">
                    {store.name}
                  </span>
                  {store.badge === "novo" && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      Novo
                    </span>
                  )}
                  {store.badge === "atrasado" && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                      Atrasado
                    </span>
                  )}
                </div>

                {/* Center: phase */}
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: PHASES[store.phase].color }}
                  />
                  <span className="text-[12px] text-gray-500 dark:text-white/60 dark:text-gray-400 dark:text-white/50">
                    {PHASES[store.phase].label}
                  </span>
                </div>

                {/* Right: days */}
                <span
                  className={cn(
                    "text-[12px] font-mono tabular-nums",
                    getDaysColor(store.days)
                  )}
                >
                  {store.days}d
                </span>
              </div>
            ))}
          </div>

          {/* ── Footer ── */}
          <div className="mt-3 text-[12px] text-gray-400 dark:text-white/50 dark:text-gray-500 dark:text-white/60">
            {kpi.inProgress} em andamento &middot; m&eacute;dia {kpi.avgTime}
          </div>
        </>
      )}
    </div>
  )
}
