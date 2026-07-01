"use client"

/**
 * Painel "Gerar imagens" — tela cheia, aberto da task de PRODUÇÃO de campanha.
 *
 * Sidebar de LOTES (cada lote = um tipo de imagem: formato + instrução +
 * imagem-base opcional + flags de adaptação). O painel central edita o lote
 * selecionado e dispara a geração por LOTE × LOJA, mostrando os resultados por
 * loja com status ao vivo (polling 4s enquanto houver 'queued'/'generating'),
 * "Regerar com ajuste" e "Tentar de novo". Espelha campaign-copy-handoff.tsx.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from "lucide-react"
import type {
  CampaignImageAdaptFlags,
  CampaignImageBatchWithResults,
  CampaignImageFormat,
  CampaignImagePayload,
  CampaignImageResult,
  CampaignImageResultStatus,
  CampaignImageTargetStore,
  CampaignImageTextContext,
} from "@/types/campaign-central"

const FORMAT_LABEL: Record<CampaignImageFormat, string> = {
  hero: "Hero (4:3)",
  square: "Quadrado (1:1)",
  story: "Story (3:5)",
}

const FLAG_LABELS: Array<{ key: keyof CampaignImageAdaptFlags; label: string }> = [
  { key: "idioma", label: "Idioma" },
  { key: "cores", label: "Cores" },
  { key: "logo", label: "Logo" },
  { key: "catalogo", label: "Catálogo" },
]

/**
 * Campos textuais OPT-IN do agente de imagem. Cada um é um toggle + valor
 * custom opcional; desligado por padrão (prompt enxuto). `hint` mostra de
 * onde sai o dado da loja quando o valor custom fica vazio.
 */
const TEXT_FIELD_LABELS: Array<{
  key: keyof CampaignImageTextContext
  label: string
  hint: string
}> = [
  { key: "nicho", label: "Nicho", hint: "nicho da loja" },
  { key: "publico", label: "Persona/público", hint: "persona do briefing" },
  { key: "tom", label: "Tom de voz", hint: "tom de voz da marca" },
  { key: "moeda", label: "Moeda/locale", hint: "moeda/idioma da loja" },
  { key: "headline", label: "Headline", hint: "headline da copy de produção" },
]

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  )
}

function statusMeta(status: CampaignImageResultStatus): {
  dot: string
  label: string
} {
  switch (status) {
    case "ready":
      return { dot: "bg-emerald-500", label: "Pronta" }
    case "adjustment":
      return { dot: "bg-sky-500", label: "Ajustada" }
    case "generating":
      return { dot: "bg-amber-400 animate-pulse", label: "Gerando…" }
    case "failed":
      return { dot: "bg-rose-500", label: "Erro" }
    default:
      return { dot: "bg-muted-foreground/40", label: "Na fila" }
  }
}

/** Contadores de status pra badge do lote na sidebar. */
function countByStatus(results: CampaignImageResult[]): {
  ready: number
  pending: number
  failed: number
} {
  let ready = 0
  let pending = 0
  let failed = 0
  for (const r of results) {
    if (r.status === "ready" || r.status === "adjustment") ready++
    else if (r.status === "failed") failed++
    else pending++
  }
  return { ready, pending, failed }
}

export function CampaignImageHandoff({
  taskId,
  onClose,
}: {
  taskId: string
  onClose: () => void
}) {
  const [data, setData] = useState<CampaignImagePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/campaign-images`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Erro ${res.status}`)
      }
      const j = (await res.json()) as CampaignImagePayload
      setData(j)
      setSelectedBatchId((cur) => cur ?? j.batches[0]?.id ?? null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar")
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    void load()
  }, [load])

  // Polling enquanto QUALQUER resultado estiver na fila/gerando.
  const anyPending = !!data?.batches.some((b) =>
    b.results.some((r) => r.status === "queued" || r.status === "generating"),
  )
  useEffect(() => {
    if (!anyPending) return
    const t = setInterval(() => void load(), 4000)
    return () => clearInterval(t)
  }, [anyPending, load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const batches = useMemo(() => data?.batches ?? [], [data])
  const stores = useMemo(() => data?.stores ?? [], [data])
  const current = useMemo(
    () => batches.find((b) => b.id === selectedBatchId) ?? batches[0] ?? null,
    [batches, selectedBatchId],
  )

  const upsertBatch = useCallback((batch: CampaignImageBatchWithResults) => {
    setData((d) => {
      if (!d) return d
      const idx = d.batches.findIndex((b) => b.id === batch.id)
      const next = [...d.batches]
      if (idx >= 0) next[idx] = batch
      else next.push(batch)
      return { ...d, batches: next }
    })
  }, [])

  const createBatch = useCallback(async () => {
    setCreating(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/campaign-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_batch",
          name: `Lote ${batches.length + 1}`,
          format: "hero",
          instruction: "",
          adapt_flags: { idioma: true, cores: true, logo: true, catalogo: true },
          // Contexto textual começa todo desligado (prompt enxuto).
          text_context: {},
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Erro ${res.status}`)
      }
      const j = (await res.json()) as { batch: CampaignImageBatchWithResults }
      upsertBatch(j.batch)
      setSelectedBatchId(j.batch.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar lote")
    } finally {
      setCreating(false)
    }
  }, [taskId, batches.length, upsertBatch])

  const generateBatch = useCallback(async () => {
    if (!current) return
    setGenerating(true)
    // Otimista: marca todas as lojas como gerando.
    setData((d) => {
      if (!d) return d
      const next = d.batches.map((b) =>
        b.id === current.id
          ? {
              ...b,
              results: stores.map<CampaignImageResult>((s) => ({
                id: `tmp-${s.store_id}`,
                batch_id: b.id,
                store_id: s.store_id,
                store_name: s.store_name,
                country: s.country,
                language: s.language,
                status: "generating",
                image_url: null,
                adjustment_notes: null,
                error_message: null,
                generated_at: null,
              })),
            }
          : b,
      )
      return { ...d, batches: next }
    })
    try {
      const res = await fetch(`/api/tasks/${taskId}/campaign-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_batch", batch_id: current.id }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Erro ${res.status}`)
      }
      const j = (await res.json()) as { batch: CampaignImageBatchWithResults }
      upsertBatch(j.batch)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar")
      void load()
    } finally {
      setGenerating(false)
    }
  }, [current, stores, taskId, upsertBatch, load])

  return (
    <div className="fixed inset-0 z-[60] flex bg-black/50 p-2 sm:p-5">
      <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2 text-[13px]">
            <ImagePlus size={14} className="shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Produção</span>
            <span className="text-muted-foreground/50">/</span>
            <span className="truncate font-medium text-foreground">
              {data?.title || "Campanha"}
            </span>
            <span className="ml-1 rounded-[5px] bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              Geração de imagens
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-[12px] text-muted-foreground sm:inline">
              {stores.length} loja{stores.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-[5px] p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Fechar"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1">
          {/* Sidebar de lotes */}
          <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-border bg-muted/30 p-3 sm:block">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Lotes de imagem
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground">
                {batches.length}
              </span>
            </div>
            {batches.map((b) => {
              const active = current?.id === b.id
              const c = countByStatus(b.results)
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBatchId(b.id)}
                  className={`mb-1 flex w-full flex-col gap-1 rounded-[6px] px-2.5 py-2 text-left ${
                    active ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12.5px] font-medium text-foreground">
                      {b.name}
                    </span>
                    <span className="shrink-0 rounded-[4px] bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {FORMAT_LABEL[b.format].split(" ")[0]}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-[10.5px] text-muted-foreground">
                    {c.ready > 0 && (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {c.ready}
                      </span>
                    )}
                    {c.pending > 0 && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        {c.pending}
                      </span>
                    )}
                    {c.failed > 0 && (
                      <span className="flex items-center gap-1 text-rose-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        {c.failed}
                      </span>
                    )}
                    {b.results.length === 0 && <span>Sem geração</span>}
                  </span>
                </button>
              )
            })}
            <button
              type="button"
              onClick={createBatch}
              disabled={creating}
              className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-[6px] border border-dashed border-border px-2.5 py-2 text-[12px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Novo lote
            </button>
          </aside>

          {/* Main */}
          <main className="min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {loading && (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 animate-spin" size={16} /> Carregando…
              </div>
            )}
            {!loading && error && (
              <div className="mb-3 flex items-center gap-2 rounded-[6px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/30">
                <AlertTriangle size={15} /> {error}
              </div>
            )}
            {!loading && !current && (
              <div className="flex h-48 flex-col items-center justify-center gap-3 text-[13px] text-muted-foreground">
                <ImagePlus size={28} className="opacity-40" />
                Nenhum lote ainda. Crie um lote para começar.
                <button
                  type="button"
                  onClick={createBatch}
                  disabled={creating}
                  className="inline-flex items-center gap-1.5 rounded-[6px] bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background hover:opacity-90 disabled:opacity-50"
                >
                  {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  Criar primeiro lote
                </button>
              </div>
            )}

            {!loading && current && (
              <BatchEditor
                key={current.id}
                taskId={taskId}
                batch={current}
                stores={stores}
                generating={generating}
                onBatchChange={upsertBatch}
                onGenerate={generateBatch}
                onResultChange={(result) => {
                  setData((d) => {
                    if (!d) return d
                    const next = d.batches.map((b) =>
                      b.id === result.batch_id
                        ? {
                            ...b,
                            results: (() => {
                              const idx = b.results.findIndex(
                                (r) => r.store_id === result.store_id,
                              )
                              const arr = [...b.results]
                              if (idx >= 0) arr[idx] = result
                              else arr.push(result)
                              return arr
                            })(),
                          }
                        : b,
                    )
                    return { ...d, batches: next }
                  })
                }}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  )
}

// ── Editor de um lote + grid de resultados ───────────────────────────

function BatchEditor({
  taskId,
  batch,
  stores,
  generating,
  onBatchChange,
  onGenerate,
  onResultChange,
}: {
  taskId: string
  batch: CampaignImageBatchWithResults
  stores: CampaignImageTargetStore[]
  generating: boolean
  onBatchChange: (b: CampaignImageBatchWithResults) => void
  onGenerate: () => void
  onResultChange: (r: CampaignImageResult) => void
}) {
  const [name, setName] = useState(batch.name)
  const [format, setFormat] = useState<CampaignImageFormat>(batch.format)
  const [instruction, setInstruction] = useState(batch.instruction)
  const [flags, setFlags] = useState<CampaignImageAdaptFlags>(batch.adapt_flags ?? {})
  const [textContext, setTextContext] = useState<CampaignImageTextContext>(
    batch.text_context ?? {},
  )
  const [refUrl, setRefUrl] = useState<string | null>(batch.reference_image_url)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  // Persiste edição do lote (PATCH via POST create? não — usa endpoint dedicado).
  const saveBatch = useCallback(
    async (patch: Partial<{
      name: string
      format: CampaignImageFormat
      instruction: string
      adapt_flags: CampaignImageAdaptFlags
      text_context: CampaignImageTextContext
      reference_image_url: string | null
    }>) => {
      setSaving(true)
      try {
        const res = await fetch(`/api/tasks/${taskId}/campaign-images/batch`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batch_id: batch.id, ...patch }),
        })
        if (res.ok) {
          const j = (await res.json()) as { batch: CampaignImageBatchWithResults }
          // mantém os results já carregados
          onBatchChange({ ...j.batch, results: batch.results })
        }
      } catch {
        /* silencioso — re-tenta no próximo save */
      } finally {
        setSaving(false)
      }
    },
    [taskId, batch.id, batch.results, onBatchChange],
  )

  const onUpload = useCallback(
    async (file: File) => {
      setUploading(true)
      try {
        const fd = new FormData()
        fd.append("file", file)
        const res = await fetch(`/api/tasks/${taskId}/campaign-images/upload`, {
          method: "POST",
          body: fd,
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || `Erro ${res.status}`)
        }
        const j = (await res.json()) as { url: string }
        setRefUrl(j.url)
        await saveBatch({ reference_image_url: j.url })
      } catch {
        /* erro de upload — silencioso na UI por ora */
      } finally {
        setUploading(false)
      }
    },
    [taskId, saveBatch],
  )

  const toggleFlag = (key: keyof CampaignImageAdaptFlags) => {
    const next = { ...flags, [key]: !flags[key] }
    setFlags(next)
    void saveBatch({ adapt_flags: next })
  }

  // Liga/desliga um campo textual. Ligar preserva o value já digitado; salva
  // imediatamente (espelha toggleFlag).
  const toggleTextField = (key: keyof CampaignImageTextContext) => {
    const cur = textContext[key]
    const next: CampaignImageTextContext = {
      ...textContext,
      [key]: { include: !cur?.include, value: cur?.value },
    }
    setTextContext(next)
    void saveBatch({ text_context: next })
  }

  // Atualiza só o estado local do value (controlado); persiste no onBlur
  // (espelha o input de nome/instrução).
  const setTextFieldValue = (key: keyof CampaignImageTextContext, value: string) => {
    setTextContext((cur) => ({
      ...cur,
      [key]: { include: cur[key]?.include ?? true, value },
    }))
  }

  // Persiste o value custom (no blur). Só salva se o campo estiver ligado.
  const commitTextField = (key: keyof CampaignImageTextContext) => {
    const field = textContext[key]
    if (!field?.include) return
    void saveBatch({ text_context: textContext })
  }

  const results = batch.results
  const anyPending = results.some(
    (r) => r.status === "queued" || r.status === "generating",
  )

  return (
    <div>
      {/* Cabeçalho do lote */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== batch.name && saveBatch({ name })}
          className="min-w-0 flex-1 rounded-[6px] border border-transparent bg-transparent px-1 py-0.5 text-[16px] font-semibold text-foreground hover:border-border focus:border-border focus:outline-none"
          placeholder="Nome do lote"
        />
        {saving && (
          <span className="text-[11px] text-muted-foreground">Salvando…</span>
        )}
      </div>

      {/* Form do lote */}
      <div className="mb-4 grid grid-cols-1 gap-3 rounded-[8px] border border-border bg-card p-3 lg:grid-cols-2">
        {/* Formato */}
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Formato
          </label>
          <select
            value={format}
            onChange={(e) => {
              const f = e.target.value as CampaignImageFormat
              setFormat(f)
              void saveBatch({ format: f })
            }}
            className="w-full rounded-[6px] border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground"
          >
            {(Object.keys(FORMAT_LABEL) as CampaignImageFormat[]).map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
        </div>

        {/* Imagem-base */}
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Imagem-base (opcional)
          </label>
          <div className="flex items-center gap-2">
            {refUrl ? (
              <span className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={refUrl}
                  alt="Imagem-base"
                  className="h-9 w-9 rounded-[5px] border border-border object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    setRefUrl(null)
                    void saveBatch({ reference_image_url: null })
                  }}
                  className="text-[11px] text-rose-600 hover:underline"
                >
                  Remover
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-border bg-background px-2.5 py-1.5 text-[12px] font-medium text-foreground/80 hover:bg-muted disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Upload size={13} />
                )}
                Enviar imagem
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onUpload(f)
                e.target.value = ""
              }}
            />
          </div>
        </div>

        {/* Instrução */}
        <div className="lg:col-span-2">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Instrução
          </label>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onBlur={() =>
              instruction !== batch.instruction && saveBatch({ instruction })
            }
            rows={3}
            placeholder="Descreva o tipo de imagem a gerar (ex.: hero com produto em ambiente lifestyle, fundo claro)…"
            className="w-full resize-none rounded-[6px] border border-border bg-background px-2.5 py-2 text-[13px] text-foreground"
          />
        </div>

        {/* Flags de adaptação */}
        <div className="lg:col-span-2">
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Adaptar por loja
          </label>
          <div className="flex flex-wrap gap-2">
            {FLAG_LABELS.map(({ key, label }) => {
              const on = !!flags[key]
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleFlag(key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium ${
                    on
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {on && <CheckCircle2 size={12} />}
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Contexto textual opt-in */}
        <div className="lg:col-span-2">
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Contexto textual (opcional)
          </label>
          <div className="flex flex-wrap gap-2">
            {TEXT_FIELD_LABELS.map(({ key, label }) => {
              const on = !!textContext[key]?.include
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleTextField(key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium ${
                    on
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {on && <CheckCircle2 size={12} />}
                  {label}
                </button>
              )
            })}
          </div>
          {/* Inputs de valor custom dos campos ligados */}
          {TEXT_FIELD_LABELS.some(({ key }) => textContext[key]?.include) && (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TEXT_FIELD_LABELS.filter(({ key }) => textContext[key]?.include).map(
                ({ key, label, hint }) => (
                  <div key={key} className="flex flex-col gap-1">
                    <span className="text-[10.5px] font-medium text-muted-foreground">
                      {label}
                    </span>
                    <input
                      value={textContext[key]?.value ?? ""}
                      onChange={(e) => setTextFieldValue(key, e.target.value)}
                      onBlur={() => commitTextField(key)}
                      maxLength={500}
                      placeholder={`valor custom (opcional) — usa o ${hint} se vazio`}
                      className="w-full rounded-[5px] border border-border bg-background px-2 py-1.5 text-[12px] text-foreground"
                    />
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chips de lojas + ação de gerar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {stores.slice(0, 8).map((s) => (
            <span
              key={s.store_id}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-foreground/80"
              title={s.store_name}
            >
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white"
                style={{ background: s.primary_color || "#1F1F1F" }}
              >
                {initials(s.store_name)}
              </span>
              {s.store_name}
            </span>
          ))}
          {stores.length > 8 && (
            <span className="text-[11px] text-muted-foreground">
              +{stores.length - 8}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating || anyPending || stores.length === 0}
          className="inline-flex items-center gap-1.5 rounded-[6px] bg-foreground px-3.5 py-2 text-[12.5px] font-semibold text-background hover:opacity-90 disabled:opacity-50"
        >
          {generating || anyPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          Gerar {stores.length} imagem{stores.length === 1 ? "" : "ns"}
        </button>
      </div>

      {/* Grid de resultados por loja */}
      <ResultsGrid
        taskId={taskId}
        batchId={batch.id}
        stores={stores}
        results={results}
        onResultChange={onResultChange}
      />
    </div>
  )
}

// ── Grid de resultados ───────────────────────────────────────────────

function ResultsGrid({
  taskId,
  batchId,
  stores,
  results,
  onResultChange,
}: {
  taskId: string
  batchId: string
  stores: CampaignImageTargetStore[]
  results: CampaignImageResult[]
  onResultChange: (r: CampaignImageResult) => void
}) {
  const byStore = useMemo(() => {
    const m = new Map<string, CampaignImageResult>()
    for (const r of results) m.set(r.store_id, r)
    return m
  }, [results])

  if (stores.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-[12.5px] text-muted-foreground">
        Campanha sem lojas-alvo.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {stores.map((s) => (
        <ResultCard
          key={s.store_id}
          taskId={taskId}
          batchId={batchId}
          store={s}
          result={byStore.get(s.store_id) ?? null}
          onResultChange={onResultChange}
        />
      ))}
    </div>
  )
}

function ResultCard({
  taskId,
  batchId,
  store,
  result,
  onResultChange,
}: {
  taskId: string
  batchId: string
  store: CampaignImageTargetStore
  result: CampaignImageResult | null
  onResultChange: (r: CampaignImageResult) => void
}) {
  const [adjusting, setAdjusting] = useState(false)
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)

  const status = result?.status ?? "queued"
  const sm = statusMeta(status)
  const isPending = status === "queued" || status === "generating"

  const regenerate = useCallback(
    async (adjustmentNotes: string | null) => {
      setBusy(true)
      // Otimista: marca 'generating' local (mantendo a imagem antiga). Isso liga o
      // polling do modal (anyPending) → mostra "Gerando…" na hora E puxa a imagem
      // nova do banco quando ficar pronta, mesmo se a resposta longa (15-90s) cair.
      const base: CampaignImageResult = {
        id: result?.id ?? `tmp-${store.store_id}`,
        batch_id: batchId,
        store_id: store.store_id,
        store_name: store.store_name,
        country: store.country,
        language: store.language,
        status: "generating",
        image_url: result?.image_url ?? null,
        adjustment_notes: adjustmentNotes,
        error_message: null,
        generated_at: result?.generated_at ?? null,
      }
      onResultChange(base)
      setAdjusting(false)
      setNotes("")
      try {
        const res = await fetch(`/api/tasks/${taskId}/campaign-images/results`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batch_id: batchId,
            store_id: store.store_id,
            adjustment_notes: adjustmentNotes,
          }),
        })
        if (res.ok) {
          const j = (await res.json()) as { result: CampaignImageResult }
          onResultChange(j.result)
        } else {
          const j = (await res.json().catch(() => ({}))) as {
            error?: string | { message?: string }
          }
          const msg =
            typeof j.error === "string"
              ? j.error
              : j.error?.message || `Erro ${res.status}`
          onResultChange({ ...base, status: "failed", error_message: msg })
        }
      } catch {
        // Rede/timeout do cliente: o servidor pode seguir gerando. Deixa
        // 'generating' — o polling resolve pro estado real quando o banco atualizar.
      } finally {
        setBusy(false)
      }
    },
    [taskId, batchId, store, result, onResultChange],
  )

  return (
    <div className="flex flex-col overflow-hidden rounded-[8px] border border-border bg-card">
      {/* Preview */}
      <div className="relative aspect-[4/3] w-full bg-muted/40">
        {result?.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={result.image_url}
            alt={`Imagem de ${store.store_name}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            {isPending ? (
              <Loader2 className="animate-spin" size={20} />
            ) : status === "failed" ? (
              <AlertTriangle size={20} className="text-rose-500" />
            ) : (
              <ImagePlus size={20} className="opacity-40" />
            )}
          </div>
        )}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-2 py-0.5 text-[10.5px] font-medium text-foreground shadow-sm">
          <span className={`h-1.5 w-1.5 rounded-full ${sm.dot}`} />
          {sm.label}
        </span>
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-2 p-2.5">
        <div className="flex items-center gap-2">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] text-[9px] font-bold text-white"
            style={{ background: store.primary_color || "#1F1F1F" }}
          >
            {initials(store.store_name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium text-foreground">
              {store.store_name}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {store.country || "—"}
            </span>
          </span>
        </div>

        {status === "failed" && result?.error_message && (
          <p className="line-clamp-2 text-[11px] text-rose-600" title={result.error_message}>
            {result.error_message}
          </p>
        )}

        {!adjusting && (
          <div className="flex items-center gap-1.5">
            {status === "failed" ? (
              <button
                type="button"
                onClick={() => regenerate(null)}
                disabled={busy || isPending}
                className="inline-flex items-center gap-1.5 rounded-[5px] border border-border bg-background px-2 py-1 text-[11.5px] font-medium text-foreground/80 hover:bg-muted disabled:opacity-50"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Tentar de novo
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAdjusting(true)}
                disabled={busy || isPending || !result}
                className="inline-flex items-center gap-1.5 rounded-[5px] border border-border bg-background px-2 py-1 text-[11.5px] font-medium text-foreground/80 hover:bg-muted disabled:opacity-50"
              >
                <Sparkles size={12} />
                Regerar com ajuste
              </button>
            )}
          </div>
        )}

        {adjusting && (
          <div className="flex flex-col gap-1.5">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              autoFocus
              placeholder="O que ajustar? (ex.: fundo mais claro, produto centralizado)"
              className="w-full resize-none rounded-[5px] border border-border bg-background px-2 py-1.5 text-[12px] text-foreground"
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => regenerate(notes.trim() || null)}
                disabled={busy || !notes.trim()}
                className="inline-flex items-center gap-1.5 rounded-[5px] bg-foreground px-2.5 py-1 text-[11.5px] font-semibold text-background hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                Regerar
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdjusting(false)
                  setNotes("")
                }}
                className="rounded-[5px] px-2 py-1 text-[11.5px] font-medium text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
