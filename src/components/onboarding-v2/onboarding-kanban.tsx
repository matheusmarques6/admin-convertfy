"use client"

/**
 * Kanban dos onboardings (pipeline 7 colunas). Drag-and-drop entre
 * colunas chama /api/onboardings/[id]/advance se for proxima coluna,
 * ou /go-back se voltar (com modal de feedback obrigatorio).
 *
 * Card mostra: cliente, loja, briefing_status, current_version, dias
 * parado, flags de pagamento/contrato.
 */

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { SelectClientAndStore } from "./select-client-and-store"
import { OnboardingCard } from "./onboarding-card"
import { OnboardingDrawer } from "./onboarding-drawer"
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd"
import {
  Plus,
  Loader2,
  Search,
  Flame,
  Activity,
  Clock,
  TrendingUp,
  X,
} from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import { ROUTES } from "@/lib/routes"
import type {
  OnboardingPipelineItem,
  OperationalPipelineColumn,
} from "@/types/onboarding-pipeline"

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error?.message ?? j.error ?? `HTTP ${r.status}`)
  return j
}

type KanbanTab = "all" | "mine" | "overdue" | "live"

interface OrgMember {
  id: string
  role: string
  profile_id: string
  profile?: { id: string; name: string; avatar_url: string | null }
}

function avatarHash(name: string): { bg: string; fg: string } {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  const pal = [
    { bg: "#EEF0FB", fg: "#4E62D8" },
    { bg: "#ECFDF5", fg: "#065F46" },
    { bg: "#FFFBEB", fg: "#92400E" },
    { bg: "#F3E8FF", fg: "#7C3AED" },
    { bg: "#FEF2F2", fg: "#991B1B" },
    { bg: "#F3F4F6", fg: "#4B5563" },
  ]
  return pal[Math.abs(h) % pal.length]
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
}

export function OnboardingKanban() {
  const { data, mutate, isLoading } = useSWR<{
    columns: OperationalPipelineColumn[]
    onboardings: OnboardingPipelineItem[]
  }>("/api/onboardings", fetcher, { revalidateOnFocus: false })

  // Members pra filtro de responsavel
  const { data: membersData } = useSWR<{ members: OrgMember[] }>(
    "/api/admin/org-members",
    fetcher,
    { revalidateOnFocus: false },
  )

  // ID do user logado (vem do /api/me/tasks que ja é cached)
  const { data: meData } = useSWR<{
    member: { id: string; role: string; profile_id: string }
  }>("/api/me/tasks?status=pending", fetcher, { revalidateOnFocus: false })

  const [newOpen, setNewOpen] = useState(false)
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [goBackContext, setGoBackContext] = useState<{
    onboardingId: string
    targetSlug: string
  } | null>(null)
  const [tab, setTab] = useState<KanbanTab>("all")
  const [search, setSearch] = useState("")
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const toast = useToast()

  // Atalho Cmd+K / Ctrl+K pro search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        document.getElementById("kanban-search")?.focus()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const columns = useMemo(
    () => [...(data?.columns ?? [])].sort((a, b) => a.position - b.position),
    [data?.columns],
  )
  const allOnboardings = useMemo(
    () => data?.onboardings ?? [],
    [data?.onboardings],
  )
  const members = useMemo(() => membersData?.members ?? [], [membersData])
  const meProfileId = meData?.member?.profile_id ?? null
  const meRole = meData?.member?.role ?? null

  // Helper: onboarding pertence ao usuario "me"?
  function isMine(onb: OnboardingPipelineItem): boolean {
    if (!meProfileId && !meRole) return false
    const tasks = onb.tasks ?? []
    return tasks.some(
      (t) =>
        (t as unknown as { assignee_id?: string }).assignee_id ===
          meProfileId ||
        (t.assignee_role && t.assignee_role === meRole),
    )
  }

  // Helper: onboarding tem alguma task atribuida a um member especifico?
  function hasMember(
    onb: OnboardingPipelineItem,
    member: OrgMember,
  ): boolean {
    const tasks = onb.tasks ?? []
    return tasks.some(
      (t) =>
        (t as unknown as { assignee_id?: string }).assignee_id ===
          member.profile_id ||
        (t.assignee_role && t.assignee_role === member.role),
    )
  }

  // Helper: SLA estourado
  function isOverdue(
    onb: OnboardingPipelineItem,
    cols: OperationalPipelineColumn[],
  ): boolean {
    const col =
      onb.current_column ??
      cols.find((c) => c.id === onb.current_column_id)
    if (!col || !col.sla_hours) return false
    const elapsed =
      (Date.now() - new Date(onb.last_column_change_at).getTime()) /
      3_600_000
    return elapsed >= col.sla_hours
  }

  // Aplica filtros: search + tab + responsavel
  const filteredOnboardings = useMemo(() => {
    return allOnboardings.filter((o) => {
      // Search
      if (search.trim()) {
        const q = search.toLowerCase()
        const name = (o.store?.store_name ?? "").toLowerCase()
        const client = (o.client?.name ?? "").toLowerCase()
        const company = (o.client?.company ?? "").toLowerCase()
        if (
          !name.includes(q) &&
          !client.includes(q) &&
          !company.includes(q)
        )
          return false
      }
      // Tab
      if (tab === "mine" && !isMine(o)) return false
      if (tab === "overdue" && !isOverdue(o, columns)) return false
      if (tab === "live") {
        const lastCol = columns[columns.length - 1]
        if (lastCol && o.current_column_id !== lastCol.id) return false
      }
      // Responsavel
      if (selectedMemberId) {
        const m = members.find((x) => x.id === selectedMemberId)
        if (!m || !hasMember(o, m)) return false
      }
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOnboardings, search, tab, selectedMemberId, columns, members, meProfileId, meRole])

  // KPIs (baseados em todos os onboardings, nao nos filtrados)
  const kpis = useMemo(() => {
    const total = allOnboardings.length
    const overdue = allOnboardings.filter((o) => isOverdue(o, columns)).length
    // Health: 100 menos % de atrasados (simples e auditavel)
    const health = total === 0 ? 100 : Math.round(100 - (overdue / total) * 100)
    // Tempo medio na etapa atual (dias)
    const days = allOnboardings.map((o) => {
      const ms = Date.now() - new Date(o.last_column_change_at).getTime()
      return ms / 86_400_000
    })
    const avgDays =
      days.length === 0
        ? 0
        : Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10
    return { total, overdue, health, avgDays }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOnboardings, columns])

  // Counts pra cada tab
  const tabCounts = useMemo(
    () => ({
      all: allOnboardings.length,
      mine: allOnboardings.filter(isMine).length,
      overdue: allOnboardings.filter((o) => isOverdue(o, columns)).length,
      live: (() => {
        const lastCol = columns[columns.length - 1]
        if (!lastCol) return 0
        return allOnboardings.filter(
          (o) => o.current_column_id === lastCol.id,
        ).length
      })(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allOnboardings, columns, meProfileId, meRole],
  )

  const byColumn = useMemo(() => {
    const map = new Map<string, OnboardingPipelineItem[]>()
    for (const c of columns) map.set(c.id, [])
    for (const o of filteredOnboardings) {
      if (!o.current_column_id) continue
      map.get(o.current_column_id)?.push(o)
    }
    return map
  }, [columns, filteredOnboardings])

  const handleDrag = async (result: DropResult) => {
    if (!result.destination) return
    const { draggableId, destination, source } = result
    if (destination.droppableId === source.droppableId) return

    const onb = allOnboardings.find((o) => o.id === draggableId)
    if (!onb) return

    const srcIdx = columns.findIndex((c) => c.id === source.droppableId)
    const destIdx = columns.findIndex((c) => c.id === destination.droppableId)
    if (srcIdx < 0 || destIdx < 0) return

    // Avancar (proximo +1)
    if (destIdx === srcIdx + 1) {
      const res = await fetch(`/api/onboardings/${draggableId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.toast({
          variant: "destructive",
          title: "Nao foi possivel avancar",
          description: j.error?.message ?? j.error ?? "Tente novamente.",
        })
        return
      }
      toast.toast({ title: "Onboarding avancou de coluna" })
      mutate()
      return
    }

    // Voltar pra coluna anterior — abre dialog de feedback
    if (destIdx < srcIdx) {
      const targetCol = columns[destIdx]
      setGoBackContext({
        onboardingId: draggableId,
        targetSlug: targetCol.slug,
      })
      return
    }

    toast.toast({
      variant: "destructive",
      title: "Pular colunas não permitido",
      description: "Arraste 1 coluna por vez (avançar ou voltar).",
    })
  }

  if (isLoading) return <KanbanSkeleton />

  return (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-[#0B0E15]">
      {/* Header com titulo + acao */}
      <div className="px-5 sm:px-7 pt-5 pb-3 bg-white dark:bg-[#0F1117] border-b border-black/[0.06] dark:border-white/[0.08]">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-500 dark:text-white/55">
              Workflows
            </p>
            <h1 className="text-[22px] sm:text-[24px] font-semibold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Onboarding
              <span className="text-[12px] font-medium text-slate-400 dark:text-white/40 tabular-nums">
                {kpis.total} ativos
              </span>
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[8px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12.5px] font-semibold hover:opacity-90 transition-opacity shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            Novo onboarding
          </button>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="Ativos"
            value={String(kpis.total)}
            caption="no pipeline"
            icon={<Activity className="h-3.5 w-3.5" />}
            tone="neutral"
          />
          <KpiCard
            label="Atrasados"
            value={String(kpis.overdue)}
            caption="precisa de ação"
            icon={<Flame className="h-3.5 w-3.5" />}
            tone={kpis.overdue > 0 ? "danger" : "neutral"}
          />
          <KpiCard
            label="Health score"
            value={String(kpis.health)}
            caption={
              kpis.health >= 80
                ? "saudável"
                : kpis.health >= 60
                  ? "atenção"
                  : "crítico"
            }
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            tone={
              kpis.health >= 80
                ? "success"
                : kpis.health >= 60
                  ? "warn"
                  : "danger"
            }
          />
          <KpiCard
            label="Tempo médio"
            value={`${kpis.avgDays}d`}
            caption="por etapa · meta: 4d"
            icon={<Clock className="h-3.5 w-3.5" />}
            tone={kpis.avgDays <= 4 ? "success" : "warn"}
          />
        </div>
      </div>

      {/* Toolbar: tabs + responsavel + search */}
      <div className="px-5 sm:px-7 py-2.5 bg-white dark:bg-[#0F1117] border-b border-black/[0.06] dark:border-white/[0.08] flex flex-wrap items-center gap-3">
        {/* Tabs */}
        <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-white/[0.04] rounded-[8px] p-0.5">
          {(
            [
              { id: "all", label: "Todos", count: tabCounts.all },
              { id: "mine", label: "Meus", count: tabCounts.mine },
              { id: "overdue", label: "Atrasados", count: tabCounts.overdue },
              { id: "live", label: "Pronto pra live", count: tabCounts.live },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={
                "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-[12px] font-medium transition-colors " +
                (tab === t.id
                  ? "bg-white dark:bg-[#1A1D27] text-slate-900 dark:text-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                  : "text-slate-600 dark:text-white/65 hover:text-slate-900 dark:hover:text-white")
              }
            >
              {t.label}
              {t.count > 0 && t.id !== "all" && (
                <span
                  className={
                    "text-[10px] font-semibold tabular-nums px-1 rounded " +
                    (t.id === "overdue" && tab !== t.id
                      ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                      : "text-slate-500 dark:text-white/45")
                  }
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filtro responsavel */}
        {members.length > 0 && (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-medium text-slate-500 dark:text-white/55 shrink-0">
              Responsável:
            </span>
            <div className="flex items-center -space-x-1.5">
              {members.slice(0, 5).map((m) => {
                const name = m.profile?.name ?? m.role
                const ini = initials(name)
                const c = avatarHash(name)
                const selected = selectedMemberId === m.id
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      setSelectedMemberId(selected ? null : m.id)
                    }
                    title={name}
                    className={
                      "h-6 w-6 rounded-full inline-flex items-center justify-center text-[9.5px] font-semibold ring-2 transition-all " +
                      (selected
                        ? "ring-brand-500 scale-110 z-10"
                        : "ring-white dark:ring-[#0F1117] hover:scale-105 hover:z-10")
                    }
                    style={{
                      background: c.bg,
                      color: c.fg,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {ini || "?"}
                  </button>
                )
              })}
              {members.length > 5 && (
                <span className="text-[10px] text-slate-400 dark:text-white/40 pl-2">
                  +{members.length - 5}
                </span>
              )}
            </div>
            {selectedMemberId && (
              <button
                type="button"
                onClick={() => setSelectedMemberId(null)}
                className="text-[11px] text-slate-500 hover:text-slate-900 dark:text-white/55 dark:hover:text-white inline-flex items-center gap-0.5"
              >
                <X className="h-3 w-3" />
                limpar
              </button>
            )}
          </div>
        )}

        {/* Search */}
        <div className="ml-auto flex items-center gap-2 min-w-[220px] flex-1 sm:flex-initial sm:w-[280px]">
          <div className="relative flex-1">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-white/35"
              strokeWidth={2}
            />
            <input
              id="kanban-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar loja, contato..."
              className="w-full h-8 pl-8 pr-12 text-[12.5px] rounded-[8px] border border-slate-200 dark:border-white/[0.10] bg-slate-50 dark:bg-white/[0.03] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/35 focus:outline-none focus:border-brand-400 focus:bg-white dark:focus:bg-[#1A1D27] transition-colors"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9.5px] font-mono font-semibold text-slate-400 dark:text-white/35 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded px-1 py-0.5">
              ⌘K
            </span>
          </div>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 min-h-0 overflow-x-auto">
        <DragDropContext onDragEnd={handleDrag}>
          <div className="flex gap-3 px-5 py-4 h-full">
            {columns.map((col) => {
              const cards = byColumn.get(col.id) ?? []
              const overdueInCol = cards.filter((c) =>
                isOverdue(c, columns),
              ).length
              const slaLabel = col.sla_hours
                ? `SLA ${Math.ceil(col.sla_hours / 24)}d`
                : null
              return (
                <div
                  key={col.id}
                  className="flex flex-col w-[280px] min-w-[280px]"
                >
                  {/* Header: dot + nome + count, role + SLA, badge atrasados */}
                  <div className="px-1 pb-2.5 pt-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-[7px] w-[7px] rounded-full shrink-0"
                          style={{ background: col.color }}
                          aria-hidden
                        />
                        <span className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">
                          {col.name}
                        </span>
                        <span className="text-[11px] font-medium text-slate-500 dark:text-white/55 tabular-nums">
                          {cards.length}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1.5 gap-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400 dark:text-white/35 uppercase tracking-wide">
                        {col.default_assignee_role && (
                          <span>{col.default_assignee_role}</span>
                        )}
                        {col.default_assignee_role && slaLabel && (
                          <span className="text-slate-300 dark:text-white/20">
                            ·
                          </span>
                        )}
                        {slaLabel && <span>{slaLabel}</span>}
                      </div>
                      {overdueInCol > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-300 tabular-nums">
                          <Flame
                            className="h-2.5 w-2.5"
                            strokeWidth={2.5}
                          />
                          {overdueInCol}
                        </span>
                      )}
                    </div>
                  </div>

                  <Droppable droppableId={col.id}>
                    {(prov, snap) => (
                      <div
                        ref={prov.innerRef}
                        {...prov.droppableProps}
                        className={
                          "flex-1 p-2 space-y-2 overflow-y-auto min-h-[200px] " +
                          (snap.isDraggingOver
                            ? "bg-brand-50/60 dark:bg-brand-500/[0.05]"
                            : "")
                        }
                      >
                        {cards.map((onb, idx) => (
                          <Draggable
                            key={onb.id}
                            draggableId={onb.id}
                            index={idx}
                          >
                            {(dp, ds) => (
                              <div
                                ref={dp.innerRef}
                                {...dp.draggableProps}
                                {...dp.dragHandleProps}
                                role="button"
                                tabIndex={0}
                                onClick={() => setDrawerId(onb.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault()
                                    setDrawerId(onb.id)
                                  }
                                }}
                                className="focus:outline-none"
                              >
                                <OnboardingCard
                                  onb={onb}
                                  stageColor={col.color}
                                  isDragging={ds.isDragging}
                                  onView={(id) => setDrawerId(id)}
                                  onForceAdvance={(id) => {
                                    window.location.href =
                                      ROUTES.ADMIN.ONBOARDING_V2.DETAIL(id) +
                                      "?action=force-advance"
                                  }}
                                  onRequestAdjustments={(id) => {
                                    window.location.href =
                                      ROUTES.ADMIN.ONBOARDING_V2.DETAIL(id) +
                                      "?action=go-back"
                                  }}
                                  onArchive={async (id) => {
                                    if (
                                      !confirm(
                                        "Arquivar esse onboarding? (status=cancelled, soft-delete)",
                                      )
                                    )
                                      return
                                    const res = await fetch(
                                      `/api/onboardings/${id}`,
                                      { method: "DELETE" },
                                    )
                                    if (res.ok) {
                                      toast.toast({ title: "Onboarding arquivado" })
                                      mutate()
                                    } else {
                                      const j = await res.json().catch(() => ({}))
                                      toast.toast({
                                        variant: "destructive",
                                        title: "Falha",
                                        description: j.error ?? "Tente novamente.",
                                      })
                                    }
                                  }}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {prov.placeholder}
                        {cards.length === 0 && !snap.isDraggingOver && (
                          <p className="text-[11px] text-slate-400 dark:text-white/30 text-center py-3 italic">
                            Vazio
                          </p>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              )
            })}
          </div>
        </DragDropContext>
      </div>

      {newOpen && (
        <NewOnboardingDialog
          onClose={() => setNewOpen(false)}
          onCreated={() => {
            setNewOpen(false)
            mutate()
          }}
        />
      )}

      {goBackContext && (
        <KanbanGoBackDialog
          onboardingId={goBackContext.onboardingId}
          targetSlug={goBackContext.targetSlug}
          onClose={() => setGoBackContext(null)}
          onDone={() => {
            setGoBackContext(null)
            mutate()
          }}
        />
      )}

      <OnboardingDrawer
        onboardingId={drawerId}
        open={drawerId !== null}
        onClose={() => setDrawerId(null)}
        onMutate={mutate}
      />
    </div>
  )
}

function KanbanGoBackDialog({
  onboardingId,
  targetSlug,
  onClose,
  onDone,
}: {
  onboardingId: string
  targetSlug: string
  onClose: () => void
  onDone: () => void
}) {
  const [feedback, setFeedback] = useState("")
  const [severity, setSeverity] = useState<
    "small" | "medium" | "rework_part" | "rework_all"
  >("medium")
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  async function submit() {
    if (feedback.trim().length < 10) {
      toast.toast({
        variant: "destructive",
        title: "Feedback obrigatorio",
        description: "Mínimo 10 caracteres.",
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
      <div className="w-full max-w-[460px] bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] overflow-hidden">
        <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
            Voltar pra coluna anterior
          </h2>
          <p className="mt-0.5 text-[12px] text-slate-500 dark:text-white/55">
            Uma nova versão será criada com o feedback.
          </p>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80 mb-1">
              Severidade
            </label>
            <select
              value={severity}
              onChange={(e) =>
                setSeverity(
                  e.target.value as
                    | "small"
                    | "medium"
                    | "rework_part"
                    | "rework_all",
                )
              }
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
              Feedback (min 10 chars)
            </label>
            <textarea
              autoFocus
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
            Voltar coluna
          </button>
        </div>
      </div>
    </div>
  )
}


function NewOnboardingDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [clientId, setClientId] = useState<string | null>(null)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [plan, setPlan] = useState<string>("Pro")
  const [mrr, setMrr] = useState<string>("")
  const [whatsapp, setWhatsapp] = useState<string>("")
  const [language, setLanguage] = useState<string>("pt-BR")
  const [vertical, setVertical] = useState<string>("e-commerce")
  const [source, setSource] = useState<"manual" | "deal_won" | "referral" | "migration">("manual")
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  function fmtMrrInput(v: string): string {
    const digits = v.replace(/\D/g, "")
    if (!digits) return ""
    const n = Number(digits) / 100
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  }

  function fmtWhatsInput(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 13)
    if (d.length <= 2) return d
    if (d.length <= 4) return `+${d.slice(0, 2)} ${d.slice(2)}`
    if (d.length <= 9) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4)}`
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  }

  function parseMrrToNumber(s: string): number | null {
    const digits = s.replace(/\D/g, "")
    if (!digits) return null
    return Number(digits) / 100
  }

  async function submit() {
    if (!clientId || !storeId) {
      toast.toast({
        variant: "destructive",
        title: "Cliente e Loja sao obrigatorios",
      })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/onboardings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          store_id: storeId,
          plan,
          mrr_value: parseMrrToNumber(mrr),
          client_whatsapp: whatsapp || null,
          language,
          vertical,
          source,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.toast({
          variant: "destructive",
          title: "Falha ao criar",
          description: j.error ?? "Tente novamente.",
        })
        return
      }
      const onbId = j.onboarding?.id
      const formToken = j.onboarding?.form_token
      if (j.created === false) {
        toast.toast({
          title: "Onboarding ja existia",
          description: "Essa loja ja tem onboarding em progresso.",
        })
      } else if (formToken) {
        const url = `${window.location.origin}/form/${formToken}`
        try {
          await navigator.clipboard.writeText(url)
          toast.toast({
            title: "Onboarding criado",
            description: "Link do formulário copiado pra clipboard.",
          })
        } catch {
          toast.toast({
            title: "Onboarding criado",
            description: url,
          })
        }
      } else {
        toast.toast({ title: "Onboarding criado" })
      }
      onCreated()
      if (onbId) {
        // navega pro detail
        setTimeout(() => {
          window.location.href = `/admin/onboarding/${onbId}`
        }, 200)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[560px] bg-white dark:bg-[#0F1117] rounded-[8px] shadow-xl border border-black/[0.08] dark:border-white/[0.08] overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
            Novo onboarding
          </h2>
          <p className="mt-0.5 text-[12px] text-slate-500 dark:text-white/55">
            Cadastre cliente, loja e dados comerciais. Após criar, o link do
            formulário do cliente é gerado automaticamente.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <SelectClientAndStore
            selectedClientId={clientId}
            selectedStoreId={storeId}
            onClientChange={setClientId}
            onStoreChange={setStoreId}
          />

          {/* Comercial */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-white/80 uppercase tracking-wide">
                Plano
              </label>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                className="w-full h-9 px-2 text-[12.5px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
              >
                <option value="Essencial">Essencial</option>
                <option value="Pro">Pro</option>
                <option value="Premium">Premium</option>
                <option value="Custom">Custom</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-white/80 uppercase tracking-wide">
                MRR (R$)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={mrr}
                onChange={(e) => setMrr(fmtMrrInput(e.target.value))}
                placeholder="R$ 0,00"
                className="w-full h-9 px-2 text-[12.5px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-white/80 uppercase tracking-wide">
              WhatsApp do cliente
            </label>
            <input
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(fmtWhatsInput(e.target.value))}
              placeholder="+55 (31) 99999-9999"
              className="w-full h-9 px-2 text-[12.5px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-white/80 uppercase tracking-wide">
                Idioma
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full h-9 px-2 text-[12.5px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
              >
                <option value="pt-BR">Português (BR)</option>
                <option value="en-US">English (US)</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-white/80 uppercase tracking-wide">
                Vertical
              </label>
              <select
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
                className="w-full h-9 px-2 text-[12.5px] rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27]"
              >
                <option value="e-commerce">E-commerce</option>
                <option value="moda">Moda</option>
                <option value="suplementos">Suplementos</option>
                <option value="beleza">Beleza/Cosméticos</option>
                <option value="alimentos">Alimentos/Bebidas</option>
                <option value="automotivo">Automotivo</option>
                <option value="saude">Saúde</option>
                <option value="pets">Pets</option>
                <option value="outros">Outros</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-white/80 uppercase tracking-wide">
              Origem
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: "manual", label: "Manual" },
                  { value: "deal_won", label: "Deal fechado" },
                  { value: "referral", label: "Indicação" },
                  { value: "migration", label: "Migração" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSource(opt.value)}
                  className={
                    "h-8 text-[12px] font-medium rounded-[5px] border transition-colors " +
                    (source === opt.value
                      ? "bg-[#1F1F1F] text-white border-[#1F1F1F] dark:bg-white dark:text-black dark:border-white"
                      : "bg-white dark:bg-white/[0.04] text-slate-700 dark:text-white/70 border-slate-200 dark:border-white/[0.08] hover:border-slate-300")
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 text-[12px] font-medium text-slate-700 hover:bg-slate-100 dark:text-white/80 dark:hover:bg-white/[0.04] rounded-[6px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !clientId || !storeId}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold bg-[#1F1F1F] dark:bg-white text-white dark:text-black rounded-[6px] disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Criar e copiar link
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── KpiCard ─────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  caption,
  icon,
  tone,
}: {
  label: string
  value: string
  caption: string
  icon: React.ReactNode
  tone: "neutral" | "success" | "warn" | "danger"
}) {
  const valueColor =
    tone === "danger"
      ? "text-rose-600 dark:text-rose-400"
      : tone === "warn"
        ? "text-amber-700 dark:text-amber-300"
        : tone === "success"
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-slate-900 dark:text-white"
  const iconColor =
    tone === "danger"
      ? "text-rose-500"
      : tone === "warn"
        ? "text-amber-500"
        : tone === "success"
          ? "text-emerald-500"
          : "text-slate-400 dark:text-white/40"
  return (
    <div className="rounded-[10px] border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#1A1D27] px-3.5 py-2.5 sm:px-4 sm:py-3 hover:border-slate-300 dark:hover:border-white/[0.10] transition-colors">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={iconColor}>{icon}</span>
        <span className="text-[11px] font-medium text-slate-500 dark:text-white/55">
          {label}
        </span>
      </div>
      <p
        className={`text-[22px] sm:text-[26px] font-semibold leading-none tabular-nums tracking-tight ${valueColor}`}
      >
        {value}
      </p>
      <p className="text-[10.5px] text-slate-400 dark:text-white/40 mt-1">
        {caption}
      </p>
    </div>
  )
}

function KanbanSkeleton() {
  return (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-[#0B0E15]">
      <div className="h-14 border-b border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#0F1117]" />
      <div className="flex gap-3 p-5 overflow-x-auto">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="w-[300px] min-w-[300px] rounded-[8px] bg-white dark:bg-[#161922] border border-black/[0.06] dark:border-white/[0.08] p-3 animate-pulse"
          >
            <div className="h-4 w-24 bg-slate-200 dark:bg-white/[0.06] rounded mb-3" />
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((__, j) => (
                <div key={j} className="h-16 bg-slate-100 dark:bg-white/[0.04] rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
