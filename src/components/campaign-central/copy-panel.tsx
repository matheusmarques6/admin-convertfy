"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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
  AlertTriangle,
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
  niche?: string | null
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
  const [nicheFilter, setNicheFilter] = useState<string>("todos")
  const [selectedPilot, setSelectedPilot] = useState<Set<string>>(new Set())
  const [selectedRollout, setSelectedRollout] = useState<Set<string>>(new Set())
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [qualityBusy, setQualityBusy] = useState<string | null>(null)
  /** Lojas com dispatch em andamento — UI mostra spinner ate receber callback. */
  const [pendingStoreIds, setPendingStoreIds] = useState<Set<string>>(new Set())
  /** Mode do dispatch atual — pendingStoreIds e relativo a esse mode. */
  const [pendingMode, setPendingMode] = useState<"test" | "production" | null>(null)
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  const { data: storesData } = useSWR<{ stores: StoreOption[] }>(
    open ? "/api/stores" : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const stores = useMemo(() => storesData?.stores ?? [], [storesData])
  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores])

  const pilotResults = useMemo(
    () => (suggestion?.copy_results?.test ?? {}) as Record<string, CopyResultEntry>,
    [suggestion?.copy_results?.test],
  )
  const rolloutResults = useMemo(
    () => (suggestion?.copy_results?.production ?? {}) as Record<string, CopyResultEntry>,
    [suggestion?.copy_results?.production],
  )
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
        if (
          nicheFilter !== "todos" &&
          (s.niche ?? "").trim().toLowerCase() !== nicheFilter
        )
          return false
        return true
      }),
    [stores, statusFilter, regionFilter, langFilter, nicheFilter],
  )

  /** Nichos únicos derivados das lojas (case-insensitive; preserva display). */
  const niches = useMemo(() => {
    const seen = new Map<string, string>()
    for (const s of stores) {
      const raw = s.niche?.trim()
      if (!raw) continue
      const key = raw.toLowerCase()
      if (!seen.has(key)) seen.set(key, raw)
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [stores])

  const activeNicheLabel = useMemo(() => {
    if (nicheFilter === "todos") return null
    return niches.find(([k]) => k === nicheFilter)?.[1] ?? nicheFilter
  }, [nicheFilter, niches])

  /**
   * Polling: enquanto houver lojas pending, refaz fetch da suggestion
   * a cada 4s. Detecta termino lendo copy_results[mode][storeId].status
   * — quando none == 'pending', limpa pending e dispara toast. Vive
   * antes do early return pra respeitar rules-of-hooks.
   */
  useEffect(() => {
    if (pendingStoreIds.size === 0 || !pendingMode || !suggestion) return

    const currentResults = (suggestion.copy_results?.[pendingMode] ?? {}) as Record<
      string,
      CopyResultEntry
    >
    const stillPending = Array.from(pendingStoreIds).filter(
      (id) => (currentResults[id]?.status ?? "pending") === "pending",
    )

    if (stillPending.length === 0) {
      const completed = Array.from(pendingStoreIds)
      const success = completed.filter((id) => currentResults[id]?.status === "success").length
      const failed = completed.filter((id) => currentResults[id]?.status === "error").length
      setPendingStoreIds(new Set())
      setPendingMode(null)
      setBusy(null)
      if (failed > 0) {
        const firstErr = completed.find((id) => currentResults[id]?.status === "error")
        toast({
          title: `${failed} loja(s) falharam`,
          description: firstErr
            ? currentResults[firstErr]?.error_message ?? "Erro no callback"
            : "Erro no callback",
          variant: "destructive",
        })
      } else if (success > 0) {
        toast({
          title: "Copy pronta",
          description: `${success} loja(s) geradas com sucesso.`,
        })
      }
      return
    }

    const tick = setInterval(() => {
      onSavedRef.current()
    }, 4000)
    return () => clearInterval(tick)
  }, [pendingStoreIds, pendingMode, suggestion, toast])

  // IMPORTANTE: os useMemos abaixo precisam ficar ANTES do early return
  // pra respeitar rules-of-hooks (React #310: rendered more hooks than
  // during the previous render). Guards internos lidam com suggestion null.
  const rolloutCandidateIds = useMemo(() => {
    if (!suggestion || phase !== "rollout") return new Set<string>()
    const fromTargets = new Set(suggestion.targets.map((t) => t.store_id))
    for (const [sid, entry] of Object.entries(pilotResults)) {
      if (entry.quality !== "good") fromTargets.add(sid)
    }
    return fromTargets
  }, [phase, suggestion, pilotResults])

  const visibleStores = useMemo(() => {
    if (!suggestion) return []
    if (phase === "pilot") return matched
    return matched.filter((s) => rolloutCandidateIds.has(s.id))
  }, [phase, matched, rolloutCandidateIds, suggestion])

  if (!suggestion) return null

  const mode = phase === "pilot" ? "test" : "production"
  const results = phase === "pilot" ? pilotResults : rolloutResults
  const selected = phase === "pilot" ? selectedPilot : selectedRollout
  const setSelected = phase === "pilot" ? setSelectedPilot : setSelectedRollout

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

  /**
   * Dispatch async: rota retorna 202 com job_id; UI faz polling de
   * onSaved (re-fetch da suggestion) ate todas as lojas saírem de
   * status='pending'. Sem mais lista de results/errors síncrona.
   */
  const callGenerate = async (
    storeIds: string[],
    targetMode: "test" | "production",
  ): Promise<{ job_id: string | null; stores_count: number; reason?: string }> => {
    const res = await fetch(
      `/api/admin/campaign-central/suggestions/${suggestion.id}/generate-copy`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: targetMode, store_ids: storeIds }),
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
    const storeIds = genList.map((s) => s.id)
    const targetMode = mode
    setBusy(phase === "pilot" ? "generating" : "rollout")
    setPendingStoreIds(new Set(storeIds))
    setPendingMode(targetMode)
    try {
      if (phase === "pilot") {
        await callSetPilot(storeIds)
      }
      const result = await callGenerate(storeIds, targetMode)
      onSavedRef.current()
      const description =
        result.reason === "no_url_configured"
          ? "Webhook n8n não configurado — fallback inline rodará no próximo watchdog (até 5min)."
          : `Aguarde — ${storeIds.length} loja(s) entram em fila.`
      toast({
        title: phase === "pilot" ? "Piloto enfileirado" : "Rollout enfileirado",
        description,
      })
    } catch (err) {
      // Falha pré-dispatch: limpa pending (UI volta ao estado anterior)
      setPendingStoreIds(new Set())
      setPendingMode(null)
      setBusy(null)
      toast({
        title: "Falha ao iniciar geração",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      })
    }
  }

  const regenerateOne = async (storeId: string) => {
    setRegeneratingId(storeId)
    setPendingStoreIds((prev) => {
      const next = new Set(prev)
      next.add(storeId)
      return next
    })
    setPendingMode(mode)
    try {
      await callGenerate([storeId], mode)
      onSavedRef.current()
    } catch (err) {
      setPendingStoreIds((prev) => {
        const next = new Set(prev)
        next.delete(storeId)
        return next
      })
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

            {niches.length > 0 && (
              <div className="mb-2.5">
                <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Nicho
                </div>
                <select
                  value={nicheFilter}
                  onChange={(e) => setNicheFilter(e.target.value)}
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

            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                {phase === "pilot" ? "Lojas piloto" : "Lojas para rollout"}
              </span>
              <span className="flex gap-3">
                {activeNicheLabel && (
                  <button
                    onClick={() =>
                      setSelected((prev) => {
                        const next = new Set(prev)
                        for (const s of visibleStores) next.add(s.id)
                        return next
                      })
                    }
                    className="text-[11.5px] font-semibold text-primary hover:underline"
                    title={`Adicionar todas as ${visibleStores.length} loja(s) de ${activeNicheLabel}`}
                  >
                    Todas do nicho
                  </button>
                )}
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
              className={`mt-2 flex flex-col gap-1 rounded-[6px] border px-3 py-2 text-[12.5px] ${
                genList.length > 0
                  ? "border-primary/20 bg-primary/5 text-primary"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              <div className="flex items-center gap-2">
                <Store size={14} />
                <span>
                  <strong className="font-bold tabular-nums">
                    {genList.length} de {visibleStores.length}
                  </strong>{" "}
                  loja{visibleStores.length !== 1 ? "s" : ""} selecionada
                  {genList.length !== 1 ? "s" : ""}
                </span>
              </div>
              {activeNicheLabel && (
                <div className="pl-[22px] text-[11.5px] font-medium opacity-80">
                  Nicho ‘{activeNicheLabel}’:{" "}
                  <strong className="font-bold tabular-nums">
                    {genList.length}/{visibleStores.length}
                  </strong>
                </div>
              )}
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
                  const isPending =
                    pendingMode === mode && (pendingStoreIds.has(storeId) || entry.status === "pending")
                  const isError = entry.status === "error" && !isPending
                  return (
                    <div
                      key={storeId}
                      className={`overflow-hidden rounded-[8px] border bg-card ${
                        isGood
                          ? "border-emerald-300"
                          : isError
                          ? "border-red-300"
                          : isPending
                          ? "border-primary/40"
                          : "border-border"
                      }`}
                    >
                      <div
                        className={`flex items-center gap-2 border-b border-border/50 px-3.5 py-2 ${
                          isGood
                            ? "bg-emerald-50"
                            : isError
                            ? "bg-red-50"
                            : isPending
                            ? "bg-primary/5"
                            : "bg-muted/40"
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
                        {isPending && (
                          <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary">
                            <Loader2 size={13} className="animate-spin" /> Gerando…
                          </span>
                        )}
                        {isError && (
                          <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-red-600">
                            <AlertTriangle size={13} /> Erro
                          </span>
                        )}
                        {isGood && !isPending && !isError && (
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
