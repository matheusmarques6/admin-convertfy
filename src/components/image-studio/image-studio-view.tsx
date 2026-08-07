"use client"

/**
 * Estúdio de Geração de Imagens (/admin/imagens).
 *
 * Página standalone que espelha o painel de imagens da Central de Campanhas
 * (campaign-image-handoff.tsx), mas desacoplada de campanha/task: seleção
 * LIVRE de lojas por lote + N VARIAÇÕES por loja (direção opcional em cada).
 * Histórico navegável de lotes na sidebar; grid loja × variação com polling
 * 4s, "Regerar com ajuste", download individual e ZIP.
 *
 * Zero ligação de dados com o fluxo de campanha (tabelas image_studio_*).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  Download,
  ImagePlus,
  Loader2,
  Lock,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
  ZoomIn,
} from "lucide-react"
import type {
  ImageStudioAdaptFlags,
  ImageStudioBatchWithResults,
  ImageStudioFormat,
  ImageStudioReferenceMode,
  ImageStudioResult,
  ImageStudioResultStatus,
  ImageStudioStore,
  ImageStudioStoreSpec,
  ImageStudioTextContext,
  ImageStudioVariation,
} from "@/types/image-studio"
import { useToast } from "@/lib/hooks/use-toast"

const FORMAT_LABEL: Record<ImageStudioFormat, string> = {
  hero: "Hero (4:3)",
  square: "Quadrado (1:1)",
  story: "Story (3:5)",
  portrait: "Retrato (4:5)",
  landscape: "Paisagem (16:9)",
  banner: "Banner (2:1)",
  vertical: "Vertical (9:16)",
}

const FLAG_LABELS: Array<{ key: keyof ImageStudioAdaptFlags; label: string }> = [
  { key: "idioma", label: "Idioma" },
  { key: "cores", label: "Cores" },
  { key: "logo", label: "Logo" },
  { key: "catalogo", label: "Catálogo" },
]

const TEXT_FIELD_LABELS: Array<{
  key: keyof ImageStudioTextContext
  label: string
  hint: string
}> = [
  { key: "nicho", label: "Nicho", hint: "nicho da loja" },
  { key: "publico", label: "Persona/público", hint: "persona do briefing" },
  { key: "tom", label: "Tom de voz", hint: "tom de voz da marca" },
  { key: "moeda", label: "Moeda/locale", hint: "moeda/idioma da loja" },
  { key: "headline", label: "Headline", hint: "texto custom obrigatório" },
]

const MAX_VARIATIONS = 8
/** Espelha MAX_REFERENCE_IMAGES do service (teto de imagens-base). */
const MAX_REFERENCE_IMAGES = 6
/** Lojas por request de geração (chunking contra o teto de 300s da função). */
const GENERATE_CHUNK_STORES = 6
/** Acima disso, confirmação explícita de custo antes de gerar. */
const CONFIRM_THRESHOLD = 20

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

function statusMeta(status: ImageStudioResultStatus): { dot: string; label: string } {
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

function countByStatus(results: ImageStudioResult[]): {
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

// ── Download helpers (client) ────────────────────────────────────────

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function extFromUrl(url: string): string {
  const path = url.split("?")[0] ?? ""
  const m = path.match(/\.([a-z0-9]{3,4})$/i)
  return m ? m[1].toLowerCase() : "png"
}

function imageFilename(
  storeName: string,
  format: string,
  variationIndex: number,
  url: string,
): string {
  const safe =
    storeName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "imagem"
  return `${safe}_${format}_v${variationIndex + 1}.${extFromUrl(url)}`
}

async function downloadImageUrl(url: string, filename: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Falha ao baixar (HTTP ${res.status})`)
  triggerBlobDownload(await res.blob(), filename)
}

async function downloadResponseAsFile(res: Response, fallback: string): Promise<void> {
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as {
      error?: string | { message?: string }
    }
    const msg =
      typeof j.error === "string"
        ? j.error
        : j.error?.message || `Falha ao baixar (HTTP ${res.status})`
    throw new Error(msg)
  }
  const disposition = res.headers.get("Content-Disposition") ?? ""
  const match = disposition.match(/filename="?([^"]+)"?/)
  triggerBlobDownload(await res.blob(), match?.[1] ?? fallback)
}

async function parseError(res: Response): Promise<string> {
  const j = (await res.json().catch(() => ({}))) as {
    error?: string | { message?: string }
  }
  return typeof j.error === "string"
    ? j.error
    : j.error?.message || `Erro ${res.status}`
}

// ── Página ───────────────────────────────────────────────────────────

export function ImageStudioView() {
  const [batches, setBatches] = useState<ImageStudioBatchWithResults[]>([])
  const [stores, setStores] = useState<ImageStudioStore[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/image-studio/batches")
      if (!res.ok) throw new Error(await parseError(res))
      const j = (await res.json()) as { batches: ImageStudioBatchWithResults[] }
      setBatches(j.batches)
      setSelectedBatchId((cur) => cur ?? j.batches[0]?.id ?? null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    void (async () => {
      try {
        const res = await fetch("/api/admin/image-studio/stores")
        if (!res.ok) return
        const j = (await res.json()) as { stores: ImageStudioStore[] }
        setStores(j.stores)
      } catch {
        /* seletor fica vazio; o erro aparece ao tentar gerar */
      }
    })()
  }, [load])

  // Polling enquanto QUALQUER resultado estiver na fila/gerando.
  const anyPending = batches.some((b) =>
    b.results.some((r) => r.status === "queued" || r.status === "generating"),
  )
  useEffect(() => {
    if (!anyPending) return
    const t = setInterval(() => void load(), 4000)
    return () => clearInterval(t)
  }, [anyPending, load])

  const current = useMemo(
    () => batches.find((b) => b.id === selectedBatchId) ?? batches[0] ?? null,
    [batches, selectedBatchId],
  )

  const upsertBatch = useCallback((batch: ImageStudioBatchWithResults) => {
    setBatches((prev) => {
      const idx = prev.findIndex((b) => b.id === batch.id)
      const next = [...prev]
      if (idx >= 0) next[idx] = batch
      else next.unshift(batch)
      return next
    })
  }, [])

  const createBatch = useCallback(async () => {
    setCreating(true)
    try {
      const res = await fetch("/api/admin/image-studio/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Lote ${batches.length + 1}`,
          format: "hero",
          instruction: "",
          reference_image_urls: [],
          reference_mode: "all",
          adapt_flags: { idioma: true, cores: true, logo: true, catalogo: true },
          text_context: {},
          store_ids: [],
          variations: [{}],
        }),
      })
      if (!res.ok) throw new Error(await parseError(res))
      const j = (await res.json()) as { batch: ImageStudioBatchWithResults }
      upsertBatch(j.batch)
      setSelectedBatchId(j.batch.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar lote")
    } finally {
      setCreating(false)
    }
  }, [batches.length, upsertBatch])

  const removeBatch = useCallback(
    async (batchId: string) => {
      try {
        const res = await fetch(`/api/admin/image-studio/batches/${batchId}`, {
          method: "DELETE",
        })
        if (!res.ok) throw new Error(await parseError(res))
        setBatches((prev) => prev.filter((b) => b.id !== batchId))
        setSelectedBatchId((cur) => (cur === batchId ? null : cur))
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao excluir lote")
      }
    },
    [],
  )

  // Geração com CHUNKING: fatia as lojas em grupos e dispara um request por
  // grupo, sequencial — nenhum request encosta no teto de 300s e os cards
  // atualizam ao vivo entre chunks (o polling puxa o progresso).
  const generateBatch = useCallback(async () => {
    if (!current) return
    const selectedStores = current.store_ids
    if (selectedStores.length === 0) return
    // Aprovadas são congeladas no servidor — não entram na conta nem no
    // update otimista (senão o card aprovado piscaria "Gerando…" à toa).
    const approvedKeys = new Set(
      current.results
        .filter((r) => r.approved_at)
        .map((r) => `${r.store_id}:${r.variation_index}`),
    )
    const total =
      selectedStores.length * current.variations.length - approvedKeys.size
    if (total <= 0) return
    if (total > CONFIRM_THRESHOLD) {
      const ok = window.confirm(
        `Isso vai gerar ${total} imagens (${selectedStores.length} lojas × ${current.variations.length} variações${
          approvedKeys.size > 0 ? `, ${approvedKeys.size} aprovadas ficam de fora` : ""
        }). Confirmar?`,
      )
      if (!ok) return
    }
    setGenerating(true)
    // Otimista: marca como gerando só o que NÃO está aprovado; as
    // aprovadas seguem com o resultado atual.
    setBatches((prev) =>
      prev.map((b) =>
        b.id === current.id
          ? {
              ...b,
              results: selectedStores.flatMap((storeId) =>
                current.variations.map<ImageStudioResult>((_, vi) => {
                  const existing = b.results.find(
                    (r) => r.store_id === storeId && r.variation_index === vi,
                  )
                  if (existing?.approved_at) return existing
                  const meta = stores.find((s) => s.store_id === storeId)
                  return {
                    id: `tmp-${storeId}-${vi}`,
                    batch_id: b.id,
                    store_id: storeId,
                    store_name: meta?.store_name ?? "Loja",
                    country: meta?.country ?? "",
                    language: meta?.language ?? null,
                    variation_index: vi,
                    status: "generating",
                    image_url: null,
                    adjustment_notes: null,
                    error_message: null,
                    generated_at: null,
                    approved_at: null,
                    updated_at: new Date().toISOString(),
                  }
                }),
              ),
            }
          : b,
      ),
    )
    try {
      for (let i = 0; i < selectedStores.length; i += GENERATE_CHUNK_STORES) {
        const chunk = selectedStores.slice(i, i + GENERATE_CHUNK_STORES)
        const res = await fetch(
          `/api/admin/image-studio/batches/${current.id}/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ store_ids: chunk }),
          },
        )
        if (!res.ok) throw new Error(await parseError(res))
        const j = (await res.json()) as { batch: ImageStudioBatchWithResults }
        upsertBatch(j.batch)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar")
      void load()
    } finally {
      setGenerating(false)
    }
  }, [current, stores, upsertBatch, load])

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col px-4 py-4 sm:px-6">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ImagePlus size={18} className="shrink-0 text-muted-foreground" />
          <h1 className="truncate text-[18px] font-semibold text-foreground">
            Geração de Imagens
          </h1>
          <span className="ml-1 rounded-[5px] bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            Estúdio
          </span>
        </div>
        <span className="hidden text-[12px] text-muted-foreground sm:inline">
          {stores.length} loja{stores.length === 1 ? "" : "s"} disponíve
          {stores.length === 1 ? "l" : "is"}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-background">
        {/* Sidebar de lotes (histórico) */}
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
                className={`group mb-1 flex w-full flex-col gap-1 rounded-[6px] px-2.5 py-2 text-left ${
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
                  <span>
                    {b.store_ids.length} loja{b.store_ids.length === 1 ? "" : "s"} ×{" "}
                    {b.variations.length}
                  </span>
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
              batch={current}
              allStores={stores}
              generating={generating}
              onBatchChange={upsertBatch}
              onGenerate={generateBatch}
              onDelete={() => {
                if (
                  window.confirm(
                    "Excluir este lote e todas as imagens geradas? Essa ação é definitiva.",
                  )
                ) {
                  void removeBatch(current.id)
                }
              }}
              onResultChange={(result) => {
                setBatches((prev) =>
                  prev.map((b) =>
                    b.id === result.batch_id
                      ? {
                          ...b,
                          results: (() => {
                            const idx = b.results.findIndex(
                              (r) =>
                                r.store_id === result.store_id &&
                                r.variation_index === result.variation_index,
                            )
                            const arr = [...b.results]
                            if (idx >= 0) arr[idx] = result
                            else arr.push(result)
                            return arr
                          })(),
                        }
                      : b,
                  ),
                )
              }}
            />
          )}
        </main>
      </div>
    </div>
  )
}

// ── Editor de um lote ────────────────────────────────────────────────

function BatchEditor({
  batch,
  allStores,
  generating,
  onBatchChange,
  onGenerate,
  onDelete,
  onResultChange,
}: {
  batch: ImageStudioBatchWithResults
  allStores: ImageStudioStore[]
  generating: boolean
  onBatchChange: (b: ImageStudioBatchWithResults) => void
  onGenerate: () => void
  onDelete: () => void
  onResultChange: (r: ImageStudioResult) => void
}) {
  const [name, setName] = useState(batch.name)
  const [format, setFormat] = useState<ImageStudioFormat>(batch.format)
  const [instruction, setInstruction] = useState(batch.instruction)
  const [flags, setFlags] = useState<ImageStudioAdaptFlags>(batch.adapt_flags ?? {})
  const [textContext, setTextContext] = useState<ImageStudioTextContext>(
    batch.text_context ?? {},
  )
  const [refUrls, setRefUrls] = useState<string[]>(batch.reference_image_urls ?? [])
  const [refMode, setRefMode] = useState<ImageStudioReferenceMode>(
    batch.reference_mode ?? "all",
  )
  const [storeIds, setStoreIds] = useState<string[]>(batch.store_ids)
  const [variations, setVariations] = useState<ImageStudioVariation[]>(
    batch.variations.length > 0 ? batch.variations : [{}],
  )
  const [storeSpecs, setStoreSpecs] = useState<Record<string, ImageStudioStoreSpec>>(
    batch.store_specs ?? {},
  )
  const [addingSpecFor, setAddingSpecFor] = useState("")
  const [specUploadingFor, setSpecUploadingFor] = useState<string | null>(null)
  const specFileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [storeQuery, setStoreQuery] = useState("")
  const [countryFilter, setCountryFilter] = useState("")
  const [languageFilter, setLanguageFilter] = useState("")
  const [nicheFilter, setNicheFilter] = useState("")
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const toast = useToast()

  const saveBatch = useCallback(
    async (patch: Record<string, unknown>) => {
      setSaving(true)
      try {
        const res = await fetch(`/api/admin/image-studio/batches/${batch.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        })
        if (res.ok) {
          const j = (await res.json()) as { batch: ImageStudioBatchWithResults }
          onBatchChange({ ...j.batch, results: batch.results })
        }
      } catch {
        /* silencioso — re-tenta no próximo save */
      } finally {
        setSaving(false)
      }
    },
    [batch.id, batch.results, onBatchChange],
  )

  // Aceita N arquivos de uma vez: sobe em série (a rota é 1 arquivo por
  // request) e ACRESCENTA à lista, respeitando o teto.
  const onUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      setUploading(true)
      const uploaded: string[] = []
      try {
        for (const file of files) {
          if (refUrls.length + uploaded.length >= MAX_REFERENCE_IMAGES) break
          const fd = new FormData()
          fd.append("file", file)
          fd.append("batch_id", batch.id)
          const res = await fetch("/api/admin/image-studio/upload", {
            method: "POST",
            body: fd,
          })
          if (!res.ok) throw new Error(await parseError(res))
          const j = (await res.json()) as { url: string }
          uploaded.push(j.url)
        }
      } catch {
        /* erro de upload — o que subiu antes é preservado abaixo */
      } finally {
        if (uploaded.length > 0) {
          const next = [...refUrls, ...uploaded].slice(0, MAX_REFERENCE_IMAGES)
          setRefUrls(next)
          await saveBatch({ reference_image_urls: next })
        }
        setUploading(false)
      }
    },
    [batch.id, refUrls, saveBatch],
  )

  const removeRefUrl = (url: string) => {
    const next = refUrls.filter((u) => u !== url)
    setRefUrls(next)
    void saveBatch({ reference_image_urls: next })
  }

  const toggleFlag = (key: keyof ImageStudioAdaptFlags) => {
    const next = { ...flags, [key]: !flags[key] }
    setFlags(next)
    void saveBatch({ adapt_flags: next })
  }

  const toggleTextField = (key: keyof ImageStudioTextContext) => {
    const cur = textContext[key]
    const next: ImageStudioTextContext = {
      ...textContext,
      [key]: { include: !cur?.include, value: cur?.value },
    }
    setTextContext(next)
    void saveBatch({ text_context: next })
  }

  const setTextFieldValue = (key: keyof ImageStudioTextContext, value: string) => {
    setTextContext((cur) => ({
      ...cur,
      [key]: { include: cur[key]?.include ?? true, value },
    }))
  }

  const commitTextField = (key: keyof ImageStudioTextContext) => {
    const field = textContext[key]
    if (!field?.include) return
    void saveBatch({ text_context: textContext })
  }

  // ── Seleção de lojas ──
  const commitStoreIds = (next: string[]) => {
    setStoreIds(next)
    void saveBatch({ store_ids: next })
  }

  const toggleStore = (storeId: string) => {
    commitStoreIds(
      storeIds.includes(storeId)
        ? storeIds.filter((id) => id !== storeId)
        : [...storeIds, storeId],
    )
  }

  /** Opções de um eixo de segmentação, com contagem — alimenta os selects. */
  const facetOptions = useCallback(
    (pick: (s: ImageStudioStore) => string | null): Array<[string, number]> => {
      const counts = new Map<string, number>()
      for (const s of allStores) {
        const v = (pick(s) ?? "").trim()
        if (!v) continue
        counts.set(v, (counts.get(v) ?? 0) + 1)
      }
      return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    },
    [allStores],
  )

  const countryOptions = useMemo(() => facetOptions((s) => s.country), [facetOptions])
  const languageOptions = useMemo(() => facetOptions((s) => s.language), [facetOptions])
  const nicheOptions = useMemo(() => facetOptions((s) => s.niche), [facetOptions])

  // Lojas visíveis = busca + os 3 filtros combinados (AND).
  const filteredStores = useMemo(() => {
    const q = storeQuery.trim().toLowerCase()
    return allStores.filter((s) => {
      if (q && !s.store_name.toLowerCase().includes(q)) return false
      if (countryFilter && (s.country ?? "").trim() !== countryFilter) return false
      if (languageFilter && (s.language ?? "").trim() !== languageFilter) return false
      if (nicheFilter && (s.niche ?? "").trim() !== nicheFilter) return false
      return true
    })
  }, [allStores, storeQuery, countryFilter, languageFilter, nicheFilter])

  const visibleIds = useMemo(
    () => filteredStores.map((s) => s.store_id),
    [filteredStores],
  )
  const visibleAllSelected =
    visibleIds.length > 0 && visibleIds.every((id) => storeIds.includes(id))

  const selectVisible = () => {
    commitStoreIds(Array.from(new Set([...storeIds, ...visibleIds])))
  }
  const unselectVisible = () => {
    const visible = new Set(visibleIds)
    commitStoreIds(storeIds.filter((id) => !visible.has(id)))
  }
  // ── Adendos por loja ──
  // Digitar é local (controlado); persiste no blur, como os demais campos.
  const setSpecText = (storeId: string, instruction: string) => {
    setStoreSpecs((cur) => ({ ...cur, [storeId]: { ...cur[storeId], instruction } }))
  }

  // Imagem-exemplo da loja: sobe e persiste na hora (não tem blur).
  const uploadSpecImage = async (storeId: string, file: File) => {
    setSpecUploadingFor(storeId)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("batch_id", batch.id)
      const res = await fetch("/api/admin/image-studio/upload", {
        method: "POST",
        body: fd,
      })
      if (!res.ok) throw new Error(await parseError(res))
      const j = (await res.json()) as { url: string }
      const next = {
        ...storeSpecs,
        [storeId]: { ...storeSpecs[storeId], reference_image_url: j.url },
      }
      setStoreSpecs(next)
      await saveBatch({ store_specs: next })
    } catch {
      /* erro de upload — silencioso por ora */
    } finally {
      setSpecUploadingFor(null)
    }
  }

  const removeSpecImage = (storeId: string) => {
    const next = {
      ...storeSpecs,
      [storeId]: { ...storeSpecs[storeId], reference_image_url: undefined },
    }
    setStoreSpecs(next)
    void saveBatch({ store_specs: next })
  }
  const commitSpecs = () => {
    void saveBatch({ store_specs: storeSpecs })
  }
  const removeSpec = (storeId: string) => {
    const next = { ...storeSpecs }
    delete next[storeId]
    setStoreSpecs(next)
    void saveBatch({ store_specs: next })
  }
  // Cartões: lojas com adendo (mesmo em branco enquanto edita) na ordem da seleção.
  const specStoreIds = useMemo(
    () => storeIds.filter((id) => storeSpecs[id] !== undefined),
    [storeIds, storeSpecs],
  )
  // Candidatas a receber um adendo: selecionadas que ainda não têm.
  const specCandidates = useMemo(
    () =>
      storeIds
        .filter((id) => storeSpecs[id] === undefined)
        .map((id) => allStores.find((s) => s.store_id === id))
        .filter((s): s is ImageStudioStore => !!s),
    [storeIds, storeSpecs, allStores],
  )
  const storeName = (id: string) =>
    allStores.find((s) => s.store_id === id)?.store_name ?? "Loja"

  const hasFilters = !!(storeQuery.trim() || countryFilter || languageFilter || nicheFilter)
  const clearFilters = () => {
    setStoreQuery("")
    setCountryFilter("")
    setLanguageFilter("")
    setNicheFilter("")
  }

  // ── Variações ──
  const setVariationCount = (count: number) => {
    const n = Math.max(1, Math.min(MAX_VARIATIONS, count))
    const next = Array.from({ length: n }, (_, i) => variations[i] ?? {})
    setVariations(next)
    void saveBatch({ variations: next })
  }

  const setVariationDirection = (index: number, direction: string) => {
    setVariations((cur) => cur.map((v, i) => (i === index ? { ...v, direction } : v)))
  }

  const commitVariations = () => {
    void saveBatch({ variations })
  }

  const results = batch.results
  const anyPending = results.some(
    (r) => r.status === "queued" || r.status === "generating",
  )
  const readyCount = countByStatus(results).ready
  const approvedCount = results.filter(
    (r) => r.approved_at && storeIds.includes(r.store_id) && r.variation_index < variations.length,
  ).length
  // O botão promete o que a geração REALMENTE vai fazer: aprovadas ficam fora.
  const totalImages = Math.max(
    0,
    storeIds.length * variations.length - approvedCount,
  )

  const selectedStores = useMemo(
    () =>
      storeIds
        .map((id) => allStores.find((s) => s.store_id === id))
        .filter((s): s is ImageStudioStore => !!s),
    [storeIds, allStores],
  )

  const handleDownloadAll = useCallback(async () => {
    setDownloadingAll(true)
    try {
      const res = await fetch(
        `/api/admin/image-studio/batches/${batch.id}/download-zip`,
      )
      await downloadResponseAsFile(res, `${batch.name || "imagens"}.zip`)
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao baixar",
        description: e instanceof Error ? e.message : "Erro desconhecido",
      })
    } finally {
      setDownloadingAll(false)
    }
  }, [batch.id, batch.name, toast])

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
        <div className="flex items-center gap-2">
          {saving && <span className="text-[11px] text-muted-foreground">Salvando…</span>}
          <button
            type="button"
            onClick={onDelete}
            title="Excluir lote"
            className="rounded-[5px] p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Form do lote */}
      <div className="mb-4 grid grid-cols-1 gap-3 rounded-[8px] border border-border bg-card p-3 lg:grid-cols-2 2xl:grid-cols-3">
        {/* Formato */}
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Formato
          </label>
          <select
            value={format}
            onChange={(e) => {
              const f = e.target.value as ImageStudioFormat
              setFormat(f)
              void saveBatch({ format: f })
            }}
            className="w-full rounded-[6px] border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground"
          >
            {(Object.keys(FORMAT_LABEL) as ImageStudioFormat[]).map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
        </div>

        {/* Imagens-base (0..N) + modo de uso */}
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Imagens-base (opcional)
            {refUrls.length > 0 && (
              <span className="ml-1.5 font-semibold normal-case tracking-normal text-foreground">
                {refUrls.length}/{MAX_REFERENCE_IMAGES}
              </span>
            )}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {refUrls.map((url, i) => (
              <span key={url} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Imagem-base ${i + 1}`}
                  title={`Imagem-base ${i + 1}`}
                  className="h-11 w-11 rounded-[5px] border border-border object-cover"
                />
                <span className="absolute left-0 top-0 rounded-br-[4px] rounded-tl-[4px] bg-black/60 px-1 text-[9px] font-bold text-white">
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeRefUrl(url)}
                  title="Remover"
                  className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-white group-hover:flex"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            {refUrls.length < MAX_REFERENCE_IMAGES && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-dashed border-border bg-background px-2.5 py-1.5 text-[12px] font-medium text-foreground/80 hover:bg-muted disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Upload size={13} />
                )}
                {refUrls.length > 0 ? "Adicionar" : "Enviar imagem"}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                if (files.length > 0) void onUpload(files)
                e.target.value = ""
              }}
            />
          </div>

          {/* Modo só faz diferença com 2+ imagens */}
          {refUrls.length > 1 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["all", "Todas em cada imagem"],
                  ["per_variation", "Uma por variação"],
                ] as Array<[ImageStudioReferenceMode, string]>
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setRefMode(mode)
                    void saveBatch({ reference_mode: mode })
                  }}
                  className={`rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${
                    refMode === mode
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
              <span className="text-[10.5px] text-muted-foreground">
                {refMode === "per_variation"
                  ? `variação 1 → imagem 1, variação 2 → imagem 2… (repete em ciclo)`
                  : "o modelo recebe todas as referências em cada geração"}
              </span>
            </div>
          )}
        </div>

        {/* Instrução */}
        <div className="lg:col-span-2 2xl:col-span-3">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Instrução
          </label>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onBlur={() => instruction !== batch.instruction && saveBatch({ instruction })}
            rows={3}
            placeholder="Descreva o tipo de imagem a gerar (ex.: hero com produto em ambiente lifestyle, fundo claro)…"
            className="w-full resize-none rounded-[6px] border border-border bg-background px-2.5 py-2 text-[13px] text-foreground"
          />
        </div>

        {/* Variações por loja */}
        <div className="lg:col-span-2 2xl:col-span-3">
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Variações por loja
          </label>
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVariationCount(variations.length - 1)}
              disabled={variations.length <= 1}
              className="flex h-7 w-7 items-center justify-center rounded-[5px] border border-border bg-background text-foreground/70 hover:bg-muted disabled:opacity-40"
              aria-label="Menos variações"
            >
              <Minus size={13} />
            </button>
            <span className="w-8 text-center text-[14px] font-semibold text-foreground">
              {variations.length}
            </span>
            <button
              type="button"
              onClick={() => setVariationCount(variations.length + 1)}
              disabled={variations.length >= MAX_VARIATIONS}
              className="flex h-7 w-7 items-center justify-center rounded-[5px] border border-border bg-background text-foreground/70 hover:bg-muted disabled:opacity-40"
              aria-label="Mais variações"
            >
              <Plus size={13} />
            </button>
            <span className="text-[11.5px] text-muted-foreground">
              imagem{variations.length === 1 ? "" : "ns"} por loja — direção opcional por
              variação (vazia = variação livre)
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {variations.map((v, i) => (
              <div key={i} className="flex flex-col gap-1">
                <span className="text-[10.5px] font-medium text-muted-foreground">
                  Variação {i + 1}
                </span>
                <input
                  value={v.direction ?? ""}
                  onChange={(e) => setVariationDirection(i, e.target.value)}
                  onBlur={commitVariations}
                  maxLength={1000}
                  placeholder="ex.: produto em close, fundo cor da marca (opcional)"
                  className="w-full rounded-[5px] border border-border bg-background px-2 py-1.5 text-[12px] text-foreground"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Flags de adaptação */}
        <div className="lg:col-span-2 2xl:col-span-3">
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
        <div className="lg:col-span-2 2xl:col-span-3">
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

        {/* Seleção de lojas — busca + filtros (país/idioma/nicho) + ações em massa */}
        <div className="lg:col-span-2 2xl:col-span-3">
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Lojas do lote
            <span className="ml-1.5 font-semibold normal-case tracking-normal text-foreground">
              {storeIds.length} de {allStores.length} selecionada
              {storeIds.length === 1 ? "" : "s"}
            </span>
          </label>

          {/* Busca + facetas */}
          <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-2 rounded-[6px] border border-border bg-background px-2.5 py-1.5">
              <Search size={13} className="shrink-0 text-muted-foreground" />
              <input
                value={storeQuery}
                onChange={(e) => setStoreQuery(e.target.value)}
                placeholder="Buscar loja…"
                className="w-full bg-transparent text-[12.5px] text-foreground outline-none"
              />
            </div>
            <FacetSelect
              label="País"
              value={countryFilter}
              options={countryOptions}
              onChange={setCountryFilter}
            />
            <FacetSelect
              label="Idioma"
              value={languageFilter}
              options={languageOptions}
              onChange={setLanguageFilter}
            />
            <FacetSelect
              label="Nicho"
              value={nicheFilter}
              options={nicheOptions}
              onChange={setNicheFilter}
            />
          </div>

          {/* Ações em massa sobre o recorte visível */}
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={selectVisible}
              disabled={visibleIds.length === 0 || visibleAllSelected}
              className="inline-flex items-center gap-1.5 rounded-[5px] border border-border bg-background px-2.5 py-1 text-[11.5px] font-medium text-foreground/80 hover:bg-muted disabled:opacity-40"
            >
              <CheckCircle2 size={12} />
              Selecionar {visibleIds.length}
              {hasFilters ? " filtrada" : " loja"}
              {visibleIds.length === 1 ? "" : "s"}
            </button>
            <button
              type="button"
              onClick={unselectVisible}
              disabled={!visibleIds.some((id) => storeIds.includes(id))}
              className="inline-flex items-center gap-1.5 rounded-[5px] border border-border bg-background px-2.5 py-1 text-[11.5px] font-medium text-foreground/80 hover:bg-muted disabled:opacity-40"
            >
              <X size={12} />
              Remover visíveis
            </button>
            {storeIds.length > 0 && (
              <button
                type="button"
                onClick={() => commitStoreIds([])}
                className="rounded-[5px] px-2 py-1 text-[11.5px] font-medium text-muted-foreground hover:bg-muted"
              >
                Limpar seleção
              </button>
            )}
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-[5px] px-2 py-1 text-[11.5px] font-medium text-muted-foreground hover:bg-muted"
              >
                Limpar filtros
              </button>
            )}
          </div>

          {/* Lista das lojas visíveis (linhas densas, multi-coluna em telas largas) */}
          <div className="max-h-[19rem] overflow-y-auto rounded-[6px] border border-border bg-background">
            {filteredStores.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                Nenhuma loja com esses filtros.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3">
                {filteredStores.map((s) => {
                  const on = storeIds.includes(s.store_id)
                  const meta = [s.country, s.language, s.niche].filter(Boolean).join(" · ")
                  return (
                    <button
                      key={s.store_id}
                      type="button"
                      onClick={() => toggleStore(s.store_id)}
                      title={[s.store_name, meta].filter(Boolean).join(" — ")}
                      className={`flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5 text-left transition-colors ${
                        on ? "bg-primary/5" : "hover:bg-muted/60"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${
                          on
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-background"
                        }`}
                      >
                        {on && <Check size={11} strokeWidth={3} />}
                      </span>
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-[8.5px] font-bold text-white"
                        style={{ background: s.primary_color || "#1F1F1F" }}
                      >
                        {initials(s.store_name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">
                        {s.store_name}
                        {(storeSpecs[s.store_id]?.instruction?.trim() ||
                          storeSpecs[s.store_id]?.reference_image_url) && (
                          <span
                            title="Tem especificação própria de geração"
                            className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle"
                          />
                        )}
                      </span>
                      {meta && (
                        <span className="max-w-[45%] shrink-0 truncate text-[10.5px] text-muted-foreground">
                          {meta}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Especificações por loja — adendo ao brief, só das lojas que têm */}
        <div className="lg:col-span-2 2xl:col-span-3">
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Especificações por loja
            <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground/80">
              acrescentam ao brief base, valem para todas as variações da loja
            </span>
          </label>

          {specStoreIds.length > 0 && (
            <div className="mb-2 grid grid-cols-1 gap-2 xl:grid-cols-2">
              {specStoreIds.map((id) => (
                <div
                  key={id}
                  className="rounded-[6px] border border-border bg-background p-2"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
                      {storeName(id)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSpec(id)}
                      title="Remover especificação"
                      className="rounded-[4px] p-1 text-muted-foreground hover:bg-muted hover:text-rose-600"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <textarea
                      value={storeSpecs[id]?.instruction ?? ""}
                      onChange={(e) => setSpecText(id, e.target.value)}
                      onBlur={commitSpecs}
                      rows={2}
                      maxLength={1000}
                      autoFocus={!storeSpecs[id]?.instruction}
                      placeholder="ex.: usar a caixa de presente aberta, fundo escuro"
                      className="min-w-0 flex-1 resize-none rounded-[5px] border border-border bg-background px-2 py-1.5 text-[12px] text-foreground"
                    />
                    {/* Imagem-exemplo desta loja — substitui as imagens-base do lote */}
                    {storeSpecs[id]?.reference_image_url ? (
                      <span className="group/img relative shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={storeSpecs[id]!.reference_image_url}
                          alt={`Exemplo de ${storeName(id)}`}
                          title="Imagem-exemplo desta loja (vai junto com as do lote)"
                          className="h-[52px] w-[52px] rounded-[5px] border border-border object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeSpecImage(id)}
                          title="Remover imagem"
                          className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-white group-hover/img:flex"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => specFileRefs.current[id]?.click()}
                        disabled={specUploadingFor === id}
                        title="Enviar imagem-exemplo desta loja — vai junto com as imagens-base do lote"
                        className="flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[5px] border border-dashed border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
                      >
                        {specUploadingFor === id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <>
                            <ImagePlus size={14} />
                            <span className="text-[9px] font-medium">exemplo</span>
                          </>
                        )}
                      </button>
                    )}
                    <input
                      ref={(el) => {
                        specFileRefs.current[id] = el
                      }}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void uploadSpecImage(id, f)
                        e.target.value = ""
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {specCandidates.length > 0 ? (
            <select
              value={addingSpecFor}
              onChange={(e) => {
                const id = e.target.value
                if (!id) return
                setSpecText(id, "")
                setAddingSpecFor("")
              }}
              className="w-full rounded-[6px] border border-dashed border-border bg-background px-2.5 py-1.5 text-[12.5px] text-muted-foreground sm:max-w-sm"
            >
              <option value="">+ Especificação para uma loja…</option>
              {specCandidates.map((s) => (
                <option key={s.store_id} value={s.store_id}>
                  {s.store_name}
                </option>
              ))}
            </select>
          ) : (
            storeIds.length === 0 && (
              <p className="text-[12px] text-muted-foreground">
                Selecione lojas acima para poder especificar por loja.
              </p>
            )
          )}
        </div>
      </div>

      {/* Ações */}
      <div className="mb-3 flex flex-wrap items-center justify-end gap-1.5">
        {readyCount > 0 && (
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={downloadingAll}
            title={`Baixar ${readyCount} imagem${readyCount === 1 ? "" : "ns"} em .zip`}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-border bg-background px-3 py-2 text-[12.5px] font-medium text-foreground/80 hover:bg-muted disabled:opacity-50"
          >
            {downloadingAll ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Archive size={14} />
            )}
            Baixar todas
          </button>
        )}
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating || anyPending || totalImages === 0}
          className="inline-flex items-center gap-1.5 rounded-[6px] bg-foreground px-3.5 py-2 text-[12.5px] font-semibold text-background hover:opacity-90 disabled:opacity-50"
        >
          {generating || anyPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          Gerar {totalImages} imagem{totalImages === 1 ? "" : "ns"}
          {variations.length > 1 && storeIds.length > 0
            ? ` (${storeIds.length}×${variations.length}${
                approvedCount > 0 ? ` − ${approvedCount} aprovada${approvedCount === 1 ? "" : "s"}` : ""
              })`
            : approvedCount > 0
              ? ` (− ${approvedCount} aprovada${approvedCount === 1 ? "" : "s"})`
              : ""}
        </button>
      </div>

      {/* Grid loja × variação */}
      {selectedStores.length === 0 ? (
        <div className="flex h-24 items-center justify-center text-[12.5px] text-muted-foreground">
          Selecione as lojas do lote acima.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {selectedStores.map((s) => (
            <div key={s.store_id}>
              <div className="mb-1.5 flex items-center gap-2">
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-[5px] text-[8.5px] font-bold text-white"
                  style={{ background: s.primary_color || "#1F1F1F" }}
                >
                  {initials(s.store_name)}
                </span>
                <span className="text-[13px] font-medium text-foreground">
                  {s.store_name}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {s.country || ""}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 min-[1800px]:grid-cols-5">
                {variations.map((v, vi) => (
                  <ResultCard
                    key={`${s.store_id}-${vi}`}
                    format={batch.format}
                    store={s}
                    variationIndex={vi}
                    variationLabel={v.label || `Variação ${vi + 1}`}
                    result={
                      results.find(
                        (r) => r.store_id === s.store_id && r.variation_index === vi,
                      ) ?? null
                    }
                    onResultChange={onResultChange}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Select de faceta (país/idioma/nicho) com contagem por valor. */
function FacetSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<[string, number]>
  onChange: (v: string) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={`w-full rounded-[6px] border bg-background px-2.5 py-1.5 text-[12.5px] ${
        value ? "border-foreground font-medium text-foreground" : "border-border text-foreground/70"
      }`}
    >
      <option value="">{label}: todos</option>
      {options.map(([v, count]) => (
        <option key={v} value={v}>
          {label}: {v} ({count})
        </option>
      ))}
    </select>
  )
}

// ── Card de resultado (loja × variação) ──────────────────────────────

// Card preso: generating/queued há mais que o maxDuration da rota (5min).
const STUCK_MS = 5 * 60 * 1000

function ResultCard({
  format,
  store,
  variationIndex,
  variationLabel,
  result,
  onResultChange,
}: {
  format: ImageStudioFormat
  store: ImageStudioStore
  variationIndex: number
  variationLabel: string
  result: ImageStudioResult | null
  onResultChange: (r: ImageStudioResult) => void
}) {
  const [busy, setBusy] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [notes, setNotes] = useState("")
  const [downloading, setDownloading] = useState(false)
  const [zoom, setZoom] = useState(false)
  const [imgReady, setImgReady] = useState(true)
  const toast = useToast()

  useEffect(() => {
    if (!zoom) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        setZoom(false)
      }
    }
    window.addEventListener("keydown", onKey, true)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey, true)
      document.body.style.overflow = prevOverflow
    }
  }, [zoom])

  // Sem resultado = nunca gerou. Estado idle explícito — nunca finge fila.
  const hasResult = !!result
  const status = result?.status ?? "queued"
  const sm = hasResult
    ? statusMeta(status)
    : { dot: "bg-muted-foreground/40", label: "Aguardando geração" }
  const isPending = hasResult && (status === "queued" || status === "generating")
  const canDownload =
    !!result?.image_url && (status === "ready" || status === "adjustment")
  const isApproved = !!result?.approved_at
  const isStuck =
    isPending &&
    !!result?.updated_at &&
    Date.now() - Date.parse(result.updated_at) > STUCK_MS

  const handleDownload = useCallback(async () => {
    if (!result?.image_url) return
    setDownloading(true)
    try {
      await downloadImageUrl(
        result.image_url,
        imageFilename(store.store_name, format, variationIndex, result.image_url),
      )
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao baixar",
        description: e instanceof Error ? e.message : "Erro desconhecido",
      })
    } finally {
      setDownloading(false)
    }
  }, [result?.image_url, store.store_name, format, variationIndex, toast])

  const setApproval = useCallback(
    async (approved: boolean) => {
      if (!result || result.id.startsWith("tmp-")) return
      setBusy(true)
      // Otimista: o cadeado aparece/some na hora.
      onResultChange({
        ...result,
        approved_at: approved ? new Date().toISOString() : null,
      })
      try {
        const res = await fetch(`/api/admin/image-studio/results/${result.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approved }),
        })
        if (res.ok) {
          const j = (await res.json()) as { result: ImageStudioResult }
          onResultChange(j.result)
        }
      } catch {
        /* o polling reconcilia com o estado real */
      } finally {
        setBusy(false)
      }
    },
    [result, onResultChange],
  )

  const regenerate = useCallback(
    async (adjustmentNotes: string | null) => {
      if (!result || result.id.startsWith("tmp-")) return
      setBusy(true)
      onResultChange({
        ...result,
        status: "generating",
        adjustment_notes: adjustmentNotes,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      setImgReady(!result.image_url ? true : false)
      try {
        const res = await fetch(`/api/admin/image-studio/results/${result.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adjustment_notes: adjustmentNotes }),
        })
        if (res.ok) {
          const j = (await res.json()) as { result: ImageStudioResult }
          onResultChange(j.result)
        }
        // Falha silenciosa: fica em generating; o polling resolve pro estado real.
      } catch {
        /* idem */
      } finally {
        setBusy(false)
        setAdjusting(false)
        setNotes("")
      }
    },
    [result, onResultChange],
  )

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-[8px] border bg-card ${
        isApproved ? "border-emerald-500/60 ring-1 ring-emerald-500/30" : "border-border"
      }`}
    >
      {/* Área da imagem */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted/40">
        {result?.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={result.image_url}
            alt={`${variationLabel} de ${store.store_name}`}
            onLoad={() => setImgReady(true)}
            onError={() => setImgReady(true)}
            onClick={() => setZoom(true)}
            className="h-full w-full cursor-zoom-in object-cover"
          />
        ) : !isPending ? (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            {status === "failed" && hasResult ? (
              <AlertTriangle size={20} className="text-rose-500" />
            ) : (
              <ImagePlus size={20} className="opacity-40" />
            )}
          </div>
        ) : null}

        {(isPending || !imgReady) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background/70 backdrop-blur-[1px]">
            <Loader2 className="animate-spin text-foreground/70" size={22} />
            {isPending && (
              <span className="text-[11px] font-medium text-foreground/80">
                {result?.adjustment_notes ? "Ajustando…" : "Gerando…"}
              </span>
            )}
          </div>
        )}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-2 py-0.5 text-[10.5px] font-medium text-foreground shadow-sm">
          <span className={`h-1.5 w-1.5 rounded-full ${sm.dot}`} />
          {sm.label}
        </span>
        <span className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground shadow-sm">
          {variationLabel}
        </span>
        {isApproved && (
          <span
            title="Aprovada — não é regerada com o lote"
            className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm"
          >
            <Lock size={10} /> Aprovada
          </span>
        )}
        {result?.image_url && !isPending && imgReady && (
          <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
            <ZoomIn size={11} /> Ver
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-2 p-2.5">
        {status === "failed" && result?.error_message && (
          <p
            className="line-clamp-2 text-[11px] text-rose-600"
            title={result.error_message}
          >
            {result.error_message}
          </p>
        )}

        {!adjusting && isApproved && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setApproval(false)}
              disabled={busy}
              title="Desaprovar — volta a ser regerada com o lote"
              className="inline-flex items-center gap-1.5 rounded-[5px] border border-emerald-600/40 bg-emerald-50 px-2 py-1 text-[11.5px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-950/30"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
              Aprovada
            </button>
            {canDownload && (
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                title="Baixar imagem"
                className="inline-flex items-center gap-1.5 rounded-[5px] border border-border bg-background px-2 py-1 text-[11.5px] font-medium text-foreground/80 hover:bg-muted disabled:opacity-50"
              >
                {downloading ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Download size={12} />
                )}
                Baixar
              </button>
            )}
          </div>
        )}

        {!adjusting && !isApproved && (
          <div className="flex items-center gap-1.5">
            {canDownload && (
              <button
                type="button"
                onClick={() => setApproval(true)}
                disabled={busy}
                title="Aprovar — congela esta imagem; gerar o lote de novo não a substitui"
                className="inline-flex items-center gap-1.5 rounded-[5px] border border-border bg-background px-2 py-1 text-[11.5px] font-medium text-foreground/80 hover:bg-muted disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Check size={12} />
                )}
                Aprovar
              </button>
            )}
            {(hasResult && status === "failed") || isStuck ? (
              <button
                type="button"
                onClick={() => regenerate(null)}
                disabled={busy}
                title={isStuck ? "Parece travada — gerar de novo" : undefined}
                className="inline-flex items-center gap-1.5 rounded-[5px] border border-border bg-background px-2 py-1 text-[11.5px] font-medium text-foreground/80 hover:bg-muted disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RefreshCw size={12} />
                )}
                Tentar de novo
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAdjusting(true)}
                disabled={busy || isPending || !hasResult}
                className="inline-flex items-center gap-1.5 rounded-[5px] border border-border bg-background px-2 py-1 text-[11.5px] font-medium text-foreground/80 hover:bg-muted disabled:opacity-50"
              >
                <Sparkles size={12} />
                Regerar com ajuste
              </button>
            )}
            {canDownload && (
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                title="Baixar imagem"
                className="inline-flex items-center gap-1.5 rounded-[5px] border border-border bg-background px-2 py-1 text-[11.5px] font-medium text-foreground/80 hover:bg-muted disabled:opacity-50"
              >
                {downloading ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Download size={12} />
                )}
                Baixar
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

      {/* Lightbox */}
      {zoom && result?.image_url && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoom(false)}
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.image_url}
            alt={`${variationLabel} de ${store.store_name}`}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded object-contain shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setZoom(false)}
            aria-label="Fechar"
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X size={18} />
          </button>
          <span className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[12px] font-medium text-white/85">
            {store.store_name} — {variationLabel}
          </span>
        </div>
      )}
    </div>
  )
}
