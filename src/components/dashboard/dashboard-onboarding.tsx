"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"

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

type Phase = "config" | "briefing" | "klaviyo" | "camp" | "golive"

interface PhaseConfig {
  label: string
  color: string
}

// ─── Phase config ─────────────────────────────────────────

const PHASES: Record<Phase, PhaseConfig> = {
  config: { label: "Configuração", color: "#6B7280" },
  briefing: { label: "Briefing", color: "#4E62D8" },
  klaviyo: { label: "Klaviyo", color: "#7C3AED" },
  camp: { label: "1ª Camp.", color: "#F59E0B" },
  golive: { label: "Go Live", color: "#10B981" },
}

// ─── Mock data ────────────────────────────────────────────

const MOCK_STORES: OnboardingStore[] = [
  { name: "Casa & Decor", phase: "camp", days: 11, badge: "atrasado" },
  { name: "Green Garden", phase: "klaviyo", days: 9 },
  { name: "TechHub Store", phase: "briefing", days: 6 },
  { name: "Moda Viva", phase: "klaviyo", days: 4 },
  { name: "Pet Kingdom", phase: "config", days: 3 },
  { name: "Esporte Total", phase: "camp", days: 3 },
  { name: "Sabor & Arte", phase: "briefing", days: 2 },
  { name: "Doce Encanto", phase: "golive", days: 2 },
  { name: "Nova Beleza", phase: "config", days: 1, badge: "novo" },
]

const MOCK_KPI = {
  inProgress: 9,
  avgTime: "5d",
  completed30d: 4,
  overdue: 2,
}

// ─── Pipeline counts ──────────────────────────────────────

const PIPELINE_SEGMENTS: { phase: Phase; count: number }[] = [
  { phase: "config", count: 2 },
  { phase: "briefing", count: 2 },
  { phase: "klaviyo", count: 2 },
  { phase: "camp", count: 2 },
  { phase: "golive", count: 1 },
]

const TOTAL_PIPELINE = PIPELINE_SEGMENTS.reduce((s, seg) => s + seg.count, 0)

// ─── Helpers ──────────────────────────────────────────────

function getDaysColor(days: number): string {
  if (days > 7) return "text-red-600 dark:text-red-400"
  if (days > 5) return "text-amber-600 dark:text-amber-400"
  return "text-gray-500 dark:text-gray-400"
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
            : "text-gray-900 dark:text-[#EAEDF3]"
        )}
      >
        {value}
      </div>
      <div className="text-[11px] text-gray-400 dark:text-gray-500">
        {label}
      </div>
    </div>
  )
}

// ─── DashboardOnboarding (exported) ───────────────────────

function mapPhase(raw: string): Phase {
  const lower = raw.toLowerCase()
  if (lower.includes("config") || lower === "setup") return "config"
  if (lower.includes("brief")) return "briefing"
  if (lower.includes("klaviyo") || lower.includes("integra")) return "klaviyo"
  if (lower.includes("camp") || lower.includes("1a") || lower.includes("first")) return "camp"
  if (lower.includes("golive") || lower.includes("go_live") || lower.includes("live") || lower === "completed") return "golive"
  if (lower === "in_progress") return "klaviyo"
  return "config"
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
    return MOCK_STORES
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
      completed30d: onboardings ? 0 : MOCK_KPI.completed30d, // no completed data from props
      overdue,
    }
  }, [stores, onboardings])

  // Derive pipeline from real stores
  const pipelineSegments = useMemo(() => {
    const counts: Record<Phase, number> = { config: 0, briefing: 0, klaviyo: 0, camp: 0, golive: 0 }
    for (const s of stores) {
      counts[s.phase]++
    }
    return (Object.keys(counts) as Phase[])
      .filter((phase) => counts[phase] > 0)
      .map((phase) => ({ phase, count: counts[phase] }))
  }, [stores])

  const totalPipeline = pipelineSegments.reduce((s, seg) => s + seg.count, 0)

  return (
    <div
      className={cn(
        "rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-white p-6",
        "dark:border-[rgba(255,255,255,0.08)] dark:bg-[#1A1D27]"
      )}
    >
      {loading ? (
        <SkeletonState />
      ) : (
        <>
          {/* ── Header ── */}
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[14px] font-medium text-gray-700 dark:text-gray-300">
              Onboarding
            </h3>
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
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                  {PHASES[seg.phase].label}
                </span>
                <span className="text-[11px] font-mono tabular-nums text-gray-400 dark:text-gray-500">
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
                  <span className="text-[13px] font-medium text-gray-900 dark:text-[#EAEDF3]">
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
                  <span className="text-[12px] text-gray-500 dark:text-gray-400">
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
          <div className="mt-3 text-[12px] text-gray-400 dark:text-gray-500">
            {kpi.inProgress} em andamento &middot; m&eacute;dia {kpi.avgTime}
          </div>
        </>
      )}
    </div>
  )
}
