"use client"

import { useState } from "react"
import { X, Check, Edit3, Send, Mail, Monitor, Smartphone, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CountryChip } from "./country-chip"
import { EditBlock } from "./email-builder/edit-block"
import { BlockCanvas } from "./email-builder/block-canvas"
import { buildDefaultDraft } from "./email-builder/default-draft"
import type { CampaignSuggestion, EmailDraft } from "@/types/campaign-central"

const TYPE_LABEL: Record<string, { label: string; tone: "info" | "positive" | "warning" | "neutral" }> = {
  data: { label: "Data sazonal", tone: "info" },
  tema: { label: "Tema em alta", tone: "neutral" },
  email: { label: "Email campeão", tone: "positive" },
  performance: { label: "Performance", tone: "warning" },
  avulsa: { label: "Avulsa", tone: "neutral" },
}

interface Props {
  suggestion: CampaignSuggestion
  onClose: () => void
  onSaveDraft: (draft: EmailDraft) => Promise<{ ok: boolean }>
  onApprove: (draft: EmailDraft) => Promise<{ ok: boolean }>
  onGenerateCopy: () => void
}

export function CampaignDetailModal({
  suggestion: s,
  onClose,
  onSaveDraft,
  onApprove,
  onGenerateCopy,
}: Props) {
  const [draft, setDraft] = useState<EmailDraft>(() => s.email_draft ?? buildDefaultDraft(s))
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")
  const [busy, setBusy] = useState<"save" | "approve" | null>(null)
  const mobile = device === "mobile"

  const meta = TYPE_LABEL[s.type] ?? TYPE_LABEL.avulsa

  const handleSave = async () => {
    setBusy("save")
    try {
      await onSaveDraft(draft)
    } finally {
      setBusy(null)
    }
  }

  const handleApprove = async () => {
    setBusy("approve")
    try {
      const result = await onApprove(draft)
      if (result.ok) onClose()
    } finally {
      setBusy(null)
    }
  }

  const metaRow = (label: string, value: React.ReactNode) => (
    <div className="flex items-start justify-between gap-3 border-b border-dashed border-border py-2 text-[12.5px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold text-foreground/90">{value}</span>
    </div>
  )

  const canvas = (
    <BlockCanvas blocks={draft.blocks} mobile={mobile} onChange={(blocks) => setDraft((p) => ({ ...p, blocks }))} />
  )

  return (
    <div
      className="fixed inset-0 z-[100] isolate flex items-center justify-center bg-white/90 p-4 backdrop-blur-md md:p-7 dark:bg-gray-950/90"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex h-[88vh] w-[1080px] max-w-full flex-col overflow-hidden rounded-[10px] border border-border bg-muted/30 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-border bg-card px-5 py-3.5">
          <Badge variant={meta.tone}>{meta.label}</Badge>
          {s.low_perf && (
            <Badge variant="negative" showDot>
              Baixa performance
            </Badge>
          )}
          <span className="truncate text-[16px] font-semibold tracking-tight text-foreground">
            {s.title}
          </span>
          <div className="flex-1" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Confiança
          </span>
          <span
            className={`text-[13px] font-bold tabular-nums ${
              (s.confidence ?? 0) >= 85 ? "text-emerald-600" : "text-primary"
            }`}
          >
            {s.confidence ?? "—"}%
          </span>
          <button onClick={onClose} className="ml-2 rounded p-1 text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Body — duas colunas */}
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[340px_1fr]">
          {/* Esquerda — briefing */}
          <div className="overflow-y-auto border-r border-border bg-card p-5">
            <div className="mb-3 text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
              Por que essa campanha
            </div>
            {s.trigger && (
              <div className="mb-4 flex items-start gap-2.5 rounded-[6px] border border-border bg-muted/40 px-3.5 py-3">
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-foreground">{s.trigger.label}</div>
                  <div className="mt-px text-[11.5px] text-muted-foreground">{s.trigger.detail}</div>
                  <div className="mt-1 text-[10.5px] text-muted-foreground/70">
                    fonte: {s.trigger.source}
                  </div>
                </div>
              </div>
            )}

            <div className="mb-2 flex items-center gap-1.5">
              <span className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
                Estratégia sugerida
              </span>
              <span className="text-[10.5px] text-muted-foreground/70">· editável</span>
            </div>
            <div className="mb-4 rounded-[6px] border border-border p-1">
              <EditBlock
                value={draft.strategy || s.angle || ""}
                onChange={(v) => setDraft((p) => ({ ...p, strategy: v }))}
                placeholder="Descreva a estratégia da campanha"
                className="text-[13px] leading-relaxed text-muted-foreground"
              />
            </div>

            <div className="mb-1 text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
              Resumo
            </div>
            {metaRow("Alvo", s.target_summary || `${s.targets.length} loja(s)`)}
            {metaRow("Canal", s.channel)}
            {s.est_revenue && metaRow("Impacto estimado", s.est_revenue)}
            {s.send_date && metaRow("Envio sugerido", s.send_date.split("-").reverse().join("/"))}
            <div className="flex items-start justify-between gap-3 py-2 text-[12.5px]">
              <span className="text-muted-foreground">Lojas</span>
              <div className="flex flex-wrap justify-end gap-1">
                {s.targets.map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    <CountryChip code={t.country} size="sm" />
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-1 space-y-1">
              {s.targets.map((t, i) => (
                <div key={i} className="truncate text-[12px] text-muted-foreground">
                  · {t.store_name}
                </div>
              ))}
            </div>
          </div>

          {/* Direita — construtor de email */}
          <div className="overflow-y-auto p-5 md:px-7">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Mail size={16} className="text-primary" />
              <span className="text-[13.5px] font-semibold text-foreground">Estrutura do email</span>
              <span className="hidden text-[11.5px] text-muted-foreground/70 lg:inline">
                · arraste para reordenar · clique para editar
              </span>
              <div className="flex-1" />
              <div className="inline-flex gap-0.5 rounded-[6px] bg-muted p-0.5">
                {(
                  [
                    { k: "desktop", label: "Desktop", Icon: Monitor },
                    { k: "mobile", label: "Mobile", Icon: Smartphone },
                  ] as const
                ).map(({ k, label, Icon }) => {
                  const on = device === k
                  return (
                    <button
                      key={k}
                      onClick={() => setDevice(k)}
                      className={`inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-[12px] transition-colors ${
                        on
                          ? "bg-card font-semibold text-foreground shadow-sm"
                          : "font-medium text-muted-foreground"
                      }`}
                    >
                      <Icon size={13} /> {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Meta do email */}
            <div className="mb-4 rounded-[8px] border border-border bg-card p-3.5">
              <div className="mb-1 text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground/70">
                Assunto
              </div>
              <EditBlock
                value={draft.subject}
                onChange={(v) => setDraft((p) => ({ ...p, subject: v }))}
                placeholder="Assunto do email"
                className="mb-2.5 text-[14px] font-semibold text-foreground"
              />
              <div className="mb-1 text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground/70">
                Preview text
              </div>
              <EditBlock
                value={draft.preheader}
                onChange={(v) => setDraft((p) => ({ ...p, preheader: v }))}
                placeholder="Texto de pré-visualização"
                className="text-[12.5px] text-muted-foreground"
              />
            </div>

            {/* Canvas — moldura conforme device */}
            {mobile ? (
              <div className="flex justify-center pb-2">
                <div className="relative w-[372px] rounded-[46px] bg-[#0F1117] px-3 pb-4 pt-3 shadow-2xl">
                  <div className="absolute left-1/2 top-3 z-10 h-[22px] w-[118px] -translate-x-1/2 rounded-b-2xl bg-[#0F1117]" />
                  <div className="overflow-hidden rounded-[34px] bg-card">
                    <div className="flex h-9 items-center justify-between px-5 text-[11.5px] font-bold tabular-nums text-foreground/80">
                      <span>9:41</span>
                      <span className="inline-flex items-end gap-0.5">
                        <span className="h-1.5 w-[3px] rounded-sm bg-foreground/70" />
                        <span className="h-2 w-[3px] rounded-sm bg-foreground/70" />
                        <span className="h-2.5 w-[3px] rounded-sm bg-foreground/70" />
                      </span>
                    </div>
                    <div className="max-h-[480px] overflow-y-auto">{canvas}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mx-auto w-[560px] max-w-full overflow-hidden rounded-[10px] border border-border bg-card shadow-sm">
                {canvas}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-t border-border bg-card px-5 py-3.5">
          <span className="text-[12px] text-muted-foreground">
            {draft.blocks.length} blocos · edições salvas como rascunho deste ciclo.
          </span>
          <div className="flex-1" />
          <Button variant="secondary" size="md" onClick={onGenerateCopy}>
            <Edit3 size={14} className="mr-1.5" /> Gerar copy com IA
          </Button>
          <Button variant="secondary" size="md" onClick={handleSave} disabled={busy !== null}>
            {busy === "save" ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Check size={14} className="mr-1.5" />
            )}
            Salvar rascunho
          </Button>
          <Button size="md" onClick={handleApprove} disabled={busy !== null || s.status === "approved"}>
            {busy === "approve" ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Send size={14} className="mr-1.5" />
            )}
            {s.status === "approved" ? "Aprovada" : "Salvar e aprovar"}
          </Button>
        </div>
      </div>
    </div>
  )
}
