"use client"

/**
 * Aba Visão Geral — Alertas + Performance snapshot + Atividade recente
 * Sidebar: Saúde detalhada + Próximos eventos + Integrações.
 */

import { useEffect, useState } from "react"
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

const KIND_LABELS: Record<string, { label: string; color: string }> = {
  feedback: { label: "Feedback", color: "#4E62D8" },
  teste: { label: "Teste A/B", color: "#A855F7" },
  otim: { label: "Otimização", color: "#F59E0B" },
  entrega: { label: "Entrega", color: "#10B981" },
  integracao: { label: "Integração", color: "#6B7280" },
  call: { label: "Call", color: "#3B82F6" },
  outro: { label: "Outro", color: "#9CA3AF" },
}

export function TabVisao({ storeId }: TabVisaoProps) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [events, setEvents] = useState<CsEvent[]>([])

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
      {/* MAIN */}
      <div className="flex flex-col gap-4">
        {/* Alertas */}
        <Card title="Alertas" subtitle="Itens que merecem ação agora" linkLabel="Ver todos" linkHref={`/admin/stores/${storeId}?tab=atividade`}>
          <div className="flex flex-col gap-2">
            <AlertRow
              kind="warn"
              title="Feedback semanal — agendar"
              detail="Próxima reunião com Bruna em 22/05. Confirme até 19/05."
              ctaLabel="Agendar"
            />
            <AlertRow
              kind="info"
              title="Shopify não conectado"
              detail="A loja está em Omnisend. Conecte o Shopify para destravar Receita atribuída completa."
              ctaLabel="Conectar Shopify"
            />
          </div>
        </Card>

        {/* Performance snapshot */}
        <Card title="Performance · últimos 30 dias">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Kpi label="Receita Convertfy" value="—" sub="vs período anterior" />
            <Kpi label="Email + SMS" value="—" sub="entregues" />
            <Kpi label="Open rate" value="—" sub="vs benchmark" />
            <Kpi label="CTOR" value="—" sub="vs benchmark" />
          </div>
          <div className="h-[120px] rounded-md bg-slate-50 border flex items-center justify-center text-[12px] text-slate-400 italic" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
            Receita atribuída diária — gráfico aparece quando há dados
          </div>
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
        {/* Saúde da loja */}
        <Card title="Saúde da loja">
          <div className="flex items-center gap-3 mb-3">
            <div className="text-[36px] font-bold text-emerald-600 tabular-nums leading-none">
              82
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                SAÚDE
              </div>
              <div className="text-[13px] font-bold text-slate-900">Boa</div>
              <div className="text-[10.5px] text-slate-500">Boa · +4 vs mês passado</div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {[
              { label: "Engajamento de envio", value: 88 },
              { label: "Crescimento de lista", value: 75 },
              { label: "Receita vs meta", value: 92 },
              { label: "Adoção de canal", value: 45, isNeg: true },
              { label: "Setup completo", value: 67 },
            ].map((s) => (
              <div key={s.label}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-600">{s.label}</span>
                  <span
                    className={cn(
                      "font-bold tabular-nums",
                      s.isNeg
                        ? "text-red-600"
                        : s.value >= 75
                          ? "text-emerald-600"
                          : "text-amber-600",
                    )}
                  >
                    {s.value}%
                  </span>
                </div>
                <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${s.value}%`,
                      background: s.isNeg
                        ? "#DC2626"
                        : s.value >= 75
                          ? "#10B981"
                          : "#F59E0B",
                    }}
                  />
                </div>
              </div>
            ))}
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

        {/* Integrações */}
        <Card
          title="Integrações"
          subtitle="3 de 6 configuradas"
          linkLabel="Setup →"
          linkHref={`/admin/stores/${storeId}?tab=setup`}
        >
          <div className="flex flex-col gap-1.5">
            {[
              { name: "Shopify", status: "not_configured" },
              { name: "Klaviyo", status: "not_configured" },
              { name: "Omnisend", status: "connected" },
              { name: "Google Analytics (GA4)", status: "not_configured" },
              { name: "Meta Ads", status: "not_configured" },
              { name: "TikTok Ads", status: "not_configured" },
            ].map((i) => (
              <div
                key={i.name}
                className="flex items-center justify-between text-[12px] px-2 py-1.5 rounded-md hover:bg-slate-50"
              >
                <span className="text-slate-700">{i.name}</span>
                <span
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-wider",
                    i.status === "connected" ? "text-emerald-600" : "text-slate-400",
                  )}
                >
                  {i.status === "connected" ? "● Conectado" : "Não configurado"}
                </span>
              </div>
            ))}
          </div>
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
  kind, title, detail, ctaLabel,
}: {
  kind: "warn" | "info"
  title: string
  detail: string
  ctaLabel?: string
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
      {ctaLabel && (
        <button
          className="text-[11.5px] font-semibold whitespace-nowrap inline-flex items-center gap-1"
          style={{ color: cfg.color }}
        >
          {ctaLabel} <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md bg-slate-50 border px-3 py-2.5" style={{ borderColor: "rgba(0,0,0,0.04)" }}>
      <div className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-[18px] font-bold text-slate-900 tabular-nums leading-none mb-1">{value}</div>
      <div className="text-[10.5px] text-slate-500">{sub}</div>
    </div>
  )
}
