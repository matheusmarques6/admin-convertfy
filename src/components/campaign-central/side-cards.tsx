"use client"

import { Zap, Mail, Activity } from "lucide-react"
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

export function TrendsList({ trends }: { trends: CampaignTrend[] }) {
  return (
    <SideCard title="Temas em alta" Icon={Zap}>
      {trends.length === 0 && (
        <div className="py-2.5 text-[12px] text-muted-foreground">
          Nenhuma trend capturada neste ciclo.
        </div>
      )}
      {trends.map((t, i) => (
        <div
          key={t.id}
          className={`flex items-center gap-2.5 py-2.5 ${
            i < trends.length - 1 ? "border-b border-border/50" : ""
          }`}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold text-foreground">{t.title}</div>
            <div className="mt-px text-[11px] text-muted-foreground">
              {[t.tag, t.source].filter(Boolean).join(" · ")}
            </div>
          </div>
          {t.delta_label && (
            <span className="shrink-0 text-[12px] font-bold tabular-nums text-emerald-600">
              {t.delta_label}
            </span>
          )}
        </div>
      ))}
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
