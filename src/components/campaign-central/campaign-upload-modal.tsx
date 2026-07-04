"use client"

/**
 * Modal fullscreen "Subir Campanha por Loja" — tasks "Subir e-mails -
 * <idioma>" (impl_subir_ptbr/en/outras) da etapa de implementação.
 *
 * Mostra, loja a loja, o email daquela loja fatiado nos cortes do mapa
 * APROVADO (campaign_cut_maps) com ESCALA POR LARGURA (pixels do modelo ×
 * largura_loja ÷ largura_modelo), com a copy da loja ao lado
 * para copiar e download PNG/ZIP por corte. Imagens entram pelo import
 * automático do Figma (frames nomeados com o nome da loja) ou por upload
 * manual em massa/individual.
 *
 * As fatias na tela usam CSS crop (as URLs assinadas são cross-origin —
 * canvas ficaria tainted); os PNGs baixados são gerados no servidor com
 * sharp (rotas slice/download-zip).
 *
 * O progresso é POR CAMPANHA×LOJA — as 3 tasks de idioma compartilham. A
 * conclusão da TASK é manual no painel (banner orienta quando o grupo do
 * idioma termina).
 *
 * Shell replica campaign-cut-mapping-modal.tsx (overlay z-[60], ESC fecha,
 * portal montado pelo chamador).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileArchive,
  Figma,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Loader2,
  RefreshCw,
  RotateCcw,
  Upload,
  X,
} from "lucide-react"
import { PORT_TYPES, type CutPort } from "@/types/campaign-cuts"
import type {
  CampaignUploadPayload,
  CampaignUploadStore,
  FigmaImportResult,
} from "@/types/campaign-store-emails"
import type { EmailDraftBlock } from "@/types/campaign-central"
import {
  LANG_GROUP_LABEL,
  LANG_GROUP_ORDER,
  type TaskLangGroup,
} from "@/lib/campaign-cuts/lang"
import { matchNamesToStores } from "@/lib/campaign-cuts/store-match"
import { portPixelRectWidthScaled } from "@/lib/campaign-cuts/geometry"
import { assignBlocksToPorts } from "@/lib/campaign-cuts/copy-match"
import { BlockPreview, copyBlocksToText } from "./block-preview"

interface Props {
  taskId: string
  taskLang: TaskLangGroup
  campaignTitle?: string | null
  onClose: () => void
}

type ViewMode = "lista" | "workbench"

interface UnassignedFile {
  file: File
  storeId: string | ""
}

const STATUS_DOT: Record<string, string> = {
  pendente: "bg-gray-300 dark:bg-gray-600",
  andamento: "bg-amber-400",
  concluida: "bg-emerald-500",
}

/** Texto de UM bloco pro clipboard (sem os headers de copyBlocksToText). */
function blockText(block: EmailDraftBlock): string {
  switch (block.type) {
    case "heading":
      return [block.headline, block.sub].filter(Boolean).join("\n")
    case "text":
    case "footer":
      return block.value ?? ""
    case "offer":
    case "button":
      return block.value ?? ""
    case "image":
      return block.caption ?? ""
    case "products":
      return (block.items ?? [])
        .map((it) => `• ${it.name ?? "Produto"} — ${it.price ?? ""}`)
        .join("\n")
    default:
      return ""
  }
}

/**
 * Fatia exibida por CSS crop (sem canvas, sem CORS). O retângulo em
 * PIXELS vem de portPixelRectWidthScaled — a mesma conta do recorte
 * server-side, então o preview bate com o PNG baixado.
 */
function SliceView({
  imageUrl,
  natW,
  rect,
  alt,
  className,
}: {
  imageUrl: string
  natW: number
  rect: { top: number; height: number }
  alt: string
  className?: string
}) {
  const h = Math.max(rect.height, 1)
  return (
    <div
      className={`relative w-full overflow-hidden bg-muted ${className ?? ""}`}
      style={{ paddingTop: `${(h / natW) * 100}%` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={alt}
        className="absolute left-0 w-full max-w-none"
        style={{ top: `-${(rect.top / h) * 100}%` }}
        draggable={false}
      />
    </div>
  )
}

export function CampaignUploadModal({
  taskId,
  taskLang,
  campaignTitle,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<CampaignUploadPayload | null>(null)

  const [view, setView] = useState<ViewMode>("lista")
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null)
  const [activePortId, setActivePortId] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<TaskLangGroup>>(
    () => new Set(LANG_GROUP_ORDER.filter((g) => g !== taskLang)),
  )

  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<FigmaImportResult | null>(null)
  const [showImportPanel, setShowImportPanel] = useState(false)

  const [unassigned, setUnassigned] = useState<UnassignedFile[]>([])
  const [uploadingStores, setUploadingStores] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [showFullCopy, setShowFullCopy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const bulkInputRef = useRef<HTMLInputElement | null>(null)
  const storeInputRef = useRef<HTMLInputElement | null>(null)
  const importingRef = useRef(false)
  importingRef.current = importing

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg)
    window.setTimeout(() => setFeedback(null), 2400)
  }, [])

  // ── Load ───────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/campaign-uploads`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Erro ${res.status}`)
      }
      const j = (await res.json()) as {
        data?: CampaignUploadPayload
      } & Partial<CampaignUploadPayload>
      const p = (j.data ?? j) as CampaignUploadPayload
      setPayload(p)
      setError(null)
      return p
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar")
      return null
    }
  }, [taskId])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const p = await load()
      if (!alive || !p) {
        setLoading(false)
        return
      }
      // Auto-seleção: primeira loja não-concluída do idioma da task.
      const ofLang = p.stores.filter((s) => s.lang_group === taskLang)
      const first =
        ofLang.find((s) => s.email?.status !== "concluida") ??
        ofLang[0] ??
        p.stores[0]
      if (first) setActiveStoreId(first.store_id)
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [load, taskLang])

  // ESC fecha (bloqueado durante import — o POST continua no servidor,
  // mas fechar no meio confunde o operador).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !importingRef.current) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // ── Derivados ────────────────────────────────────────────────────────
  const stores = useMemo(() => payload?.stores ?? [], [payload])
  const activeStore = stores.find((s) => s.store_id === activeStoreId) ?? null
  const cutMap = payload?.cut_map ?? null
  const ports = useMemo(() => cutMap?.portas ?? [], [cutMap])

  const groupOrder = useMemo<TaskLangGroup[]>(
    () => [taskLang, ...LANG_GROUP_ORDER.filter((g) => g !== taskLang)],
    [taskLang],
  )
  const grouped = useMemo(
    () =>
      groupOrder
        .map((g) => ({
          group: g,
          items: stores.filter((s) => s.lang_group === g),
        }))
        .filter((g) => g.items.length > 0),
    [groupOrder, stores],
  )

  const copyMatch = useMemo(() => {
    if (!activeStore?.copy?.blocks || ports.length === 0) return null
    return assignBlocksToPorts(ports, activeStore.copy.blocks)
  }, [activeStore, ports])

  // Abre a copy completa automaticamente quando a distribuição é ambígua.
  useEffect(() => {
    setShowFullCopy(Boolean(copyMatch?.ambiguous))
    setActivePortId(null)
  }, [activeStoreId, copyMatch?.ambiguous])

  const langDone = useMemo(() => {
    const ofLang = stores.filter((s) => s.lang_group === taskLang)
    return (
      ofLang.length > 0 &&
      ofLang.every((s) => s.email?.status === "concluida")
    )
  }, [stores, taskLang])

  const downloadedSet = useMemo(
    () => new Set(activeStore?.email?.downloaded_ports ?? []),
    [activeStore],
  )

  // ── Ações ────────────────────────────────────────────────────────────
  const patchStore = useCallback(
    async (
      storeId: string,
      body: { status?: string; add_downloaded_ports?: string[] },
    ) => {
      const res = await fetch(`/api/tasks/${taskId}/campaign-uploads`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId, ...body }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Erro ${res.status}`)
      }
      const j = await res.json()
      const email = (j.data ?? j).email
      setPayload((p) =>
        p
          ? {
              ...p,
              stores: p.stores.map((s) =>
                s.store_id === storeId ? { ...s, email } : s,
              ),
            }
          : p,
      )
      return email
    },
    [taskId],
  )

  const handleImportFigma = useCallback(
    async (storeIds?: string[]) => {
      setImporting(true)
      setShowImportPanel(true)
      try {
        const res = await fetch(
          `/api/tasks/${taskId}/campaign-uploads/import-figma`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(storeIds?.length ? { store_ids: storeIds } : {}),
          },
        )
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(j.error || `Erro ${res.status}`)
        const result = (j.data ?? j) as FigmaImportResult
        setImportResult((prev) => {
          if (!storeIds?.length || !prev) return result
          // Retry parcial: substitui só as lojas re-tentadas.
          const byId = new Map(result.results.map((r) => [r.store_id, r]))
          return {
            ...result,
            results: prev.results.map((r) => byId.get(r.store_id) ?? r),
          }
        })
        await load()
        const ok = result.results.filter((r) => r.status === "imported").length
        showFeedback(`Import concluído: ${ok} loja(s) importada(s)`)
      } catch (e) {
        showFeedback(e instanceof Error ? e.message : "Erro no import")
      } finally {
        setImporting(false)
      }
    },
    [taskId, load, showFeedback],
  )

  const uploadFileForStore = useCallback(
    async (storeId: string, file: File) => {
      setUploadingStores((prev) => new Set(prev).add(storeId))
      try {
        const fd = new FormData()
        fd.append("file", file)
        fd.append("store_id", storeId)
        const res = await fetch(`/api/tasks/${taskId}/campaign-uploads/upload`, {
          method: "POST",
          body: fd,
        })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(j.error || `Erro ${res.status}`)
        const email = (j.data ?? j).email
        setPayload((p) =>
          p
            ? {
                ...p,
                stores: p.stores.map((s) =>
                  s.store_id === storeId ? { ...s, email } : s,
                ),
              }
            : p,
        )
        return true
      } catch (e) {
        showFeedback(e instanceof Error ? e.message : "Erro no upload")
        return false
      } finally {
        setUploadingStores((prev) => {
          const next = new Set(prev)
          next.delete(storeId)
          return next
        })
      }
    },
    [taskId, showFeedback],
  )

  const handleBulkFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith("image/"))
      if (images.length === 0) return
      const names = images.map((f) => f.name.replace(/\.[^.]+$/, ""))
      const match = matchNamesToStores(
        names,
        stores.map((s) => ({ store_id: s.store_id, store_name: s.store_name })),
      )
      const fileByName = new Map(names.map((n, i) => [n, images[i]]))

      // Não-casados/ambíguos → atribuição manual via select.
      const pending: UnassignedFile[] = [
        ...match.unmatchedNames,
        ...match.ambiguous.map((a) => a.name),
      ]
        .map((n) => fileByName.get(n))
        .filter((f): f is File => Boolean(f))
        .map((file) => ({ file, storeId: "" as const }))
      if (pending.length > 0) setUnassigned((prev) => [...prev, ...pending])

      // Casados: upload com pool de 3.
      const queue = match.matched.map((m) => ({
        storeId: m.store.store_id,
        file: fileByName.get(m.name)!,
      }))
      let next = 0
      let okCount = 0
      await Promise.all(
        Array.from({ length: Math.min(3, queue.length) }, async () => {
          while (next < queue.length) {
            const item = queue[next]
            next += 1
            const ok = await uploadFileForStore(item.storeId, item.file)
            if (ok) okCount += 1
          }
        }),
      )
      if (queue.length > 0) {
        showFeedback(
          `${okCount}/${queue.length} imagem(ns) casada(s) por nome${
            pending.length > 0 ? ` — ${pending.length} para atribuir` : ""
          }`,
        )
      } else if (pending.length > 0) {
        showFeedback(`${pending.length} arquivo(s) sem loja — atribua abaixo`)
      }
    },
    [stores, uploadFileForStore, showFeedback],
  )

  const handleDownloadSlice = useCallback(
    async (store: CampaignUploadStore, port: CutPort) => {
      const key = `${store.store_id}:${port.id}`
      setBusy((prev) => new Set(prev).add(key))
      try {
        const a = document.createElement("a")
        a.href = `/api/tasks/${taskId}/campaign-uploads/slice?store_id=${store.store_id}&port_id=${encodeURIComponent(port.id)}`
        a.download = ""
        document.body.appendChild(a)
        a.click()
        a.remove()
        await patchStore(store.store_id, { add_downloaded_ports: [port.id] })
      } catch (e) {
        showFeedback(e instanceof Error ? e.message : "Erro no download")
      } finally {
        setBusy((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    },
    [taskId, patchStore, showFeedback],
  )

  const handleDownloadZip = useCallback(
    async (store: CampaignUploadStore) => {
      const key = `${store.store_id}:zip`
      setBusy((prev) => new Set(prev).add(key))
      try {
        const a = document.createElement("a")
        a.href = `/api/tasks/${taskId}/campaign-uploads/download-zip?store_id=${store.store_id}`
        a.download = ""
        document.body.appendChild(a)
        a.click()
        a.remove()
        await patchStore(store.store_id, {
          add_downloaded_ports: ports.map((p) => p.id),
        })
      } catch (e) {
        showFeedback(e instanceof Error ? e.message : "Erro no download")
      } finally {
        setBusy((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    },
    [taskId, ports, patchStore, showFeedback],
  )

  const handleCompleteStore = useCallback(
    async (store: CampaignUploadStore) => {
      const isDone = store.email?.status === "concluida"
      if (isDone) {
        await patchStore(store.store_id, { status: "andamento" })
        return
      }
      const downloaded = new Set(store.email?.downloaded_ports ?? [])
      const missing = ports.filter((p) => !downloaded.has(p.id)).length
      if (
        missing > 0 &&
        !window.confirm(
          `Ainda faltam ${missing} corte(s) sem download nesta loja. Concluir mesmo assim?`,
        )
      ) {
        return
      }
      await patchStore(store.store_id, { status: "concluida" })
      // Avança para a próxima loja não-concluída do idioma da task.
      const ofLang = stores.filter(
        (s) => s.lang_group === store.lang_group && s.store_id !== store.store_id,
      )
      const nextStore = ofLang.find((s) => s.email?.status !== "concluida")
      if (nextStore) setActiveStoreId(nextStore.store_id)
    },
    [ports, stores, patchStore],
  )

  const figmaDisabledReason = !payload?.figma_available
    ? "FIGMA_PERSONAL_TOKEN não configurado no servidor — use o upload manual"
    : !payload?.figma_link
      ? "Campanha sem link do Figma (deliverable da etapa estrutura)"
      : null

  // ── Render ───────────────────────────────────────────────────────────
  const title = payload?.campaign_title ?? campaignTitle ?? "Campanha"

  return (
    <div className="fixed inset-0 z-[60] flex bg-black/50 p-2 sm:p-5">
      <div className="mx-auto flex h-full w-full max-w-[1500px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2 text-[13px]">
            <Upload size={14} className="shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Implementação</span>
            <span className="text-muted-foreground/50">/</span>
            <span className="truncate font-medium text-foreground">{title}</span>
            <span className="ml-1 rounded-[5px] bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              Subir e-mails · {LANG_GROUP_LABEL[taskLang]}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {importing && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 size={12} className="animate-spin" />
                Importando do Figma — pode levar ~1 min, não feche
              </span>
            )}
            <button
              type="button"
              onClick={() => !importing && onClose()}
              disabled={importing}
              className="rounded-[5px] p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              aria-label="Fechar"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
            <Loader2 size={16} className="mr-2 animate-spin" /> Carregando…
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-[13px] text-red-600">
            {error}
          </div>
        ) : payload && payload.cut_map_status !== "approved" ? (
          // Gate: a Tela 2 nunca opera sem mapa aprovado.
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertTriangle size={28} className="text-amber-500" />
            <div className="text-[14px] font-semibold text-foreground">
              Aprove o corte modelo primeiro
            </div>
            <p className="max-w-md text-[12.5px] text-muted-foreground">
              {payload.cut_map_status === "draft"
                ? "O mapa de cortes desta campanha está em rascunho. Abra a task \"Corte modelo\" e aprove o mapeamento para liberar a subida por loja."
                : "Esta campanha ainda não tem mapa de cortes. Abra a task \"Corte modelo\" e aprove o mapeamento para liberar a subida por loja."}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 rounded-[6px] border border-border px-4 py-2 text-[12.5px] font-semibold text-foreground hover:bg-muted"
            >
              Fechar
            </button>
          </div>
        ) : payload ? (
          <>
            {/* Barra de ações */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
              <div className="flex gap-0.5 rounded-[8px] bg-muted p-0.5">
                <button
                  type="button"
                  onClick={() => setView("lista")}
                  className={`inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[12px] font-semibold ${
                    view === "lista"
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <List size={13} /> Lista
                </button>
                <button
                  type="button"
                  onClick={() => setView("workbench")}
                  className={`inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[12px] font-semibold ${
                    view === "workbench"
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <LayoutGrid size={13} /> Workbench
                </button>
              </div>

              <div className="mx-1 h-5 w-px bg-border" />

              <button
                type="button"
                onClick={() => handleImportFigma()}
                disabled={importing || Boolean(figmaDisabledReason)}
                title={figmaDisabledReason ?? "Importar 1 frame por loja do arquivo do Figma"}
                className="inline-flex items-center gap-1.5 rounded-[6px] bg-primary px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {importing ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Figma size={13} />
                )}
                Importar do Figma
              </button>

              <button
                type="button"
                onClick={() => bulkInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  void handleBulkFiles(Array.from(e.dataTransfer.files))
                }}
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-dashed border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Solte vários PNGs aqui — casamos com as lojas pelo nome do arquivo"
              >
                <Upload size={13} /> Soltar PNGs (em massa)
              </button>
              <input
                ref={bulkInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  e.target.value = ""
                  void handleBulkFiles(files)
                }}
              />

              {langDone && (
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-[6px] bg-emerald-50 px-2.5 py-1 text-[11.5px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <CheckCircle2 size={13} />
                  Todas as lojas de {LANG_GROUP_LABEL[taskLang]} concluídas — conclua a task no painel
                </span>
              )}
            </div>

            {/* Painel de resultados do import */}
            {showImportPanel && importResult && (
              <div className="max-h-44 overflow-y-auto border-b border-border bg-muted/40 px-4 py-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11.5px] font-semibold text-foreground">
                    Import do Figma — {importResult.frames_found} frame(s) no arquivo
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowImportPanel(false)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label="Fechar painel"
                  >
                    <X size={13} />
                  </button>
                </div>
                <div className="grid gap-1 sm:grid-cols-2">
                  {importResult.results.map((r) => (
                    <div
                      key={r.store_id}
                      className="flex items-center gap-2 rounded-[5px] border border-border bg-background px-2 py-1 text-[11.5px]"
                    >
                      {r.status === "imported" ? (
                        <Check size={12} className="shrink-0 text-emerald-600" />
                      ) : (
                        <AlertTriangle
                          size={12}
                          className={`shrink-0 ${r.status === "failed" ? "text-red-500" : "text-amber-500"}`}
                        />
                      )}
                      <span className="truncate font-medium">{r.store_name}</span>
                      <span className="truncate text-muted-foreground">
                        {r.status === "imported"
                          ? `frame "${r.frame_name}"`
                          : r.status === "no_frame"
                            ? "sem frame com o nome da loja"
                            : r.status === "ambiguous"
                              ? (r.error ?? "nome ambíguo")
                              : (r.error ?? "falhou")}
                      </span>
                      {r.status === "failed" && (
                        <button
                          type="button"
                          disabled={importing}
                          onClick={() => handleImportFigma([r.store_id])}
                          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-[4px] border border-border px-1.5 py-0.5 text-[10.5px] font-semibold hover:bg-muted disabled:opacity-40"
                        >
                          <RefreshCw size={10} /> Tentar de novo
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {importResult.results.some((r) => r.status === "no_frame") && (
                  <p className="mt-1.5 truncate text-[10.5px] text-muted-foreground">
                    Frames no arquivo: {importResult.frame_names.join(", ") || "nenhum"}
                  </p>
                )}
              </div>
            )}

            {/* Arquivos sem loja (atribuição manual) */}
            {unassigned.length > 0 && (
              <div className="border-b border-border bg-amber-50/50 px-4 py-2.5 dark:bg-amber-950/20">
                <div className="mb-1.5 text-[11.5px] font-semibold text-amber-800 dark:text-amber-400">
                  {unassigned.length} arquivo(s) sem loja — atribua manualmente
                </div>
                <div className="flex flex-col gap-1.5">
                  {unassigned.map((u, idx) => (
                    <div key={`${u.file.name}-${idx}`} className="flex items-center gap-2 text-[12px]">
                      <ImageIcon size={13} className="shrink-0 text-muted-foreground" />
                      <span className="max-w-[240px] truncate">{u.file.name}</span>
                      <select
                        value={u.storeId}
                        onChange={(e) =>
                          setUnassigned((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, storeId: e.target.value } : x,
                            ),
                          )
                        }
                        className="rounded-[5px] border border-border bg-background px-2 py-1 text-[12px]"
                      >
                        <option value="">Escolher loja…</option>
                        {stores.map((s) => (
                          <option key={s.store_id} value={s.store_id}>
                            {s.store_name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!u.storeId}
                        onClick={async () => {
                          const ok = await uploadFileForStore(u.storeId, u.file)
                          if (ok) {
                            setUnassigned((prev) => prev.filter((_, i) => i !== idx))
                          }
                        }}
                        className="rounded-[5px] bg-primary px-2.5 py-1 text-[11.5px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
                      >
                        Subir
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setUnassigned((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                        aria-label="Descartar"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Body */}
            <div className="flex min-h-0 flex-1">
              {/* Rail de lojas */}
              <div className="flex w-[280px] shrink-0 flex-col overflow-y-auto border-r border-border bg-muted/30">
                {grouped.map(({ group, items }) => {
                  const done = items.filter(
                    (s) => s.email?.status === "concluida",
                  ).length
                  const collapsed = collapsedGroups.has(group)
                  return (
                    <div key={group}>
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedGroups((prev) => {
                            const next = new Set(prev)
                            if (next.has(group)) next.delete(group)
                            else next.add(group)
                            return next
                          })
                        }
                        className="flex w-full items-center gap-1.5 border-b border-border/60 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                      >
                        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                        {LANG_GROUP_LABEL[group]}
                        {group === taskLang && (
                          <span className="rounded-[4px] bg-primary/10 px-1 py-0.5 text-[9.5px] font-bold text-primary">
                            esta task
                          </span>
                        )}
                        <span className="ml-auto font-semibold">
                          {done}/{items.length}
                        </span>
                      </button>
                      {!collapsed &&
                        items.map((s) => {
                          const st = s.email?.status ?? "pendente"
                          const isActive = s.store_id === activeStoreId
                          return (
                            <button
                              key={s.store_id}
                              type="button"
                              onClick={() => setActiveStoreId(s.store_id)}
                              className={`flex w-full items-center gap-2 border-b border-border/40 px-3 py-2 text-left text-[12.5px] ${
                                isActive
                                  ? "bg-background font-semibold text-foreground"
                                  : "text-foreground/80 hover:bg-background/60"
                              }`}
                            >
                              <span
                                className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[st]}`}
                                title={st}
                              />
                              <span className="truncate">{s.store_name}</span>
                              {!s.email?.image_url && (
                                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                                  sem imagem
                                </span>
                              )}
                              {uploadingStores.has(s.store_id) && (
                                <Loader2
                                  size={12}
                                  className="ml-auto shrink-0 animate-spin text-muted-foreground"
                                />
                              )}
                            </button>
                          )
                        })}
                    </div>
                  )
                })}
              </div>

              {/* Loja ativa */}
              <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
                {!activeStore ? (
                  <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
                    Selecione uma loja no painel à esquerda
                  </div>
                ) : (
                  <>
                    {/* Sub-header da loja */}
                    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2.5">
                      <span className="text-[14px] font-bold text-foreground">
                        {activeStore.store_name}
                      </span>
                      <span
                        className={`rounded-[5px] px-2 py-0.5 text-[10.5px] font-semibold ${
                          activeStore.email?.status === "concluida"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                            : activeStore.email?.status === "andamento"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {activeStore.email?.status ?? "pendente"}
                      </span>
                      {!activeStore.copy && (
                        <span className="inline-flex items-center gap-1 rounded-[5px] bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                          <AlertTriangle size={10} /> sem copy — só imagem
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-1.5">
                        {activeStore.email?.image_url && (
                          <>
                            <button
                              type="button"
                              onClick={() => storeInputRef.current?.click()}
                              className="inline-flex items-center gap-1 rounded-[5px] border border-border px-2 py-1 text-[11.5px] font-semibold text-foreground hover:bg-muted"
                            >
                              <Upload size={12} /> Substituir imagem
                            </button>
                            <button
                              type="button"
                              disabled={busy.has(`${activeStore.store_id}:zip`)}
                              onClick={() => handleDownloadZip(activeStore)}
                              className="inline-flex items-center gap-1 rounded-[5px] border border-border px-2 py-1 text-[11.5px] font-semibold text-foreground hover:bg-muted disabled:opacity-40"
                            >
                              <FileArchive size={12} /> Baixar todos (.zip)
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          disabled={!activeStore.email?.image_url}
                          onClick={() => handleCompleteStore(activeStore)}
                          className={`inline-flex items-center gap-1 rounded-[5px] px-2.5 py-1 text-[11.5px] font-semibold disabled:opacity-40 ${
                            activeStore.email?.status === "concluida"
                              ? "border border-border text-foreground hover:bg-muted"
                              : "bg-emerald-600 text-white hover:bg-emerald-700"
                          }`}
                        >
                          {activeStore.email?.status === "concluida" ? (
                            <>
                              <RotateCcw size={12} /> Reabrir
                            </>
                          ) : (
                            <>
                              <Check size={12} /> Concluir loja
                            </>
                          )}
                        </button>
                      </div>
                      <input
                        ref={storeInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          e.target.value = ""
                          if (f && activeStore) {
                            void uploadFileForStore(activeStore.store_id, f)
                          }
                        }}
                      />
                    </div>

                    {/* Conteúdo da loja */}
                    {!activeStore.email?.image_url ? (
                      <button
                        type="button"
                        onClick={() => storeInputRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault()
                          const f = Array.from(e.dataTransfer.files).find((x) =>
                            x.type.startsWith("image/"),
                          )
                          if (f) void uploadFileForStore(activeStore.store_id, f)
                        }}
                        className="m-6 flex flex-1 flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      >
                        {uploadingStores.has(activeStore.store_id) ? (
                          <Loader2 size={22} className="animate-spin" />
                        ) : (
                          <ImageIcon size={22} />
                        )}
                        <span className="text-[13px] font-semibold">
                          Solte o PNG do email de {activeStore.store_name}
                        </span>
                        <span className="text-[11.5px]">
                          ou clique para escolher · ou use “Importar do Figma”
                        </span>
                      </button>
                    ) : (
                      <UploadStoreContent
                        view={view}
                        store={activeStore}
                        ports={ports}
                        modelW={cutMap?.image_natural_w ?? null}
                        modelH={cutMap?.image_natural_h ?? null}
                        copyMatch={copyMatch}
                        downloadedSet={downloadedSet}
                        busy={busy}
                        activePortId={activePortId}
                        setActivePortId={setActivePortId}
                        onDownloadSlice={handleDownloadSlice}
                        showFeedback={showFeedback}
                        showFullCopy={showFullCopy}
                        setShowFullCopy={setShowFullCopy}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        ) : null}

        {/* Feedback flutuante */}
        {feedback && (
          <div className="pointer-events-none absolute bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-[7px] bg-gray-900 px-3.5 py-2 text-[12px] font-medium text-white shadow-lg">
            {feedback}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Conteúdo por loja (Lista/Workbench) ─────────────────────────────────

function CopyBlockActions({
  blocks,
  onCopied,
}: {
  blocks: EmailDraftBlock[]
  onCopied: (msg: string) => void
}) {
  if (blocks.length === 0) return null
  return (
    <button
      type="button"
      onClick={() => {
        const text = blocks.map(blockText).filter(Boolean).join("\n\n")
        void navigator.clipboard.writeText(text)
        onCopied("Copy do corte copiada")
      }}
      className="inline-flex items-center gap-1 rounded-[5px] border border-border px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-muted"
    >
      <Copy size={11} /> Copiar tudo do corte
    </button>
  )
}

function PortCopyBlocks({
  blocks,
  onCopied,
}: {
  blocks: EmailDraftBlock[]
  onCopied: (msg: string) => void
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {blocks.map((b) => (
        <div key={b.id} className="group relative rounded-[6px] border border-border bg-card p-2.5">
          <BlockPreview block={b} />
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(blockText(b))
              onCopied("Bloco copiado")
            }}
            className="absolute right-1.5 top-1.5 rounded-[4px] border border-border bg-background p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
            aria-label="Copiar bloco"
          >
            <Copy size={11} />
          </button>
        </div>
      ))}
    </div>
  )
}

function UploadStoreContent({
  view,
  store,
  ports,
  modelW,
  modelH,
  copyMatch,
  downloadedSet,
  busy,
  activePortId,
  setActivePortId,
  onDownloadSlice,
  showFeedback,
  showFullCopy,
  setShowFullCopy,
}: {
  view: ViewMode
  store: CampaignUploadStore
  ports: CutPort[]
  /** Dimensões naturais da imagem MODELO (do mapa de cortes). */
  modelW: number | null
  modelH: number | null
  copyMatch: ReturnType<typeof assignBlocksToPorts> | null
  downloadedSet: Set<string>
  busy: Set<string>
  activePortId: string | null
  setActivePortId: (id: string | null) => void
  onDownloadSlice: (store: CampaignUploadStore, port: CutPort) => void
  showFeedback: (msg: string) => void
  showFullCopy: boolean
  setShowFullCopy: (v: boolean) => void
}) {
  const email = store.email!
  const natW = email.image_natural_w ?? 600
  const natH = email.image_natural_h ?? 2000
  const imageUrl = email.image_url!
  const activePort =
    ports.find((p) => p.id === activePortId) ?? ports[0] ?? null

  // Mesma conta do recorte server-side: preview = PNG baixado.
  const rectFor = (port: CutPort) =>
    portPixelRectWidthScaled(
      port,
      { w: modelW, h: modelH },
      { w: natW, h: natH },
    )

  const portCard = (port: CutPort, idx: number) => {
    const meta = PORT_TYPES[port.type]
    const blocks = copyMatch?.byPort[port.id] ?? []
    const downloaded = downloadedSet.has(port.id)
    const key = `${store.store_id}:${port.id}`
    return (
      <div key={port.id} className="rounded-[8px] border border-border bg-background">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
            style={{ backgroundColor: meta?.color ?? "#9CA3AF" }}
          />
          <span className="text-[12px] font-bold text-foreground">
            {String(idx + 1).padStart(2, "0")} · {port.label}
          </span>
          <span className="text-[10.5px] text-muted-foreground">
            {meta?.label ?? port.type}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {meta?.hasCopy && (
              <CopyBlockActions blocks={blocks} onCopied={showFeedback} />
            )}
            <button
              type="button"
              disabled={busy.has(key)}
              onClick={() => onDownloadSlice(store, port)}
              className={`inline-flex items-center gap-1 rounded-[5px] px-2 py-1 text-[11px] font-semibold disabled:opacity-40 ${
                downloaded
                  ? "border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : "bg-primary text-white hover:opacity-90"
              }`}
            >
              {downloaded ? <Check size={11} /> : <Download size={11} />}
              {downloaded ? "Baixado" : "Baixar PNG"}
            </button>
          </div>
        </div>
        <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <SliceView
            imageUrl={imageUrl}
            natW={natW}
            rect={rectFor(port)}
            alt={port.label}
            className="rounded-[6px] border border-border"
          />
          <div>
            {!meta?.hasCopy ? (
              <div className="rounded-[6px] border border-dashed border-border px-3 py-4 text-center text-[11.5px] text-muted-foreground">
                só imagem — este corte não tem copy
              </div>
            ) : blocks.length === 0 ? (
              <div className="rounded-[6px] border border-dashed border-amber-300/70 bg-amber-50/40 px-3 py-4 text-center text-[11.5px] text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-400">
                nenhum bloco de copy casou com este corte — confira na copy completa abaixo
              </div>
            ) : (
              <PortCopyBlocks blocks={blocks} onCopied={showFeedback} />
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {copyMatch?.ambiguous && (
        <div className="flex items-center gap-2 rounded-[7px] border border-amber-300/70 bg-amber-50/60 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-400">
          <AlertTriangle size={13} className="shrink-0" />
          Parte da copy não casou automaticamente com os cortes — use a “Copy completa da loja” abaixo.
        </div>
      )}

      {view === "lista" ? (
        ports.map((p, i) => portCard(p, i))
      ) : (
        <div className="grid gap-3 lg:grid-cols-[120px_minmax(0,1fr)]">
          {/* Strip de miniaturas */}
          <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-x-visible">
            {ports.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePortId(p.id)}
                className={`w-[104px] shrink-0 overflow-hidden rounded-[6px] border-2 text-left ${
                  activePort?.id === p.id
                    ? "border-primary"
                    : "border-border hover:border-primary/40"
                }`}
                title={p.label}
              >
                <SliceView imageUrl={imageUrl} natW={natW} rect={rectFor(p)} alt={p.label} />
                <div className="flex items-center gap-1 bg-background px-1.5 py-1 text-[10px] font-semibold text-foreground">
                  <span
                    className="h-1.5 w-1.5 rounded-[2px]"
                    style={{ backgroundColor: PORT_TYPES[p.type]?.color ?? "#9CA3AF" }}
                  />
                  {String(i + 1).padStart(2, "0")}
                  {downloadedSet.has(p.id) && (
                    <Check size={9} className="ml-auto text-emerald-600" />
                  )}
                </div>
              </button>
            ))}
          </div>
          {/* Fatia grande + copy do corte ativo */}
          {activePort &&
            portCard(activePort, ports.findIndex((p) => p.id === activePort.id))}
        </div>
      )}

      {/* Copy completa da loja (fallback/conferência) */}
      {store.copy && (
        <div className="rounded-[8px] border border-border">
          <button
            type="button"
            onClick={() => setShowFullCopy(!showFullCopy)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold text-foreground hover:bg-muted/60"
          >
            {showFullCopy ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Copy completa da loja
            <span className="ml-auto" />
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                void navigator.clipboard.writeText(copyBlocksToText(store.copy!))
                showFeedback("Copy completa copiada")
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation()
                  void navigator.clipboard.writeText(copyBlocksToText(store.copy!))
                  showFeedback("Copy completa copiada")
                }
              }}
              className="inline-flex items-center gap-1 rounded-[5px] border border-border px-2 py-1 text-[11px] font-semibold hover:bg-muted"
            >
              <Copy size={11} /> Copiar tudo
            </span>
          </button>
          {showFullCopy && (
            <div className="flex flex-col gap-2.5 border-t border-border p-3">
              <div className="text-[12px]">
                <span className="font-semibold text-foreground">Assunto:</span>{" "}
                <span className="text-foreground/85">{store.copy.subject}</span>
              </div>
              <div className="text-[12px]">
                <span className="font-semibold text-foreground">Preview:</span>{" "}
                <span className="text-foreground/85">
                  {store.copy.preheader ?? store.copy.preview}
                </span>
              </div>
              {(store.copy.blocks ?? []).map((b) => (
                <div key={b.id} className="rounded-[6px] border border-border bg-card p-2.5">
                  <BlockPreview block={b} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
