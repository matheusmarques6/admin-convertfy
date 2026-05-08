"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import {
  X,
  MessageSquare,
  FileText,
  Phone,
  Mail,
  Calendar,
  Building2,
  User,
  Tag,
  ExternalLink,
  Trophy,
  XCircle,
  ChevronRight,
  Sparkles,
  StickyNote,
  CheckSquare,
  AlertCircle,
  DollarSign,
  TrendingUp,
} from "lucide-react"

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const json = await r.json()
  if (!r.ok || json?.success === false) {
    throw new Error(json?.error || `HTTP ${r.status}`)
  }
  return json
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(v)

const ACTIVITY_ICONS: Record<string, typeof MessageSquare> = {
  note: FileText,
  call: Phone,
  email: Mail,
  wa_message: MessageSquare,
  ig_message: MessageSquare,
  meeting: Calendar,
  task: CheckSquare,
  system: Sparkles,
  stage_change: ChevronRight,
}

interface DealDrawerProps {
  dealId: string | null
  onClose: () => void
  onUpdated?: () => void
  /** Fallback: dados ja conhecidos do deal (vindo da listagem do
   *  pipeline). Usado pra renderizar header/sidebar enquanto a API
   *  individual nao responde, OU se ela retornar 404 por race condition. */
  fallbackDeal?: {
    id: string
    title: string
    value: number | null
    status: string
    pipeline_id: string
    stage_id: string
    tags?: string[] | null
    source?: string | null
    created_at?: string | null
    owner?: { id: string; name: string; avatar_url: string | null } | null
    client?: { id: string; name: string } | null
    store?: { id: string; name: string } | null
  } | null
  /** Quando a API individual retorna 404, chama isso pra disparar
   *  revalidacao do pipeline (que sumir com o card fantasma se
   *  ele realmente nao existe mais no DB). */
  onMissing?: () => void
}

interface DealDetailResponse {
  success?: boolean
  deal: {
    id: string
    title: string
    value: number | null
    currency: string | null
    probability: number | null
    status: string
    source: string | null
    tags: string[] | null
    notes: string | null
    lost_reason: string | null
    won_reason: string | null
    created_at: string
    updated_at: string
    pipeline_id: string
    stage_id: string
    pipeline?: { id: string; name: string }
    stage?: { id: string; name: string; stage_type: string | null; color?: string | null }
    owner?: { id: string; name: string; avatar_url: string | null } | null
    client?: { id: string; name: string } | null
    store?: { id: string; name: string } | null
    lead?: { id: string; name: string; email: string | null } | null
  }
  activities: Array<{
    id: string
    type: string
    content: string
    due_at: string | null
    completed_at: string | null
    is_internal: boolean
    created_at: string
    creator?: { id: string; name: string; avatar_url: string | null } | null
  }>
  history: Array<{
    id: string
    from_stage_id: string | null
    to_stage_id: string | null
    from_stage?: { name: string } | null
    to_stage?: { name: string } | null
    created_at: string
    changed_by?: { id: string; name: string } | null
  }>
}

type ComposerTab = "note" | "task" | "call" | "email"

const COMPOSER_TABS: Array<{ id: ComposerTab; label: string; icon: typeof StickyNote }> = [
  { id: "note", label: "Nota", icon: StickyNote },
  { id: "task", label: "Tarefa", icon: CheckSquare },
  { id: "call", label: "Ligacao", icon: Phone },
  { id: "email", label: "Email", icon: Mail },
]

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
}

export function DealDrawer({
  dealId,
  onClose,
  onUpdated,
  fallbackDeal,
  onMissing,
}: DealDrawerProps) {
  const open = !!dealId
  const { data, isLoading, error, mutate } = useSWR<DealDetailResponse>(
    dealId ? `/api/crm/deals/${dealId}` : null,
    fetcher,
    {
      // Backoff curto + retry 1x: cobre race com POST que ainda nao
      // committou no DB primary read. Apos isso considera 404 real.
      shouldRetryOnError: true,
      errorRetryCount: 1,
      errorRetryInterval: 600,
    },
  )

  const [composerTab, setComposerTab] = useState<ComposerTab>("note")
  const [composerContent, setComposerContent] = useState("")
  const [composerDueIn, setComposerDueIn] = useState<string>("24")
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    if (!open) {
      setComposerContent("")
      setComposerTab("note")
    }
  }, [open])

  // Se a API individual falhou mas temos fallback do pipeline, usa
  // ele. Garante que o drawer nunca fica em branco — pelo menos os
  // dados basicos do card aparecem.
  const errorIs404 =
    error instanceof Error && /not.?found|nao encontrad|404/i.test(error.message)

  // Quando confirmamos 404, avisa o pai pra revalidar o pipeline (e
  // potencialmente sumir com o card fantasma).
  useEffect(() => {
    if (errorIs404 && onMissing) onMissing()
  }, [errorIs404, onMissing])

  const apiDeal = data?.deal
  const deal = apiDeal ?? (fallbackDeal as DealDetailResponse["deal"] | undefined)
  const activities = data?.activities || []

  const postActivity = async () => {
    if (!dealId || !composerContent.trim()) return
    setPosting(true)
    try {
      const payload: Record<string, unknown> = {
        type: composerTab,
        content: composerContent.trim(),
        is_internal: composerTab !== "email",
      }
      if (composerTab === "task" && composerDueIn) {
        const hours = parseInt(composerDueIn, 10)
        if (!Number.isNaN(hours)) {
          payload.due_at = new Date(Date.now() + hours * 3600000).toISOString()
        }
      }
      await fetch(`/api/crm/deals/${dealId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      setComposerContent("")
      await mutate()
      onUpdated?.()
    } finally {
      setPosting(false)
    }
  }

  const isWon = deal?.status === "won"
  const isLost = deal?.status === "lost"
  const isDealOpen = deal?.status === "open"

  // Cor de acento do estagio (fallback cinza ardosia se nao tiver cor)
  const accentColor = deal?.stage?.color ?? "#475569"

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
        />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[100vw] sm:max-w-[640px] lg:max-w-[820px] flex-col bg-white dark:bg-[#0F1117] text-slate-900 dark:text-white/90 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"
          style={{ animationDuration: "200ms" }}
        >
          <DialogPrimitive.Title className="sr-only">
            {deal?.title || "Detalhes do deal"}
          </DialogPrimitive.Title>

          {/* ─── HEADER ─── */}
          <div className="relative flex items-start justify-between border-b border-black/[0.06] dark:border-white/[0.08] px-6 py-4 bg-white dark:bg-[#0F1117]">
            {/* Faixa colorida lateral esquerda — vinculo visual com a coluna */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1"
              style={{ background: accentColor }}
              aria-hidden
            />

            <div className="min-w-0 flex-1 pr-3 pl-2">
              {isLoading && !deal ? (
                <DealHeaderSkeleton />
              ) : error && !deal ? (
                <DealError message={error.message} onRetry={() => mutate()} />
              ) : deal ? (
                <>
                  {/* Breadcrumb pipeline > stage + status pill */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {deal.pipeline && (
                      <span
                        className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500 dark:text-white/55"
                      >
                        {deal.pipeline.name}
                      </span>
                    )}
                    {deal.stage && (
                      <>
                        <ChevronRight className="h-3 w-3 text-slate-300 dark:text-white/30 shrink-0" />
                        <StageBadge stage={deal.stage} />
                      </>
                    )}
                    <StatusPill status={deal.status} />
                  </div>

                  {/* Titulo do deal */}
                  <h2 className="mt-1.5 truncate text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                    {deal.title}
                  </h2>

                  {/* Valor + probabilidade + cliente */}
                  <div className="mt-1.5 flex items-center gap-4 flex-wrap">
                    {deal.value != null && deal.value > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold tabular-nums text-slate-900 dark:text-white">
                        <DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        {fmtBRL(deal.value)}
                      </span>
                    )}
                    {apiDeal?.probability != null && apiDeal.probability > 0 && (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-white/55"
                        title="Probabilidade de fechar"
                      >
                        <TrendingUp className="h-3 w-3" />
                        {apiDeal.probability}% prob.
                      </span>
                    )}
                    {deal.client && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-white/55">
                        <Building2 className="h-3 w-3" />
                        {deal.client.name}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <DealError message="Deal nao encontrado" />
              )}
            </div>

            <button
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:text-slate-900 dark:text-white/60 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Banner de aviso quando usamos fallback (deal individual
              falhou mas estamos exibindo dados do pipeline data).
              Visivel mas nao alarmante — o drawer continua funcional. */}
          {error && deal && (
            <div className="px-6 py-2 flex items-center gap-2 border-b border-amber-200/70 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/15 text-xs text-amber-700 dark:text-amber-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">
                Mostrando dados em cache. {errorIs404
                  ? "Este deal pode ter sido movido ou removido."
                  : "Erro ao carregar detalhes completos."}
              </span>
              <button
                onClick={() => mutate()}
                className="font-medium underline hover:text-amber-900 dark:hover:text-amber-200"
              >
                Recarregar
              </button>
            </div>
          )}

          {/* ─── REASON BANNERS — so disponiveis no api deal full ─── */}
          {apiDeal && isWon && apiDeal.won_reason && (
            <div className="px-6 py-2.5 flex items-center gap-2 border-b border-emerald-200/70 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/15 text-sm text-emerald-700 dark:text-emerald-300">
              <Trophy className="h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>Ganho:</strong> {apiDeal.won_reason}
              </span>
            </div>
          )}
          {apiDeal && isLost && apiDeal.lost_reason && (
            <div className="px-6 py-2.5 flex items-center gap-2 border-b border-red-200/70 dark:border-red-900/40 bg-red-50 dark:bg-red-900/15 text-sm text-red-700 dark:text-red-300">
              <XCircle className="h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>Perdido:</strong> {apiDeal.lost_reason}
              </span>
            </div>
          )}

          {/* ─── BODY 2-col em desktop, stack em mobile ─── */}
          <div className="flex flex-1 flex-col-reverse md:flex-row overflow-hidden">
            {/* TIMELINE + COMPOSER (esquerda) */}
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Composer — so quando temos o deal real do servidor.
                  Em modo fallback (api falhou) nao deixa criar atividade
                  pra evitar confusao de estado. */}
              {apiDeal && isDealOpen && (
                <div className="border-b border-black/[0.06] dark:border-white/[0.08] px-6 py-3 bg-slate-50 dark:bg-[#161922]">
                  <div className="flex items-center gap-1 mb-2">
                    {COMPOSER_TABS.map((t) => {
                      const Icon = t.icon
                      const active = composerTab === t.id
                      return (
                        <button
                          key={t.id}
                          onClick={() => setComposerTab(t.id)}
                          className={
                            active
                              ? "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-[4px] bg-slate-900 text-white border border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white"
                              : "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-[4px] bg-white dark:bg-[#1A1D27] text-slate-700 dark:text-white/70 border border-slate-200 dark:border-white/[0.10] hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                          }
                        >
                          <Icon className="h-3 w-3" />
                          {t.label}
                        </button>
                      )
                    })}
                  </div>
                  <textarea
                    className="w-full px-3 py-2 text-sm rounded-[6px] bg-white dark:bg-[#1A1D27] text-slate-900 dark:text-white/90 border border-slate-200 dark:border-white/[0.08] placeholder:text-slate-400 dark:placeholder:text-white/30 focus:border-slate-400 dark:focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:focus:ring-white/10 resize-y"
                    style={{ minHeight: 64 }}
                    placeholder={
                      composerTab === "note"
                        ? "Anote uma observacao interna..."
                        : composerTab === "task"
                          ? "Descreva a tarefa..."
                          : composerTab === "call"
                            ? "Resumo da ligacao..."
                            : "Resumo do email enviado..."
                    }
                    value={composerContent}
                    onChange={(e) => setComposerContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        postActivity()
                      }
                    }}
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {composerTab === "task" ? (
                      <select
                        className="h-8 px-2 text-xs rounded-[4px] bg-white dark:bg-[#1A1D27] text-slate-700 dark:text-white/80 border border-slate-200 dark:border-white/[0.10]"
                        value={composerDueIn}
                        onChange={(e) => setComposerDueIn(e.target.value)}
                      >
                        <option value="2">Vence em 2h</option>
                        <option value="24">Vence em 24h</option>
                        <option value="72">Vence em 3 dias</option>
                        <option value="168">Vence em 1 semana</option>
                        <option value="">Sem prazo</option>
                      </select>
                    ) : (
                      <span className="text-[10px] text-slate-400 dark:text-white/40">
                        ⌘/Ctrl+Enter pra enviar
                      </span>
                    )}
                    <button
                      className="h-8 px-3 text-xs font-medium rounded-[4px] bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={postActivity}
                      disabled={!composerContent.trim() || posting}
                    >
                      {posting
                        ? "Salvando..."
                        : `Adicionar ${
                            COMPOSER_TABS.find((t) => t.id === composerTab)
                              ?.label || ""
                          }`}
                    </button>
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div className="flex-1 overflow-auto px-6 py-4">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500 dark:text-white/55 mb-3">
                  Atividades ({activities.length})
                </h3>
                {isLoading && !data ? (
                  <ActivitiesSkeleton />
                ) : activities.length === 0 ? (
                  <EmptyActivities />
                ) : (
                  <ol className="space-y-4 relative">
                    <div className="absolute top-0 bottom-0 w-px bg-slate-200 dark:bg-white/[0.08]" style={{ left: 13 }} />
                    {activities.map((a) => {
                      const Icon = ACTIVITY_ICONS[a.type] || FileText
                      const isOverdue =
                        a.due_at &&
                        !a.completed_at &&
                        new Date(a.due_at).getTime() < Date.now()
                      return (
                        <li
                          key={a.id}
                          className="flex gap-3 relative"
                          style={{ zIndex: 1 }}
                        >
                          <div
                            className={
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 " +
                              (a.type === "stage_change"
                                ? "bg-blue-50 text-blue-700 border-white dark:bg-blue-900/30 dark:text-blue-300 dark:border-[#0F1117]"
                                : isOverdue
                                  ? "bg-red-50 text-red-700 border-white dark:bg-red-900/30 dark:text-red-300 dark:border-[#0F1117]"
                                  : "bg-slate-100 text-slate-700 border-white dark:bg-white/[0.06] dark:text-white/70 dark:border-[#0F1117]")
                            }
                          >
                            <Icon className="h-3 w-3" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-xs font-medium text-slate-700 dark:text-white/80">
                                {a.creator?.name || "Sistema"}
                              </span>
                              <span className="text-[10px] text-slate-500 dark:text-white/50">
                                {new Date(a.created_at).toLocaleString("pt-BR")}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[13px] text-slate-700 dark:text-white/80 leading-relaxed whitespace-pre-wrap">
                              {a.content}
                            </p>
                            {a.due_at && (
                              <p
                                className={
                                  "mt-1 text-[10px] font-medium " +
                                  (isOverdue
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-amber-700 dark:text-amber-400")
                                }
                              >
                                {isOverdue ? "⚠ Atrasada" : "⏰ Vence"}{" "}
                                {new Date(a.due_at).toLocaleString("pt-BR")}
                              </p>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </div>
            </div>

            {/* SIDEBAR (direita / topo no mobile) */}
            {deal && (
              <aside className="w-full md:w-[280px] md:shrink-0 overflow-auto border-b md:border-b-0 md:border-l border-black/[0.06] dark:border-white/[0.08] bg-slate-50 dark:bg-[#161922]">
                <div className="px-5 py-4 space-y-5">
                  <SidebarSection title="Sobre">
                    <SidebarRow icon={<User className="h-3 w-3" />} label="Owner">
                      {deal.owner ? (
                        <div className="flex items-center gap-1.5">
                          {deal.owner.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={deal.owner.avatar_url}
                              alt={deal.owner.name}
                              className="h-4 w-4 rounded-full object-cover"
                            />
                          ) : (
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 dark:bg-white/[0.10] text-[8px] font-semibold text-slate-600 dark:text-white/70">
                              {getInitials(deal.owner.name)}
                            </span>
                          )}
                          <span>{deal.owner.name}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 dark:text-white/40">—</span>
                      )}
                    </SidebarRow>
                    <SidebarRow icon={<Building2 className="h-3 w-3" />} label="Cliente">
                      {deal.client?.name || (
                        <span className="text-slate-400 dark:text-white/40">Sem cliente</span>
                      )}
                    </SidebarRow>
                    {deal.store && (
                      <SidebarRow icon={<Building2 className="h-3 w-3" />} label="Loja">
                        {deal.store.name}
                      </SidebarRow>
                    )}
                    <SidebarRow icon={<Tag className="h-3 w-3" />} label="Fonte">
                      {deal.source || (
                        <span className="text-slate-400 dark:text-white/40">—</span>
                      )}
                    </SidebarRow>
                    {deal.created_at && (
                      <SidebarRow icon={<Calendar className="h-3 w-3" />} label="Criado em">
                        {new Date(deal.created_at).toLocaleDateString("pt-BR")}
                      </SidebarRow>
                    )}
                    {apiDeal?.updated_at && (
                      <SidebarRow icon={<Calendar className="h-3 w-3" />} label="Atualizado">
                        {new Date(apiDeal.updated_at).toLocaleDateString("pt-BR")}
                      </SidebarRow>
                    )}
                  </SidebarSection>

                  {apiDeal?.lead && (
                    <SidebarSection title="Lead origem">
                      <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1A1D27] p-3">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-white">
                          <ExternalLink className="h-3 w-3" />
                          {apiDeal.lead.name}
                        </div>
                        {apiDeal.lead.email && (
                          <div className="mt-1 text-[11px] text-slate-500 dark:text-white/55">
                            {apiDeal.lead.email}
                          </div>
                        )}
                      </div>
                    </SidebarSection>
                  )}

                  {deal.tags && deal.tags.length > 0 && (
                    <SidebarSection title="Tags">
                      <div className="flex flex-wrap gap-1">
                        {deal.tags.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-white/75 border border-slate-200 dark:border-white/[0.08]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </SidebarSection>
                  )}

                  {apiDeal?.notes && (
                    <SidebarSection title="Notas">
                      <p className="text-sm text-slate-700 dark:text-white/75 whitespace-pre-wrap leading-relaxed">
                        {apiDeal.notes}
                      </p>
                    </SidebarSection>
                  )}
                </div>
              </aside>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ── Sub-componentes ──────────────────────────────────────────────

function StageBadge({
  stage,
}: {
  stage: { name: string; stage_type: string | null; color?: string | null }
}) {
  const tone =
    stage.stage_type === "won"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-900/40"
      : stage.stage_type === "lost"
        ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-900/40"
        : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/[0.06] dark:text-white/75 dark:border-white/[0.08]"
  return (
    <span
      className={`text-[10px] font-medium uppercase tracking-[0.04em] px-2 py-0.5 rounded-[3px] border ${tone}`}
    >
      {stage.name}
    </span>
  )
}

function StatusPill({ status }: { status: string }) {
  if (status === "won") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
        <Trophy className="h-2.5 w-2.5" />
        GANHO
      </span>
    )
  }
  if (status === "lost") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
        <XCircle className="h-2.5 w-2.5" />
        PERDIDO
      </span>
    )
  }
  if (status === "open") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
        ABERTO
      </span>
    )
  }
  return null
}

function SidebarSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500 dark:text-white/55 mb-2">
        {title}
      </h4>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function SidebarRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <div
        className="flex items-center gap-1.5 shrink-0 text-[10px] text-slate-500 dark:text-white/55"
        style={{ width: 80, paddingTop: 1 }}
      >
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex-1 min-w-0 text-[13px] text-slate-800 dark:text-white/85">
        {children}
      </div>
    </div>
  )
}

function DealHeaderSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-3 w-24 rounded bg-slate-200 dark:bg-white/[0.08]" />
        <div className="h-3 w-3 rounded bg-slate-100 dark:bg-white/[0.04]" />
        <div className="h-4 w-20 rounded bg-slate-200 dark:bg-white/[0.08]" />
      </div>
      <div className="h-6 w-3/4 rounded bg-slate-300 dark:bg-white/[0.10]" />
      <div className="flex items-center gap-3">
        <div className="h-4 w-28 rounded bg-slate-200 dark:bg-white/[0.08]" />
        <div className="h-4 w-20 rounded bg-slate-100 dark:bg-white/[0.06]" />
      </div>
    </div>
  )
}

function ActivitiesSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex gap-3 animate-pulse">
          <div className="h-7 w-7 rounded-full bg-slate-200 dark:bg-white/[0.08] shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <div className="h-3 w-24 rounded bg-slate-200 dark:bg-white/[0.08]" />
              <div className="h-2.5 w-20 rounded bg-slate-100 dark:bg-white/[0.06]" />
            </div>
            <div className="h-3 w-full rounded bg-slate-100 dark:bg-white/[0.06]" />
            <div className="h-3 w-2/3 rounded bg-slate-100 dark:bg-white/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyActivities() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-white/[0.06] text-slate-400 dark:text-white/40 mb-3">
        <FileText className="h-4 w-4" />
      </div>
      <p className="text-sm font-medium text-slate-700 dark:text-white/80">
        Nenhuma atividade ainda
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-white/55 max-w-xs">
        Use o composer acima pra adicionar uma nota, criar uma tarefa ou registrar uma ligacao/email.
      </p>
    </div>
  )
}

function DealError({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium">Erro ao carregar deal</span>
      </div>
      <p className="text-xs text-slate-600 dark:text-white/60 break-words">
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="self-start text-xs font-medium text-slate-700 dark:text-white/80 hover:text-slate-900 dark:hover:text-white underline"
        >
          Tentar novamente
        </button>
      )}
    </div>
  )
}
