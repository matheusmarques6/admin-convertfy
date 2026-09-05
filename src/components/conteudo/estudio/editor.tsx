"use client"

/**
 * Editor do carrossel — Tela B do Estúdio: topbar (projeto › nome, status,
 * versão, Preview, salvo automaticamente, Salvar, Exportar), sidebar de
 * ConvertIA | Ajustes (acordeões), canvas com pill de contexto e vizinhos,
 * painel Frames | Legenda, barra inferior (hi-fi, zonas seguras, undo/redo,
 * zoom) e painel flutuante de imagem. Modais: Preview, Exportar, Agendar,
 * Brand Kit.
 *
 * Estado: reducer único (use-editor) com undo/redo e autosave local.
 * Escala do canvas via ResizeObserver; alças em px de tela; ← → ⌘V Esc.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  History,
  Image as ImageIcon,
  Instagram,
  LayoutTemplate,
  Megaphone,
  Minus,
  Palette,
  Plus,
  Ratio,
  Redo2,
  Settings2,
  Sparkles,
  Store,
  Type,
  Undo2,
  Waves,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { aplicarPropostas, ehTextoGuia, novaVersao, propostasDeLinhas, setTexto as setTextoDoc } from "@/lib/conteudo/documento"
import { agendarDocumento } from "@/lib/conteudo/data"
import { chamarIA } from "@/lib/conteudo/ia/client"
import { resumoDocumento } from "@/lib/conteudo/ia/prompt"
import { CAMPO_LABEL, camposExcedidos } from "@/lib/conteudo/limites"
import type { BrandKit, Campo, DocFrame, Documento, EstiloTexto, Perfil, PerfilEditavel } from "@/lib/conteudo/types"
import { ROUTES } from "@/lib/routes"
import { CtBadge, CtIconBtn, CtToast, TNUM, inputCls } from "../ui"
import { ST_STATUS } from "./biblioteca"
import { Chat } from "./chat"
import type { EditorApi, ModalEditor } from "./editor-types"
import { Frame, alturaFrame, type SelImagem, type SelTexto } from "./frame"
import { FramesPanel } from "./frames-panel"
import { ImageFloat } from "./image-float"
import { AgendarModal, BrandKitModal, ExportModal, PreviewModal } from "./modais"
import {
  PainelAssistente,
  PainelCores,
  PainelCtas,
  PainelFundo,
  PainelGlobais,
  PainelGradiente,
  PainelHistorico,
  PainelMidia,
  PainelProporcao,
  PainelTemplate,
  PainelTexto,
} from "./paineis"
import { Thumb } from "./thumb"
import { useEditor } from "./use-editor"

type PainelKey = "template" | "assistente" | "globais" | "texto" | "midia" | "cores" | "fundo" | "gradiente" | "ctas" | "proporcao" | "historico"

const GRUPOS: Array<[string, PainelKey[]]> = [
  ["Conteúdo", ["template", "assistente", "texto", "midia"]],
  ["Marca", ["globais", "cores", "fundo", "gradiente", "ctas"]],
  ["Saída", ["proporcao", "historico"]],
]

const PAINEIS: Record<PainelKey, [string, LucideIcon]> = {
  template: ["Template", Columns3],
  assistente: ["Assistente Convertfy", Sparkles],
  globais: ["Campos globais", Store],
  texto: ["Texto", Type],
  midia: ["Mídia", ImageIcon],
  cores: ["Cores globais", Palette],
  fundo: ["Fundo", LayoutTemplate],
  gradiente: ["Gradiente", Waves],
  ctas: ["CTAs", Megaphone],
  proporcao: ["Proporção", Ratio],
  historico: ["Histórico", History],
}

interface Props {
  doc: Documento
  perfis: Perfil[]
  brandKits: Record<PerfilEditavel, BrandKit> | null
  onSalvarBrandKit: (perfil: PerfilEditavel, kit: BrandKit) => Promise<void>
  modalInicial?: ModalEditor | null
  abaInicial?: "ia" | "ajustes"
  modoTemplate?: boolean
  onSalvarTemplate?: (doc: Documento) => Promise<void>
  anexosIniciais?: string[]
  onSalvo?: (doc: Documento) => void
}

export function Editor({ doc: docInicial, perfis, brandKits, onSalvarBrandKit, modalInicial, abaInicial, modoTemplate = false, onSalvarTemplate, anexosIniciais, onSalvo }: Props) {
  const router = useRouter()
  const ed = useEditor(docInicial, onSalvo)
  const { doc, set, preview } = ed
  const [ativo, setAtivoRaw] = useState(0)
  const [painel, setPainel] = useState<PainelKey | null>("template")
  const [aba, setAba] = useState<"ia" | "ajustes">(abaInicial ?? "ia")
  const [sel, setSel] = useState<SelTexto | null>(null)
  const [imgSel, setImgSel] = useState<SelImagem | null>(null)
  const [zoom, setZoom] = useState(100)
  const [hifi, setHifi] = useState(true)
  const [zonas, setZonas] = useState(false)
  const [modal, setModal] = useState<ModalEditor | null>(modalInicial ?? null)
  const [toast, setToast] = useState<string | null>(null)
  const [expOpen, setExpOpen] = useState(false)
  const [preenchendo, setPreenchendo] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 900, h: 700 })

  const avisar = useCallback((m: string) => {
    setToast(m)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const setAtivo = useCallback(
    (i: number) => {
      setAtivoRaw(Math.max(0, Math.min(doc.frames.length - 1, i)))
      setSel(null)
    },
    [doc.frames.length],
  )
  useEffect(() => {
    if (ativo > doc.frames.length - 1) setAtivoRaw(Math.max(0, doc.frames.length - 1))
  }, [doc.frames.length, ativo])

  const setFrame = useCallback((i: number, patch: Partial<DocFrame>) => set((d) => ({ ...d, frames: d.frames.map((f, j) => (j === i ? { ...f, ...patch } : f)) })), [set])

  const perfilDoc = useMemo(() => perfis.find((p) => p.id === doc.perfil), [perfis, doc.perfil])
  const abrirMidia = useCallback(() => {
    setAba("ajustes")
    setPainel("midia")
  }, [])

  const api: EditorApi = useMemo(
    () => ({ doc, set, preview, setFrame, ativo, setAtivo, sel, setSel, imgSel, setImgSel, setModal, avisar, brandKits, perfis, perfil: perfilDoc, modoTemplate, abrirMidia, restaurar: ed.restaurar, temSnapshot: ed.temSnapshot }),
    [doc, set, preview, setFrame, ativo, setAtivo, sel, imgSel, avisar, brandKits, perfis, perfilDoc, modoTemplate, abrirMidia, ed.restaurar, ed.temSnapshot],
  )

  const f = doc.frames[ativo]
  const H = alturaFrame(doc)

  // ── canvas: escala pelo container ──
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setBox({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])
  const comVizinhos = box.w >= 760
  const fitH = (box.h - 56 - 64 - 24) / H
  const fitW = comVizinhos ? (box.w - 48 - 2 * 28) / (1080 * (1 + 2 * 0.42)) : (box.w - 48) / 1080
  const fit = Math.max(0.12, Math.min(fitH, fitW))
  const canvasScale = fit * (zoom / 100)

  // ── teclado ──
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement
      const tag = (el?.tagName || "").toLowerCase()
      if (el?.isContentEditable || tag === "input" || tag === "textarea" || tag === "select") return
      if (ev.key === "ArrowRight") setAtivo(ativo + 1)
      else if (ev.key === "ArrowLeft") setAtivo(ativo - 1)
      else if (ev.key === "Escape") {
        setSel(null)
        setImgSel(null)
        setModal(null)
        setExpOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [ativo, setAtivo])

  // ── colar texto distribui ──
  useEffect(() => {
    const onPaste = (ev: ClipboardEvent) => {
      const el = ev.target as HTMLElement
      const tag = (el?.tagName || "").toLowerCase()
      if (el?.isContentEditable || tag === "input" || tag === "textarea") return
      const txt = ev.clipboardData?.getData("text") ?? ""
      const props = propostasDeLinhas(doc, txt)
      if (props.length < 2) return
      ev.preventDefault()
      set(() => aplicarPropostas(doc, props, `Texto colado distribuído em ${props.length} slides`), null)
      avisar(`${props.length} slides preenchidos com o texto colado`)
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [doc, set, avisar])

  // ── handlers do frame ──
  const onDragEst = useCallback(
    (frameId: string, campo: Campo, p: EstiloTexto, final: boolean) => {
      const fn = (d: Documento): Documento => ({ ...d, estilos: { ...d.estilos, [frameId]: { ...(d.estilos[frameId] ?? {}), [campo]: { ...(d.estilos[frameId]?.[campo] ?? {}), ...p } } } })
      if (final) set(fn, p.dy != null ? "Texto reposicionado" : "Texto redimensionado")
      else preview(fn)
    },
    [set, preview],
  )
  const onEditText = useCallback((frameId: string, campo: Campo, v: string) => set((d) => setTextoDoc(d, frameId, campo, v)), [set])

  const preencherIA = async () => {
    if (!f) return
    setPreenchendo(true)
    try {
      const r = await chamarIA({ acao: "preencher_frame", resumo: resumoDocumento(doc, perfilDoc), frame: { frameId: f.frameId, tipo: f.tipo, label: f.label, campos: f.campos }, atual: f.textos })
      setFrame(ativo, { textos: { ...f.textos, ...r.textos } })
      avisar("Slide preenchido pela ConvertIA")
    } catch (e) {
      avisar(e instanceof Error ? `ConvertIA: ${e.message}` : "A ConvertIA não respondeu. Tente de novo.")
    } finally {
      setPreenchendo(false)
    }
  }

  const copiarLegenda = async () => {
    try {
      await navigator.clipboard.writeText(doc.legenda)
      avisar("Legenda copiada")
    } catch {
      avisar("Não foi possível copiar")
    }
  }

  const ehGuia = f ? ehTextoGuia(f) : false
  const excedidos = f ? camposExcedidos(f) : []
  const imgAtivo = imgSel ? doc.frames.find((x) => x.frameId === imgSel.frameId) : null
  const [stL, stC] = ST_STATUS[doc.status]
  const versoes = useMemo(() => {
    const n = parseInt(doc.versao.replace(/\D/g, ""), 10) || 1
    return Array.from({ length: Math.max(n, 1) }, (_, i) => `v${i + 1}`)
  }, [doc.versao])

  const painelBody: Record<PainelKey, React.ReactNode> = {
    template: <PainelTemplate api={api} />,
    assistente: <PainelAssistente api={api} />,
    globais: <PainelGlobais api={api} />,
    texto: <PainelTexto api={api} />,
    midia: <PainelMidia api={api} />,
    cores: <PainelCores api={api} />,
    fundo: <PainelFundo api={api} />,
    gradiente: <PainelGradiente api={api} />,
    ctas: <PainelCtas api={api} />,
    proporcao: <PainelProporcao api={api} />,
    historico: <PainelHistorico api={api} />,
  }

  const ghost = (l: string, on: () => void, icon?: LucideIcon) => (
    <button type="button" onClick={on} className="inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-[var(--ops-border)] px-[11px] text-[11.5px] font-medium text-[var(--ops-title)] hover:bg-[var(--ops-hover)]">
      {icon && <Icon icon={icon} customSize={12} />}
      {l}
    </button>
  )

  return (
    <div
      className="-m-4 flex h-[100dvh] min-w-0 flex-col bg-[var(--ops-page)] md:-m-6 lg:-m-8"
      onClick={() => {
        setSel(null)
        setImgSel(null)
      }}
    >
      {/* topbar */}
      <div className="flex h-[52px] shrink-0 items-center gap-2 overflow-x-auto border-b border-[var(--ops-border)] bg-[var(--ops-card)] px-4" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => router.push(ROUTES.ADMIN.CONTEUDO.ESTUDIO)} title="Voltar à biblioteca" aria-label="Voltar à biblioteca" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-[var(--ops-border)] text-[var(--ops-sec)] hover:bg-[var(--ops-hover)]">
          <Icon icon={ChevronLeft} customSize={14} />
        </button>
        <span className="text-[10px] font-bold tracking-[0.08em] text-[var(--ops-mut)]">PROJETOS</span>
        <span className="text-[var(--ops-mut)]">›</span>
        <input value={doc.projeto} onChange={(e) => set({ projeto: e.target.value })} aria-label="Projeto" className={cn(inputCls, "h-7 w-[170px] font-medium")} />
        <span className="text-[var(--ops-mut)]">›</span>
        <span className="text-[10px] font-bold tracking-[0.08em] text-[var(--ops-mut)]">CARROSSEL</span>
        <span className="text-[var(--ops-mut)]">›</span>
        <input value={doc.nome} onChange={(e) => set({ nome: e.target.value })} aria-label="Nome do carrossel" className={cn(inputCls, "h-7 w-[280px] font-semibold")} />
        <CtBadge txt={stL} cor={stC} />
        <select value={doc.versao} onChange={(e) => set({ versao: e.target.value })} aria-label="Versão" className="h-7 rounded-[7px] border border-[var(--ops-border)] bg-[var(--ops-page)] px-1.5 text-[11.5px] text-[var(--ops-title)] outline-none">
          {versoes.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        {ghost("Criar novo", () => set({ versao: novaVersao(doc.versao) }, "Nova versão criada"), Plus)}
        <span className="flex-1" />
        {modoTemplate && <span className="inline-flex h-7 items-center rounded-full bg-[#0E7490]/15 px-2.5 text-[11px] font-semibold text-[#0E7490] dark:text-[#67E8F9]">Revisando template</span>}
        {modoTemplate && onSalvarTemplate && (
          <button type="button" onClick={() => void onSalvarTemplate(doc)} className="h-8 rounded-lg bg-[#0E7490] px-3.5 text-[12px] font-semibold text-white">
            Salvar template
          </button>
        )}
        {ghost("Preview", () => setModal("preview"), Instagram)}
        {ed.salvo === "conflito" ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--ops-warn-br)] bg-[var(--ops-warn-bg)] px-2 py-1 text-[10.5px] text-[var(--ops-warn)]" title={ed.erroSalvar ?? undefined}>
            Alterado em outro lugar
            <button type="button" onClick={() => ed.resolverConflito("recarregar")} className="font-semibold underline">
              Recarregar
            </button>
            <button type="button" onClick={() => ed.resolverConflito("sobrescrever")} className="font-semibold underline">
              Sobrescrever
            </button>
          </span>
        ) : (
          <span className={cn("whitespace-nowrap text-[10.5px]", ed.salvo === "erro" ? "text-[var(--ops-neg)]" : "text-[var(--ops-mut)]")} title={ed.erroSalvar ?? undefined}>
            {ed.salvo === "salvo" ? "Salvo no servidor" : ed.salvo === "salvando" ? "Salvando…" : ed.salvo === "pendente" ? "Alterações pendentes" : `Erro ao salvar${ed.erroSalvar ? `: ${ed.erroSalvar}` : ""}`}
          </span>
        )}
        {ghost("Salvar", () => {
          set({ status: doc.status === "rascunho" ? "pronto" : doc.status }, doc.status === "rascunho" ? "Marcado como pronto" : null)
          void ed.salvarAgora().then((ok) => avisar(ok ? "Salvo no servidor" : "Não foi possível salvar"))
        })}
        <div className="relative flex shrink-0">
          <button type="button" onClick={() => setModal("exportar")} className="h-8 rounded-l-lg bg-[var(--ops-accent)] px-3.5 text-[12px] font-semibold text-[var(--ops-on-accent)]">
            Exportar
          </button>
          <Popover open={expOpen} onOpenChange={setExpOpen}>
            <PopoverTrigger asChild>
              <button type="button" aria-label="Mais opções de exportação" className="flex h-8 w-7 items-center justify-center rounded-r-lg border-l border-white/25 bg-[var(--ops-accent)] text-[var(--ops-on-accent)]">
                <Icon icon={ChevronDown} customSize={12} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={6} className="w-[230px] rounded-[9px] border-[var(--ops-border)] bg-[var(--ops-card)] p-1 shadow-lg">
              {(
                [
                  ["Baixar todos em PNG (ZIP)", () => setModal("exportar")],
                  ["Baixar todos em JPG (ZIP)", () => setModal("exportar")],
                  ["Copiar legenda", () => void copiarLegenda()],
                  ["Enviar para o calendário", () => setModal("agendar")],
                  ["Abrir prévia do Instagram", () => setModal("preview")],
                ] as Array<[string, () => void]>
              ).map(([l, fn]) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => {
                    setExpOpen(false)
                    fn()
                  }}
                  className="block w-full rounded-md px-2.5 py-[7px] text-left text-[12px] text-[var(--ops-text)] hover:bg-[var(--ops-hover)]"
                >
                  {l}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1">
        {/* sidebar */}
        <aside className="flex w-[330px] shrink-0 flex-col border-r border-[var(--ops-border)] bg-[var(--ops-card)]" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-0.5 border-b border-[var(--ops-border)] px-2.5 pt-2.5">
            {(
              [
                ["ia", "ConvertIA", Sparkles],
                ["ajustes", "Ajustes", Settings2],
              ] as Array<["ia" | "ajustes", string, LucideIcon]>
            ).map(([k, l, ic]) => (
              <button key={k} type="button" onClick={() => setAba(k)} className={cn("-mb-px flex items-center gap-[7px] border-b-2 px-3 py-2 text-[12.5px]", aba === k ? "border-[var(--ops-accent)] font-semibold text-[var(--ops-title)]" : "border-transparent font-medium text-[var(--ops-sec)]")}>
                <Icon icon={ic} customSize={13} />
                {l}
              </button>
            ))}
          </div>
          <div className={cn("min-h-0 flex-1 flex-col", aba === "ia" ? "flex" : "hidden")}>
            <Chat api={api} anexosIniciais={anexosIniciais} />
          </div>
          <div className={cn("min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2.5 pb-5 pt-2.5", aba === "ajustes" ? "flex" : "hidden")}>
            {GRUPOS.map(([g, keys], gi) => (
              <div key={g} className="flex flex-col gap-1">
                <div className={cn("px-2.5 pb-1 text-[9.5px] font-bold uppercase tracking-[0.1em] text-[var(--ops-mut)]", gi ? "pt-3.5" : "pt-1")}>{g}</div>
                {keys.map((k) => {
                  const [l, ic] = PAINEIS[k]
                  const on = painel === k
                  return (
                    <div key={k} className={cn("rounded-[9px] border", on ? "border-[var(--ops-border)] bg-[var(--ops-page)]" : "border-transparent")}>
                      <button type="button" onClick={() => setPainel(on ? null : k)} aria-expanded={on} className={cn("flex h-10 w-full items-center gap-2.5 rounded-[9px] px-2.5 text-left", !on && "hover:bg-[var(--ops-hover)]")}>
                        <span className={cn("inline-flex h-[26px] w-[26px] items-center justify-center rounded-[7px]", on ? "bg-[var(--ops-track)] text-[var(--ops-title)]" : "bg-[var(--ops-tile)] text-[var(--ops-sec)]")}>
                          <Icon icon={ic} customSize={13} />
                        </span>
                        <span className={cn("flex-1 text-[12.5px]", on ? "font-semibold text-[var(--ops-title)]" : "font-medium text-[var(--ops-sec)]")}>{l}</span>
                        <span className={cn("flex text-[var(--ops-mut)] transition-transform", on && "rotate-180")}>
                          <Icon icon={ChevronDown} customSize={12} />
                        </span>
                      </button>
                      {on && <div className="px-3 pb-3.5 pt-0.5">{painelBody[k]}</div>}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </aside>

        {/* canvas */}
        <div ref={canvasRef} className="relative min-w-0 flex-1 overflow-hidden bg-[#E9EBF0] dark:bg-[#0B0D12]">
          {f && (
            <div onClick={(e) => e.stopPropagation()} className="absolute left-1/2 top-3 z-[5] flex h-[34px] max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 overflow-hidden whitespace-nowrap rounded-[17px] border border-[var(--ops-border)] bg-[var(--ops-card)] pl-3 pr-1.5 shadow-[0_4px_14px_rgba(0,0,0,0.08)]">
              <span className="text-[12px] font-semibold text-[var(--ops-title)]">
                {String(ativo + 1).padStart(2, "0")} · {f.label}
              </span>
              <span className="text-[11px] capitalize text-[var(--ops-mut)]">
                {f.tipo}
                {f.slotsImagem ? (f.imagens.slot1 ? " · com imagem" : " · sem imagem") : ""}
              </span>
              {excedidos.length > 0 && (
                <span title="O texto encolheu para caber. Encurte ou divida em dois." className="inline-flex items-center gap-[5px] rounded-[10px] border border-[var(--ops-warn-br)] bg-[var(--ops-warn-bg)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--ops-warn)]">
                  {excedidos.map((c) => CAMPO_LABEL[c]).join(" e ")} longo{excedidos.length > 1 ? "s" : ""}
                </span>
              )}
              {ehGuia && (
                <button type="button" onClick={() => void preencherIA()} disabled={preenchendo} className="inline-flex h-6 items-center gap-[5px] rounded-xl bg-[var(--ops-accent)] px-[9px] text-[10.5px] font-semibold text-[var(--ops-on-accent)] disabled:opacity-60">
                  <Icon icon={Sparkles} customSize={11} /> {preenchendo ? "Preenchendo…" : "Preencher com IA"}
                </button>
              )}
              <span className="mx-0.5 h-4 w-px bg-[var(--ops-border)]" />
              <CtIconBtn icon={ChevronLeft} title="Anterior (←)" disabled={ativo === 0} onClick={() => setAtivo(ativo - 1)} />
              <CtIconBtn icon={ChevronRight} title="Próximo (→)" disabled={ativo === doc.frames.length - 1} onClick={() => setAtivo(ativo + 1)} />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center gap-7 overflow-hidden px-6 pb-16 pt-14">
            {comVizinhos && ativo > 0 && (
              <div
                onClick={(e) => {
                  e.stopPropagation()
                  setAtivo(ativo - 1)
                }}
                className="shrink-0 cursor-pointer overflow-hidden rounded opacity-45 transition-opacity hover:opacity-70"
              >
                <Thumb doc={doc} ix={ativo - 1} w={1080 * canvasScale * 0.42} />
              </div>
            )}
            <div onClick={(e) => e.stopPropagation()} className="max-h-full shrink-0 overflow-hidden rounded shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
              {hifi ? (
                <Frame
                  doc={doc}
                  ix={ativo}
                  scale={canvasScale}
                  sel={sel}
                  imgSel={imgSel}
                  interactive
                  zonas={zonas}
                  onSelText={(s) => {
                    setSel(s)
                    setImgSel(null)
                    if (!s.editing) {
                      setPainel("texto")
                      setAba("ajustes")
                    }
                  }}
                  onSelImg={(s) => {
                    setSel(null)
                    if (s.vazio) {
                      setImgSel(null)
                      setPainel("midia")
                      setAba("ajustes")
                    } else setImgSel(s)
                  }}
                  onEditText={onEditText}
                  onDragEst={onDragEst}
                />
              ) : (
                <div className="flex items-center justify-center bg-[var(--ops-card)] text-[12px] text-[var(--ops-mut)]" style={{ width: 1080 * canvasScale, height: H * canvasScale }}>
                  Rascunho de baixa fidelidade · {f?.label}
                </div>
              )}
            </div>
            {comVizinhos && ativo < doc.frames.length - 1 && (
              <div
                onClick={(e) => {
                  e.stopPropagation()
                  setAtivo(ativo + 1)
                }}
                className="shrink-0 cursor-pointer overflow-hidden rounded opacity-45 transition-opacity hover:opacity-70"
              >
                <Thumb doc={doc} ix={ativo + 1} w={1080 * canvasScale * 0.42} />
              </div>
            )}
          </div>
          {imgAtivo?.imagens.slot1 && <ImageFloat api={api} />}

          {/* barra inferior */}
          <div onClick={(e) => e.stopPropagation()} className="absolute inset-x-0 bottom-0 flex h-11 items-center gap-2.5 overflow-x-auto border-t border-[var(--ops-border)] bg-[var(--ops-card)] px-4">
            <label className="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-[11.5px] text-[var(--ops-sec)]">
              <span className={cn("h-[7px] w-[7px] rounded-full", hifi ? "bg-[var(--ops-pos)]" : "bg-[var(--ops-mut)]")} />
              <input type="checkbox" checked={hifi} onChange={(e) => setHifi(e.target.checked)} className="m-0 accent-[var(--ops-accent)]" />
              <span>
                <span className="hidden xl:inline">Visualização de </span>alta fidelidade
              </span>
            </label>
            <label className={cn("ml-2.5 flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-[11.5px]", zonas ? "text-[var(--ops-title)]" : "text-[var(--ops-sec)]")}>
              <input type="checkbox" checked={zonas} onChange={(e) => setZonas(e.target.checked)} className="m-0 accent-[#DC2626]" />
              <span>
                Zonas seguras<span className="hidden xl:inline"> do Instagram</span>
              </span>
            </label>
            <span className="ml-2 hidden whitespace-nowrap text-[10.5px] text-[var(--ops-mut)] 2xl:inline">← → navegam · ⌘V cola e distribui · duplo clique edita · ⌘Z desfaz</span>
            <span className="min-w-2 flex-1" />
            <div className="flex shrink-0 gap-1">
              <CtIconBtn icon={Undo2} title="Desfazer (⌘Z)" disabled={!ed.podeDesfazer} onClick={ed.undo} />
              <CtIconBtn icon={Redo2} title="Refazer (⌘⇧Z)" disabled={!ed.podeRefazer} onClick={ed.redo} />
            </div>
            <span className="min-w-2 flex-1" />
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => setZoom(100)} title="Ajustar à tela" className={cn("h-7 rounded-[7px] border border-[var(--ops-border)] px-[9px] text-[11px] font-medium text-[var(--ops-sec)]", zoom === 100 ? "bg-[var(--ops-hover)]" : "bg-[var(--ops-card)]")}>
                Ajustar
              </button>
              <CtIconBtn icon={Minus} title="Diminuir" onClick={() => setZoom((z) => Math.max(50, z - 10))} />
              <span className="w-11 text-center text-[11.5px] font-semibold text-[var(--ops-title)]" style={TNUM}>
                {zoom}%
              </span>
              <CtIconBtn icon={Plus} title="Aumentar" onClick={() => setZoom((z) => Math.min(160, z + 10))} />
            </div>
          </div>
        </div>

        <FramesPanel api={api} />
      </div>

      {modal === "preview" && <PreviewModal doc={doc} perfil={perfilDoc} onClose={() => setModal(null)} onExportar={() => setModal("exportar")} onAgendar={() => setModal("agendar")} />}
      {modal === "exportar" && <ExportModal api={api} onClose={() => setModal(null)} onAgendar={() => setModal("agendar")} />}
      {modal === "agendar" && (
        <AgendarModal
          doc={doc}
          perfis={perfis}
          onClose={() => setModal(null)}
          onConfirmar={async (q) => {
            // Salva o documento antes: a agenda referencia a linha no banco.
            const ok = await ed.salvarAgora()
            if (!ok) throw new Error("Salve o carrossel antes de agendar.")
            const r = await agendarDocumento({ documentoId: doc.id, perfil: q.perfil || null, data: q.dataIso, hora: q.hora })
            const nomePerfil = perfis.find((p) => p.id === q.perfil)?.nome ?? "perfil"
            set({ status: "agendado", data: r.agenda.data, agenda: { perfil: r.agenda.perfil, data: r.agenda.data, dataIso: r.agenda.dataIso, hora: r.agenda.hora } }, `Agendado para ${r.agenda.data} às ${r.agenda.hora} · ${nomePerfil}`)
            setModal(null)
            avisar(`Agendado para ${r.agenda.data} às ${r.agenda.hora} e adicionado ao Calendário`)
          }}
        />
      )}
      {modal === "brandkit" && (
        <BrandKitModal
          api={api}
          onSalvarBrandKit={async (perfil, kit) => {
            await onSalvarBrandKit(perfil, kit)
            if (perfil === doc.perfil) set({ brandKit: kit }, "Brand Kit atualizado")
          }}
          onClose={() => setModal(null)}
        />
      )}
      <CtToast msg={toast} />
    </div>
  )
}
