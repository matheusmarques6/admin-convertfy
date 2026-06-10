"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { X, Zap, Check, Loader2, Store, Copy as CopyIcon, RefreshCw, Edit3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/lib/hooks/use-toast"
import type { CampaignSuggestion, CopyResultEntry } from "@/types/campaign-central"

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

export function CopyPanel({ suggestion, onClose, onSaved }: Props) {
  const { toast } = useToast()
  const open = !!suggestion

  const [mode, setMode] = useState<"test" | "production">("test")
  const [phase, setPhase] = useState<"idle" | "generating" | "done">("idle")
  const [statusFilter, setStatusFilter] = useState<"todas" | "ativas" | "inativas">("todas")
  const [regionFilter, setRegionFilter] = useState<"todas" | "BR" | "EU" | "US">("todas")
  const [langFilter, setLangFilter] = useState<"todos" | "pt" | "en" | "es">("todos")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<Record<string, CopyResultEntry>>({})
  const [quality, setQuality] = useState<Record<string, boolean>>({})
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data: storesData } = useSWR<{ stores: StoreOption[] }>(
    open ? "/api/stores" : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const stores = useMemo(() => storesData?.stores ?? [], [storesData])

  // Reset ao abrir nova sugestão: pré-seleciona os targets dela
  useEffect(() => {
    if (suggestion) {
      setMode("test")
      setPhase("idle")
      setStatusFilter("todas")
      setRegionFilter("todas")
      setLangFilter("todos")
      setSelected(new Set(suggestion.targets.map((t) => t.store_id)))
      setQuality({})
      // Carrega resultados já persistidos do modo teste
      setResults(suggestion.copy_results?.test ?? {})
      if (Object.keys(suggestion.copy_results?.test ?? {}).length > 0) setPhase("done")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion?.id])

  // Ao trocar de modo, carrega o que já existe persistido naquele modo
  useEffect(() => {
    if (!suggestion) return
    const existing = suggestion.copy_results?.[mode] ?? {}
    setResults(existing)
    setPhase(Object.keys(existing).length > 0 ? "done" : "idle")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

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

  const genList = matched.filter((s) => selected.has(s.id))

  if (!suggestion) return null

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const callGenerate = async (storeIds: string[]) => {
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
    return json as { results: Record<string, CopyResultEntry>; errors: Record<string, string> }
  }

  const generate = async () => {
    if (genList.length === 0) return
    setPhase("generating")
    try {
      const { results: generated, errors } = await callGenerate(genList.map((s) => s.id))
      setResults((prev) => ({ ...prev, ...generated }))
      setPhase("done")
      const failed = Object.keys(errors ?? {}).length
      if (failed > 0) {
        toast({
          title: `${failed} loja(s) falharam`,
          description: Object.values(errors)[0],
          variant: "destructive",
        })
      }
      onSaved()
    } catch (err) {
      setPhase(Object.keys(results).length > 0 ? "done" : "idle")
      toast({
        title: "Falha ao gerar copy",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      })
    }
  }

  const regenerateOne = async (storeId: string) => {
    setRegeneratingId(storeId)
    try {
      const { results: generated } = await callGenerate([storeId])
      setResults((prev) => ({ ...prev, ...generated }))
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

  const copyToClipboard = async (id: string, entry: CopyResultEntry) => {
    try {
      await navigator.clipboard.writeText(`${entry.subject}\n${entry.preview}`)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1400)
    } catch {
      // clipboard indisponível — ignora
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

  const storeById = new Map(stores.map((s) => [s.id, s]))

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-gray-900/30 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      {/* Panel */}
      <aside
        className={`fixed inset-y-0 right-0 z-[41] flex w-[480px] max-w-[92vw] flex-col border-l border-border bg-muted/20 shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ background: "var(--background)" }}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-border bg-card px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                <Edit3 size={13} /> Geração de copy
              </div>
              <div className="truncate text-[16px] font-semibold tracking-tight text-foreground">
                {suggestion.title}
              </div>
            </div>
            <button onClick={onClose} className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Contexto */}
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
            {suggestion.trigger && (
              <div className="flex justify-between gap-3 border-t border-dashed border-border py-1">
                <span className="text-muted-foreground">Gatilho</span>
                <span className="text-right font-semibold text-foreground/90">
                  {suggestion.trigger.label}
                </span>
              </div>
            )}
          </div>

          {/* Segmentação */}
          <div className="mb-4">
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Gerar para
            </div>
            <FilterRow
              label="Status"
              value={statusFilter}
              onPick={(k) => setStatusFilter(k as typeof statusFilter)}
              options={[
                { k: "todas", label: "Todas" },
                { k: "ativas", label: "Somente ativas" },
                { k: "inativas", label: "Somente inativas" },
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

            {/* Lista de lojas */}
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                Lojas {mode === "test" ? "para testar" : "selecionadas"}
              </span>
              <span className="flex gap-3">
                <button
                  onClick={() => setSelected(new Set(matched.map((s) => s.id)))}
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
              {matched.length === 0 && (
                <div className="px-3.5 py-3.5 text-center text-[12px] text-muted-foreground">
                  Nenhuma loja com esses filtros.
                </div>
              )}
              {matched.map((s, i) => {
                const on = selected.has(s.id)
                return (
                  <button
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/40 ${
                      i < matched.length - 1 ? "border-b border-border/50" : ""
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
                  {genList.length} de {matched.length}
                </strong>{" "}
                loja{matched.length !== 1 ? "s" : ""} {mode === "test" ? "para o teste" : "para produção"}
              </span>
            </div>
          </div>

          {/* Modo */}
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Objetivo da geração
          </div>
          <div className="mb-4 flex gap-2">
            {(
              [
                { key: "test", title: "Teste", sub: "copy real por loja p/ avaliar" },
                { key: "production", title: "Produção", sub: "versão final p/ enviar" },
              ] as const
            ).map((m) => {
              const on = mode === m.key
              return (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  className={`flex-1 rounded-[8px] border px-3 py-2.5 text-left transition-colors ${
                    on
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <div className={`text-[13px] font-semibold ${on ? "text-primary" : "text-foreground/90"}`}>
                    {m.title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{m.sub}</div>
                </button>
              )
            })}
          </div>

          {/* Gerar / resultados */}
          {phase === "idle" && (
            <Button
              size="lg"
              className="w-full"
              onClick={generate}
              disabled={genList.length === 0}
            >
              <Zap size={16} className="mr-1.5" />
              {mode === "test"
                ? `Gerar copy de ${genList.length} loja${genList.length !== 1 ? "s" : ""}`
                : `Gerar versão final · ${genList.length} loja${genList.length !== 1 ? "s" : ""}`}
            </Button>
          )}

          {phase === "generating" && (
            <div className="flex items-center justify-center gap-2.5 rounded-[8px] border border-border bg-card px-4 py-5 text-[13px] text-muted-foreground">
              <Loader2 size={16} className="animate-spin text-primary" />
              Gerando copy com base no contexto de cada loja…
            </div>
          )}

          {phase === "done" && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-foreground/90">
                  Copy gerada para {Object.keys(results).length} loja
                  {Object.keys(results).length !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={generate}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
                >
                  <Zap size={13} /> Regerar tudo
                </button>
              </div>
              <div className="mb-3 text-[11.5px] text-muted-foreground">
                Avalie a qualidade loja a loja antes de soltar pra todas.
              </div>
              <div className="flex flex-col gap-3">
                {genList
                  .filter((s) => results[s.id])
                  .map((s) => {
                    const entry = results[s.id]
                    const good = quality[s.id]
                    const isRegen = regeneratingId === s.id
                    return (
                      <div
                        key={s.id}
                        className={`overflow-hidden rounded-[8px] border bg-card ${
                          good ? "border-emerald-300" : "border-border"
                        }`}
                      >
                        <div
                          className={`flex items-center gap-2 border-b border-border/50 px-3.5 py-2 ${
                            good ? "bg-emerald-50" : "bg-muted/40"
                          }`}
                        >
                          <span className="text-[12.5px] font-semibold text-foreground">
                            {s.store_name}
                          </span>
                          <Badge variant="neutral">{countryKey(s.country)}</Badge>
                          <Badge variant="info">{LANG_LABEL[langKey(s.language)] ?? "—"}</Badge>
                          <div className="flex-1" />
                          {good && (
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
                          <div className="text-[12.5px] leading-normal text-muted-foreground">
                            {entry.preview}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 px-3.5 pb-3">
                          <button
                            onClick={() => copyToClipboard(s.id, entry)}
                            className={`inline-flex items-center gap-1 text-[11.5px] font-semibold ${
                              copiedId === s.id ? "text-emerald-600" : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {copiedId === s.id ? <Check size={13} /> : <CopyIcon size={13} />}
                            {copiedId === s.id ? "Copiado" : "Copiar"}
                          </button>
                          <div className="flex-1" />
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => regenerateOne(s.id)}
                            disabled={isRegen}
                          >
                            {isRegen ? (
                              <Loader2 size={13} className="mr-1 animate-spin" />
                            ) : (
                              <RefreshCw size={13} className="mr-1" />
                            )}
                            Refazer
                          </Button>
                          <Button
                            variant={good ? "primary" : "secondary"}
                            size="sm"
                            onClick={() =>
                              setQuality((p) => ({ ...p, [s.id]: !p[s.id] }))
                            }
                          >
                            <Check size={13} className="mr-1" />
                            {good ? "Aprovada" : "Boa"}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                {genList.some((s) => !results[s.id]) && (
                  <div className="rounded-[6px] border border-dashed border-border px-3.5 py-2.5 text-[12px] text-muted-foreground">
                    {genList.filter((s) => !results[s.id]).length} loja(s) ainda sem copy — clique
                    em &quot;Regerar tudo&quot; ou ajuste a seleção.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
