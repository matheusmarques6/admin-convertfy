"use client"

/**
 * Kanban dos onboardings (pipeline 7 colunas). Drag-and-drop entre
 * colunas chama /api/onboardings/[id]/advance se for proxima coluna,
 * ou /go-back se voltar (com modal de feedback obrigatorio).
 *
 * Card mostra: cliente, loja, briefing_status, current_version, dias
 * parado, flags de pagamento/contrato.
 */

import { useEffect, useMemo, useRef, useState } from "react"
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
  Check,
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

export interface OnboardingKanbanProps {
  /** Payloads das rotas, pré-carregados pelo RSC (byte-idênticos aos fetches). */
  initialOnboardings?: {
    columns: OperationalPipelineColumn[]
    onboardings: OnboardingPipelineItem[]
  } | null
  initialMembers?: { members: OrgMember[] } | null
  initialMe?: {
    profile: { id: string }
    orgMember: { role: string } | null
  } | null
}

export function OnboardingKanban({
  initialOnboardings,
  initialMembers,
  initialMe,
}: OnboardingKanbanProps = {}) {
  // Congela os initialData do RSC (as 3 keys são estáticas — filtros de
  // tab/search/member são client-side, em memória).
  const initialRef = useRef({
    onboardings: initialOnboardings ?? undefined,
    members: initialMembers ?? undefined,
    me: initialMe ?? undefined,
  })

  // fallbackData pinta os dados do RSC imediatamente; o SWR ainda revalida
  // em background no mount (revalidateOnMount default) — frescor idêntico ao
  // comportamento anterior, sem bloquear o primeiro paint. Importante para o
  // caso raro de re-sync de colunas pós-deploy (roda em background no GET).
  const { data, mutate, isLoading } = useSWR<{
    columns: OperationalPipelineColumn[]
    onboardings: OnboardingPipelineItem[]
  }>("/api/onboardings", fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    fallbackData: initialRef.current.onboardings,
  })

  // Members pra filtro de responsavel
  const { data: membersData } = useSWR<{ members: OrgMember[] }>(
    "/api/admin/org-members",
    fetcher,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      fallbackData: initialRef.current.members,
    },
  )

  // ID do user logado (vem do /api/me/permissions que ja é cached pelo PermissionsProvider)
  const { data: meData } = useSWR<{
    profile: { id: string }
    orgMember: { role: string } | null
  }>("/api/me/permissions", fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    fallbackData: initialRef.current.me,
  })

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
  const meProfileId = meData?.profile?.id ?? null
  const meRole = meData?.orgMember?.role ?? null

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
        {columns.length === 0 ? (
          <div className="flex items-center justify-center h-full px-6 py-10">
            <div className="text-center max-w-md">
              <p className="text-[14px] font-semibold text-slate-900 dark:text-white mb-1">
                Pipeline não inicializada
              </p>
              <p className="text-[12.5px] text-slate-500 dark:text-white/55 mb-4">
                As colunas do onboarding ainda não foram criadas pra esta
                org. Tente recarregar — o sistema cria automaticamente no
                primeiro acesso.
              </p>
              <button
                type="button"
                onClick={() => mutate()}
                className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black"
              >
                Recarregar
              </button>
            </div>
          </div>
        ) : (
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
        )}
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


// ─── NewOnboardingDialog: wizard 3 steps com selecao de assinatura + origem rica ──

interface ClientSubscription {
  id: string
  client_id: string
  name: string
  value: number | string
  cycle: string
  payment_method: string
  status: string
  start_date: string
  next_due_date: string
  notes: string | null
  asaas_subscription_id: string | null
}

interface ClientLite {
  id: string
  name: string
  company: string | null
}

interface PipelineLite {
  id: string
  name: string
  scope?: string
}

type SourceChannel =
  | "indicacao"
  | "deal_won"
  | "instagram"
  | "social_selling"
  | "paid_ads"
  | "organic"
  | "event"
  | "partner"
  | "migration"
  | "manual"
  | "other"

const SOURCE_CHANNELS: Array<{
  value: SourceChannel
  label: string
  hint: string
}> = [
  { value: "indicacao", label: "Indicação", hint: "Quem indicou?" },
  { value: "deal_won", label: "Pipeline CRM", hint: "Qual pipeline?" },
  { value: "instagram", label: "Instagram", hint: "Direct / bio / story" },
  {
    value: "social_selling",
    label: "Social selling",
    hint: "LinkedIn, posts, comunidade",
  },
  { value: "paid_ads", label: "Tráfego pago", hint: "Meta / Google / TikTok" },
  { value: "organic", label: "Orgânico", hint: "SEO, busca direta" },
  { value: "event", label: "Evento", hint: "Palestra, feira, meetup" },
  { value: "partner", label: "Parceiro", hint: "Co-marketing / parceria" },
  { value: "migration", label: "Migração", hint: "Cliente antigo migrando" },
  { value: "manual", label: "Manual", hint: "Cadastro interno" },
  { value: "other", label: "Outro", hint: "Detalhe nas notas" },
]

function NewOnboardingDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [clientId, setClientId] = useState<string | null>(null)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null)
  const [skipSubscription, setSkipSubscription] = useState(false)
  const [sourceChannel, setSourceChannel] = useState<SourceChannel | null>(null)
  const [referredById, setReferredById] = useState<string | null>(null)
  const [referredByName, setReferredByName] = useState("")
  const [sourcePipelineId, setSourcePipelineId] = useState<string | null>(null)
  const [sourceNotes, setSourceNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  // Carrega subscriptions do cliente quando ele eh selecionado
  const { data: subsData } = useSWR<{ subscriptions: ClientSubscription[] }>(
    clientId ? `/api/client-subscriptions?client_id=${clientId}` : null,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const subscriptions = useMemo(
    () => subsData?.subscriptions ?? [],
    [subsData],
  )
  const activeSubscriptions = useMemo(
    () => subscriptions.filter((s) => s.status === "active"),
    [subscriptions],
  )

  // Carrega clients pra "quem indicou"
  const { data: clientsData } = useSWR<{ clients: ClientLite[] } | ClientLite[]>(
    sourceChannel === "indicacao" ? "/api/clients?limit=200" : null,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const referrerOptions = useMemo<ClientLite[]>(() => {
    if (!clientsData) return []
    const list = Array.isArray(clientsData)
      ? clientsData
      : clientsData.clients ?? []
    return list.filter((c) => c.id !== clientId)
  }, [clientsData, clientId])

  // Carrega pipelines CRM pra "veio de qual pipeline"
  const { data: pipelinesData } = useSWR<{ pipelines: PipelineLite[] }>(
    sourceChannel === "deal_won" ? "/api/crm/pipelines" : null,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const pipelines = useMemo(
    () => pipelinesData?.pipelines ?? [],
    [pipelinesData],
  )

  // Reset subscription quando muda cliente
  useEffect(() => {
    setSubscriptionId(null)
    setSkipSubscription(false)
  }, [clientId])

  // Auto-seleciona se cliente so tem 1 subscription ativa
  useEffect(() => {
    if (activeSubscriptions.length === 1 && !subscriptionId) {
      setSubscriptionId(activeSubscriptions[0].id)
    }
  }, [activeSubscriptions, subscriptionId])

  function canAdvance(): boolean {
    if (step === 1) return !!clientId && !!storeId
    if (step === 2) return !!subscriptionId || skipSubscription
    if (step === 3) {
      if (!sourceChannel) return false
      if (
        sourceChannel === "indicacao" &&
        !referredById &&
        !referredByName.trim()
      )
        return false
      if (sourceChannel === "deal_won" && !sourcePipelineId) return false
      return true
    }
    return false
  }

  async function submit() {
    if (!clientId || !storeId || !sourceChannel) return
    setSubmitting(true)
    try {
      // Map source_channel pra enum legado do campo `source`
      const legacySource =
        sourceChannel === "deal_won"
          ? "deal_won"
          : sourceChannel === "indicacao"
            ? "referral"
            : sourceChannel === "migration"
              ? "migration"
              : "manual"

      const res = await fetch("/api/onboardings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          store_id: storeId,
          subscription_id: subscriptionId,
          source: legacySource,
          source_channel: sourceChannel,
          referred_by_client_id:
            sourceChannel === "indicacao" ? referredById : null,
          referred_by_name:
            sourceChannel === "indicacao" && !referredById
              ? referredByName.trim() || null
              : null,
          source_pipeline_id:
            sourceChannel === "deal_won" ? sourcePipelineId : null,
          source_notes: sourceNotes.trim() || null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.toast({
          variant: "destructive",
          title: "Falha ao criar",
          description: j.error?.message ?? j.error ?? "Tente novamente.",
        })
        return
      }
      const onbId = j.onboarding?.id
      const formToken = j.onboarding?.form_token
      if (j.created === false) {
        toast.toast({
          title: "Onboarding já existia",
          description: "Essa loja já tem onboarding em progresso.",
        })
      } else if (formToken) {
        const url = `${window.location.origin}/form/${formToken}`
        try {
          await navigator.clipboard.writeText(url)
          toast.toast({
            title: "Onboarding criado",
            description: "Link do formulário copiado.",
          })
        } catch {
          toast.toast({ title: "Onboarding criado", description: url })
        }
      } else {
        toast.toast({ title: "Onboarding criado" })
      }
      onCreated()
      if (onbId) {
        setTimeout(() => {
          window.location.href = `/admin/onboarding/${onbId}`
        }, 200)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const stepConfigs = [
    { n: 1, label: "Cliente e loja" },
    { n: 2, label: "Assinatura" },
    { n: 3, label: "Origem" },
  ]

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[600px] bg-white dark:bg-[#0F1117] rounded-[12px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-slate-900 dark:text-white">
                Novo onboarding
              </h2>
              <p className="text-[12px] text-slate-500 dark:text-white/55 mt-0.5">
                {step === 1 && "Selecione o cliente e a loja."}
                {step === 2 && "Atrele uma assinatura existente do cliente."}
                {step === 3 && "Como esse lead chegou até nós?"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="h-7 w-7 inline-flex items-center justify-center rounded-[6px] text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-white/40 dark:hover:text-white/80 dark:hover:bg-white/[0.06] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-2">
            {stepConfigs.map((s, idx) => {
              const isActive = step === s.n
              const isDone = step > s.n
              return (
                <div key={s.n} className="flex items-center gap-2 flex-1">
                  <div
                    className={
                      "inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-semibold tabular-nums shrink-0 " +
                      (isDone
                        ? "bg-emerald-500 text-white"
                        : isActive
                          ? "bg-[#1F1F1F] text-white dark:bg-white dark:text-black"
                          : "bg-slate-100 text-slate-400 dark:bg-white/[0.06] dark:text-white/40")
                    }
                  >
                    {isDone ? (
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    ) : (
                      s.n
                    )}
                  </div>
                  <span
                    className={
                      "text-[11.5px] font-medium " +
                      (isActive
                        ? "text-slate-900 dark:text-white"
                        : isDone
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-slate-400 dark:text-white/40")
                    }
                  >
                    {s.label}
                  </span>
                  {idx < stepConfigs.length - 1 && (
                    <div className="flex-1 h-px bg-slate-200 dark:bg-white/[0.08] ml-1" />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <SelectClientAndStore
              selectedClientId={clientId}
              selectedStoreId={storeId}
              onClientChange={setClientId}
              onStoreChange={setStoreId}
            />
          )}

          {step === 2 && (
            <SubscriptionStep
              clientId={clientId}
              subscriptions={subscriptions}
              activeSubscriptions={activeSubscriptions}
              selectedId={subscriptionId}
              onSelect={(id) => {
                setSubscriptionId(id)
                setSkipSubscription(false)
              }}
              skip={skipSubscription}
              onSkip={() => {
                setSkipSubscription(true)
                setSubscriptionId(null)
              }}
            />
          )}

          {step === 3 && (
            <SourceStep
              channel={sourceChannel}
              onChannelChange={setSourceChannel}
              referredById={referredById}
              onReferredByChange={(id) => {
                setReferredById(id)
                if (id) setReferredByName("")
              }}
              referredByName={referredByName}
              onReferredByNameChange={(name) => {
                setReferredByName(name)
                if (name.trim()) setReferredById(null)
              }}
              referrerOptions={referrerOptions}
              sourcePipelineId={sourcePipelineId}
              onSourcePipelineChange={setSourcePipelineId}
              pipelines={pipelines}
              notes={sourceNotes}
              onNotesChange={setSourceNotes}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-6 py-3.5 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
          <button
            type="button"
            onClick={() => {
              if (step === 1) onClose()
              else setStep((s) => (s - 1) as 1 | 2 | 3)
            }}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-[12.5px] font-medium text-slate-700 hover:bg-slate-100 dark:text-white/80 dark:hover:bg-white/[0.04] rounded-[7px]"
          >
            {step === 1 ? "Cancelar" : "Voltar"}
          </button>
          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
              disabled={!canAdvance()}
              className="inline-flex items-center gap-1.5 h-9 px-4 text-[12.5px] font-semibold bg-[#1F1F1F] dark:bg-white text-white dark:text-black rounded-[7px] disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              Próximo
              <ArrowRightIcon />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !canAdvance()}
              className="inline-flex items-center gap-1.5 h-9 px-4 text-[12.5px] font-semibold bg-[#1F1F1F] dark:bg-white text-white dark:text-black rounded-[7px] disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Criar onboarding
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ArrowRightIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

// ─── Step 2: Selecionar assinatura ───────────────────────────────────────

function SubscriptionStep({
  clientId,
  subscriptions,
  activeSubscriptions,
  selectedId,
  onSelect,
  skip,
  onSkip,
}: {
  clientId: string | null
  subscriptions: ClientSubscription[]
  activeSubscriptions: ClientSubscription[]
  selectedId: string | null
  onSelect: (id: string) => void
  skip: boolean
  onSkip: () => void
}) {
  if (!clientId) {
    return (
      <p className="text-[13px] text-slate-500 italic">
        Volte e selecione o cliente.
      </p>
    )
  }

  const PAYMENT_LABEL: Record<string, string> = {
    pix_direto: "PIX direto",
    pix_asaas: "PIX (Asaas)",
    asaas: "Asaas",
    boleto: "Boleto",
    credit_card: "Cartão",
    wise: "Wise",
    bank_transfer: "Transferência",
  }
  const CYCLE_LABEL: Record<string, string> = {
    MONTHLY: "/mês",
    QUARTERLY: "/trimestre",
    YEARLY: "/ano",
    WEEKLY: "/semana",
    BIWEEKLY: "/quinzenal",
  }

  return (
    <div className="space-y-3">
      {activeSubscriptions.length === 0 && subscriptions.length === 0 && (
        <div className="rounded-[10px] border border-amber-200 bg-amber-50/60 dark:bg-amber-500/[0.06] dark:border-amber-500/30 p-4">
          <p className="text-[13px] font-semibold text-amber-900 dark:text-amber-300">
            Cliente sem assinatura cadastrada
          </p>
          <p className="text-[12px] text-amber-700 dark:text-amber-400/80 mt-1 leading-relaxed">
            Você pode criar a assinatura depois em{" "}
            <span className="font-medium">Cliente › Financeiro</span> ou
            continuar sem ela agora — o onboarding fica sem MRR/plano atrelados
            até você adicionar.
          </p>
          <button
            type="button"
            onClick={onSkip}
            className={
              "mt-3 inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-[6px] border transition-colors " +
              (skip
                ? "bg-amber-600 text-white border-amber-600"
                : "bg-white dark:bg-white/[0.04] text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/30 hover:bg-amber-50")
            }
          >
            {skip && <Check className="h-3 w-3" strokeWidth={3} />}
            Continuar sem assinatura
          </button>
        </div>
      )}

      {activeSubscriptions.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/55">
            Assinaturas ativas
          </p>
          {activeSubscriptions.map((s) => {
            const selected = selectedId === s.id
            const valueLabel = Number(s.value).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
              maximumFractionDigits: 0,
            })
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                className={
                  "w-full text-left p-3.5 rounded-[10px] border transition-all duration-150 flex items-start gap-3 " +
                  (selected
                    ? "border-brand-500 bg-brand-50/40 dark:bg-brand-500/[0.08] ring-4 ring-brand-500/10"
                    : "border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] hover:border-slate-300 dark:hover:border-white/[0.12]")
                }
              >
                <span
                  className={
                    "shrink-0 inline-flex items-center justify-center h-4 w-4 rounded-full border-2 mt-0.5 " +
                    (selected
                      ? "border-brand-500 bg-brand-500"
                      : "border-slate-300 dark:border-white/[0.20]")
                  }
                  aria-hidden
                >
                  {selected && (
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[14px] font-semibold text-slate-900 dark:text-white truncate">
                      {s.name}
                    </span>
                    <span className="text-[14px] font-semibold tabular-nums text-slate-900 dark:text-white shrink-0">
                      {valueLabel}
                      <span className="text-[11px] font-normal text-slate-500 dark:text-white/55">
                        {CYCLE_LABEL[s.cycle] ?? `/${s.cycle.toLowerCase()}`}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11.5px] text-slate-500 dark:text-white/55">
                    <span>
                      {PAYMENT_LABEL[s.payment_method] ?? s.payment_method}
                    </span>
                    {s.asaas_subscription_id && (
                      <>
                        <span className="text-slate-300 dark:text-white/20">
                          ·
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400 font-medium">
                          <span className="h-1 w-1 rounded-full bg-emerald-500" />
                          Asaas
                        </span>
                      </>
                    )}
                    <span className="text-slate-300 dark:text-white/20">·</span>
                    <span>
                      Próximo vencimento:{" "}
                      {new Date(s.next_due_date).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {subscriptions.filter((s) => s.status !== "active").length > 0 && (
        <details className="text-[12px]">
          <summary className="cursor-pointer text-slate-500 dark:text-white/55 hover:text-slate-700">
            Mostrar assinaturas inativas (
            {subscriptions.filter((s) => s.status !== "active").length})
          </summary>
          <div className="mt-2 space-y-1.5 pl-3 border-l-2 border-slate-100 dark:border-white/[0.06]">
            {subscriptions
              .filter((s) => s.status !== "active")
              .map((s) => (
                <div
                  key={s.id}
                  className="text-[12px] text-slate-400 dark:text-white/40 flex items-center justify-between"
                >
                  <span className="truncate">
                    {s.name} ·{" "}
                    <span className="italic">{s.status}</span>
                  </span>
                  <span className="tabular-nums">
                    {Number(s.value).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </div>
              ))}
          </div>
        </details>
      )}

      {activeSubscriptions.length > 0 && (
        <button
          type="button"
          onClick={onSkip}
          className={
            "w-full text-left p-3.5 rounded-[10px] border transition-colors flex items-center gap-3 " +
            (skip
              ? "border-slate-700 dark:border-white/30 bg-slate-50 dark:bg-white/[0.04]"
              : "border-dashed border-slate-300 dark:border-white/[0.10] bg-transparent hover:bg-slate-50 dark:hover:bg-white/[0.02]")
          }
        >
          <span
            className={
              "shrink-0 inline-flex items-center justify-center h-4 w-4 rounded-full border-2 " +
              (skip
                ? "border-slate-700 bg-slate-700 dark:border-white dark:bg-white"
                : "border-slate-300 dark:border-white/[0.20]")
            }
          >
            {skip && (
              <span className="h-1.5 w-1.5 rounded-full bg-white dark:bg-black" />
            )}
          </span>
          <div className="flex-1">
            <p className="text-[13px] font-medium text-slate-700 dark:text-white/80">
              Continuar sem atrelar assinatura
            </p>
            <p className="text-[11px] text-slate-500 dark:text-white/45 mt-0.5">
              Você pode atrelar depois em Cliente › Financeiro.
            </p>
          </div>
        </button>
      )}
    </div>
  )
}

// ─── ReferrerPicker: cliente existente OU texto livre (influencer/parceiro) ──

function ReferrerPicker({
  referredById,
  onReferredByChange,
  referredByName,
  onReferredByNameChange,
  referrerOptions,
}: {
  referredById: string | null
  onReferredByChange: (id: string | null) => void
  referredByName: string
  onReferredByNameChange: (s: string) => void
  referrerOptions: ClientLite[]
}) {
  const [search, setSearch] = useState("")
  const [showList, setShowList] = useState(false)

  // Texto exibido no input: se ja escolheu cliente, mostra o nome; senao,
  // mostra o texto livre que o user esta digitando.
  const selectedClient = referrerOptions.find((c) => c.id === referredById)
  const inputValue =
    selectedClient?.name ?? (referredByName || search)

  const filtered = useMemo(() => {
    const term = (selectedClient ? "" : (referredByName || search))
      .toLowerCase()
      .trim()
    if (!term) return referrerOptions.slice(0, 8)
    return referrerOptions
      .filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          (c.company ?? "").toLowerCase().includes(term),
      )
      .slice(0, 8)
  }, [referrerOptions, search, referredByName, selectedClient])

  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/55">
        Quem indicou? <span className="text-rose-500">*</span>
      </label>
      <div className="rounded-[8px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] overflow-hidden">
        {/* Input combinado */}
        <div className="flex items-center gap-2 px-3 h-10">
          <input
            type="text"
            value={inputValue}
            onFocus={() => setShowList(true)}
            onChange={(e) => {
              const v = e.target.value
              if (referredById) onReferredByChange(null)
              setSearch(v)
              onReferredByNameChange(v)
              setShowList(true)
            }}
            placeholder="Buscar cliente OU digitar nome (ex: Carlos Azevedo)"
            className="flex-1 h-9 text-[13px] bg-transparent border-0 focus:outline-none placeholder:text-slate-400 dark:placeholder:text-white/35"
          />
          {(referredById || referredByName) && (
            <button
              type="button"
              onClick={() => {
                onReferredByChange(null)
                onReferredByNameChange("")
                setSearch("")
              }}
              aria-label="Limpar"
              className="h-6 w-6 inline-flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-white/40 dark:hover:text-white/80 dark:hover:bg-white/[0.06]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Lista de sugestoes (clientes existentes) */}
        {showList && !referredById && filtered.length > 0 && (
          <div className="border-t border-slate-100 dark:border-white/[0.06] max-h-[180px] overflow-y-auto">
            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">
              Selecionar cliente existente
            </p>
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onReferredByChange(c.id)
                  onReferredByNameChange("")
                  setSearch("")
                  setShowList(false)
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium text-slate-900 dark:text-white truncate">
                    {c.name}
                  </p>
                  {c.company && (
                    <p className="text-[10.5px] text-slate-500 dark:text-white/55 truncate">
                      {c.company}
                    </p>
                  )}
                </div>
                <Check className="h-3 w-3 text-emerald-500 opacity-0 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        )}

        {/* Hint quando esta digitando nome livre */}
        {showList && !referredById && referredByName.trim() && (
          <div className="border-t border-slate-100 dark:border-white/[0.06] px-3 py-2 bg-amber-50/40 dark:bg-amber-500/[0.06]">
            <p className="text-[11.5px] text-amber-800 dark:text-amber-300">
              <span className="font-semibold">{referredByName.trim()}</span>{" "}
              será registrado como referrer externo (influencer / parceiro
              que não é cliente).
            </p>
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-500 dark:text-white/45">
        Pode selecionar um cliente da lista OU digitar o nome de alguém
        que não é cliente (influencer, parceiro). Ambos contam nas
        métricas de indicações.
      </p>
    </div>
  )
}

// ─── Step 3: Origem ───────────────────────────────────────────────────────

function SourceStep({
  channel,
  onChannelChange,
  referredById,
  onReferredByChange,
  referredByName,
  onReferredByNameChange,
  referrerOptions,
  sourcePipelineId,
  onSourcePipelineChange,
  pipelines,
  notes,
  onNotesChange,
}: {
  channel: SourceChannel | null
  onChannelChange: (c: SourceChannel) => void
  referredById: string | null
  onReferredByChange: (id: string | null) => void
  referredByName: string
  onReferredByNameChange: (s: string) => void
  referrerOptions: ClientLite[]
  sourcePipelineId: string | null
  onSourcePipelineChange: (id: string | null) => void
  pipelines: PipelineLite[]
  notes: string
  onNotesChange: (s: string) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/55 mb-2">
          Como esse lead chegou?
        </p>
        <div className="grid grid-cols-2 gap-2">
          {SOURCE_CHANNELS.map((c) => {
            const selected = channel === c.value
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => onChannelChange(c.value)}
                className={
                  "text-left p-2.5 rounded-[8px] border transition-all duration-150 " +
                  (selected
                    ? "border-brand-500 bg-brand-50/40 dark:bg-brand-500/[0.08] ring-2 ring-brand-500/10"
                    : "border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] hover:border-slate-300")
                }
              >
                <div className="flex items-center gap-2">
                  <span
                    className={
                      "shrink-0 inline-flex items-center justify-center h-3.5 w-3.5 rounded-full border-2 " +
                      (selected
                        ? "border-brand-500 bg-brand-500"
                        : "border-slate-300 dark:border-white/[0.20]")
                    }
                  >
                    {selected && (
                      <span className="h-1 w-1 rounded-full bg-white" />
                    )}
                  </span>
                  <span className="text-[13px] font-semibold text-slate-900 dark:text-white">
                    {c.label}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-white/50 mt-0.5 ml-[22px]">
                  {c.hint}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Conditional: Quem indicou (combobox cliente OU texto livre) */}
      {channel === "indicacao" && (
        <ReferrerPicker
          referredById={referredById}
          onReferredByChange={onReferredByChange}
          referredByName={referredByName}
          onReferredByNameChange={onReferredByNameChange}
          referrerOptions={referrerOptions}
        />
      )}

      {/* Conditional: Pipeline de origem */}
      {channel === "deal_won" && (
        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/55">
            Pipeline de origem <span className="text-rose-500">*</span>
          </label>
          <select
            value={sourcePipelineId ?? ""}
            onChange={(e) => onSourcePipelineChange(e.target.value || null)}
            className="w-full h-10 px-3 text-[13px] rounded-[8px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 transition-all"
          >
            <option value="">— selecione a pipeline CRM —</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.scope ? ` · ${p.scope}` : ""}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 dark:text-white/45">
            Útil pra calcular taxa de conversão de cada pipeline.
          </p>
        </div>
      )}

      {/* Notas opcionais */}
      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/55">
          Detalhes adicionais{" "}
          <span className="text-slate-400 dark:text-white/35 normal-case">
            (opcional)
          </span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={2}
          placeholder="Nome da campanha, hashtag, evento específico, contexto..."
          className="w-full px-3 py-2 text-[13px] rounded-[8px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 transition-all resize-none"
        />
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
