"use client"

import { useState, type ReactNode } from "react"
import useSWR from "swr"
import { X, Check, Edit3, Send, Zap, Wand2, Loader2, Search, AlertTriangle, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { UnderlineTabs, UnderlineTabItem } from "@/components/ui/underline-tabs"
import { useToast } from "@/lib/hooks/use-toast"
import { CountryChip } from "./country-chip"
import {
  FilterRow,
  deriveNiches,
  matchStore,
  type LangFilter,
  type RegionFilter,
  type StatusFilter,
} from "./store-filters"
import type {
  CampaignSuggestion,
  CopyResultEntry,
  SuggestionTarget,
} from "@/types/campaign-central"
import { CopyOriginBadge, copyStatusMeta } from "./block-preview"
import { CopyPreviewModal } from "./copy-preview-modal"

/** Pool de lojas da org — mesma forma do /api/stores usada no CopyPanel. */
interface StoreOption {
  id: string
  store_name: string
  country?: string | null
  language?: string | null
  niche?: string | null
  is_active?: boolean
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const LANG_LABEL: Record<string, string> = {
  pt: "Português",
  en: "Inglês",
  es: "Espanhol",
}

function langLabel(language: string | null | undefined): string {
  return LANG_LABEL[(language ?? "pt").slice(0, 2).toLowerCase()] ?? "Português"
}

/** Placeholder do briefing (mostra o formato esperado). Espelha o protótipo.
 *  As seções do EMAIL usam "## NOME" (linha própria) — a normalização do
 *  callback fatia a copy por esses marcadores; o resto (objetivo/tom/regras)
 *  é contexto pra IA e fica sem "##". */
const BRIEF_PLACEHOLDER = `Ex.:

OBJETIVO
Recuperar clientes inativos sem queimar a base. Foco em reengajar.

TOM GERAL
Próximo e caloroso, com leve urgência. Nada agressivo.

REGRAS
- Sem emoji no assunto. Frases curtas.
- Evitar clichês e gatilhos de spam (GRÁTIS!!!, URGENTE).

ESTRUTURA DO EMAIL
Marque cada seção com "## NOME" — a copy volta separada por seção:

## HERO
Abertura: reconhecer a ausência com empatia + gancho do retorno.

## CORPO
1 benefício claro do retorno + prova social curta.

## OFERTA
Condição e prazo, com destaque visual.

## CTA
Verbo de ação, 1ª pessoa. 1 só CTA.

## RODAPÉ
Descadastro amigável + assinatura da loja.`

/** Gera um modelo inicial de briefing a partir da campanha. As seções do email
 *  já vêm marcadas com "## NOME" pra a copy voltar separada por seção. */
function buildBriefTemplate(s: CampaignSuggestion): string {
  const storeCount = s.targets.length
  return `OBJETIVO
${s.angle || "Defina o objetivo central desta campanha."}

TOM GERAL
Defina o tom da campanha "${s.title}". Ex.: confiante e direto, alinhado à marca de cada loja.

REGRAS
- Canal: ${s.channel}. Adaptar idioma e voz por loja (${storeCount} loja(s)).
- Evitar clichês e gatilhos de spam.

ESTRUTURA DO EMAIL
Marque cada seção com "## NOME" — a copy volta separada por seção:

## HERO
Gancho principal + contexto/gatilho (${s.trigger?.label ?? "—"}).

## CORPO
Benefício central + prova.

## OFERTA
Condição e prazo, com destaque.

## CTA
1 só, verbo de ação.

## RODAPÉ
Assinatura da loja.`
}

const TYPE_LABEL: Record<string, { label: string; tone: "info" | "positive" | "warning" | "neutral" }> = {
  data: { label: "Data sazonal", tone: "info" },
  tema: { label: "Tema em alta", tone: "neutral" },
  email: { label: "Email campeão", tone: "positive" },
  performance: { label: "Performance", tone: "warning" },
  avulsa: { label: "Avulsa", tone: "neutral" },
}

const STATUS_LABEL: Record<string, string> = {
  suggested: "Sugestão",
  approved: "Aprovada",
  dismissed: "Descartada",
}

const CHANNEL_OPTIONS = ["Email", "Email + SMS", "SMS", "Push"]

type TabKey = "detalhes" | "lojas" | "copy" | "agenda"
type BusyState = "approve" | "dismiss" | "send_date" | "brief" | "channel" | "targets"

interface Props {
  suggestion: CampaignSuggestion
  onClose: () => void
  /** Revalida o board após edição inline (brief/targets/send_date/channel). */
  onChanged?: () => void
  /** Aprova a campanha (sem draft). O caller revalida e fecha em caso de ok. */
  onApprove: () => Promise<{ ok: boolean; error?: string }>
  /** Rejeita/descarta a sugestão. O caller revalida e fecha em caso de ok. */
  onDismiss: () => Promise<{ ok: boolean }>
  /** Abre o CopyPanel pra gerar copy de teste/produção. */
  onGenerateCopy: () => void
}

export function CampaignDetailModal({
  suggestion: s,
  onClose,
  onChanged,
  onApprove,
  onDismiss,
  onGenerateCopy,
}: Props) {
  const { toast } = useToast()
  const [tab, setTab] = useState<TabKey>("detalhes")
  const [busy, setBusy] = useState<BusyState | null>(null)
  /** Loja cujo pop-up de copy está aberto (empilha acima deste modal). */
  const [previewStoreId, setPreviewStoreId] = useState<string | null>(null)
  const [brief, setBrief] = useState<string>(s.brief?.structure ?? "")
  const [briefSaved, setBriefSaved] = useState<boolean>(Boolean(s.brief?.structure))
  const [sendDate, setSendDate] = useState<string>(s.send_date ?? "")
  const [channel, setChannel] = useState<string>(s.channel)
  const [targets, setTargets] = useState<SuggestionTarget[]>(s.targets)
  const [storeStatus, setStoreStatus] = useState<StatusFilter>("todas")
  const [storeRegion, setStoreRegion] = useState<RegionFilter>("todas")
  const [storeLang, setStoreLang] = useState<LangFilter>("todos")
  const [storeNiche, setStoreNiche] = useState<string>("todos")
  const [storeQuery, setStoreQuery] = useState<string>("")
  /** Loading do botão "Usar como copy master" (parse-master do brief). */
  const [usingStructure, setUsingStructure] = useState(false)

  const meta = TYPE_LABEL[s.type] ?? TYPE_LABEL.avulsa
  const isSuggested = s.status === "suggested"
  // A aba Lojas é editável enquanto a campanha é rascunho (suggested). O
  // servidor revalida contra client_stores e sincroniza target_stores quando
  // já existe pipeline_item (campanhas manuais), pra o board refletir.
  const storesEditable = isSuggested

  const pilotResults = (s.copy_results?.test ?? {}) as Record<string, CopyResultEntry>
  const pilotEntries = Object.entries(pilotResults)
  const approvedPilotCount = pilotEntries.filter(([, c]) => c.quality === "good").length
  const hasPilotGood = approvedPilotCount > 0
  const prodCount = Object.keys(s.copy_results?.production ?? {}).length

  // "Usar como copy master": converte o brief escrito em master (parse-master),
  // sem a IA reescrever. Só faz sentido enquanto não há master e o texto cabe
  // no limite do parser (20..20000 chars).
  const hasMaster = !!s.email_draft?.blocks?.length
  const briefLen = brief.trim().length
  const canUseStructureAsMaster = !hasMaster && briefLen >= 20 && briefLen <= 20_000

  const nameById = new Map(targets.map((t) => [t.store_id, t.store_name]))

  // Pool de lojas — carregado só quando a aba Lojas está aberta e editável.
  const { data: storesData } = useSWR<{ stores: StoreOption[] }>(
    tab === "lojas" && storesEditable ? "/api/stores" : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const pool = storesData?.stores ?? []
  const selectedIds = new Set(targets.map((t) => t.store_id))
  const niches = deriveNiches(pool)
  const storeQ = storeQuery.trim().toLowerCase()
  const filteredPool = pool.filter(
    (o) =>
      matchStore(o, {
        status: storeStatus,
        region: storeRegion,
        lang: storeLang,
        niche: storeNiche,
      }) &&
      (!storeQ || o.store_name.toLowerCase().includes(storeQ)),
  )

  const channelOptions = CHANNEL_OPTIONS.includes(channel)
    ? CHANNEL_OPTIONS
    : [channel, ...CHANNEL_OPTIONS]

  // ── Persistência inline (PATCH update_draft) ───────────────────────────
  const patchDraft = async (
    body: Record<string, unknown>,
    label: BusyState,
  ): Promise<boolean> => {
    setBusy(label)
    try {
      const res = await fetch(`/api/admin/campaign-central/suggestions/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_draft", ...body }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      onChanged?.()
      return true
    } catch (err) {
      toast({
        title: "Falha ao salvar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      })
      return false
    } finally {
      setBusy(null)
    }
  }

  const saveBrief = async (next: string) => {
    const ok = await patchDraft({ brief: next.trim() ? { structure: next } : null }, "brief")
    if (ok) {
      setBriefSaved(Boolean(next.trim()))
      toast({
        title: "Briefing salvo",
        description: "Aplicado na próxima geração de copy (teste e produção).",
      })
    }
  }

  /** Usa o texto da "Estrutura & tom" como copy master direto, via parse-master
   *  (preserva o texto, sem a IA reescrever). Persiste no email_draft e revalida
   *  o board. Mesmo caminho do CopyPanel. */
  const useStructureAsMaster = async () => {
    if (!canUseStructureAsMaster) return
    setUsingStructure(true)
    try {
      const res = await fetch(
        `/api/admin/campaign-central/suggestions/${s.id}/parse-master`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raw_text: brief.trim() }),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      toast({
        title: "Copy master pronta",
        description: "Sua estrutura virou a copy master. Abra a geração de teste pra criar o piloto.",
      })
      onChanged?.()
    } catch (err) {
      toast({
        title: "Falha ao usar a estrutura",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setUsingStructure(false)
    }
  }

  const saveSendDate = async (next: string) => {
    setSendDate(next)
    const ok = await patchDraft({ send_date: next === "" ? null : next }, "send_date")
    if (ok) {
      toast({
        title: "Data salva",
        description: next
          ? `Envio agendado para ${next.split("-").reverse().join("/")}.`
          : "Data removida.",
      })
    }
  }

  const saveChannel = async (next: string) => {
    setChannel(next)
    await patchDraft({ channel: next }, "channel")
  }

  const toggleStore = async (opt: StoreOption) => {
    const has = selectedIds.has(opt.id)
    if (has && targets.length === 1) {
      toast({ title: "Mantenha ao menos 1 loja-alvo", variant: "destructive" })
      return
    }
    const next: SuggestionTarget[] = has
      ? targets.filter((t) => t.store_id !== opt.id)
      : [
          ...targets,
          {
            store_id: opt.id,
            store_name: opt.store_name,
            country: (opt.country ?? "BR").toUpperCase().slice(0, 2),
          },
        ]
    const prev = targets
    setTargets(next) // otimista
    const ok = await patchDraft({ targets: next }, "targets")
    if (!ok) setTargets(prev) // rollback
  }

  /** Marca todas as lojas do filtro atual (1 PATCH com o array completo). */
  const markAllFiltered = async () => {
    const ids = new Set(targets.map((t) => t.store_id))
    const additions: SuggestionTarget[] = filteredPool
      .filter((o) => !ids.has(o.id))
      .map((o) => ({
        store_id: o.id,
        store_name: o.store_name,
        country: (o.country ?? "BR").toUpperCase().slice(0, 2),
      }))
    if (additions.length === 0) return
    const next = [...targets, ...additions]
    const prev = targets
    setTargets(next)
    const ok = await patchDraft({ targets: next }, "targets")
    if (!ok) setTargets(prev)
  }

  /** Remove do alvo as lojas do filtro atual (mantém o mínimo de 1). */
  const clearFiltered = async () => {
    const filteredIds = new Set(filteredPool.map((o) => o.id))
    const next = targets.filter((t) => !filteredIds.has(t.store_id))
    if (next.length === targets.length) return // nenhuma filtrada estava marcada
    if (next.length === 0) {
      toast({ title: "Mantenha ao menos 1 loja-alvo", variant: "destructive" })
      return
    }
    const prev = targets
    setTargets(next)
    const ok = await patchDraft({ targets: next }, "targets")
    if (!ok) setTargets(prev)
  }

  // ── Ações do footer (o caller revalida e fecha em caso de ok) ──────────
  const handleApprove = async () => {
    setBusy("approve")
    try {
      const res = await onApprove()
      if (!res.ok && res.error) {
        toast({
          title: "Não foi possível aprovar",
          description: res.error,
          variant: "destructive",
        })
      }
    } finally {
      setBusy(null)
    }
  }

  const handleDismiss = async () => {
    setBusy("dismiss")
    try {
      await onDismiss()
    } finally {
      setBusy(null)
    }
  }

  const metricCard = (label: string, value: ReactNode, positive?: boolean) => (
    <div className="rounded-[6px] border border-border bg-card px-3 py-2.5">
      <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`text-[13px] font-semibold ${
          positive ? "tabular-nums text-emerald-600" : "text-foreground/90"
        }`}
      >
        {value}
      </div>
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-white/90 p-4 backdrop-blur-md md:p-7 dark:bg-gray-950/90"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[calc(100vh-48px)] w-[620px] max-w-full flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 px-5 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <Badge variant={meta.tone}>{meta.label}</Badge>
                {s.low_perf && (
                  <Badge variant="negative" showDot>
                    Baixa performance
                  </Badge>
                )}
                <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
                  <span className="size-1.5 rounded-[2px] bg-muted-foreground" />
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
                {s.confidence != null && (
                  <span
                    className="text-[11.5px] font-semibold tabular-nums text-muted-foreground"
                    title="Confiança da IA"
                  >
                    · {s.confidence}% confiança
                  </span>
                )}
              </div>
              <div className="text-[18px] font-semibold tracking-tight text-foreground">
                {s.title}
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X size={18} />
            </button>
          </div>

          <UnderlineTabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="mt-3.5">
            <UnderlineTabItem value="detalhes" className="min-h-[36px] px-3 text-[12.5px]">
              Detalhes
            </UnderlineTabItem>
            <UnderlineTabItem value="lojas" className="min-h-[36px] px-3 text-[12.5px]">
              Lojas ({targets.length})
            </UnderlineTabItem>
            <UnderlineTabItem value="copy" className="min-h-[36px] px-3 text-[12.5px]">
              Copy
            </UnderlineTabItem>
            <UnderlineTabItem value="agenda" className="min-h-[36px] px-3 text-[12.5px]">
              Agendamento
            </UnderlineTabItem>
          </UnderlineTabs>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-5">
          {/* DETALHES */}
          {tab === "detalhes" && (
            <div>
              {s.trigger && (
                <div className="mb-3.5 flex items-start gap-2.5 rounded-[6px] border border-border bg-card px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold text-foreground">
                      {s.trigger.label}
                    </div>
                    <div className="mt-px text-[11.5px] text-muted-foreground">
                      {s.trigger.detail}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-[4px] border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {s.trigger.source}
                  </span>
                </div>
              )}
              <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                Ângulo da campanha
              </div>
              <div className="mb-4 text-[13px] leading-relaxed text-foreground/80">
                {s.angle || "—"}
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div className="col-span-3 rounded-[6px] border border-border bg-card px-3 py-2.5">
                  <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                    Assunto
                  </div>
                  <div className="text-[13px] font-semibold text-foreground/90">
                    {s.subject ? `"${s.subject}"` : "—"}
                  </div>
                </div>
                {metricCard("Canal", channel)}
                {metricCard("Impacto estimado", s.est_revenue || "—", true)}
                {metricCard("Confiança IA", s.confidence != null ? `${s.confidence}%` : "—")}
              </div>
            </div>
          )}

          {/* LOJAS */}
          {tab === "lojas" && (
            <div>
              {storesEditable ? (
                <>
                  {/* Busca por nome */}
                  <div className="relative mb-2.5">
                    <Search
                      size={14}
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                      type="text"
                      value={storeQuery}
                      onChange={(e) => setStoreQuery(e.target.value)}
                      placeholder="Buscar loja por nome…"
                      className="w-full rounded-[6px] border border-border bg-card py-1.5 pl-8 pr-2.5 text-[12.5px] text-foreground/90 focus:border-primary focus:outline-none"
                    />
                  </div>

                  {/* Filtros */}
                  <FilterRow
                    label="Status"
                    value={storeStatus}
                    onPick={(k) => setStoreStatus(k as StatusFilter)}
                    options={[
                      { k: "todas", label: "Todas" },
                      { k: "ativas", label: "Ativas" },
                      { k: "inativas", label: "Inativas" },
                    ]}
                  />
                  <FilterRow
                    label="Região"
                    value={storeRegion}
                    onPick={(k) => setStoreRegion(k as RegionFilter)}
                    options={[
                      { k: "todas", label: "Todas" },
                      { k: "BR", label: "Brasil" },
                      { k: "EU", label: "Europa" },
                      { k: "US", label: "EUA" },
                    ]}
                  />
                  <FilterRow
                    label="Idioma"
                    value={storeLang}
                    onPick={(k) => setStoreLang(k as LangFilter)}
                    options={[
                      { k: "todos", label: "Todos" },
                      { k: "pt", label: "Português" },
                      { k: "en", label: "Inglês" },
                      { k: "es", label: "Espanhol" },
                    ]}
                  />
                  {niches.length > 0 && (
                    <div className="mb-2.5">
                      <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Nicho
                      </div>
                      <select
                        value={storeNiche}
                        onChange={(e) => setStoreNiche(e.target.value)}
                        className="w-full rounded-[6px] border border-border bg-card px-2.5 py-1.5 text-[12.5px] font-medium text-foreground focus:border-primary focus:outline-none"
                      >
                        <option value="todos">Todos os nichos</option>
                        {niches.map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Contador + ações em massa */}
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {filteredPool.length} de {pool.length} ·{" "}
                      <span className="text-foreground">{targets.length}</span> selecionada
                      {targets.length !== 1 ? "s" : ""}
                    </span>
                    <span className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => void markAllFiltered()}
                        disabled={busy === "targets" || filteredPool.length === 0}
                        className="text-[11.5px] font-semibold text-primary hover:underline disabled:opacity-40"
                      >
                        Marcar todas
                      </button>
                      <button
                        type="button"
                        onClick={() => void clearFiltered()}
                        disabled={busy === "targets"}
                        className="text-[11.5px] font-semibold text-primary hover:underline disabled:opacity-40"
                      >
                        Limpar
                      </button>
                    </span>
                  </div>

                  {/* Lista filtrada */}
                  <div className="max-h-[300px] overflow-y-auto rounded-[6px] border border-border bg-card">
                    {pool.length === 0 ? (
                      <div className="flex items-center gap-2 px-3 py-6 text-[12px] text-muted-foreground">
                        <Loader2 size={14} className="animate-spin" /> Carregando lojas…
                      </div>
                    ) : filteredPool.length === 0 ? (
                      <div className="px-3.5 py-6 text-center text-[12px] text-muted-foreground">
                        Nenhuma loja com esses filtros.
                      </div>
                    ) : (
                      filteredPool.map((opt, i) => {
                        const on = selectedIds.has(opt.id)
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => void toggleStore(opt)}
                            disabled={busy === "targets"}
                            className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                              i < filteredPool.length - 1 ? "border-b border-border" : ""
                            } ${on ? "bg-primary/5" : "hover:bg-muted/40"}`}
                          >
                            <span
                              className={`flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border ${
                                on
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-muted-foreground/30 bg-card"
                              }`}
                            >
                              {on && <Check size={11} />}
                            </span>
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-[5px] bg-muted text-[11px] font-bold uppercase text-muted-foreground">
                              {(opt.store_name || "?").slice(0, 1)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12.5px] font-semibold text-foreground">
                                {opt.store_name}
                              </span>
                              <span className="block text-[11px] text-muted-foreground">
                                {(opt.country ?? "—").toUpperCase()} · {langLabel(opt.language)}
                              </span>
                            </span>
                            {opt.is_active === false && <Badge variant="neutral">inativa</Badge>}
                          </button>
                        )
                      })
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                    Lojas-alvo
                  </div>
                  <div className="mb-3 rounded-[6px] border border-border bg-muted/40 px-3 py-2 text-[11.5px] text-muted-foreground">
                    As lojas-alvo ficam fixas após a aprovação da campanha.
                  </div>
                  <div className="overflow-hidden rounded-[6px] border border-border bg-card">
                    {targets.map((t, i) => (
                      <div
                        key={t.store_id}
                        className={`flex items-center gap-2.5 px-3 py-2.5 ${
                          i < targets.length - 1 ? "border-b border-border" : ""
                        }`}
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-[5px] bg-muted text-[11px] font-bold uppercase text-muted-foreground">
                          {(t.store_name || "?").slice(0, 1)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-foreground">
                          {t.store_name}
                        </span>
                        <CountryChip code={t.country} size="sm" />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* COPY */}
          {tab === "copy" && (
            <div className="flex flex-col gap-3">
              {/* Estrutura & tom da copy (brief do COO) */}
              <div className="rounded-[6px] border border-border bg-card p-3.5">
                <div className="mb-1 flex items-center gap-2">
                  <Edit3 size={14} className="text-primary" />
                  <span className="text-[13px] font-semibold text-foreground">
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
                    className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline disabled:opacity-50"
                    title="Gerar um modelo inicial a partir da campanha"
                  >
                    <Wand2 size={12} /> Usar modelo
                  </button>
                </div>
                <p className="mb-2.5 text-[11.5px] leading-snug text-muted-foreground">
                  Descreva objetivo, tom e regras. Marque cada seção do email com{" "}
                  <span className="rounded bg-muted px-1 font-mono text-[10.5px] text-foreground/80">
                    ## HERO
                  </span>
                  ,{" "}
                  <span className="rounded bg-muted px-1 font-mono text-[10.5px] text-foreground/80">
                    ## REVIEW
                  </span>
                  … pra a copy chegar <strong className="font-semibold">separada por seção</strong>{" "}
                  pros designers.
                </p>
                <textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  onBlur={(e) => {
                    if (e.target.value !== (s.brief?.structure ?? "")) void saveBrief(e.target.value)
                  }}
                  disabled={busy === "brief"}
                  rows={10}
                  placeholder={BRIEF_PLACEHOLDER}
                  className="w-full resize-y rounded-[6px] border border-border bg-muted/30 p-2.5 text-[12.5px] leading-relaxed text-foreground/90 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                {canUseStructureAsMaster && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={useStructureAsMaster}
                    disabled={usingStructure || busy !== null}
                    className="mt-2.5 w-full"
                  >
                    {usingStructure ? (
                      <Loader2 size={13} className="mr-1.5 animate-spin" />
                    ) : (
                      <Check size={13} className="mr-1.5" />
                    )}
                    {usingStructure ? "Usando sua estrutura…" : "Usar como copy master"}
                  </Button>
                )}
              </div>

              {/* Copy de teste · por loja */}
              <div className="rounded-[6px] border border-border bg-card p-3.5">
                <div className="mb-1.5 flex items-center gap-2">
                  <Edit3 size={14} className="text-primary" />
                  <span className="text-[13px] font-semibold text-foreground">
                    Copy de teste · por loja
                  </span>
                  {pilotEntries.length > 0 && (
                    <Badge variant="positive" showDot>
                      gerada
                    </Badge>
                  )}
                </div>
                <p className="mb-2.5 text-[11.5px] leading-snug text-muted-foreground">
                  Gere a copy real de cada loja selecionada e avalie a qualidade antes de soltar pra
                  todas.
                </p>
                <Button variant="secondary" size="sm" onClick={onGenerateCopy}>
                  <Zap size={13} className="mr-1.5" />
                  {pilotEntries.length > 0 ? "Reabrir geração de teste" : "Abrir geração de teste"}
                </Button>

                {pilotEntries.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                        Copies geradas
                      </span>
                      <span className="text-[11px] font-semibold tabular-nums text-emerald-600">
                        {approvedPilotCount}/{pilotEntries.length} aprovadas
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {pilotEntries.map(([storeId, cp]) => {
                        const meta = copyStatusMeta(cp)
                        const good = meta.kind === "approved"
                        const pending = meta.kind === "pending"
                        const error = meta.kind === "error"
                        return (
                          <button
                            key={storeId}
                            type="button"
                            onClick={() => setPreviewStoreId(storeId)}
                            className={`group w-full overflow-hidden rounded-[6px] border text-left transition-colors hover:border-primary/50 ${
                              good
                                ? "border-emerald-300 dark:border-emerald-800"
                                : error
                                ? "border-red-300 dark:border-red-900"
                                : pending
                                ? "border-primary/40"
                                : "border-border"
                            }`}
                          >
                            <div
                              className={`flex items-center gap-2 border-b border-border px-2.5 py-1.5 ${
                                good
                                  ? "bg-emerald-50 dark:bg-emerald-950/30"
                                  : error
                                  ? "bg-red-50 dark:bg-red-950/30"
                                  : pending
                                  ? "bg-primary/5"
                                  : "bg-muted/30"
                              }`}
                            >
                              <span className="truncate text-[12px] font-semibold text-foreground">
                                {nameById.get(storeId) ?? "Loja"}
                              </span>
                              <div className="flex-1" />
                              {pending ? (
                                <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-primary">
                                  <Loader2 size={11} className="animate-spin" /> {meta.label}
                                </span>
                              ) : error ? (
                                <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-red-600">
                                  <AlertTriangle size={11} /> {meta.label}
                                </span>
                              ) : good ? (
                                <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald-600">
                                  <Check size={11} /> {meta.label}
                                </span>
                              ) : (
                                <span className="text-[10.5px] text-muted-foreground">
                                  {meta.label}
                                </span>
                              )}
                            </div>
                            <div className="px-2.5 py-2">
                              <div className="mb-0.5 flex items-center gap-1.5">
                                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-foreground">
                                  {cp.subject || "—"}
                                </span>
                                <span className="inline-flex shrink-0 items-center gap-0.5 text-[10.5px] font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                                  <Eye size={11} /> ver
                                </span>
                              </div>
                              <div className="line-clamp-1 text-[11.5px] leading-snug text-muted-foreground">
                                {cp.preheader ?? cp.preview}
                              </div>
                              {cp.generated_via && (
                                <div className="mt-1.5">
                                  <CopyOriginBadge entry={cp} />
                                </div>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Copy de produção */}
              <div className="rounded-[6px] border border-border bg-card p-3.5">
                <div className="mb-1.5 flex items-center gap-2">
                  <Check size={14} className="text-emerald-600" />
                  <span className="text-[13px] font-semibold text-foreground">Copy de produção</span>
                  {prodCount > 0 && (
                    <Badge variant="positive" showDot>
                      pronta
                    </Badge>
                  )}
                </div>
                <p className="mb-2.5 text-[11.5px] leading-snug text-muted-foreground">
                  Versão final aplicada às {targets.length} loja(s) da campanha.
                </p>
                <Button size="sm" onClick={onGenerateCopy}>
                  <Zap size={13} className="mr-1.5" /> Gerar copy de produção
                </Button>
              </div>
            </div>
          )}

          {/* AGENDAMENTO */}
          {tab === "agenda" && (
            <div className="flex flex-col gap-3.5">
              <div className="flex flex-wrap gap-3">
                <div className="min-w-[180px] flex-1">
                  <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                    Data de envio
                  </div>
                  <input
                    type="date"
                    value={sendDate}
                    onChange={(e) => setSendDate(e.target.value)}
                    onBlur={(e) => {
                      if (e.target.value !== (s.send_date ?? "")) void saveSendDate(e.target.value)
                    }}
                    disabled={busy === "send_date"}
                    className="w-full cursor-pointer rounded-[6px] border border-border bg-card px-3 py-2 text-[13px] text-foreground/90 focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="w-[200px]">
                  <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                    Canal
                  </div>
                  <select
                    value={channel}
                    onChange={(e) => void saveChannel(e.target.value)}
                    disabled={busy === "channel"}
                    className="w-full cursor-pointer rounded-[6px] border border-border bg-card px-3 py-2 text-[13px] text-foreground/90 focus:border-primary focus:outline-none"
                  >
                    {channelOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-[6px] border border-sky-200 bg-sky-50 px-3.5 py-3 text-[12px] leading-snug text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
                <Send size={14} className="mt-px shrink-0" />
                <span>
                  Ao mover o card para <strong>Agendada</strong>, o envio é criado na Omnisend para
                  esta data e canal automaticamente.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-2.5 border-t border-border bg-card px-5 py-3">
          {isSuggested ? (
            <>
              <Button
                variant="ghost"
                size="md"
                onClick={() => void handleDismiss()}
                disabled={busy !== null}
                className="text-muted-foreground"
              >
                {busy === "dismiss" ? (
                  <Loader2 size={15} className="mr-1.5 animate-spin" />
                ) : (
                  <X size={15} className="mr-1.5" />
                )}
                Rejeitar
              </Button>
              <div className="flex-1" />
              <Button variant="secondary" size="md" onClick={onGenerateCopy} disabled={busy !== null}>
                <Edit3 size={14} className="mr-1.5" /> Gerar copy
              </Button>
              <Button
                size="md"
                onClick={() => void handleApprove()}
                disabled={busy !== null || !hasPilotGood}
                title={
                  hasPilotGood
                    ? "Aprovar campanha"
                    : "Aprovação requer ao menos 1 piloto marcado como 'Boa' no painel de copy."
                }
              >
                {busy === "approve" ? (
                  <Loader2 size={15} className="mr-1.5 animate-spin" />
                ) : (
                  <Check size={15} className="mr-1.5" />
                )}
                Aprovar
              </Button>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-600">
                <Check size={15} />
                {s.status === "approved" ? "Campanha aprovada" : "Campanha descartada"}
              </span>
              <div className="flex-1" />
              <Button variant="secondary" size="md" onClick={onGenerateCopy} disabled={busy !== null}>
                <Edit3 size={14} className="mr-1.5" /> Gerar copy
              </Button>
            </>
          )}
        </div>
      </div>
      <CopyPreviewModal
        entry={previewStoreId ? (pilotResults[previewStoreId] ?? null) : null}
        storeName={previewStoreId ? (nameById.get(previewStoreId) ?? "Loja") : ""}
        onClose={() => setPreviewStoreId(null)}
      />
    </div>
  )
}
