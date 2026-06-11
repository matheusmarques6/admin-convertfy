"use client"

import { Zap, Mail, Activity, AlertTriangle, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { CountryChip } from "./country-chip"
import type { AttentionStore, BenchmarkEmail, CampaignTrend } from "@/types/campaign-central"

function SideCard({
  title,
  Icon,
  children,
}: {
  title: string
  Icon: typeof Zap
  children: React.ReactNode
}) {
  return (
    <div className="mb-4 overflow-hidden rounded-[8px] border border-border bg-card shadow-sm">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon size={16} className="text-muted-foreground" />
        <span className="text-[13px] font-semibold text-foreground">{title}</span>
      </header>
      <div className="px-4 pb-3 pt-1.5">{children}</div>
    </div>
  )
}

const CATEGORY_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  consumo: { label: "Consumo", bg: "bg-emerald-50", text: "text-emerald-700" },
  cultural: { label: "Cultural", bg: "bg-blue-50", text: "text-blue-700" },
  esportivo: { label: "Esportivo", bg: "bg-amber-50", text: "text-amber-700" },
  social: { label: "Social", bg: "bg-purple-50", text: "text-purple-700" },
  viral: { label: "Viral", bg: "bg-pink-50", text: "text-pink-700" },
  outros: { label: "Outros", bg: "bg-muted/40", text: "text-muted-foreground" },
}

const URGENCY_LABEL: Record<string, string> = {
  week: "esta semana",
  month: "este mês",
  quarter: "trimestre",
}

export function TrendsList({ trends }: { trends: CampaignTrend[] }) {
  return (
    <SideCard title="Temas em alta" Icon={Zap}>
      {trends.length === 0 && (
        <div className="py-2.5 text-[12px] text-muted-foreground">
          Nenhuma trend capturada neste ciclo.
        </div>
      )}
      {trends.map((t, i) => {
        const cat = CATEGORY_STYLE[t.category ?? "outros"] ?? CATEGORY_STYLE.outros
        const score = t.commercial_potential ?? 0
        const scoreColor =
          score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-muted-foreground/40"
        const isRisk = t.risk_flag === "high"
        return (
          <div
            key={t.id}
            className={`py-2.5 ${i < trends.length - 1 ? "border-b border-border/50" : ""}`}
          >
            {isRisk && (
              <div
                className="mb-1.5 inline-flex items-center gap-1 rounded-[5px] border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700"
                title={t.risk_reason ?? "Conteúdo sensível detectado"}
              >
                <AlertTriangle size={10} /> Risco · revise antes
              </div>
            )}
            <div className="flex items-center gap-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold text-foreground">
                  {t.title}
                </div>
                <div className="mt-px flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                  <span
                    className={`inline-block rounded-[4px] px-1.5 py-px font-semibold ${cat.bg} ${cat.text}`}
                  >
                    {cat.label}
                  </span>
                  {t.urgency && (
                    <span className="inline-flex items-center gap-0.5">
                      <Clock size={10} /> {URGENCY_LABEL[t.urgency] ?? t.urgency}
                    </span>
                  )}
                  {t.source && <span className="truncate">· {t.source}</span>}
                </div>
              </div>
              {t.delta_label && (
                <span className="shrink-0 text-[12px] font-bold tabular-nums text-emerald-600">
                  {t.delta_label}
                </span>
              )}
            </div>
            {t.commercial_potential != null && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full ${scoreColor}`} style={{ width: `${score}%` }} />
                </div>
                <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {score}/100
                </span>
              </div>
            )}
            {t.campaign_angle && (
              <div className="mt-1.5 text-[11px] leading-snug text-muted-foreground/90">
                {t.campaign_angle}
              </div>
            )}
          </div>
        )
      })}
    </SideCard>
  )
}

export function PerformersList({ performers }: { performers: BenchmarkEmail[] }) {
  return (
    <SideCard title="Emails que estão bombando" Icon={Mail}>
      {performers.length === 0 && (
        <div className="py-2.5 text-[12px] text-muted-foreground">
          Sem benchmark disponível (precisa de campanhas Omnisend com 500+ destinatários nos
          últimos 30 dias).
        </div>
      )}
      {performers.map((p, i) => (
        <div key={i} className={`py-2.5 ${i < performers.length - 1 ? "border-b border-border/50" : ""}`}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-[12.5px] font-semibold text-foreground">
              &quot;{p.subject}&quot;
            </span>
            <span className="shrink-0 text-[13px] font-bold tabular-nums text-primary">
              {p.metric}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {[p.label, p.vertical, p.lift].filter(Boolean).join(" · ")}
          </div>
        </div>
      ))}
    </SideCard>
  )
}

export function AttentionList({
  attention,
  onSeeIdeas,
}: {
  attention: AttentionStore[]
  onSeeIdeas?: () => void
}) {
  const toneVariant: Record<AttentionStore["tone"], "warning" | "negative" | "info"> = {
    warn: "warning",
    neg: "negative",
    purple: "info",
  }
  return (
    <SideCard title="Lojas que precisam de atenção" Icon={Activity}>
      {attention.length === 0 && (
        <div className="py-2.5 text-[12px] text-muted-foreground">
          Nenhuma loja em atenção. 🎉
        </div>
      )}
      {attention.map((a, i) => (
        <div
          key={a.store_id}
          className={`py-3 ${i < attention.length - 1 ? "border-b border-border/50" : ""}`}
        >
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="whitespace-nowrap text-[13px] font-semibold text-foreground">
              {a.store_name}
            </span>
            <CountryChip code={a.country} size="sm" />
            <div className="min-w-2 flex-1" />
            <Badge variant={toneVariant[a.tone]} showDot>
              {a.metric}
            </Badge>
          </div>
          <div className="mb-2 text-[11.5px] text-muted-foreground">
            {[a.vertical, a.sub].filter(Boolean).join(" · ")}
          </div>
          {a.ideas > 0 && (
            <button
              onClick={onSeeIdeas}
              className="inline-flex items-center gap-1.5 rounded-[6px] border border-border bg-card px-2.5 py-1 text-[12px] font-medium text-primary hover:border-primary/40"
            >
              <Zap size={13} /> Ver {a.ideas === 1 ? "1 ideia" : `${a.ideas} ideias`} de campanha
            </button>
          )}
        </div>
      ))}
    </SideCard>
  )
}
