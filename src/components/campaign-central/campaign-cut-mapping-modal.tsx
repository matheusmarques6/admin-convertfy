"use client"

/**
 * Modal fullscreen "Mapear Cortes de Campanha" — task "Corte modelo" da
 * etapa de implementação do design de campanha.
 *
 * O implementador sobe a IMAGEM do email finalizado e marca as "portas"
 * (fatias horizontais contíguas 0..1): clique divide, fronteiras são
 * arrastáveis, lixeira mescla com a anterior. Retângulos marcam "áreas
 * especiais". "Aprovar mapeamento" valida no servidor, salva por CAMPANHA
 * e conclui a task (via onApproved — o drawer usa o PUT oficial de status).
 *
 * Persistência: autosave debounced (1s) no PUT de rascunho — ESC não perde
 * trabalho. Coordenadas em frações 0..1 (ver src/types/campaign-cuts.ts).
 *
 * Shell replica campaign-image-handoff.tsx (overlay z-[60], ESC fecha,
 * portal montado pelo chamador).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  FileImage,
  Layers,
  Pencil,
  RotateCcw,
  Scissors,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import {
  PORT_TYPES,
  PORT_TYPE_LIST,
  type CampaignCutMap,
  type CutPort,
  type CutPortType,
  type CutSpecialArea,
} from "@/types/campaign-cuts"
import {
  clamp01,
  initialPorts,
  mergePortWithPrevious,
  movePortBoundary,
  newPortId,
  splitPortAt,
} from "@/lib/campaign-cuts/geometry"

interface Props {
  taskId: string
  campaignTitle?: string | null
  onClose: () => void
  /** Conclui a task via o caminho oficial do drawer. Retorna sucesso. */
  onApproved: () => Promise<boolean>
}

type Tool = "line" | "rect"

type DragState =
  | { kind: "boundary"; idx: number }
  | { kind: "rect"; x0: number; y0: number; x1: number; y1: number }
  | null

const MIN_GAP_PX = 24

export function CampaignCutMappingModal({
  taskId,
  campaignTitle,
  onClose,
  onApproved,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [map, setMap] = useState<CampaignCutMap | null>(null)
  const [title, setTitle] = useState<string | null>(campaignTitle ?? null)

  const [ports, setPorts] = useState<CutPort[]>([])
  const [areas, setAreas] = useState<CutSpecialArea[]>([])
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageMeta, setImageMeta] = useState<{
    path: string | null
    filename: string | null
    w: number | null
    h: number | null
  }>({ path: null, filename: null, w: null, h: null })

  const [tool, setTool] = useState<Tool>("line")
  const [hoverPortId, setHoverPortId] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState>(null)
  const [uploading, setUploading] = useState(false)
  const [figmaModelUrl, setFigmaModelUrl] = useState("")
  const [importingFigma, setImportingFigma] = useState(false)
  const [approving, setApproving] = useState(false)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle")
  const [feedback, setFeedback] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ count: number; taskDone: boolean } | null>(null)

  const imgWrapRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dirtyRef = useRef(false)
  // Skip do autosave na hidratação inicial (abrir ≠ editar).
  const justLoadedRef = useRef(false)
  // Bloqueia autosave pendente logo após aprovar (não rebaixar pra draft).
  const suppressSaveRef = useRef(false)
  const dragRef = useRef<DragState>(null)
  dragRef.current = drag

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg)
    window.setTimeout(() => setFeedback(null), 2200)
  }, [])

  // ── Load ───────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}/campaign-cuts`)
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || `Erro ${res.status}`)
        }
        const j = (await res.json()) as {
          data?: { map: CampaignCutMap | null; campaign_title: string | null }
          map?: CampaignCutMap | null
          campaign_title?: string | null
        }
        const payload = j.data ?? j
        if (!alive) return
        const m = payload.map ?? null
        setMap(m)
        setTitle((t) => payload.campaign_title ?? t)
        if (m) {
          justLoadedRef.current = true
          setPorts(m.portas.length > 0 ? m.portas : initialPorts())
          setAreas(m.special_areas ?? [])
          setImageUrl(m.image_url)
          setImageMeta({
            path: m.image_path,
            filename: m.image_filename,
            w: m.image_natural_w,
            h: m.image_natural_h,
          })
        }
        setError(null)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Falha ao carregar")
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [taskId])

  // ── ESC fecha ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !success) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, success])

  // ── Autosave (debounce 1s; suprimido durante drag) ─────────────────
  const buildSavePayload = useCallback(
    () => ({
      image_url: imageUrl,
      image_path: imageMeta.path,
      image_filename: imageMeta.filename,
      image_natural_w: imageMeta.w,
      image_natural_h: imageMeta.h,
      portas: ports,
      special_areas: areas,
    }),
    [imageUrl, imageMeta, ports, areas],
  )
  const payloadRef = useRef(buildSavePayload)
  payloadRef.current = buildSavePayload

  const saveDraft = useCallback(async () => {
    if (!payloadRef.current().image_url) return
    // Depois de aprovar, um timer de autosave pendente NÃO pode regravar
    // como rascunho (rebaixaria o mapa recém-aprovado). Uma edição real
    // posterior reabilita o autosave no effect.
    if (suppressSaveRef.current) return
    dirtyRef.current = false
    setSaveState("saving")
    try {
      const res = await fetch(`/api/tasks/${taskId}/campaign-cuts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadRef.current()),
      })
      setSaveState(res.ok ? "saved" : "idle")
    } catch {
      setSaveState("idle")
    }
  }, [taskId])

  useEffect(() => {
    if (loading || !imageUrl) return
    // A primeira execução após a CARGA não é edição do usuário — sem esse
    // skip, abrir o modal já regravava o mapa como rascunho (rebaixando um
    // mapa aprovado sem nenhuma ação do usuário).
    if (justLoadedRef.current) {
      justLoadedRef.current = false
      return
    }
    suppressSaveRef.current = false // edição real reabilita o autosave
    dirtyRef.current = true
    if (drag) return // flush acontece no fim do drag
    const t = window.setTimeout(() => void saveDraft(), 1000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ports, areas, imageUrl, drag])

  // Flush best-effort no unmount.
  useEffect(() => {
    return () => {
      if (dirtyRef.current && payloadRef.current().image_url) {
        void fetch(`/api/tasks/${taskId}/campaign-cuts`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadRef.current()),
          keepalive: true,
        }).catch(() => {})
      }
    }
  }, [taskId])

  // ── Upload ─────────────────────────────────────────────────────────
  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        showFeedback("Arquivo precisa ser uma imagem (PNG/JPG/WEBP).")
        return
      }
      setUploading(true)
      try {
        const fd = new FormData()
        fd.append("file", file)
        const res = await fetch(`/api/tasks/${taskId}/campaign-cuts/upload`, {
          method: "POST",
          body: fd,
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || `Erro ${res.status}`)
        }
        const j = (await res.json()) as {
          data?: { url: string; path: string; filename: string }
          url?: string
          path?: string
          filename?: string
        }
        const up = j.data ?? (j as { url: string; path: string; filename: string })

        // Mede as dimensões naturais antes de liberar o canvas.
        const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
          img.onerror = () => reject(new Error("Falha ao carregar a imagem"))
          img.src = up.url
        })

        setImageUrl(up.url)
        setImageMeta({ path: up.path, filename: up.filename, w: dims.w, h: dims.h })
        setPorts((prev) => (prev.length > 0 ? prev : initialPorts()))
        showFeedback("Imagem carregada — clique no email para marcar os cortes.")
      } catch (e) {
        showFeedback(e instanceof Error ? e.message : "Falha no upload")
      } finally {
        setUploading(false)
      }
    },
    [taskId, showFeedback],
  )

  // Importa a imagem de referência direto do Figma (link do frame do
  // email modelo). O servidor exporta em 2x — mesmo scale da Tela 2 —
  // e devolve url/path/dimensões; daqui em diante é igual ao upload.
  const handleImportModelFromFigma = useCallback(async () => {
    const url = figmaModelUrl.trim()
    if (!url) return
    setImportingFigma(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/campaign-cuts/import-figma`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ figma_url: url }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || `Erro ${res.status}`)
      const up = (j.data ?? j) as {
        url: string
        path: string
        filename: string
        image_natural_w: number
        image_natural_h: number
      }
      setImageUrl(up.url)
      setImageMeta({
        path: up.path,
        filename: up.filename,
        w: up.image_natural_w,
        h: up.image_natural_h,
      })
      setPorts((prev) => (prev.length > 0 ? prev : initialPorts()))
      showFeedback("Email modelo importado do Figma — marque os cortes.")
    } catch (e) {
      showFeedback(e instanceof Error ? e.message : "Falha no import do Figma")
    } finally {
      setImportingFigma(false)
    }
  }, [figmaModelUrl, taskId, showFeedback])

  // Paste global — só sem imagem e ignorando inputs.
  useEffect(() => {
    if (imageUrl) return
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return
      const file = e.clipboardData?.files?.[0]
      if (file && file.type.startsWith("image/")) {
        e.preventDefault()
        void handleFile(file)
      }
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [imageUrl, handleFile])

  // ── Conversão de coordenadas ───────────────────────────────────────
  const fracFromEvent = useCallback((e: { clientX: number; clientY: number }) => {
    const el = imgWrapRef.current
    if (!el) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    return {
      x: clamp01((e.clientX - r.left) / r.width),
      y: clamp01((e.clientY - r.top) / r.height),
    }
  }, [])

  const minGapFrac = useCallback(() => {
    const el = imgWrapRef.current
    if (!el) return 0.01
    const h = el.getBoundingClientRect().height
    return h > 0 ? MIN_GAP_PX / h : 0.01
  }, [])

  // ── Drag global (fronteiras e retângulo) ───────────────────────────
  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => {
      const { x, y } = fracFromEvent(e)
      const cur = dragRef.current
      if (!cur) return
      if (cur.kind === "boundary") {
        setPorts((prev) => movePortBoundary(prev, cur.idx, y, minGapFrac()))
      } else {
        setDrag({ ...cur, x1: x, y1: y })
      }
    }
    const onUp = () => {
      const cur = dragRef.current
      if (cur && cur.kind === "rect") {
        const x = Math.min(cur.x0, cur.x1)
        const y = Math.min(cur.y0, cur.y1)
        const w = Math.abs(cur.x1 - cur.x0)
        const h = Math.abs(cur.y1 - cur.y0)
        const el = imgWrapRef.current
        const rectPx = el
          ? { w: w * el.getBoundingClientRect().width, h: h * el.getBoundingClientRect().height }
          : { w: 0, h: 0 }
        if (rectPx.w > 8 && rectPx.h > 8) {
          setAreas((prev) => [
            ...prev,
            { id: newPortId(), label: `Área especial ${prev.length + 1}`, x, y, w, h },
          ])
          showFeedback("Área especial marcada.")
        }
      }
      setDrag(null)
      void saveDraft()
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [drag, fracFromEvent, minGapFrac, saveDraft, showFeedback])

  // ── Ações do canvas ────────────────────────────────────────────────
  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (tool !== "rect") return
    const { x, y } = fracFromEvent(e)
    setDrag({ kind: "rect", x0: x, y0: y, x1: x, y1: y })
  }

  const onCanvasClick = (e: React.MouseEvent) => {
    if (tool !== "line" || drag) return
    const { y } = fracFromEvent(e)
    const out = splitPortAt(ports, y, minGapFrac())
    if (!out) {
      showFeedback("Muito perto de um corte existente.")
      return
    }
    setPorts(out)
    showFeedback("Corte adicionado.")
  }

  const resetMap = () => {
    if (!window.confirm("Restaurar o mapa? Todos os cortes e áreas serão removidos.")) return
    setPorts(initialPorts())
    setAreas([])
    showFeedback("Mapa restaurado.")
  }

  const setPortLabel = (id: string, label: string) =>
    setPorts((prev) => prev.map((p) => (p.id === id ? { ...p, label } : p)))
  const setPortType = (id: string, type: CutPortType) =>
    setPorts((prev) => prev.map((p) => (p.id === id ? { ...p, type } : p)))

  // ── Aprovar ────────────────────────────────────────────────────────
  const approve = async () => {
    setApproving(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/campaign-cuts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", ...payloadRef.current() }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Erro ${res.status}`)
      }
      dirtyRef.current = false
      suppressSaveRef.current = true
      const taskDone = await onApproved()
      setSuccess({ count: ports.length, taskDone })
    } catch (e) {
      showFeedback(e instanceof Error ? e.message : "Falha ao aprovar")
    } finally {
      setApproving(false)
    }
  }

  const copyCount = useMemo(
    () => ports.filter((p) => PORT_TYPES[p.type].hasCopy).length,
    [ports],
  )
  const boundaries = ports.slice(0, -1)
  const isApproved = map?.status === "approved" && !dirtyRef.current

  // Preview do retângulo em drag
  const rectPreview =
    drag?.kind === "rect"
      ? {
          x: Math.min(drag.x0, drag.x1),
          y: Math.min(drag.y0, drag.y1),
          w: Math.abs(drag.x1 - drag.x0),
          h: Math.abs(drag.y1 - drag.y0),
        }
      : null

  return (
    <div className="fixed inset-0 z-[60] flex bg-black/50 p-2 sm:p-5">
      <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2 text-[13px]">
            <Scissors size={14} className="shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Implementação</span>
            <span className="text-muted-foreground/50">/</span>
            <span className="truncate font-medium text-foreground">
              {title || "Campanha"}
            </span>
            <span className="ml-1 rounded-[5px] bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              Mapear cortes
            </span>
            {imageMeta.filename && (
              <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:inline-flex">
                <FileImage size={11} /> {imageMeta.filename}
              </span>
            )}
            {imageUrl && (
              <button
                type="button"
                onClick={() => {
                  if (
                    !window.confirm(
                      "Trocar a imagem de referência? As portas marcadas são mantidas, mas o mapa volta para rascunho e precisa ser reaprovado.",
                    )
                  ) {
                    return
                  }
                  setImageUrl(null)
                  setImageMeta({ path: null, filename: null, w: null, h: null })
                }}
                className="hidden items-center gap-1 rounded-[5px] border border-border px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-muted sm:inline-flex"
                title="Voltar para a escolha de imagem (import do Figma ou upload)"
              >
                <Upload size={11} /> Trocar imagem
              </button>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              {saveState === "saving"
                ? "Salvando…"
                : saveState === "saved"
                  ? "Rascunho salvo"
                  : isApproved
                    ? "Mapa aprovado"
                    : ""}
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
          {/* Canvas */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Toolbar */}
            <div className="flex items-center gap-3 border-b border-border bg-background px-4 py-2.5">
              <div className="flex gap-0.5 rounded-[8px] bg-muted p-0.5">
                <button
                  type="button"
                  onClick={() => setTool("line")}
                  className={`inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[12px] font-semibold ${
                    tool === "line"
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Scissors size={13} /> Linha de corte
                </button>
                <button
                  type="button"
                  onClick={() => setTool("rect")}
                  className={`inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[12px] font-semibold ${
                    tool === "rect"
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Square size={13} /> Retângulo
                </button>
              </div>
              <span className="hidden text-[11.5px] text-muted-foreground md:inline">
                {tool === "line"
                  ? "Clique no email para adicionar um corte · arraste as linhas para ajustar"
                  : "Arraste sobre uma região para marcar uma área especial"}
              </span>
              <div className="flex-1" />
              {imageUrl && (
                <button
                  type="button"
                  onClick={resetMap}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw size={13} /> Restaurar
                </button>
              )}
            </div>

            {/* Scroll area */}
            <div className="flex flex-1 justify-center overflow-y-auto bg-muted/40 px-5 pb-10 pt-7">
              {loading ? (
                <div className="mt-20 text-[13px] text-muted-foreground">Carregando…</div>
              ) : error ? (
                <div className="mt-20 text-[13px] text-destructive">{error}</div>
              ) : !imageUrl ? (
                <div className="mt-16 flex w-full max-w-[520px] flex-col gap-3">
                  {/* Import do Figma — referência proporcional por construção
                      (mesmo scale 2x do import por loja da Tela 2). */}
                  <div className="rounded-xl border border-border bg-background p-3">
                    <div className="mb-1.5 text-[12.5px] font-semibold text-foreground">
                      Importar email modelo do Figma (recomendado)
                    </div>
                    <p className="mb-2 text-[11.5px] text-muted-foreground">
                      No Figma: botão direito no frame do email modelo →
                      “Copy link to selection” → cole aqui. A referência sai na
                      MESMA escala dos emails das lojas — cortes precisos.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={figmaModelUrl}
                        onChange={(e) => setFigmaModelUrl(e.target.value)}
                        placeholder="https://www.figma.com/design/…?node-id=…"
                        className="min-w-0 flex-1 rounded-[6px] border border-border bg-background px-2.5 py-1.5 text-[12px] outline-none focus:border-primary/60"
                        disabled={importingFigma}
                      />
                      <button
                        type="button"
                        disabled={importingFigma || !figmaModelUrl.trim()}
                        onClick={() => void handleImportModelFromFigma()}
                        className="shrink-0 rounded-[6px] bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                      >
                        {importingFigma ? "Importando…" : "Importar"}
                      </button>
                    </div>
                  </div>

                  {/* Dropzone (upload manual) */}
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const f = e.dataTransfer.files?.[0]
                      if (f) void handleFile(f)
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-60 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-background text-center hover:border-primary/50"
                  >
                    <Upload size={28} className="text-muted-foreground" />
                    <div className="text-[13.5px] font-semibold text-foreground">
                      {uploading ? "Enviando…" : "Ou jogue aqui a imagem do email"}
                    </div>
                    <div className="max-w-[360px] text-[12px] text-muted-foreground">
                      Arraste o arquivo, cole (Ctrl+V) ou clique para selecionar ·
                      PNG, JPG ou WEBP · máx 10MB
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void handleFile(f)
                        e.target.value = ""
                      }}
                    />
                  </div>
                </div>
              ) : (
                /* Canvas com a imagem */
                <div className="w-full max-w-[520px]">
                  <div
                    ref={imgWrapRef}
                    onPointerDown={onCanvasPointerDown}
                    onClick={onCanvasClick}
                    className="relative select-none overflow-hidden rounded-[10px] bg-white shadow-lg"
                    style={{ cursor: tool === "rect" ? "crosshair" : "copy" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl} alt="Email da campanha" className="block w-full" draggable={false} />

                    {/* Tint da porta em hover (via lista) */}
                    {ports.map(
                      (p) =>
                        hoverPortId === p.id && (
                          <div
                            key={`t-${p.id}`}
                            className="pointer-events-none absolute left-0 right-0"
                            style={{
                              top: `${p.y0 * 100}%`,
                              height: `${(p.y1 - p.y0) * 100}%`,
                              background: PORT_TYPES[p.type].color,
                              opacity: 0.16,
                            }}
                          />
                        ),
                    )}

                    {/* Etiquetas numeradas */}
                    {ports.map((p, i) => (
                      <div
                        key={`lb-${p.id}`}
                        className="pointer-events-none absolute left-2 z-[2] inline-flex items-center gap-1.5 rounded-[6px] border border-border bg-white/95 px-1.5 py-0.5 shadow-sm"
                        style={{ top: `calc(${p.y0 * 100}% + 5px)` }}
                      >
                        <span
                          className="inline-flex h-[15px] w-[15px] items-center justify-center rounded-[4px] text-[9px] font-bold text-white"
                          style={{ background: PORT_TYPES[p.type].color }}
                        >
                          {i + 1}
                        </span>
                        <span className="text-[10.5px] font-semibold text-gray-700">{p.label}</span>
                      </div>
                    ))}

                    {/* Fronteiras arrastáveis */}
                    {boundaries.map((p, i) => (
                      <div
                        key={`b-${p.id}`}
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          setDrag({ kind: "boundary", idx: i })
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute left-0 right-0 z-[3] flex items-center"
                        style={{ top: `calc(${p.y1 * 100}% - 6px)`, height: 12, cursor: "ns-resize" }}
                      >
                        <div
                          className="absolute left-0 right-0 h-[2px] bg-primary"
                          style={{
                            top: 5,
                            opacity: drag?.kind === "boundary" && drag.idx === i ? 1 : 0.65,
                          }}
                        />
                        <div className="absolute left-1/2 top-0 flex h-3 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-primary shadow-sm">
                          <div className="h-1 w-3 border-y-2 border-white/70" />
                        </div>
                      </div>
                    ))}

                    {/* Áreas especiais */}
                    {areas.map((r) => (
                      <div
                        key={r.id}
                        className="absolute z-[2] rounded-[6px] border-2 border-dashed border-amber-500 bg-amber-400/10"
                        style={{
                          left: `${r.x * 100}%`,
                          top: `${r.y * 100}%`,
                          width: `${r.w * 100}%`,
                          height: `${r.h * 100}%`,
                        }}
                      >
                        <span className="absolute -top-2.5 left-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded-[5px] bg-amber-600 px-1.5 py-px text-[10px] font-bold text-white">
                          {r.label}
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation()
                              setAreas((prev) => prev.filter((x) => x.id !== r.id))
                            }}
                            className="inline-flex"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      </div>
                    ))}

                    {/* Preview do retângulo em drag */}
                    {rectPreview && rectPreview.w > 0.002 && (
                      <div
                        className="pointer-events-none absolute z-[4] rounded-[6px] border-2 border-dashed border-amber-500 bg-amber-400/15"
                        style={{
                          left: `${rectPreview.x * 100}%`,
                          top: `${rectPreview.y * 100}%`,
                          width: `${rectPreview.w * 100}%`,
                          height: `${rectPreview.h * 100}%`,
                        }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Painel lateral */}
          <aside className="flex w-[320px] shrink-0 flex-col border-l border-border bg-background">
            <div className="border-b border-border px-4 py-3.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-bold text-foreground">Portas do email</span>
                <span className="text-[12px] font-bold text-muted-foreground">{ports.length}</span>
              </div>
              <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                Cada porta vira um corte que as tasks de subir a campanha usam por loja.
              </div>
            </div>

            <div
              className="flex-1 overflow-y-auto p-3"
              onMouseLeave={() => setHoverPortId(null)}
            >
              {!imageUrl ? (
                <div className="px-2 py-6 text-center text-[12px] text-muted-foreground">
                  Suba a imagem do email para começar a marcar os cortes.
                </div>
              ) : (
                <>
                  {ports.map((p, i) => {
                    const meta = PORT_TYPES[p.type]
                    const active = hoverPortId === p.id
                    const heightPx = imageMeta.h
                      ? `${Math.round((p.y1 - p.y0) * imageMeta.h)}px`
                      : `${Math.round((p.y1 - p.y0) * 100)}%`
                    return (
                      <div
                        key={p.id}
                        onMouseEnter={() => setHoverPortId(p.id)}
                        className={`mb-1.5 flex items-center gap-2.5 rounded-[9px] border px-2.5 py-2 ${
                          active ? "border-primary/40 bg-primary/5" : "border-border bg-background"
                        }`}
                      >
                        <span
                          className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] text-[11px] font-bold text-white"
                          style={{ background: meta.color }}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <input
                            value={p.label}
                            onChange={(e) => setPortLabel(p.id, e.target.value)}
                            className="w-full border-none bg-transparent p-0 text-[12.5px] font-semibold text-foreground outline-none"
                          />
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <select
                              value={p.type}
                              onChange={(e) => setPortType(p.id, e.target.value as CutPortType)}
                              className="rounded-[5px] border border-border bg-muted/50 px-1 py-px text-[10.5px] font-semibold"
                              style={{ color: meta.color }}
                            >
                              {PORT_TYPE_LIST.map((t) => (
                                <option key={t} value={t}>
                                  {PORT_TYPES[t].label}
                                </option>
                              ))}
                            </select>
                            {meta.hasCopy ? (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                <Pencil size={9} /> copy
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground/60">só imagem</span>
                            )}
                            <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                              {heightPx}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          title="Mesclar com a porta anterior"
                          disabled={ports.length <= 1}
                          onClick={() => setPorts((prev) => mergePortWithPrevious(prev, p.id))}
                          className="shrink-0 p-0.5 text-muted-foreground/50 hover:text-destructive disabled:opacity-30"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )
                  })}

                  {areas.length > 0 && (
                    <div className="mt-3">
                      <div className="mb-2 px-1 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                        Áreas especiais
                      </div>
                      {areas.map((r) => (
                        <div
                          key={r.id}
                          className="mb-1.5 flex items-center gap-2 rounded-[9px] border border-amber-200 bg-amber-50 px-2.5 py-2 dark:border-amber-500/30 dark:bg-amber-500/10"
                        >
                          <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-amber-600 text-white">
                            <Square size={10} />
                          </span>
                          <input
                            value={r.label}
                            onChange={(e) =>
                              setAreas((prev) =>
                                prev.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)),
                              )
                            }
                            className="min-w-0 flex-1 border-none bg-transparent p-0 text-[12px] font-semibold text-amber-800 outline-none dark:text-amber-300"
                          />
                          <button
                            type="button"
                            onClick={() => setAreas((prev) => prev.filter((x) => x.id !== r.id))}
                            className="shrink-0 p-0.5 text-amber-600 hover:text-destructive"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer / aprovar */}
            <div className="border-t border-border bg-muted/30 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Layers size={12} /> {ports.length} porta{ports.length === 1 ? "" : "s"}
                </span>
                <span className="text-muted-foreground/40">·</span>
                <span className="inline-flex items-center gap-1">
                  <Pencil size={12} /> {copyCount} com copy
                </span>
                {areas.length > 0 && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="inline-flex items-center gap-1 text-amber-600">
                      <Square size={12} /> {areas.length} área{areas.length === 1 ? "" : "s"}
                    </span>
                  </>
                )}
              </div>
              <button
                type="button"
                disabled={!imageUrl || approving || ports.length === 0}
                onClick={() => void approve()}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-primary text-[13.5px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Check size={16} />
                {approving ? "Aprovando…" : "Aprovar mapeamento"}
              </button>
            </div>
          </aside>
        </div>

        {/* Overlay de sucesso */}
        {success && (
          <div className="absolute inset-0 z-[70] flex items-center justify-center bg-gray-900/45 p-6">
            <div className="w-[420px] rounded-2xl bg-background p-7 text-center shadow-2xl">
              <div className="mx-auto mb-3.5 flex h-[54px] w-[54px] items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                <Check size={28} />
              </div>
              <div className="text-[17px] font-bold text-foreground">Mapeamento aprovado</div>
              <div className="mx-auto mt-2 max-w-[340px] text-[13px] leading-relaxed text-muted-foreground">
                {success.count} porta{success.count === 1 ? "" : "s"} salva
                {success.count === 1 ? "" : "s"} para{" "}
                <strong className="text-foreground">{title ?? "a campanha"}</strong>.{" "}
                {success.taskDone
                  ? "A task foi concluída — as tasks de subir a campanha por loja já podem usar estes cortes."
                  : "O mapa foi salvo, mas não foi possível concluir a task automaticamente — conclua pelo painel."}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 inline-flex h-9 items-center justify-center rounded-[7px] bg-primary px-5 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Fechar
              </button>
            </div>
          </div>
        )}

        {/* Toast */}
        {feedback && (
          <div className="pointer-events-none absolute bottom-5 left-1/2 z-[65] -translate-x-1/2 rounded-[10px] bg-gray-900 px-4 py-2.5 text-[12.5px] font-medium text-white shadow-xl">
            {feedback}
          </div>
        )}
      </div>
    </div>
  )
}
