"use client"

import { useMemo } from "react"
import { Loader2, History, ArrowRight, AlertTriangle, User } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useAutomations } from "@/app/admin/campaigns/central/use-automations"
import {
  BOARD_COLUMNS,
  type BoardColumnKey,
} from "@/lib/services/campaign-central/board-mapping"
import type { CampaignAutomationRunView } from "@/types/campaign-automation"

const COLUMN = BOARD_COLUMNS.reduce(
  (acc, c) => {
    acc[c.key] = { label: c.label, color: c.color }
    return acc
  },
  {} as Record<BoardColumnKey, { label: string; color: string }>,
)

function columnLabel(key: string | null): string {
  if (!key) return "—"
  return COLUMN[key as BoardColumnKey]?.label ?? key
}

function columnColor(key: string | null): string {
  if (!key) return "#6B7280"
  return COLUMN[key as BoardColumnKey]?.color ?? "#6B7280"
}

/**
 * Título da campanha a partir da mensagem do registro
 * ('Campanha "X": Copy → Design'). Fallback: a coluna de destino.
 */
function campaignTitle(run: CampaignAutomationRunView): string {
  const m = run.error_message?.match(/^Campanha "(.+?)":/)
  if (m) return m[1]
  return `Movido para "${columnLabel(run.to_column)}"`
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

/** Pílula de coluna (cor da própria coluna do board). */
function ColumnPill({ column }: { column: string | null }) {
  const color = columnColor(column)
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-[5px] border px-1.5 py-0.5 text-[11px] font-medium"
      style={{ borderColor: `${color}40`, color, background: `${color}10` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {columnLabel(column)}
    </span>
  )
}

export function AutomationsTab() {
  const { runs, count, isLoading } = useAutomations(true)

  const summary = useMemo(
    () => `${count} movimentação${count !== 1 ? "es" : ""}`,
    [count],
  )

  return (
    <div className="max-w-[920px]">
      {/* Resumo no topo */}
      <div className="mb-4 flex items-center gap-3 rounded-[6px] border border-border bg-card px-4 py-3">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] bg-muted text-muted-foreground">
          <History size={16} />
        </span>
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-foreground">
            Histórico de movimentações
          </div>
          <div className="text-[12px] text-muted-foreground">
            Registro interno das transições do board ·{" "}
            <span className="tabular-nums">{summary}</span>
          </div>
        </div>
      </div>

      {/* Lista de transições */}
      <div className="overflow-hidden rounded-[6px] border border-border bg-card">
        {isLoading && runs.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-[13px] text-muted-foreground">
            <Loader2 size={15} className="animate-spin" /> Carregando movimentações…
          </div>
        ) : runs.length === 0 ? (
          <div className="px-5 py-12 text-center text-[13px] text-muted-foreground">
            Nenhuma movimentação registrada ainda. Avance um card entre as colunas do board para
            registrar a transição aqui.
          </div>
        ) : (
          <ul>
            {runs.map((run, i) => {
              const failed = run.status === "failed"
              return (
                <li
                  key={run.id}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    i < runs.length - 1 ? "border-b border-border/70" : ""
                  } ${failed ? "bg-[#FEF2F2] dark:bg-[#3B1111]/40" : ""}`}
                >
                  <span
                    className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[6px] text-white"
                    style={{ background: columnColor(run.to_column) }}
                  >
                    {failed ? <AlertTriangle size={15} /> : <ArrowRight size={15} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-foreground/90">
                      {campaignTitle(run)}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <ColumnPill column={run.from_column} />
                      <ArrowRight size={11} className="text-muted-foreground/60" />
                      <ColumnPill column={run.to_column} />
                      <span className="text-muted-foreground/40">·</span>
                      <span className="tabular-nums">{formatTimestamp(run.created_at)}</span>
                      {run.moved_by_name && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="inline-flex items-center gap-1">
                            <User size={11} className="text-muted-foreground/60" />
                            {run.moved_by_name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {failed && (
                    <Badge variant="negative" className="shrink-0">
                      <AlertTriangle size={11} />
                      Falhou
                    </Badge>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
