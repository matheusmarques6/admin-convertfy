"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import {
  X,
  Zap,
  Check,
  Loader2,
  Store,
  Copy as CopyIcon,
  RefreshCw,
  Edit3,
  ChevronDown,
  ChevronRight,
  Send,
  ArrowRight,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/lib/hooks/use-toast"
import type { CampaignSuggestion, CopyResultEntry, EmailDraftBlock } from "@/types/campaign-central"

interface StoreOption {
  id: string
  store_name: string
  country?: string | null
  language?: string | null
  is_active?: boolean
}

const LANG_LABEL: Record<string, string> = {
  pt: "Português",
  en: "Inglês",
  es: "Espanhol",
}

const REGION_OF: Record<string, string> = {
  BR: "BR",
  US: "US",
  PT: "EU",
  UK: "EU",
  ES: "EU",
}

function langKey(language: string | null | undefined): string {
  return (language ?? "pt-BR").slice(0, 2).toLowerCase()
}

function countryKey(country: string | null | undefined): string {
  return (country ?? "BR").toUpperCase().slice(0, 2)
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Props {
  suggestion: CampaignSuggestion | null
  onClose: () => void
  onSaved: () => void
}

type Phase = "pilot" | "rollout"

function copyBlocksToText(entry: CopyResultEntry): string {
  const lines: string[] = []
  lines.push(`Assunto: ${entry.subject}`)
  lines.push(`Preview: ${entry.preheader ?? entry.preview}`)
  lines.push("")
  for (const block of entry.blocks ?? []) {
    switch (block.type) {
      case "heading":
        if (block.headline) lines.push(`# ${block.headline}`)
        if (block.sub) lines.push(block.sub)
        lines.push("")
        break
      case "text":
        if (block.value) lines.push(block.value, "")
        break
      case "image":
        if (block.caption) lines.push(`[Imagem: ${block.caption}]`, "")
        break
      case "offer":
        if (block.value) lines.push(`>> ${block.value}`, "")
        break
      case "button":
        if (block.value) lines.push(`>> [${block.value}]`, "")
        break
      case "divider":
        lines.push("---", "")
        break
      case "footer":
        if (block.value) lines.push(block.value)
        break
      case "products":
        for (const item of block.items ?? []) {
          lines.push(`• ${item.name ?? "Produto"} — ${item.price ?? ""}`)
        }
        lines.push("")
        break
    }
  }
  return lines.join("\n").trim()
}

export function CopyPanel({ suggestion, onClose, onSaved }: Props) {
  const { toast } = useToast()
  const open = !!suggestion

  const [phase, setPhase] = useState<Phase>("pilot")
  const [busy, setBusy] = useState<"generating" | "rollout" | null>(null)
  const [statusFilter, setStatusFilter] = useState<"todas" | "ativas" | "inativas">("ativas")
  const [regionFilter, setRegionFilter] = useState<"todas" | "BR" | "EU" | "US">("todas")
  const [langFilter, setLangFilter] = useState<"todos" | "pt" | "en" | "es">("todos")
  const [selectedPilot, setSelectedPilot] = useState<Set<string>>(new Set())
  const [selectedRollout, setSelectedRollout] = useState<Set<string>>(new Set())
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [qualityBusy, setQualityBusy] = useState<string | null>(null)

  const { data: storesData } = useSWR<{ stores: StoreOption[] }>(
    open ? "/api/stores" : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const stores = useMemo(() => storesData?.stores ?? [], [storesData])
  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores])

  const pilotResults = (suggestion?.copy_results?.test ?? {}) as Record<string, CopyResultEntry>
  const rolloutResults = (suggestion?.copy_results?.production ?? {}) as Record<
    string,
    CopyResultEntry
  >
  const approvedPilotCount = Object.values(pilotResults).filter((c) => c.quality === "good").length
  const canRollout = approvedPilotCount > 0

  useEffect(() => {
    if (!suggestion) return
    const hasPilot = Object.keys(pilotResults).length > 0
    const hasRollout = Object.keys(rolloutResults).length > 0
    setPhase(hasRollout && canRollout ? "rollout" : "pilot")
    setExpandedCards(new Set())
    if (suggestion.pilot_store_ids?.length) {
      setSelectedPilot(new Set(suggestion.pilot_store_ids))
    } else {
      const seen = new Set<string>()
      const picks: string[] = []
      for (const t of suggestion.targets) {
        if (!seen.has(t.country)) {
          seen.add(t.country)
          picks.push(t.store_id)
        }
        if (picks.length >= 3) break
      }
      setSelectedPilot(new Set(picks))
    }
    setSelectedRollout(new Set())
    if (hasPilot) setExpandedCards(new Set(Object.keys(pilotResults).slice(0, 1)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion?.id])

  const matched = useMemo(
    () =>
      stores.filter((s) => {
        if (statusFilter === "ativas" && !s.is_active) return false
        if (statusFilter === "inativas" && s.is_active) return false
        if (regionFilter !== "todas" && REGION_OF[countryKey(s.country)] !== regionFilter)
          return false
        if (langFilter !== "todos" && langKey(s.language) !== langFilter) return false
        return true
      }),
    [stores, statusFilter, regionFilter, langFilter],
  )

  if (!suggestion) return null

  const mode = phase === "pilot" ? "test" : "production"
  const results = phase === "pilot" ? pilotResults : rolloutResults
  const selected = phase === "pilot" ? selectedPilot : selectedRollout
  const setSelected = phase === "pilot" ? setSelectedPilot : setSelectedRollout

  const rolloutCandidateIds = useMemo(() => {
    if (phase !== "rollout") return new Set<string>()
    const fromTargets = new Set(suggestion.targets.map((t) => t.store_id))
    for (const [sid, entry] of Object.entries(pilotResults)) {
      if (entry.quality !== "good") fromTargets.add(sid)
    }
    return fromTargets
  }, [phase, suggestion.targets, pilotResults])

  const visibleStores = useMemo(() => {
    if (phase === "pilot") return matched
    return matched.filter((s) => rolloutCandidateIds.has(s.id))
  }, [phase, matched, rolloutCandidateIds])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleExpand = (id: string) =>
    setExpandedCards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const genList = visibleStores.filter((s) => selected.has(s.id))

  const callGenerate = async (
    storeIds: string[],
  ): Promise<{ results: Record<string, CopyResultEntry>; errors: Record<string, string> }> => {
    const res = await fetch(
      `/api/admin/campaign-central/suggestions/${suggestion.id}/generate-copy`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, store_ids: storeIds }),
      },
    )
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
    return json
  }

  const callSetPilot = async (storeIds: string[]) => {
    await fetch(`/api/admin/campaign-central/suggestions/${suggestion.id}/set-pilot`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store_ids: storeIds }),
    })
  }

  const generate = async () => {
    if (genList.length === 0) return
    setBusy(phase === "pilot" ? "generating" : "rollout")
    try {
      if (phase === "pilot") {
        await callSetPilot(genList.map((s) => s.id))
      }
      const { errors } = await callGenerate(genList.map((s) => s.id))
      const failed = Object.keys(errors ?? {}).length
      if (failed > 0) {
        toast({
          title: `${failed} loja(s) falharam`,
          description: Object.values(errors)[0],
          variant: "destructive",
        })
      } else {
        toast({
          title: phase === "pilot" ? "Piloto gerado" : "Rollout gerado",
          description: `${genList.length - failed} loja(s) com copy.`,
        })
      }
      onSaved()
    } catch (err) {
      toast({
        title: "Falha ao gerar copy",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setBusy(null)
    }
  }

  const regenerateOne = async (storeId: string) => {
    setRegeneratingId(storeId)
    try {
      await callGenerate([storeId])
      onSaved()
    } catch (err) {
      toast({
        title: "Falha ao refazer",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setRegeneratingId(null)
    }
  }

  const toggleQuality = async (storeId: string, current: CopyResultEntry["quality"]) => {
    setQualityBusy(storeId)
    try {
      const next = current === "good" ? null : "good"
      const res = await fetch(
        `/api/admin/campaign-central/suggestions/${suggestion.id}/mark-quality`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ store_id: storeId, mode, quality: next }),
        },
      )
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json?.error || `HTTP ${res.status}`)
      }
      onSaved()
    } catch (err) {
      toast({
        title: "Falha ao marcar qualidade",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setQualityBusy(null)
    }
  }

  const copyToClipboard = async (id: string, entry: CopyResultEntry) => {
    try {
      await navigator.clipboard.writeText(copyBlocksToText(entry))
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1400)
    } catch {
      // clipboard indisponível
    }
  }

  const FilterRow = ({
    label,
    value,
    options,
    onPick,
  }: {
    label: string
    value: string
    options: Array<{ k: string; label: string }>
    onPick: (k: string) => void
  }) => (
    <div className="mb-2.5">
      <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value === o.k
          return (
            <button
              key={o.k}
              onClick={() => onPick(o.k)}
              className={`rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                on
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40"
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )

  const hasMaster = !!suggestion.email_draft?.blocks?.length

  return (
    <>
      <div
        className={`fixed inset-0 z-[90] bg-white/85 backdrop-blur-sm transition-opacity dark:bg-gray-950/85 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-[91] flex w-[560px] max-w-[94vw] flex-col border-l border-border shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ background: "var(--background)" }}
      >
        <div className="shrink-0 border-b border-border bg-card px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                <Edit3 size={13} /> Adaptação por loja
              </div>
              <div className="truncate text-[16px] font-semibold tracking-tight text-foreground">
                {suggestion.title}
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 text-[11.5px]">
            <button
              onClick={() => setPhase("pilot")}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold ${
                phase === "pilot"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              <span className="inline-flex size-4 items-center justify-center rounded-full bg-current/15 text-[10px]">
                1
              </span>
              Piloto
              {approvedPilotCount > 0 && <Badge variant="positive">{approvedPilotCount} OK</Badge>}
            </button>
            <ArrowRight size={13} className="text-muted-foreground/50" />
            <button
              onClick={() => canRollout && setPhase("rollout")}
              disabled={!canRollout}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                phase === "rollout"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              <span className="inline-flex size-4 items-center justify-center rounded-full bg-current/15 text-[10px]">
                2
              </span>
              Rollout (todas)
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!hasMaster && (
            <div className="mb-4 rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-700">
              <strong className="font-bold">Falta a copy master.</strong> Abra a campanha no
              detalhe e clique em <em>Gerar master</em> antes de adaptar por loja.
            </div>
          )}

          <div className="mb-4 rounded-[8px] border border-border bg-card px-3.5 py-3 text-[12.5px]">
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Alvo</span>
              <span className="font-semibold text-foreground/90">
                {suggestion.target_summary || `${suggestion.targets.length} loja(s)`}
              </span>
            </div>
            <div className="flex justify-between border-t border-dashed border-border py-1">
              <span className="text-muted-foreground">Canal</span>
              <span className="font-semibold text-foreground/90">{suggestion.channel}</span>
            </div>
            {phase === "rollout" && (
              <div className="flex justify-between border-t border-dashed border-border py-1">
                <span className="text-muted-foreground">Referências</span>
                <span className="font-semibold text-emerald-600">
                  {approvedPilotCount} piloto(s) aprovada(s)
                </span>
              </div>
            )}
          </div>

          {phase === "pilot" ? (
            <div className="mb-3 rounded-[6px] border border-border bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
              <strong className="font-bold text-foreground">Etapa 1 — Piloto.</strong> Escolha 2-3
              lojas pra validar a copy. Marque <em>Boa</em> nas que aprovar — elas serão a
              referência de qualidade no rollout.
            </div>
          ) : (
            <div className="mb-3 rounded-[6px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">
              <strong className="font-bold">Etapa 2 — Rollout.</strong> A IA vai usar as{" "}
              {approvedPilotCount} adaptação(ões) aprovada(s) como referência pra gerar as demais
              lojas com o mesmo padrão de qualidade.
            </div>
          )}

          <div className="mb-4">
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Seleção de lojas
            </div>
            <FilterRow
              label="Status"
              value={statusFilter}
              onPick={(k) => setStatusFilter(k as typeof statusFilter)}
              options={[
                { k: "todas", label: "Todas" },
                { k: "ativas", label: "Ativas" },
                { k: "inativas", label: "Inativas" },
              ]}
            />
            <FilterRow
              label="Região"
              value={regionFilter}
              onPick={(k) => setRegionFilter(k as typeof regionFilter)}
              options={[
                { k: "todas", label: "Todas" },
                { k: "BR", label: "Brasil" },
                { k: "EU", label: "Europa" },
                { k: "US", label: "EUA" },
              ]}
            />
            <FilterRow
              label="Idioma"
              value={langFilter}
              onPick={(k) => setLangFilter(k as typeof langFilter)}
              options={[
                { k: "todos", label: "Todos" },
                { k: "pt", label: "Português" },
                { k: "en", label: "Inglês" },
                { k: "es", label: "Espanhol" },
              ]}
            />

            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                {phase === "pilot" ? "Lojas piloto" : "Lojas para rollout"}
              </span>
              <span className="flex gap-3">
                <button
                  onClick={() => setSelected(new Set(visibleStores.map((s) => s.id)))}
                  className="text-[11.5px] font-semibold text-primary hover:underline"
                >
                  Todas
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-[11.5px] font-semibold text-primary hover:underline"
                >
                  Limpar
                </button>
              </span>
            </div>
            <div className="max-h-44 overflow-y-auto rounded-[6px] border border-border bg-card">
              {visibleStores.length === 0 && (
                <div className="px-3.5 py-3.5 text-center text-[12px] text-muted-foreground">
                  Nenhuma loja com esses filtros.
                </div>
              )}
              {visibleStores.map((s, i) => {
                const on = selected.has(s.id)
                return (
                  <button
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/40 ${
                      i < visibleStores.length - 1 ? "border-b border-border/50" : ""
                    }`}
                  >
                    <span
                      className={`inline-flex size-4 shrink-0 items-center justify-center rounded border-[1.5px] ${
                        on ? "border-primary bg-primary text-white" : "border-border bg-card"
                      }`}
                    >
                      {on && <Check size={11} />}
                    </span>
                    <span className="flex-1 truncate text-[12.5px] font-medium text-foreground/90">
                      {s.store_name}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {countryKey(s.country)} · {LANG_LABEL[langKey(s.language)] ?? s.language}
                    </span>
                    {!s.is_active && <Badge variant="neutral">inativa</Badge>}
                  </button>
                )
              })}
            </div>
            <div
              className={`mt-2 flex items-center gap-2 rounded-[6px] border px-3 py-2 text-[12.5px] ${
                genList.length > 0
                  ? "border-primary/20 bg-primary/5 text-primary"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              <Store size={14} />
              <span>
                <strong className="font-bold tabular-nums">
                  {genList.length} de {visibleStores.length}
                </strong>{" "}
                loja{visibleStores.length !== 1 ? "s" : ""} selecionada
                {genList.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <Button
            size="lg"
            className="mb-4 w-full"
            onClick={generate}
            disabled={busy !== null || genList.length === 0 || !hasMaster}
          >
            {busy ? (
              <Loader2 size={16} className="mr-1.5 animate-spin" />
            ) : phase === "pilot" ? (
              <Zap size={16} className="mr-1.5" />
            ) : (
              <Sparkles size={16} className="mr-1.5" />
            )}
            {busy === "generating" || busy === "rollout"
              ? "Gerando…"
              : phase === "pilot"
              ? `Gerar piloto · ${genList.length} loja${genList.length !== 1 ? "s" : ""}`
              : `Gerar para ${genList.length} loja${genList.length !== 1 ? "s" : ""}`}
          </Button>

          {Object.keys(results).length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-foreground/90">
                  {Object.keys(results).length} loja
                  {Object.keys(results).length !== 1 ? "s" : ""} com copy
                  {phase === "pilot" && (
                    <span className="ml-1.5 text-emerald-600">
                      ({approvedPilotCount} aprovada{approvedPilotCount !== 1 ? "s" : ""})
                    </span>
                  )}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {Object.entries(results).map(([storeId, entry]) => {
                  const store = storeById.get(storeId)
                  const isGood = entry.quality === "good"
                  const isExpanded = expandedCards.has(storeId)
                  const isRegen = regeneratingId === storeId
                  return (
                    <div
                      key={storeId}
                      className={`overflow-hidden rounded-[8px] border bg-card ${
                        isGood ? "border-emerald-300" : "border-border"
                      }`}
                    >
                      <div
                        className={`flex items-center gap-2 border-b border-border/50 px-3.5 py-2 ${
                          isGood ? "bg-emerald-50" : "bg-muted/40"
                        }`}
                      >
                        <span className="truncate text-[12.5px] font-semibold text-foreground">
                          {store?.store_name ?? storeId}
                        </span>
                        {store && <Badge variant="neutral">{countryKey(store.country)}</Badge>}
                        {store && (
                          <Badge variant="info">
                            {LANG_LABEL[langKey(store.language)] ?? "—"}
                          </Badge>
                        )}
                        <div className="flex-1" />
                        {isGood && (
                          <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-emerald-600">
                            <Check size={13} /> Aprovada
                          </span>
                        )}
                      </div>
                      <div className="px-3.5 py-3">
                        <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Assunto
                        </div>
                        <div className="mb-2.5 text-[13.5px] font-semibold text-foreground">
                          {entry.subject}
                        </div>
                        <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Preview
                        </div>
                        <div className="mb-2 text-[12.5px] leading-normal text-muted-foreground">
                          {entry.preheader ?? entry.preview}
                        </div>
                        {entry.blocks && entry.blocks.length > 0 && (
                          <button
                            onClick={() => toggleExpand(storeId)}
                            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline"
                          >
                            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            {isExpanded
                              ? "Ocultar email completo"
                              : `Ver email completo (${entry.blocks.length} blocos)`}
                          </button>
                        )}
                        {isExpanded && entry.blocks && (
                          <div className="mt-2.5 space-y-2.5 rounded-[6px] border border-border/70 bg-muted/30 p-3">
                            {entry.blocks.map((b, i) => (
                              <BlockPreview key={b.id ?? i} block={b} />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 px-3.5 pb-3">
                        <button
                          onClick={() => copyToClipboard(storeId, entry)}
                          className={`inline-flex items-center gap-1 text-[11.5px] font-semibold ${
                            copiedId === storeId
                              ? "text-emerald-600"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <CopyIcon size={13} />
                          {copiedId === storeId ? "Copiado" : "Copiar tudo"}
                        </button>
                        <div className="flex-1" />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => regenerateOne(storeId)}
                          disabled={isRegen || busy !== null}
                        >
                          {isRegen ? (
                            <Loader2 size={13} className="mr-1 animate-spin" />
                          ) : (
                            <RefreshCw size={13} className="mr-1" />
                          )}
                          Refazer
                        </Button>
                        <Button
                          variant={isGood ? "primary" : "secondary"}
                          size="sm"
                          onClick={() => toggleQuality(storeId, entry.quality ?? null)}
                          disabled={qualityBusy === storeId}
                        >
                          {qualityBusy === storeId ? (
                            <Loader2 size={13} className="mr-1 animate-spin" />
                          ) : (
                            <Check size={13} className="mr-1" />
                          )}
                          {isGood ? "Aprovada" : "Boa"}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
              {phase === "pilot" && canRollout && (
                <button
                  onClick={() => setPhase("rollout")}
                  className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-[6px] border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-[13px] font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  <Send size={14} /> Avançar para rollout (todas as outras lojas)
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

function BlockPreview({ block }: { block: EmailDraftBlock }) {
  switch (block.type) {
    case "image":
      return (
        <div className="rounded-[4px] border border-dashed border-border bg-muted px-2 py-2 font-mono text-[10.5px] text-muted-foreground">
          [Imagem] {block.caption ?? ""}
        </div>
      )
    case "heading":
      return (
        <div>
          <div className="text-[14px] font-bold leading-tight text-foreground">
            {block.headline ?? "—"}
          </div>
          {block.sub && (
            <div className="mt-0.5 text-[12px] text-muted-foreground">{block.sub}</div>
          )}
        </div>
      )
    case "text":
      return (
        <div className="text-[12.5px] leading-relaxed text-foreground/85">{block.value}</div>
      )
    case "offer":
      return (
        <div className="rounded-[4px] border border-primary/20 bg-primary/5 px-2 py-1.5 text-center text-[12.5px] font-semibold text-primary">
          {block.value}
        </div>
      )
    case "button":
      return (
        <div className="text-center">
          <span className="inline-block rounded-[4px] bg-primary px-4 py-1.5 text-[12px] font-semibold text-white">
            {block.value}
          </span>
        </div>
      )
    case "divider":
      return <hr className="border-border" />
    case "footer":
      return (
        <div className="text-center text-[10.5px] text-muted-foreground/70">{block.value}</div>
      )
    case "products": {
      const cols = block.columns ?? 3
      return (
        <div className={`grid gap-2 ${cols === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {(block.items ?? []).map((it, i) => (
            <div key={i} className="rounded-[4px] border border-border bg-card p-1.5">
              <div className="mb-1 h-12 rounded-[3px] border border-dashed border-border/70 bg-muted/60" />
              <div className="truncate text-[11px] font-semibold text-foreground">
                {it.name ?? "—"}
              </div>
              <div className="text-[10.5px] font-bold text-primary">{it.price ?? ""}</div>
            </div>
          ))}
        </div>
      )
    }
    default:
      return null
  }
}
