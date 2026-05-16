"use client"

/**
 * Aba Visão Geral — Alertas (derivados de integracoes faltantes + briefing)
 * + Performance snapshot 30d + Atividade recente.
 * Sidebar: Integrações reais + Próximos eventos.
 */

import { useEffect, useState } from "react"
import useSWR from "swr"
import { AlertTriangle, Info, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface TabVisaoProps {
  storeId: string
}

interface Activity {
  id: string
  kind: string
  title: string
  summary: string | null
  occurred_at: string
  author?: { name: string } | null
}

interface CsEvent {
  id: string
  kind: string
  title: string
  scheduled_at: string
}

interface IntegrationStatus {
  connected: boolean
  status?: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const KIND_LABELS: Record<string, { label: string; color: string }> = {
  feedback: { label: "Feedback", color: "#4E62D8" },
  teste: { label: "Teste A/B", color: "#A855F7" },
  otim: { label: "Otimização", color: "#F59E0B" },
  entrega: { label: "Entrega", color: "#10B981" },
  integracao: { label: "Integração", color: "#6B7280" },
  call: { label: "Call", color: "#3B82F6" },
  outro: { label: "Outro", color: "#9CA3AF" },
}

const INTEGRATIONS: Array<{ key: string; name: string }> = [
  { key: "shopify", name: "Shopify" },
  { key: "klaviyo", name: "Klaviyo" },
  { key: "omnisend", name: "Omnisend" },
  { key: "ga4", name: "Google Analytics (GA4)" },
  { key: "meta", name: "Meta Ads" },
  { key: "google_ads", name: "Google Ads" },
]

export function TabVisao({ storeId }: TabVisaoProps) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [events, setEvents] = useState<CsEvent[]>([])

  // Status real das integracoes
  const { data: credData } = useSWR(
    `/api/client-stores/credentials?store_id=${storeId}`,
    fetcher,
    { revalidateOnFocus: false },
  )
  const status = (credData?.status ?? {}) as Record<string, IntegrationStatus>

  // Briefing existente
  const { data: briefingData } = useSWR(
    `/api/onboarding/store-briefing?store_id=${storeId}`,
    fetcher,
    { revalidateOnFocus: false },
  )
  const hasBriefing = !!briefingData?.briefing

  useEffect(() => {
    fetch(`/api/admin/stores/${storeId}/activity?limit=5`)
      .then((r) => r.json())
      .then((j) => setActivities((j.data?.items ?? j.items ?? []) as Activity[]))
      .catch(() => setActivities([]))
    fetch(`/api/admin/stores/${storeId}/events?upcoming=true`)
      .then((r) => r.json())
      .then((j) => setEvents((j.data?.events ?? j.events ?? []) as CsEvent[]))
      .catch(() => setEvents([]))
  }, [storeId])

  const connectedCount = INTEGRATIONS.filter((i) => status[i.key]?.connected).length
  const totalIntegrations = INTEGRATIONS.length

  // Alertas derivados de estado real
  const alerts: Array<{ kind: "warn" | "info"; title: string; detail: string; ctaLabel: string; href: string }> = []
  if (!status.shopify?.connected) {
    alerts.push({
      kind: "info",
      title: "Shopify não conectado",
      detail: "Sem Shopify a receita total da loja não é capturada. Conecte para destravar atribuição completa.",
      ctaLabel: "Conectar",
      href: `/admin/stores/${storeId}?tab=setup`,
    })
  }
  if (!status.klaviyo?.connected && !status.omnisend?.connected) {
    alerts.push({
      kind: "warn",
      title: "Sem plataforma de email",
      detail: "Conecte Klaviyo ou Omnisend para Performance e Relatório funcionarem.",
      ctaLabel: "Conectar email",
      href: `/admin/stores/${storeId}?tab=setup`,
    })
  }
  if (!hasBriefing) {
    alerts.push({
      kind: "info",
      title: "Briefing não gerado",
      detail: "Preencha o formulário de onboarding para gerar o briefing automaticamente.",
      ctaLabel: "Abrir briefing",
      href: `/admin/stores/${storeId}?tab=contexto#briefing-completo`,
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
      {/* MAIN */}
      <div className="flex flex-col gap-4">
        {/* Alertas */}
        <Card title="Alertas" subtitle="Itens que merecem ação agora">
          {alerts.length === 0 ? (
            <div className="py-4 text-center text-[12px] text-slate-400 italic">
              Sem alertas no momento
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {alerts.map((a, i) => (
                <AlertRow key={i} {...a} />
              ))}
            </div>
          )}
        </Card>

        {/* Performance snapshot — direciona pra aba Performance */}
        <Card
          title="Performance · últimos 30 dias"
          linkLabel="Ver Performance →"
          linkHref={`/admin/stores/${storeId}?tab=performance`}
        >
          <p className="text-[12px] text-slate-500">
            KPIs detalhados de receita atribuída, campanhas e flows estão na aba Performance.
          </p>
        </Card>

        {/* Atividade recente */}
        <Card
          title="Atividade recente"
          subtitle="Últimos eventos relevantes da loja"
          linkLabel="Abrir Atividade →"
          linkHref={`/admin/stores/${storeId}?tab=atividade`}
        >
          {activities.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-slate-400 italic">
              Nenhuma atividade registrada ainda
            </div>
          ) : (
            <div className="flex flex-col">
              {activities.map((a) => {
                const cfg = KIND_LABELS[a.kind] ?? KIND_LABELS.outro
                return (
                  <div
                    key={a.id}
                    className="flex items-start gap-3 py-2.5 border-b last:border-b-0"
                    style={{ borderColor: "rgba(0,0,0,0.04)" }}
                  >
                    <div
                      className="w-1 h-10 rounded-full mt-0.5 shrink-0"
                      style={{ background: cfg.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{ background: `${cfg.color}1A`, color: cfg.color }}
                        >
                          {cfg.label}
                        </span>
                        <span className="text-[10.5px] text-slate-400 font-mono">
                          {new Date(a.occurred_at).toLocaleDateString("pt-BR")}
                        </span>
                        {a.author?.name && (
                          <span className="text-[10.5px] text-slate-500">· {a.author.name}</span>
                        )}
                      </div>
                      <div className="text-[12.5px] font-medium text-slate-900 leading-tight">
                        {a.title}
                      </div>
                      {a.summary && (
                        <div className="text-[11.5px] text-slate-500 mt-0.5 leading-snug line-clamp-2">
                          {a.summary}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* SIDEBAR */}
      <div className="flex flex-col gap-4">
        {/* Integrações reais */}
        <Card
          title="Integrações"
          subtitle={`${connectedCount} de ${totalIntegrations} configuradas`}
          linkLabel="Setup →"
          linkHref={`/admin/stores/${storeId}?tab=setup`}
        >
          <div className="flex flex-col gap-1.5">
            {INTEGRATIONS.map((i) => {
              const s = status[i.key]
              const isConnected = !!s?.connected
              return (
                <div
                  key={i.key}
                  className="flex items-center justify-between text-[12px] px-2 py-1.5 rounded-md hover:bg-slate-50"
                >
                  <span className="text-slate-700">{i.name}</span>
                  <span
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wider",
                      isConnected ? "text-emerald-600" : "text-slate-400",
                    )}
                  >
                    {isConnected ? "● Conectado" : "Não configurado"}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Próximos eventos */}
        <Card title="Próximos eventos">
          {events.length === 0 ? (
            <div className="py-4 text-center text-[12px] text-slate-400 italic">
              Sem eventos agendados
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {events.slice(0, 4).map((e) => {
                const d = new Date(e.scheduled_at)
                return (
                  <div
                    key={e.id}
                    className="flex items-start gap-2.5 px-2 py-1.5 rounded-md hover:bg-slate-50"
                  >
                    <div className="flex flex-col items-center bg-brand-50 text-brand-700 rounded-md px-2 py-1 min-w-[42px]">
                      <span className="text-[9px] font-bold uppercase tracking-wider">
                        {d.toLocaleDateString("pt-BR", { month: "short" }).slice(0, 3)}
                      </span>
                      <span className="text-[14px] font-bold leading-none tabular-nums">
                        {d.getDate()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-slate-900 leading-tight">
                        {e.title}
                      </div>
                      <div className="text-[10.5px] text-slate-500 font-mono">
                        {d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function Card({
  title, subtitle, children, linkLabel, linkHref,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  linkLabel?: string
  linkHref?: string
}) {
  return (
    <div
      className="bg-white border rounded-[10px] p-4"
      style={{ borderColor: "rgba(0,0,0,0.06)" }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-[13px] font-bold text-slate-900 m-0 leading-tight">{title}</h3>
          {subtitle && (
            <p className="text-[11.5px] text-slate-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        {linkLabel && linkHref && (
          <a href={linkHref} className="text-[11.5px] font-medium text-brand-600 hover:underline inline-flex items-center gap-0.5">
            {linkLabel}
          </a>
        )}
      </div>
      {children}
    </div>
  )
}

function AlertRow({
  kind, title, detail, ctaLabel, href,
}: {
  kind: "warn" | "info"
  title: string
  detail: string
  ctaLabel?: string
  href?: string
}) {
  const cfg =
    kind === "warn"
      ? { bg: "#FFFBEB", border: "#FDE68A", color: "#92400E", icon: AlertTriangle }
      : { bg: "#EFF6FF", border: "#BFDBFE", color: "#1D4ED8", icon: Info }
  const Icon = cfg.icon
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-md border"
      style={{ background: cfg.bg, borderColor: cfg.border }}
    >
      <Icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: cfg.color }} />
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-semibold leading-tight" style={{ color: cfg.color }}>
          {title}
        </div>
        <div className="text-[11.5px] mt-0.5 leading-snug" style={{ color: cfg.color, opacity: 0.85 }}>
          {detail}
        </div>
      </div>
      {ctaLabel && href && (
        <a
          href={href}
          className="text-[11.5px] font-semibold whitespace-nowrap inline-flex items-center gap-1"
          style={{ color: cfg.color }}
        >
          {ctaLabel} <ArrowRight className="h-3 w-3" />
        </a>
      )}
    </div>
  )
}
