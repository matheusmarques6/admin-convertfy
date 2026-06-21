"use client"

import { useState } from "react"
import { X, Check, Edit3, Send, Mail, Monitor, Smartphone, Loader2, Sparkles, ClipboardPaste, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/lib/hooks/use-toast"
import { CountryChip } from "./country-chip"
import { EditBlock } from "./email-builder/edit-block"
import { BlockCanvas } from "./email-builder/block-canvas"
import { buildDefaultDraft } from "./email-builder/default-draft"
import type { CampaignSuggestion, EmailDraft } from "@/types/campaign-central"

/** Placeholder do briefing (mostra o formato esperado). Espelha o protótipo. */
const BRIEF_PLACEHOLDER = `Ex.:

OBJETIVO
Recuperar clientes inativos sem queimar a base. Foco em reengajar.

TOM GERAL
Próximo e caloroso, com leve urgência. Nada agressivo.

ESTRUTURA (bloco a bloco)
1. Assunto — curiosidade + nome da loja. Máx. 45 caracteres.
2. Abertura — reconhecer a ausência com empatia.
3. Corpo — 1 benefício claro do retorno + prova social curta.
4. Oferta — destaque visual, condição e prazo.
5. CTA — verbo de ação, 1ª pessoa. 1 só CTA.
6. Rodapé — opção de descadastro amigável.

REGRAS
- Sem emoji no assunto.
- Frases curtas.

EVITAR
- Clichês e gatilhos de spam (GRÁTIS!!!, URGENTE).`

/** Gera um modelo inicial de briefing a partir da campanha. */
function buildBriefTemplate(s: CampaignSuggestion): string {
  const storeCount = s.targets.length
  return `OBJETIVO
${s.angle || "Defina o objetivo central desta campanha."}

TOM GERAL
Defina o tom da campanha "${s.title}". Ex.: confiante e direto, alinhado à marca de cada loja.

ESTRUTURA (bloco a bloco)
1. Assunto — gancho principal. Máx. 45 caracteres.
2. Abertura — contexto/gatilho (${s.trigger?.label ?? "—"}).
3. Corpo — benefício central + prova.
4. Oferta — condição e prazo, com destaque.
5. CTA — 1 só, verbo de ação.
6. Rodapé — assinatura da loja.

REGRAS
- Canal: ${s.channel}.
- Adaptar idioma e voz por loja (${storeCount} loja(s)).

EVITAR
- Clichês e gatilhos de spam.`
}

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
  const { toast } = useToast()
  const [draft, setDraft] = useState<EmailDraft>(() => s.email_draft ?? buildDefaultDraft(s))
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")
  const [busy, setBusy] = useState<
    "save" | "approve" | "master_ai" | "master_paste" | "send_date" | "brief" | null
  >(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [sendDate, setSendDate] = useState<string>(s.send_date ?? "")
  // Briefing de estrutura & tom da copy (campo `brief.structure`). Edição
  // local; persiste no blur via update_draft. Re-gerar a copy aplica o brief.
  const [brief, setBrief] = useState<string>(s.brief?.structure ?? "")
  const [briefSaved, setBriefSaved] = useState<boolean>(Boolean(s.brief?.structure))
  const mobile = device === "mobile"

  const saveBrief = async (next: string) => {
    setBusy("brief")
    try {
      const res = await fetch(`/api/admin/campaign-central/suggestions/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_draft",
          brief: next.trim() ? { structure: next } : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      setBriefSaved(Boolean(next.trim()))
      toast({
        title: "Briefing salvo",
        description: "Aplicado na próxima geração de copy (teste e produção).",
      })
    } catch (err) {
      toast({
        title: "Falha ao salvar briefing",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setBusy(null)
    }
  }

  const saveSendDate = async (next: string) => {
    setSendDate(next)
    setBusy("send_date")
    try {
      const res = await fetch(`/api/admin/campaign-central/suggestions/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_draft",
          send_date: next === "" ? null : next,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      toast({
        title: "Data salva",
        description: next ? `Envio agendado para ${next.split("-").reverse().join("/")}.` : "Data removida.",
      })
    } catch (err) {
      toast({
        title: "Falha ao salvar data",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setBusy(null)
    }
  }

  const generateMaster = async () => {
    setBusy("master_ai")
    try {
      const res = await fetch(
        `/api/admin/campaign-central/suggestions/${s.id}/generate-master`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      if (json.draft) {
        setDraft(json.draft as EmailDraft)
        toast({ title: "Copy master gerada", description: "Blocos atualizados pelo agente." })
      }
    } catch (err) {
      toast({
        title: "Falha ao gerar master",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setBusy(null)
    }
  }

  const parsePastedText = async () => {
    if (pasteText.trim().length < 20) {
      toast({ title: "Texto muito curto", description: "Cole pelo menos 20 caracteres." })
      return
    }
    setBusy("master_paste")
    try {
      const res = await fetch(
        `/api/admin/campaign-central/suggestions/${s.id}/parse-master`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raw_text: pasteText }),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      if (json.draft) {
        setDraft(json.draft as EmailDraft)
        setPasteOpen(false)
        setPasteText("")
        toast({ title: "Copy importada", description: "Texto convertido em blocos." })
      }
    } catch (err) {
      toast({
        title: "Falha ao importar texto",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setBusy(null)
    }
  }

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
          <span
            className={`text-[13px] font-bold tabular-nums ${
              (s.confidence ?? 0) >= 85
                ? "text-emerald-600"
                : (s.confidence ?? 0) >= 75
                  ? "text-primary"
                  : "text-amber-600"
            }`}
            title="Confiança da IA"
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

            {/* Estrutura & tom da copy (brief do COO) — espelha o protótipo. */}
            <div className="mb-4 rounded-[6px] border border-border bg-muted/30 p-3">
              <div className="mb-1 flex items-center gap-1.5">
                <Edit3 size={13} className="text-primary" />
                <span className="text-[12.5px] font-semibold text-foreground">
                  Estrutura & tom da copy
                </span>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => {
                    const tpl = buildBriefTemplate(s)
                    setBrief(tpl)
                    void saveBrief(tpl)
                  }}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline disabled:opacity-50"
                  title="Gerar um modelo inicial a partir da campanha"
                >
                  <Wand2 size={12} /> Usar modelo
                </button>
              </div>
              <p className="mb-2 text-[11.5px] leading-snug text-muted-foreground">
                Descreva como a copy deve ser gerada — estrutura por bloco, tom, regras e o que
                evitar. A IA usa isto como guia ao gerar teste e produção.
              </p>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                onBlur={(e) => {
                  if (e.target.value !== (s.brief?.structure ?? "")) void saveBrief(e.target.value)
                }}
                disabled={busy === "brief"}
                rows={9}
                placeholder={BRIEF_PLACEHOLDER}
                className="w-full resize-y rounded-[6px] border border-border bg-card p-2.5 text-[12px] leading-relaxed text-foreground/90 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="mt-1.5 flex items-center justify-between">
                <span
                  className={`inline-flex items-center gap-1 text-[11px] ${
                    briefSaved ? "text-emerald-600" : "text-muted-foreground"
                  }`}
                >
                  {busy === "brief" ? (
                    <>
                      <Loader2 size={11} className="animate-spin" /> Salvando…
                    </>
                  ) : briefSaved ? (
                    <>
                      <Check size={11} /> Briefing salvo · usado na geração
                    </>
                  ) : (
                    "Opcional, mas melhora muito o resultado"
                  )}
                </span>
                <span className="text-[10.5px] tabular-nums text-muted-foreground">
                  {brief.length} caracteres
                </span>
              </div>
            </div>

            <div className="mb-1 text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
              Resumo
            </div>
            {metaRow("Alvo", s.target_summary || `${s.targets.length} loja(s)`)}
            {metaRow("Canal", s.channel)}
            {s.est_revenue && metaRow("Impacto estimado", s.est_revenue)}
            <div className="flex items-center justify-between gap-3 border-b border-dashed border-border py-2 text-[12.5px]">
              <span className="text-muted-foreground">Data de envio</span>
              <input
                type="date"
                value={sendDate}
                onChange={(e) => setSendDate(e.target.value)}
                onBlur={(e) => {
                  if (e.target.value !== (s.send_date ?? "")) saveSendDate(e.target.value)
                }}
                disabled={busy === "send_date"}
                className="rounded-[4px] border border-border bg-card px-2 py-1 text-[12.5px] font-semibold text-foreground/90 focus:border-primary focus:outline-none"
              />
            </div>
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
              <Button
                variant="secondary"
                size="sm"
                onClick={generateMaster}
                disabled={busy !== null}
                title="Gerar copy master com IA a partir do ângulo da campanha"
              >
                {busy === "master_ai" ? (
                  <Loader2 size={13} className="mr-1 animate-spin" />
                ) : (
                  <Sparkles size={13} className="mr-1" />
                )}
                Gerar master
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPasteOpen(true)}
                disabled={busy !== null}
                title="Cole uma copy pronta — a IA converte em blocos"
              >
                <ClipboardPaste size={13} className="mr-1" />
                Colar pronta
              </Button>
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
          <Button
            size="md"
            onClick={handleApprove}
            disabled={busy !== null || s.status === "approved"}
            title="Aprovação requer pelo menos 1 piloto marcado como 'Boa' no painel de copy."
          >
            {busy === "approve" ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Send size={14} className="mr-1.5" />
            )}
            {s.status === "approved" ? "Aprovada" : "Aprovar campanha"}
          </Button>
        </div>
      </div>

      {/* Modal "Colar copy pronta" */}
      {pasteOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-white/90 p-4 backdrop-blur-md dark:bg-gray-950/90"
          onClick={() => !busy && setPasteOpen(false)}
        >
          <div
            className="flex max-h-[80vh] w-[640px] max-w-full flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-3.5">
              <ClipboardPaste size={16} className="text-primary" />
              <span className="text-[14px] font-semibold text-foreground">Colar copy pronta</span>
              <div className="flex-1" />
              <button
                onClick={() => !busy && setPasteOpen(false)}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                disabled={busy !== null}
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <p className="mb-3 text-[12.5px] text-muted-foreground">
                Cole abaixo a copy gerada em outra ferramenta (Claude, ChatGPT, Google Docs…). A IA
                vai reconhecer seções (hero, body, produtos, oferta, CTA) e montar os blocos.
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={`🎯 HERO\nHeadline da campanha\nSubtítulo de apoio\n\n📝 BODY\nCorpo do email...\n\n🛍️ PRODUTOS\nProduto 1 - R$ 199\nProduto 2 - R$ 299\n\n🎁 OFERTA\nFrete grátis acima de R$ 199\n\n🎯 CTA\nVer coleção`}
                className="h-72 w-full resize-none rounded-[6px] border border-border bg-background p-3 font-mono text-[12.5px] leading-relaxed text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                disabled={busy !== null}
              />
              <div className="mt-2 text-right text-[11px] text-muted-foreground">
                {pasteText.length} caracteres
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setPasteOpen(false)}
                disabled={busy !== null}
              >
                Cancelar
              </Button>
              <Button size="md" onClick={parsePastedText} disabled={busy !== null || pasteText.trim().length < 20}>
                {busy === "master_paste" ? (
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                ) : (
                  <Sparkles size={14} className="mr-1.5" />
                )}
                Converter em blocos
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
