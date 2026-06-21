"use client"

import { useMemo } from "react"
import {
  Loader2,
  Zap,
  ListChecks,
  MessageSquare,
  Mail,
  BarChart3,
  Check,
  AlertTriangle,
  Clock,
  CircleSlash,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useAutomations } from "@/app/admin/campaigns/central/use-automations"
import {
  BOARD_COLUMNS,
  type BoardColumnKey,
} from "@/lib/services/campaign-central/board-mapping"
import type {
  AutomationIntegration,
  AutomationRunStatus,
  CampaignAutomationRun,
} from "@/types/campaign-automation"

/** Metadados de apresentação por integração (cards do topo + ícone do log). */
const INTEGRATIONS: Array<{
  key: AutomationIntegration
  label: string
  verb: string
  /** Cor do "chip" do ícone (não-brand; segue o protótipo). */
  color: string
  Icon: LucideIcon
}> = [
  { key: "clickup", label: "ClickUp", verb: "Cria task na aprovação", color: "#7B68EE", Icon: ListChecks },
  { key: "slack", label: "Slack", verb: "Notifica fila de design", color: "#4A154B", Icon: MessageSquare },
  { key: "omnisend", label: "Omnisend", verb: "Agenda o envio", color: "#2A9D8F", Icon: Mail },
  { key: "ga", label: "Google Analytics", verb: "Registra o envio", color: "#E8710A", Icon: BarChart3 },
]

const INTEGRATION_BY_KEY = new Map(INTEGRATIONS.map((i) => [i.key, i]))

const COLUMN_LABEL: Record<BoardColumnKey, string> = BOARD_COLUMNS.reduce(
  (acc, c) => {
    acc[c.key] = c.label
    return acc
  },
  {} as Record<BoardColumnKey, string>,
)

function columnLabel(key: string | null): string {
  if (!key) return "—"
  return COLUMN_LABEL[key as BoardColumnKey] ?? key
}

/** Mensagem humana da run pro log. */
function runMessage(run: CampaignAutomationRun): string {
  const meta = INTEGRATION_BY_KEY.get(run.integration)
  const verb = meta?.verb ?? "Disparo de automação"
  const to = columnLabel(run.to_column)
  return `${verb} — card movido para "${to}"`
}

const STATUS_META: Record<
  AutomationRunStatus,
  { label: string; variant: "positive" | "negative" | "warning" | "neutral" | "info"; Icon: LucideIcon }
> = {
  stub: { label: "Simulado", variant: "info", Icon: Zap },
  success: { label: "200 OK", variant: "positive", Icon: Check },
  failed: { label: "Falhou", variant: "negative", Icon: AlertTriangle },
  pending: { label: "Pendente", variant: "warning", Icon: Clock },
  skipped: { label: "Ignorado", variant: "neutral", Icon: CircleSlash },
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function AutomationsTab() {
  const { runs, counts, isLoading } = useAutomations(true)

  const totalLabel = useMemo(
    () => `${runs.length} evento${runs.length !== 1 ? "s" : ""}`,
    [runs.length],
  )

  return (
    <div className="max-w-[920px]">
      {/* Cards de integração com contador */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {INTEGRATIONS.map((it) => {
          const Icon = it.Icon
          return (
            <div
              key={it.key}
              className="rounded-[8px] border border-border bg-card px-4 py-3.5 shadow-sm"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-white"
                  style={{ background: it.color }}
                >
                  <Icon size={15} />
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-foreground">{it.label}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{it.verb}</div>
                </div>
              </div>
              <div className="mt-2.5 flex items-baseline gap-1.5">
                <span className="text-[20px] font-bold tabular-nums text-foreground">
                  {counts[it.key] ?? 0}
                </span>
                <span className="text-[11.5px] text-muted-foreground">disparos</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Histórico */}
      <div className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-[13.5px] font-semibold text-foreground">
            Histórico de automações
          </span>
          <span className="text-[12px] tabular-nums text-muted-foreground">{totalLabel}</span>
        </div>

        {isLoading && runs.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-[13px] text-muted-foreground">
            <Loader2 size={15} className="animate-spin" /> Carregando automações…
          </div>
        ) : runs.length === 0 ? (
          <div className="px-5 py-12 text-center text-[13px] text-muted-foreground">
            Nenhuma automação disparada ainda. Avance um card entre as colunas para acionar as
            integrações.
          </div>
        ) : (
          <ul>
            {runs.map((run, i) => {
              const meta = INTEGRATION_BY_KEY.get(run.integration)
              const Icon = meta?.Icon ?? Zap
              const status = STATUS_META[run.status] ?? STATUS_META.stub
              const StatusIcon = status.Icon
              const failed = run.status === "failed"
              return (
                <li
                  key={run.id}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    i < runs.length - 1 ? "border-b border-border/70" : ""
                  } ${failed ? "bg-[#FEF2F2] dark:bg-[#3B1111]/40" : ""}`}
                >
                  <span
                    className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] text-white"
                    style={{ background: meta?.color ?? "#6B7280" }}
                  >
                    <Icon size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-foreground/90">
                      {runMessage(run)}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground/70">
                        {meta?.label ?? run.integration}
                      </span>
                      <span>·</span>
                      <span>
                        {columnLabel(run.from_column)} → {columnLabel(run.to_column)}
                      </span>
                      <span>·</span>
                      <span className="tabular-nums">{formatTimestamp(run.created_at)}</span>
                      {run.error_message && (
                        <>
                          <span>·</span>
                          <span className="text-[#991B1B] dark:text-[#FCA5A5]">
                            {run.error_message}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <Badge variant={status.variant} className="shrink-0">
                    <StatusIcon size={11} />
                    {status.label}
                  </Badge>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
