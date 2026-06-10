"use client"

import { Check, X, Edit3, Mail, Zap, Calendar, Activity, Store, Send, DollarSign, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { CampaignSuggestion } from "@/types/campaign-central"

const TYPE_META: Record<
  string,
  { label: string; tone: "info" | "positive" | "warning" | "neutral"; Icon: typeof Calendar }
> = {
  data: { label: "Data sazonal", tone: "info", Icon: Calendar },
  tema: { label: "Tema em alta", tone: "neutral", Icon: Zap },
  email: { label: "Email campeão", tone: "positive", Icon: Mail },
  performance: { label: "Performance", tone: "warning", Icon: Activity },
  avulsa: { label: "Avulsa", tone: "neutral", Icon: Edit3 },
}

interface Props {
  suggestion: CampaignSuggestion
  busy?: boolean
  onApprove: () => void
  onDismiss: () => void
  onGenerateCopy: () => void
  onOpen: () => void
  onUndo: () => void
}

export function SuggestionCard({
  suggestion: s,
  busy,
  onApprove,
  onDismiss,
  onGenerateCopy,
  onOpen,
  onUndo,
}: Props) {
  const meta = TYPE_META[s.type] ?? TYPE_META.avulsa
  const Icon = meta.Icon
  const approved = s.status === "approved"
  const dismissed = s.status === "dismissed"

  if (dismissed) {
    return (
      <div className="flex items-center justify-between rounded-[6px] border border-dashed border-border bg-muted/40 px-4 py-3">
        <span className="text-[13px] text-muted-foreground">
          <span className="line-through">{s.title}</span> · descartada
        </span>
        <button
          onClick={onUndo}
          className="text-[12.5px] font-semibold text-primary hover:underline"
          disabled={busy}
        >
          Desfazer
        </button>
      </div>
    )
  }

  const confColor =
    (s.confidence ?? 0) >= 85 ? "text-emerald-600" : (s.confidence ?? 0) >= 75 ? "text-primary" : "text-amber-600"

  return (
    <div
      className={`overflow-hidden rounded-[6px] border bg-card shadow-sm ${
        approved ? "border-emerald-300" : "border-border"
      }`}
    >
      {approved && (
        <div className="flex items-center justify-between border-b border-emerald-200 bg-emerald-50 px-4 py-1.5 text-[12px] font-semibold text-emerald-700">
          <span className="inline-flex items-center gap-1.5">
            <Check size={14} /> Aprovada · enviada para produção
          </span>
          <button onClick={onUndo} className="text-emerald-700/80 hover:underline" disabled={busy}>
            Desfazer
          </button>
        </div>
      )}

      <div className="p-4">
        <button onClick={onOpen} className="block w-full text-left">
          <div className="mb-2.5 flex items-center gap-2">
            <Badge variant={meta.tone}>{meta.label}</Badge>
            {s.low_perf && (
              <Badge variant="negative" showDot>
                Loja em baixa performance
              </Badge>
            )}
            <div className="flex-1" />
            <div className="inline-flex items-center gap-1.5">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                Confiança
              </span>
              <span className={`text-[12px] font-bold tabular-nums ${confColor}`}>
                {s.confidence ?? "—"}%
              </span>
            </div>
          </div>

          <div className="mb-3 flex items-start justify-between gap-2.5">
            <span className="text-[16.5px] font-semibold leading-tight tracking-tight text-foreground">
              {s.title}
            </span>
            <span className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[11.5px] font-semibold text-primary">
              Ver detalhes <ChevronRight size={13} />
            </span>
          </div>

          {s.trigger && (
            <div className="mb-3 flex items-start gap-2.5 rounded-[6px] border border-border bg-muted/40 px-3 py-2.5">
              <Icon size={16} className="mt-px shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold text-foreground">{s.trigger.label}</div>
                <div className="mt-px text-[11.5px] text-muted-foreground">{s.trigger.detail}</div>
              </div>
              <span className="shrink-0 rounded border border-border bg-card px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
                {s.trigger.source}
              </span>
            </div>
          )}

          {s.angle && (
            <p className="mb-3.5 text-[13px] leading-relaxed text-muted-foreground">{s.angle}</p>
          )}

          <div className="mb-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Store size={14} />
              <span className="font-medium">{s.target_summary || `${s.targets.length} loja(s)`}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Send size={14} /> {s.channel}
            </span>
            {s.est_revenue && (
              <span className="inline-flex items-center gap-1.5">
                <DollarSign size={14} />
                <span>
                  Impacto estimado{" "}
                  <strong className="font-bold text-emerald-600 tabular-nums">{s.est_revenue}</strong>
                </span>
              </span>
            )}
          </div>
        </button>

        <div className="flex items-center gap-2 border-t border-border/60 pt-3">
          <Button variant="ghost" size="sm" onClick={onDismiss} disabled={busy || approved}>
            <X size={14} className="mr-1" /> Rejeitar
          </Button>
          <div className="flex-1" />
          <Button variant="secondary" size="sm" onClick={onGenerateCopy} disabled={busy}>
            <Edit3 size={14} className="mr-1" /> Gerar copy
          </Button>
          <Button size="sm" onClick={onApprove} disabled={busy || approved}>
            <Check size={14} className="mr-1" /> {approved ? "Aprovada" : "Aprovar"}
          </Button>
        </div>
      </div>
    </div>
  )
}
