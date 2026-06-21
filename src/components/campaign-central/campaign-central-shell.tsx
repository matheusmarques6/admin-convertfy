"use client"

import { useMemo, useState } from "react"
import { Sparkles, Plus, Loader2, Calendar, Activity, Columns3, History } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useCampaignCentral } from "@/app/admin/campaigns/central/use-campaign-central"
import { useBoard } from "@/app/admin/campaigns/central/use-board"
import { useAutomations } from "@/app/admin/campaigns/central/use-automations"
import { CampaignDetailModal } from "./campaign-detail-modal"
import { NewCampaignModal } from "./new-campaign-modal"
import { CopyPanel } from "./copy-panel"
import { CalendarTab } from "./calendar-tab"
import { PerformanceTab } from "./performance-tab"
import { AutomationsTab } from "./automations-tab"
import { BoardTab } from "./board/board-tab"
import type { CampaignSuggestion } from "@/types/campaign-central"

type TabKey = "fluxo" | "calendario" | "performance" | "automacoes"

const TABS: Array<{ key: TabKey; label: string; Icon: typeof Calendar }> = [
  { key: "fluxo", label: "Fluxo", Icon: Columns3 },
  { key: "calendario", label: "Calendário", Icon: Calendar },
  { key: "performance", label: "Performance", Icon: Activity },
  { key: "automacoes", label: "Histórico", Icon: History },
]

function formatRange(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return null
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-")
    return `${d}/${m}/${y}`
  }
  return `${fmt(start)} – ${fmt(end)}`
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function CampaignCentralShell() {
  const central = useCampaignCentral()
  // O board é a fonte única do fluxo (sugestões + produção, cross-ciclo). O
  // badge da aba "Fluxo" reflete o total de cards reais do board.
  const board = useBoard(true)
  const automations = useAutomations(true)
  const [tab, setTab] = useState<TabKey>("fluxo")
  const [regenerating, setRegenerating] = useState(false)
  const [detailSuggestion, setDetailSuggestion] = useState<CampaignSuggestion | null>(null)
  const [copySuggestion, setCopySuggestion] = useState<CampaignSuggestion | null>(null)
  const [newModalOpen, setNewModalOpen] = useState(false)

  const { cycle, suggestions, counts, isLoading } = central

  const isGenerating = cycle?.status === "generating"

  const tabCounts = useMemo<Record<TabKey, number>>(
    () => ({
      fluxo: board.cards.length,
      calendario: counts.dates_upcoming,
      performance: counts.attention,
      automacoes: automations.count,
    }),
    [counts, board.cards.length, automations.count],
  )

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      await central.regenerate()
    } finally {
      setRegenerating(false)
    }
  }

  const handleCopyPanel = (s: CampaignSuggestion) => {
    setDetailSuggestion(null)
    setCopySuggestion(s)
  }
  const handleOpen = (s: CampaignSuggestion) => setDetailSuggestion(s)

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <div className="mb-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <span>Marketing</span>
          <span className="text-muted-foreground/40">›</span>
          <span className="font-medium text-foreground">Central de Campanhas</span>
        </div>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-2.5">
              <h1 className="text-[24px] font-semibold leading-none tracking-tight text-foreground">
                Central de Campanhas
              </h1>
              {cycle ? (
                <Badge variant="info" showDot>
                  Ciclo {cycle.number}
                </Badge>
              ) : (
                <Badge variant="neutral">Sem ciclo</Badge>
              )}
              {isGenerating && (
                <Badge variant="warning" showDot>
                  Gerando…
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
              {cycle && (
                <>
                  <span className="inline-flex items-center gap-1.5 text-foreground/80">
                    <Calendar size={13} /> {formatRange(cycle.range_start, cycle.range_end)}
                  </span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>Gerado {formatDateTime(cycle.generated_at) ?? "—"}</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>Próxima geração {formatDateTime(cycle.next_run_at) ?? "—"}</span>
                </>
              )}
              {!cycle && !isLoading && <span>Nenhum ciclo gerado ainda.</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              onClick={handleRegenerate}
              disabled={regenerating || isGenerating}
            >
              {regenerating ? (
                <Loader2 size={15} className="mr-1.5 animate-spin" />
              ) : (
                <Sparkles size={15} className="mr-1.5" />
              )}
              Re-gerar
            </Button>
            <Button onClick={() => setNewModalOpen(true)}>
              <Plus size={15} className="mr-1.5" /> Nova campanha
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border">
        {TABS.map((t) => {
          const Icon = t.Icon
          const on = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-[13.5px] transition-colors ${
                on
                  ? "border-foreground font-semibold text-foreground"
                  : "border-transparent font-medium text-muted-foreground hover:text-foreground/80"
              }`}
            >
              <Icon size={16} className={on ? "text-foreground" : "text-muted-foreground/70"} />
              {t.label}
              <span
                className={`inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-bold tabular-nums ${
                  on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                {tabCounts[t.key]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Conteúdo */}
      {isLoading && !cycle ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> Carregando ciclo…
        </div>
      ) : tab === "fluxo" ? (
        <BoardTab onChanged={() => central.mutate()} />
      ) : tab === "calendario" ? (
        <CalendarTab trends={central.trends} onCreate={() => setNewModalOpen(true)} />
      ) : tab === "automacoes" ? (
        <AutomationsTab />
      ) : (
        <PerformanceTab
          suggestions={suggestions}
          onApprove={central.approve}
          onDismiss={central.dismiss}
          onUndo={central.undo}
          onGenerateCopy={handleCopyPanel}
          onOpen={handleOpen}
        />
      )}

      {/* Modais da aba Performance (o board gerencia os seus próprios) */}
      {detailSuggestion && (
        <CampaignDetailModal
          key={detailSuggestion.id}
          suggestion={detailSuggestion}
          onClose={() => setDetailSuggestion(null)}
          onSaveDraft={(draft) => central.updateDraft(detailSuggestion.id, draft, draft.strategy)}
          onApprove={(draft) => central.approve(detailSuggestion.id, draft)}
          onGenerateCopy={() => handleCopyPanel(detailSuggestion)}
        />
      )}
      <NewCampaignModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onCreated={() => {
          central.mutate()
          board.mutate()
        }}
      />
      <CopyPanel
        suggestion={copySuggestion}
        onClose={() => setCopySuggestion(null)}
        onSaved={() => {
          central.mutate()
          board.mutate()
        }}
      />
    </div>
  )
}
