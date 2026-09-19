"use client"

import { Suspense, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import useSWR from "swr"
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  HeartHandshake,
  Phone,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Zap,
} from "lucide-react"
import { NewPipelineDialog } from "@/components/crm/new-pipeline-dialog"
import { PipelineBoardView } from "@/components/crm/pipeline-board-view"
import { CrmEmptyState } from "@/components/crm/crm-empty-state"
import { CsFormsList } from "@/components/crm/cs-forms-list"
import { PageSkeleton } from "@/components/ui/page-skeleton"
import { SegmentedTabs, SegmentedTabItem } from "@/components/ui/segmented-tabs"
import { ROUTES } from "@/lib/routes"

/**
 * Hub Customer Success — página única do CS com sub-abas (?tab=):
 *   - painel:      cards de pipelines + agenda do dia (o hub original)
 *   - formularios: listagem de Formulários CS (era /operacional/forms)
 *   - cadencias:   board do pipeline "Cadencias CS" embutido (era o
 *                  redirect de /operacional/cs-crm/cadences)
 *
 * As rotas antigas de forms (lista) e cadences redirecionam pras abas.
 * O editor de formulário continua em /admin/operacional/forms/[id].
 *
 * Histórico: antes existiam 2 telas com objetivo parecido (CRM CS =
 * painel diario; Pipelines CS = lista) — unificadas aqui; depois
 * (jul/2026) Formulários e Cadências viraram abas desta mesma página.
 */

const CS_TABS = ["painel", "formularios", "cadencias"] as const
type CsTab = (typeof CS_TABS)[number]

const TAB_SUBTITLES: Record<CsTab, string> = {
  painel: "Pipelines ativos + agenda do dia (auto-refresh 60s)",
  formularios: "NPS, health check e feedback — respostas viram leads CS",
  cadencias: "Frequência de acompanhamento por loja — arraste entre colunas para mudar",
}

function parseTab(raw: string | null): CsTab {
  return (CS_TABS as readonly string[]).includes(raw ?? "") ? (raw as CsTab) : "painel"
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface PipelineSummary {
  id: string
  name: string
  description: string | null
  scope: string
  color: string | null
  category?: string | null
  is_default?: boolean
  is_favorite?: boolean
  deal_count: number
  stages: Array<{ id: string; name: string }>
}

interface AgendaCard {
  id: string
  store_id: string
  store_name: string
  client_name?: string | null
  mrr_cents?: number | null
  flag_reason?: string | null
  health_state?: string
  ai_message?: string | null
  conducted_at?: string | null
  next_call_date?: string | null
  feedback_sent_at?: string | null
  feedback_method?: string | null
}

interface CsHomePayload {
  urgente: AgendaCard[]
  calls_hoje: AgendaCard[]
  feedbacks: AgendaCard[]
  agendar_call: AgendaCard[]
  pos_call_pendente: AgendaCard[]
  concluidos_hoje: AgendaCard[]
}

const fmtBRL = (cents: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(cents / 100)

export default function CsPipelinesHubPage() {
  // useSearchParams exige boundary de Suspense no App Router.
  return (
    <Suspense fallback={null}>
      <CsPipelinesHub />
    </Suspense>
  )
}

function CsPipelinesHub() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const tab = parseTab(searchParams.get("tab"))
  const setTab = (t: string) => {
    const next = parseTab(t)
    router.replace(next === "painel" ? pathname : `${pathname}?tab=${next}`, {
      scroll: false,
    })
  }

  const { data: pipelinesData, mutate: mutatePipelines } = useSWR<{
    pipelines: PipelineSummary[]
    data?: { pipelines: PipelineSummary[] }
  }>("/api/crm/pipelines?scope=cs", fetcher)

  const pipelines = useMemo<PipelineSummary[]>(
    () => pipelinesData?.data?.pipelines ?? pipelinesData?.pipelines ?? [],
    [pipelinesData],
  )

  const { data: agendaData } = useSWR<{
    data?: CsHomePayload
    urgente?: AgendaCard[]
  }>("/api/cs-crm/home", fetcher, {
    refreshInterval: 60_000, // auto-refresh a cada 60s (mesmo do antigo CRM CS)
  })

  const agenda: CsHomePayload = useMemo(
    () =>
      (agendaData?.data as CsHomePayload) ?? {
        urgente: agendaData?.urgente ?? [],
        calls_hoje: [],
        feedbacks: [],
        agendar_call: [],
        pos_call_pendente: [],
        concluidos_hoje: [],
      },
    [agendaData],
  )

  const totals = useMemo(
    () => ({
      pipelines: pipelines.length,
      total_open: pipelines.reduce((s, p) => s + (p.deal_count ?? 0), 0),
      calls_hoje: agenda.calls_hoje.length,
      urgente: agenda.urgente.length,
      pos_call: agenda.pos_call_pendente.length,
      agendar: agenda.agendar_call.length,
      feedbacks: agenda.feedbacks.length,
    }),
    [pipelines, agenda],
  )

  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [syncing, setSyncing] = useState<"health" | "carteira" | null>(null)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  async function runHealthSync() {
    if (syncing) return
    setSyncing("health")
    setSyncMessage(null)
    try {
      const r = await fetch("/api/admin/crm-health/compute-now", {
        method: "POST",
        credentials: "include",
      })
      const body = await r.json()
      if (!r.ok) throw new Error(body?.error?.message || "Falha no recalculo")
      const res = body.data ?? body
      setSyncMessage(
        `Health recalculado · ${res.ok}/${res.total} lojas · ${res.alerts_created ?? 0} novo(s) alerta(s) crítico(s). Carteira sincronizada automaticamente.`,
      )
      await mutatePipelines()
    } catch (e) {
      setSyncMessage(`Erro: ${(e as Error).message}`)
    } finally {
      setSyncing(null)
    }
  }

  async function runCarteiraSync() {
    if (syncing) return
    setSyncing("carteira")
    setSyncMessage(null)
    try {
      const r = await fetch("/api/admin/cs-carteira/sync-now", {
        method: "POST",
        credentials: "include",
      })
      const body = await r.json()
      if (!r.ok) throw new Error(body?.error?.message || "Falha no sync")
      const res = body.data ?? body
      setSyncMessage(
        `Carteira sincronizada · ${res.ok}/${res.total} lojas classificadas (use o pipeline Gestão de Carteira pra ver).`,
      )
      await mutatePipelines()
    } catch (e) {
      setSyncMessage(`Erro: ${(e as Error).message}`)
    } finally {
      setSyncing(null)
    }
  }

  const isEmpty = pipelines.length === 0

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{
        background: "var(--crm-gray-50)",
        fontFamily: "var(--crm-font-sans)",
      }}
    >
      {/* Topbar */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: "12px 32px",
          background: "var(--crm-gray-0)",
          borderBottom: "1px solid var(--crm-border)",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              color: "var(--crm-gray-900)",
              letterSpacing: "-0.01em",
            }}
          >
            Customer Success
          </h1>
          <p
            style={{
              margin: "2px 0 0",
              fontSize: 12,
              color: "var(--crm-gray-500)",
            }}
          >
            {TAB_SUBTITLES[tab]}
          </p>
        </div>
        {/* Ações de sync/criação pertencem ao Painel; as outras abas
            carregam as próprias ações (ex.: "Novo formulário"). */}
        <div
          style={{
            display: tab === "painel" ? "inline-flex" : "none",
            alignItems: "center",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={runCarteiraSync}
            disabled={syncing !== null}
            title="Analisa cada loja e classifica em Saudavel/Atencao/Risco/Churn no pipeline Gestao de Carteira"
            className="cf-focusable inline-flex items-center gap-1.5 rounded-[6px]"
            style={{
              height: 32,
              padding: "0 12px",
              background: "#fff",
              color: "var(--crm-gray-700)",
              border: "1px solid var(--crm-border)",
              fontSize: 12,
              fontWeight: 500,
              cursor: syncing ? "wait" : "pointer",
              opacity: syncing ? 0.6 : 1,
            }}
          >
            <RefreshCw
              className={
                "h-3.5 w-3.5" + (syncing === "carteira" ? " animate-spin" : "")
              }
            />
            {syncing === "carteira" ? "Analisando..." : "Sincronizar carteira"}
          </button>
          <button
            type="button"
            onClick={runHealthSync}
            disabled={syncing !== null}
            title="Recalcula health score de todas lojas e ja sincroniza carteira + alertas"
            className="cf-focusable inline-flex items-center gap-1.5 rounded-[6px]"
            style={{
              height: 32,
              padding: "0 12px",
              background: "#fff",
              color: "var(--crm-gray-700)",
              border: "1px solid var(--crm-border)",
              fontSize: 12,
              fontWeight: 500,
              cursor: syncing ? "wait" : "pointer",
              opacity: syncing ? 0.6 : 1,
            }}
          >
            <Zap
              className={
                "h-3.5 w-3.5" + (syncing === "health" ? " animate-pulse" : "")
              }
            />
            {syncing === "health" ? "Recalculando..." : "Recalcular health"}
          </button>
          <Link
            href={ROUTES.ADMIN.OPERACIONAL.PIPELINES_ADMIN}
            className="cf-focusable inline-flex items-center gap-1.5 rounded-[6px]"
            style={{
              height: 32,
              padding: "0 12px",
              background: "#fff",
              color: "var(--crm-gray-700)",
              border: "1px solid var(--crm-border)",
              fontSize: 12,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            <Settings className="h-3.5 w-3.5" />
            Configurar
          </Link>
          <button
            onClick={() => setNewDialogOpen(true)}
            className="cf-focusable inline-flex items-center gap-1.5 rounded-[6px]"
            style={{
              height: 32,
              padding: "0 12px",
              background: "var(--crm-brand)",
              color: "var(--crm-brand-fg)",
              fontSize: 12,
              fontWeight: 600,
              border: 0,
              cursor: "pointer",
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Novo pipeline
          </button>
        </div>
      </div>

      {/* Sub-abas do hub CS (URL-driven via ?tab=) */}
      <div
        style={{
          padding: "10px 32px",
          background: "var(--crm-gray-0)",
          borderBottom: "1px solid var(--crm-border)",
        }}
      >
        <SegmentedTabs value={tab} onValueChange={setTab}>
          <SegmentedTabItem value="painel">Painel</SegmentedTabItem>
          <SegmentedTabItem value="formularios">Formulários</SegmentedTabItem>
          <SegmentedTabItem value="cadencias">Cadências</SegmentedTabItem>
        </SegmentedTabs>
      </div>

      {tab === "cadencias" ? (
        // Board embutido gerencia o próprio scroll/altura.
        <div className="flex-1 min-h-0 overflow-hidden">
          <CadenciasEmbeddedBoard
            pipelines={pipelines}
            loading={!pipelinesData}
          />
        </div>
      ) : tab === "formularios" ? (
        <div className="flex-1 overflow-y-auto" style={{ padding: "24px 32px" }}>
          <div className="max-w-[1280px] mx-auto">
            <CsFormsList />
          </div>
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto" style={{ padding: "24px 32px" }}>
        {syncMessage && (
          <div
            style={{
              marginBottom: 16,
              padding: "10px 14px",
              background: syncMessage.startsWith("Erro")
                ? "#FEF2F2"
                : "#ECFDF5",
              color: syncMessage.startsWith("Erro") ? "#991B1B" : "#065F46",
              border: `1px solid ${syncMessage.startsWith("Erro") ? "#FECACA" : "#A7F3D0"}`,
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: 500,
              maxWidth: 1280,
              margin: "0 auto 16px",
            }}
          >
            {syncMessage}
          </div>
        )}
        {isEmpty ? (
          <CsPipelinesEmptyHero onCreate={() => setNewDialogOpen(true)} />
        ) : (
          <div className="space-y-6 max-w-[1280px] mx-auto">
            {/* KPIs cross-pipeline */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi
                icon={<HeartHandshake className="h-4 w-4" />}
                label="Pipelines"
                value={totals.pipelines}
              />
              <Kpi
                icon={<Zap className="h-4 w-4" />}
                label="Deals abertos"
                value={totals.total_open}
              />
              <Kpi
                icon={<Phone className="h-4 w-4" />}
                label="Calls hoje"
                value={totals.calls_hoje}
              />
              <Kpi
                icon={<AlertTriangle className="h-4 w-4" />}
                label="Em risco / pendente"
                value={totals.urgente + totals.pos_call}
                color={
                  totals.urgente + totals.pos_call > 0 ? "danger" : "default"
                }
              />
            </div>

            {/* Grid de pipelines */}
            <section>
              <SectionHeader
                title="Pipelines CS"
                hint="Abra um pipeline pra trabalhar deals no kanban completo"
              />
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {pipelines.map((p) => (
                  <PipelineCard key={p.id} pipeline={p} />
                ))}
              </div>
            </section>

            {/* Agenda do dia */}
            <section>
              <SectionHeader
                title="Agenda do dia"
                hint="Lojas que precisam ação hoje · auto-refresh 60s"
              />
              <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
                <AgendaList
                  icon={<Phone className="h-3.5 w-3.5" />}
                  title="Calls hoje"
                  tagColor="var(--crm-brand)"
                  items={agenda.calls_hoje}
                  emptyLabel="Nenhuma call agendada hoje"
                  fmtBRL={fmtBRL}
                />
                <AgendaList
                  icon={<CalendarClock className="h-3.5 w-3.5" />}
                  title="Agendar call"
                  tagColor="#92400E"
                  items={agenda.agendar_call}
                  emptyLabel="Todas com call recente"
                  fmtBRL={fmtBRL}
                />
                <AgendaList
                  icon={<RefreshCw className="h-3.5 w-3.5" />}
                  title="Pós-call pendente"
                  tagColor="#7C3AED"
                  items={agenda.pos_call_pendente}
                  emptyLabel="Tudo em dia"
                  fmtBRL={fmtBRL}
                />
              </div>
            </section>

            {/* Fluxos especiais */}
            <section>
              <SectionHeader title="Fluxos cross-pipeline" />
              <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
                <WorkflowCard
                  icon={<Sparkles className="h-4 w-4" />}
                  title="Ritual de Sexta"
                  description="Reflexão semanal guiada por IA. Avalia lojas em risco em sessão de 2h."
                  count={agenda.feedbacks.length}
                  countLabel="feedbacks WhatsApp prontos"
                  href={ROUTES.ADMIN.OPERACIONAL.CS.RITUAL}
                />
                <WorkflowCard
                  icon={<CalendarClock className="h-4 w-4" />}
                  title="Acompanhamento semanal"
                  description="Kanban semanal das lojas (saudáveis, atenção, risco, renovação)."
                  count={totals.urgente}
                  countLabel="lojas em risco"
                  href={ROUTES.ADMIN.OPERACIONAL.CS.ACOMPANHAMENTO}
                />
                <WorkflowCard
                  icon={<Phone className="h-4 w-4" />}
                  title="Calls mensais"
                  description="Pipeline dedicado de calls (agendada → realizada → feedback enviado)."
                  count={totals.calls_hoje}
                  countLabel="calls hoje"
                  href={ROUTES.ADMIN.OPERACIONAL.CS.CALLS}
                />
              </div>
            </section>
          </div>
        )}
      </div>
      )}

      <NewPipelineDialog
        open={newDialogOpen}
        scope="cs"
        onClose={() => setNewDialogOpen(false)}
        onCreated={() => {
          setNewDialogOpen(false)
          mutatePipelines()
        }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────

/**
 * Aba Cadências: embute o board do pipeline CS "Cadencias CS" (mesmo
 * nome canônico de WELL_KNOWN_NAMES em src/lib/cs-pipelines.ts — o
 * seed 20260615 cria a row). Resolve o id pela lista de pipelines já
 * carregada pelo hub; sem o pipeline, empty state com orientação.
 */
function CadenciasEmbeddedBoard({
  pipelines,
  loading,
}: {
  pipelines: PipelineSummary[]
  loading: boolean
}) {
  const cadencias = pipelines.find(
    (p) => p.name === "Cadencias CS" && p.scope === "cs",
  )

  if (!cadencias && loading) {
    return (
      <div style={{ padding: "24px 32px" }}>
        <PageSkeleton variant="list" showHeader={false} className="px-0 py-0" />
      </div>
    )
  }

  if (!cadencias) {
    return (
      <div style={{ padding: "24px 32px" }}>
        <CrmEmptyState
          icon={<CalendarClock className="h-5 w-5" />}
          title="Pipeline de Cadências não encontrado"
          description={
            'O pipeline CS "Cadencias CS" ainda não foi criado nesta organização. ' +
            "Rode o seed de consolidação de pipelines CS ou crie-o na aba Painel."
          }
        />
      </div>
    )
  }

  return <PipelineBoardView pipelineId={cadencias.id} scope="cs" />
}

function Kpi({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color?: "danger" | "default"
}) {
  const valueColor =
    color === "danger" ? "var(--crm-danger-fg)" : "var(--crm-gray-900)"
  return (
    <div
      style={{
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 6,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 10,
          fontWeight: 600,
          color: "var(--crm-gray-500)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {icon}
        {label}
      </div>
      <div
        className="crm-tnum"
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: valueColor,
          lineHeight: 1,
          fontFamily: "var(--crm-font-mono)",
        }}
      >
        {value}
      </div>
    </div>
  )
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2
        style={{
          margin: 0,
          fontSize: 12,
          fontWeight: 600,
          color: "var(--crm-gray-700)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {title}
      </h2>
      {hint && (
        <span
          style={{
            fontSize: 11,
            color: "var(--crm-gray-500)",
          }}
        >
          {hint}
        </span>
      )}
    </div>
  )
}

function PipelineCard({ pipeline }: { pipeline: PipelineSummary }) {
  const dotColor = pipeline.color ?? "var(--crm-brand)"
  return (
    <Link
      href={ROUTES.ADMIN.OPERACIONAL.PIPELINE_DETAIL(pipeline.id)}
      style={{
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 8,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        textDecoration: "none",
        transition: "border-color 120ms ease",
      }}
      className="hover:border-[color:var(--crm-brand)]"
    >
      <div className="flex items-start gap-2">
        <span
          style={{
            flexShrink: 0,
            marginTop: 5,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: dotColor,
          }}
        />
        <div className="flex-1 min-w-0">
          <h3
            className="truncate"
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--crm-gray-900)",
            }}
          >
            {pipeline.name}
          </h3>
          {pipeline.description && (
            <p
              className="line-clamp-2"
              style={{
                margin: "2px 0 0",
                fontSize: 11.5,
                color: "var(--crm-gray-500)",
                lineHeight: 1.4,
              }}
            >
              {pipeline.description}
            </p>
          )}
        </div>
        <ArrowRight
          className="h-3.5 w-3.5"
          style={{ color: "var(--crm-gray-400)", flexShrink: 0 }}
        />
      </div>
      <div
        className="flex items-center gap-3"
        style={{ fontSize: 11, color: "var(--crm-gray-500)" }}
      >
        <span className="crm-tnum">
          <strong style={{ color: "var(--crm-gray-900)" }}>
            {pipeline.deal_count}
          </strong>{" "}
          deal{pipeline.deal_count === 1 ? "" : "s"}
        </span>
        <span style={{ color: "var(--crm-gray-300)" }}>·</span>
        <span className="crm-tnum">{pipeline.stages?.length ?? 0} etapas</span>
      </div>
    </Link>
  )
}

function AgendaList({
  icon,
  title,
  tagColor,
  items,
  emptyLabel,
  fmtBRL,
}: {
  icon: React.ReactNode
  title: string
  tagColor: string
  items: AgendaCard[]
  emptyLabel: string
  fmtBRL: (cents: number) => string
}) {
  return (
    <div
      style={{
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 8,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 200,
      }}
    >
      <div className="flex items-center justify-between">
        <div
          className="inline-flex items-center gap-1.5"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: tagColor,
          }}
        >
          {icon}
          {title}
        </div>
        <span
          className="crm-tnum"
          style={{ fontSize: 11, color: "var(--crm-gray-500)" }}
        >
          {items.length}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: 240 }}>
        {items.length === 0 ? (
          <div
            style={{
              fontSize: 11.5,
              color: "var(--crm-gray-400)",
              padding: "16px 8px",
              textAlign: "center",
            }}
          >
            {emptyLabel}
          </div>
        ) : (
          items.slice(0, 10).map((it) => (
            <div
              key={it.id}
              style={{
                padding: "8px 10px",
                background: "var(--crm-gray-50)",
                borderRadius: 4,
                border: "1px solid var(--crm-border)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--crm-gray-900)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 6,
                }}
              >
                <span className="truncate">{it.store_name}</span>
                {it.mrr_cents != null && it.mrr_cents > 0 && (
                  <span
                    className="crm-tnum"
                    style={{
                      fontSize: 11,
                      color: "var(--crm-gray-500)",
                      fontFamily: "var(--crm-font-mono)",
                      flexShrink: 0,
                    }}
                  >
                    {fmtBRL(it.mrr_cents)}
                  </span>
                )}
              </div>
              {it.client_name && (
                <div
                  className="truncate"
                  style={{
                    fontSize: 11,
                    color: "var(--crm-gray-500)",
                    marginTop: 1,
                  }}
                >
                  {it.client_name}
                </div>
              )}
              {it.flag_reason && (
                <div
                  className="line-clamp-1"
                  style={{
                    fontSize: 11,
                    color: "var(--crm-gray-500)",
                    marginTop: 3,
                    fontStyle: "italic",
                  }}
                >
                  {it.flag_reason}
                </div>
              )}
            </div>
          ))
        )}
        {items.length > 10 && (
          <div
            style={{
              fontSize: 11,
              color: "var(--crm-gray-500)",
              textAlign: "center",
              padding: 4,
            }}
          >
            + {items.length - 10} {items.length - 10 === 1 ? "outra" : "outras"}
          </div>
        )}
      </div>
    </div>
  )
}

function WorkflowCard({
  icon,
  title,
  description,
  count,
  countLabel,
  href,
}: {
  icon: React.ReactNode
  title: string
  description: string
  count: number
  countLabel: string
  href: string
}) {
  return (
    <Link
      href={href}
      style={{
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 8,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        textDecoration: "none",
      }}
      className="hover:border-[color:var(--crm-brand)]"
    >
      <div className="flex items-center gap-2">
        <span style={{ color: "var(--crm-brand)" }}>{icon}</span>
        <h3
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            color: "var(--crm-gray-900)",
          }}
        >
          {title}
        </h3>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 11.5,
          color: "var(--crm-gray-500)",
          lineHeight: 1.4,
        }}
      >
        {description}
      </p>
      <div
        className="flex items-center gap-1.5"
        style={{
          marginTop: "auto",
          paddingTop: 6,
          borderTop: "1px solid var(--crm-border)",
          fontSize: 11.5,
        }}
      >
        <strong
          className="crm-tnum"
          style={{
            fontFamily: "var(--crm-font-mono)",
            color:
              count > 0 ? "var(--crm-danger-fg)" : "var(--crm-gray-700)",
          }}
        >
          {count}
        </strong>
        <span style={{ color: "var(--crm-gray-500)" }}>{countLabel}</span>
        <ArrowRight
          className="h-3 w-3 ml-auto"
          style={{ color: "var(--crm-gray-400)" }}
        />
      </div>
    </Link>
  )
}

function CsPipelinesEmptyHero({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mb-4">
          <HeartHandshake className="h-5 w-5" />
        </div>
        <h2 className="text-[18px] font-semibold text-slate-900 mb-2 tracking-tight">
          Crie seu primeiro pipeline de Customer Success
        </h2>
        <p className="text-[13px] text-slate-600 leading-relaxed mb-5">
          Acompanhe onboardings, gestão de carteira, renovações e win-back em
          estágios claros.
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[6px] bg-[#059669] hover:bg-[#047857] text-white text-[13px] font-semibold shadow-[0_1px_2px_rgba(5,150,105,0.25)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo pipeline CS
            <ArrowRight className="h-3.5 w-3.5 ml-0.5" />
          </button>
          <Link
            href={ROUTES.ADMIN.OPERACIONAL.PIPELINES_ADMIN}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[6px] border border-slate-200 text-slate-700 text-[13px] font-medium hover:bg-slate-100"
          >
            <Settings className="h-3.5 w-3.5" />
            Configurar
          </Link>
        </div>
      </div>
    </div>
  )
}
