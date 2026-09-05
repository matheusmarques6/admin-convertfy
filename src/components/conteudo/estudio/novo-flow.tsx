"use client"

/**
 * Fluxo "Novo carrossel" / "Criar template" em tela cheia: stepper de 3
 * passos com validação inline, três caminhos (Template Convertfy · 100% com
 * IA · A partir de inspiração), nome e perfil. O fluxo constrói o documento
 * (chamando a ConvertIA quando o caminho pede) e devolve pronto.
 */

import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { Check, Columns3, Image as ImageIcon, Sparkles, X } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { CT_MOLDE_COR } from "@/lib/conteudo/brand"
import { getPromptsProntos, getSugestoesImagem, slotDeUrl } from "@/lib/conteudo/data"
import {
  ajustarQuantidadeFrames,
  comHistorico,
  documentoDeEstrutura,
  novoDocumento,
  type EstruturaDetectada,
} from "@/lib/conteudo/documento"
import { chamarIA } from "@/lib/conteudo/ia/client"
import { estruturaLocal, inspiracaoLocal } from "@/lib/conteudo/ia/fallback"
import type { SaidaInspiracao } from "@/lib/conteudo/ia/schemas"
import { arquivosParaDataUrls } from "@/lib/conteudo/imagens"
import { getTemplate, moldeKeyDoTemplate, ST_FUNIL, ST_TEMPLATES } from "@/lib/conteudo/templates"
import type { BrandKit, Documento, FrameTipo, PerfilEditavel, Post } from "@/lib/conteudo/types"
import { CtBadge, CtLabel, TNUM, inputCls, selectCls, textareaCls } from "../ui"
import type { Caminho } from "./biblioteca"
import { TemplateCard } from "./template-card"
import { ThumbFit } from "./thumb"

export interface CriacaoResultado {
  doc: Documento
  caminho: Caminho | "template-review"
  /** Referências visuais anexadas no caminho IA (vão para o chat do editor). */
  anexos?: string[]
  /** Também salvar como template reutilizável (caminho inspiração). */
  salvarTemplate?: { nome: string; frames: number; templateId: string }
  /** A IA respondeu pelo modo local. */
  modoLocal?: boolean
}

interface Props {
  caminhoInicial?: Caminho | null
  tplInicial?: string | null
  perfilInicial?: PerfilEditavel
  modoTemplate?: boolean
  posts: Post[]
  brandKits: Record<PerfilEditavel, BrandKit> | null
  onClose: () => void
  onCriado: (r: CriacaoResultado) => void
}

const PILARES = ["Case", "Educacional", "Bastidor", "Benchmark"]
const TIPOS: FrameTipo[] = ["capa", "dado", "texto", "prova", "lista", "mec", "cta"]

const CAMINHOS: Array<[Caminho, string, string, LucideIcon, string]> = [
  ["template", "Template Convertfy", "Molde testado, você preenche", Columns3, "#4E62D8"],
  ["ia", "100% com IA", "Pauta ou prompt pronto, a IA monta tudo", Sparkles, "#7C3AED"],
  ["inspiracao", "A partir de inspiração", "Suba uma referência, vira template fiel", ImageIcon, "#0E7490"],
]

export function NovoFlow({ caminhoInicial, tplInicial, perfilInicial, modoTemplate, posts, brandKits, onClose, onCriado }: Props) {
  const [caminho, setCaminho] = useState<Caminho | null>(modoTemplate ? "inspiracao" : caminhoInicial ?? null)
  const [tpl, setTpl] = useState<string | null>(tplInicial ?? null)
  const [nome, setNome] = useState("")
  const [perfil, setPerfil] = useState<PerfilEditavel>(perfilInicial ?? "convertfy")
  const [prompt, setPrompt] = useState("")
  const [promptSel, setPromptSel] = useState<number | null>(null)
  const [pilar, setPilar] = useState(PILARES[0])
  const [etapa, setEtapa] = useState<"topo" | "meio" | "fundo">("topo")
  const [slides, setSlides] = useState(7)
  const [refs, setRefs] = useState<string[]>([])
  const [analise, setAnalise] = useState<"idle" | "loading" | "done">("idle")
  const [estrutura, setEstrutura] = useState<EstruturaDetectada[]>([])
  const [inspiracao, setInspiracao] = useState<SaidaInspiracao | null>(null)
  const [salvarComoTemplate, setSalvarComoTemplate] = useState(true)
  const [nomeTpl, setNomeTpl] = useState("")
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [avisoLocal, setAvisoLocal] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const prompts = getPromptsProntos()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !criando && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, criando])

  // ── validação ──
  const pronto = modoTemplate
    ? analise === "done" && nomeTpl.trim().length > 0
    : caminho === "template"
      ? Boolean(nome.trim() && tpl)
      : caminho === "ia"
        ? Boolean(nome.trim() && (prompt.trim() || promptSel != null))
        : caminho === "inspiracao"
          ? Boolean(nome.trim() && analise === "done")
          : false
  const msg = !caminho
    ? "Escolha um caminho"
    : modoTemplate
      ? analise !== "done"
        ? "Suba a inspiração e analise"
        : !nomeTpl.trim()
          ? "Dê um nome ao template"
          : "Revise slots e limites no editor antes de salvar"
      : !nome.trim()
        ? "Falta dar nome ao carrossel"
        : caminho === "template" && !tpl
          ? "Escolha um template"
          : caminho === "ia" && !prompt.trim() && promptSel == null
            ? "Descreva a pauta ou escolha um prompt"
            : caminho === "inspiracao" && analise !== "done"
              ? "Suba a inspiração e analise"
              : "Tudo pronto"

  const passos = modoTemplate ? ["Inspiração", "Estrutura detectada", "Revisar e salvar"] : ["Caminho", caminho === "ia" ? "Pauta" : caminho === "inspiracao" ? "Inspiração" : "Template", "Nome e perfil"]
  const passoAtual = modoTemplate
    ? analise === "done"
      ? 2
      : refs.length
        ? 1
        : 0
    : !caminho
      ? 0
      : (caminho === "template" ? !tpl : caminho === "ia" ? !(prompt.trim() || promptSel != null) : analise !== "done")
        ? 1
        : 2

  // ── upload de referências ──
  const addArquivos = async (files: FileList | null) => {
    if (!files?.length) return
    const urls = await arquivosParaDataUrls(files, 900)
    setRefs((r) => [...r, ...urls].slice(0, 12))
    if (analise === "done") setAnalise("idle")
  }

  const analisar = async () => {
    if (!refs.length) return
    setAnalise("loading")
    setErro(null)
    try {
      const r = await chamarIA({ acao: "analisar_inspiracao", imagens: refs })
      setInspiracao(r)
      setEstrutura(r.frames.map((f) => ({ tipo: f.tipo, slotImagem: f.slotImagem })))
      setAvisoLocal(false)
    } catch (e) {
      const r = inspiracaoLocal()
      setInspiracao(r)
      setEstrutura(r.frames.map((f) => ({ tipo: f.tipo, slotImagem: f.slotImagem })))
      setAvisoLocal(true)
      setErro(e instanceof Error ? e.message : "ConvertIA indisponível; usei a leitura local.")
    }
    setAnalise("done")
  }

  const docPrevia = useMemo(() => {
    if (!estrutura.length) return null
    const d = documentoDeEstrutura(nome.trim() || "Prévia com a identidade Convertfy", perfil, estrutura, { templateBase: inspiracao?.templateSugerido })
    d.frames[0].textos.titulo = nome.trim() || "Sua afirmação forte aqui"
    return d
  }, [estrutura, nome, perfil, inspiracao])

  // ── criação ──
  const criar = async () => {
    if (!pronto || criando) return
    setCriando(true)
    setErro(null)
    const kit = brandKits?.[perfil]
    try {
      if (modoTemplate) {
        const d = documentoDeEstrutura(nomeTpl.trim(), "convertfy", estrutura, { templateBase: inspiracao?.templateSugerido, brandKit: brandKits?.convertfy })
        d.projeto = "Templates do time"
        d.frames[0].imagens.slot1 = slotDeUrl(getSugestoesImagem("f1")[0])
        onCriado({
          doc: comHistorico(d, `Template criado a partir de inspiração (fidelidade ${Math.round(inspiracao?.fidelidade ?? 0)}%)`),
          caminho: "template-review",
          salvarTemplate: { nome: nomeTpl.trim(), frames: estrutura.length, templateId: inspiracao?.templateSugerido ?? "molde-benchmark" },
          modoLocal: avisoLocal,
        })
        return
      }
      if (caminho === "template" && tpl) {
        const d = novoDocumento(nome.trim(), perfil, tpl, { brandKit: kit })
        d.frames[0].textos.titulo = nome.trim()
        d.frames = d.frames.map((fr) => (fr.slotsImagem ? { ...fr, imagens: { slot1: slotDeUrl(getSugestoesImagem(fr.frameId)[0]) } } : fr))
        onCriado({ doc: d, caminho: "template" })
        return
      }
      if (caminho === "ia") {
        const p = promptSel != null ? prompts[promptSel] : null
        const templateId = p?.tpl ?? (etapa === "meio" ? "molde-lista" : etapa === "fundo" ? "molde-bastidor" : "molde-turbo")
        let d = novoDocumento(nome.trim(), perfil, templateId, { brandKit: kit })
        d = ajustarQuantidadeFrames(d, slides)
        const pauta = [prompt.trim(), p?.pauta].filter(Boolean).join("\n\n")
        const t = getTemplate(templateId)
        let modoLocal = false
        try {
          const r = await chamarIA({
            acao: "gerar_estrutura",
            nome: nome.trim(),
            perfil,
            pauta,
            pilar: p?.pilar ?? pilar,
            etapaFunil: ST_FUNIL[etapa].n,
            objetivoCta: "Comment gate",
            templateNome: t.nome,
            frames: d.frames.map((f) => ({ frameId: f.frameId, tipo: f.tipo, label: f.label, campos: f.campos })),
          })
          d = {
            ...d,
            nome: r.nome?.trim() || d.nome,
            frames: d.frames.map((f) => {
              const x = r.frames.find((y) => y.frameId === f.frameId)
              return x ? { ...f, textos: { ...f.textos, ...x.textos } } : f
            }),
            legenda: r.legenda,
            palavraChave: r.palavraChave.toUpperCase(),
            cta: { ...d.cta, texto: `Comente ${r.palavraChave.toUpperCase()}` },
          }
        } catch (e) {
          modoLocal = true
          const r = estruturaLocal(d)
          d = {
            ...d,
            frames: d.frames.map((f) => {
              const x = r.frames.find((y) => y.frameId === f.frameId)
              return x ? { ...f, textos: { ...f.textos, ...x.textos } } : f
            }),
            legenda: r.legenda,
            palavraChave: r.palavraChave,
          }
          setErro(e instanceof Error ? e.message : "ConvertIA indisponível")
        }
        d.frames = d.frames.map((fr) => (fr.slotsImagem ? { ...fr, imagens: { slot1: slotDeUrl(getSugestoesImagem(fr.frameId)[0]) } } : fr))
        d = comHistorico(d, modoLocal ? "Carrossel montado pelo modo local (ConvertIA indisponível)" : "Carrossel gerado 100% pela ConvertIA")
        onCriado({ doc: d, caminho: "ia", anexos: refs.length ? refs : undefined, modoLocal })
        return
      }
      if (caminho === "inspiracao") {
        let d = documentoDeEstrutura(nome.trim(), perfil, estrutura, { templateBase: inspiracao?.templateSugerido, brandKit: kit })
        d.frames[0].textos.titulo = nome.trim()
        d.frames = d.frames.map((fr) => (fr.slotsImagem ? { ...fr, imagens: { slot1: slotDeUrl(getSugestoesImagem(fr.frameId)[0]) } } : fr))
        d = comHistorico(d, `Template criado a partir de inspiração (fidelidade ${Math.round(inspiracao?.fidelidade ?? 0)}%)`)
        onCriado({
          doc: d,
          caminho: "inspiracao",
          salvarTemplate: salvarComoTemplate ? { nome: nome.trim(), frames: estrutura.length, templateId: inspiracao?.templateSugerido ?? "molde-benchmark" } : undefined,
          modoLocal: avisoLocal,
        })
      }
    } finally {
      setCriando(false)
    }
  }

  const botaoLabel = criando ? (caminho === "ia" ? "Gerando…" : "Criando…") : modoTemplate ? "Revisar no editor" : caminho === "ia" ? "Gerar carrossel" : "Criar carrossel"

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-[var(--ops-page)]" role="dialog" aria-modal="true" aria-label={modoTemplate ? "Criar template" : "Novo carrossel"}>
      {/* topo */}
      <div className="flex h-14 shrink-0 items-center gap-3.5 border-b border-[var(--ops-border)] bg-[var(--ops-card)] px-6">
        <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-[var(--ops-border)] text-[var(--ops-sec)] hover:bg-[var(--ops-hover)]">
          <Icon icon={X} customSize={14} />
        </button>
        <span className="text-[14.5px] font-semibold text-[var(--ops-title)]">{modoTemplate ? "Criar template a partir de inspiração" : "Novo carrossel"}</span>
        <span className="flex-1" />
        <div className="hidden items-center gap-1.5 md:flex">
          {passos.map((p, i) => (
            <Fragment key={p}>
              <span className={cn("inline-flex items-center gap-[7px] text-[11.5px]", i === passoAtual ? "font-semibold text-[var(--ops-title)]" : i < passoAtual ? "font-medium text-[var(--ops-sec)]" : "font-medium text-[var(--ops-mut)]")}>
                <span
                  className={cn(
                    "inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-bold",
                    i < passoAtual ? "bg-[var(--ops-pos)] text-white" : i === passoAtual ? "bg-[var(--ops-accent)] text-[var(--ops-on-accent)]" : "bg-[var(--ops-track)] text-[var(--ops-mut)]",
                  )}
                >
                  {i < passoAtual ? <Icon icon={Check} customSize={9} /> : i + 1}
                </span>
                {p}
              </span>
              {i < 2 && <span className="h-px w-5 bg-[var(--ops-border)]" />}
            </Fragment>
          ))}
        </div>
        <span className="flex-1" />
        <span className={cn("hidden text-[11.5px] sm:inline", pronto ? "text-[var(--ops-mut)]" : "text-[var(--ops-warn)]")}>{msg}</span>
        <button
          type="button"
          disabled={!pronto || criando}
          onClick={criar}
          className="inline-flex h-9 items-center gap-2 rounded-[9px] bg-[var(--ops-accent)] px-4 text-[12.5px] font-semibold text-[var(--ops-on-accent)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {criando && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
          {botaoLabel}
        </button>
      </div>

      {/* corpo */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-6 pb-12 pt-7 md:px-8">
          {erro && (
            <div className="rounded-lg border border-[var(--ops-warn-br)] bg-[var(--ops-warn-bg)] px-3 py-2.5 text-[11.5px] text-[var(--ops-warn)]">
              {erro} {avisoLocal || caminho === "ia" ? "O modo local foi usado para não travar o fluxo." : ""}
            </div>
          )}
          {!modoTemplate && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {CAMINHOS.map(([k, n, d, ic, cor]) => {
                const on = caminho === k
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setCaminho(k)}
                    aria-pressed={on}
                    className={cn("flex items-center gap-3 rounded-[11px] border bg-[var(--ops-card)] px-3.5 py-3 text-left transition-colors", on ? "border-current" : "border-[var(--ops-border)] hover:border-[var(--ops-mut)]")}
                    style={on ? { borderColor: cor, boxShadow: `0 0 0 3px ${cor}22` } : undefined}
                  >
                    <span className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px]" style={{ background: `${cor}1F`, color: cor }}>
                      <Icon icon={ic} customSize={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-[var(--ops-title)]">{n}</span>
                      <span className="mt-0.5 block text-[11px] text-[var(--ops-sec)]">{d}</span>
                    </span>
                    {on && (
                      <span className="ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white" style={{ background: cor }}>
                        <Icon icon={Check} customSize={11} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {caminho === "template" &&
            (Object.keys(ST_FUNIL) as Array<keyof typeof ST_FUNIL>).map((k) => {
              const g = ST_FUNIL[k]
              return (
                <div key={k}>
                  <div className="mb-2.5 flex flex-wrap items-baseline gap-2.5">
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: g.cor }}>
                      {g.n}
                    </span>
                    <span className="text-[11.5px] text-[var(--ops-sec)]">{g.d}</span>
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
                    {ST_TEMPLATES.filter((t) => t.etapaFunil === k).map((t) => (
                      <TemplateCard key={t.id} tpl={t} posts={posts} sel={tpl === t.id} onClick={() => setTpl(t.id)} />
                    ))}
                  </div>
                </div>
              )
            })}

          {caminho === "ia" && (
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_380px]">
              <div className="flex flex-col gap-3.5">
                <div>
                  <CtLabel>Pauta</CtLabel>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={6}
                    placeholder="Ex.: Explicar por que segmentar a base por LTV vale mais que dar cupom. Público: donos de e-commerce de moda. Tom direto, com um dado forte na capa e case da Boutique Solar como prova."
                    className={cn(textareaCls, "bg-[var(--ops-card)] px-3.5 py-3 text-[13px]")}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <CtLabel>Pilar</CtLabel>
                    <select value={pilar} onChange={(e) => setPilar(e.target.value)} className={cn(selectCls, "bg-[var(--ops-card)]")}>
                      {PILARES.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <CtLabel>Etapa do funil</CtLabel>
                    <select value={etapa} onChange={(e) => setEtapa(e.target.value as typeof etapa)} className={cn(selectCls, "bg-[var(--ops-card)]")}>
                      {(Object.keys(ST_FUNIL) as Array<keyof typeof ST_FUNIL>).map((k) => (
                        <option key={k} value={k}>
                          {ST_FUNIL[k].n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <CtLabel>Slides</CtLabel>
                    <select value={slides} onChange={(e) => setSlides(Number(e.target.value))} className={cn(selectCls, "bg-[var(--ops-card)]")}>
                      {[6, 7, 8, 9, 10].map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <CtLabel>Referências visuais (opcional)</CtLabel>
                  <div className="flex flex-wrap gap-2">
                    {refs.map((u, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={u} alt="" className="h-[70px] w-14 rounded-[7px] object-cover" />
                    ))}
                    <button type="button" onClick={() => fileRef.current?.click()} aria-label="Adicionar referência" className="h-[70px] w-14 rounded-[7px] border border-dashed border-[var(--ops-border)] text-[18px] text-[var(--ops-mut)] hover:bg-[var(--ops-hover)]">
                      +
                    </button>
                  </div>
                  <div className="mt-1.5 text-[10.5px] text-[var(--ops-mut)]">Seguem para a ConvertIA no editor, como direção visual.</div>
                </div>
                <div className="flex items-center gap-2 rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-tile)] px-3 py-2.5 text-[11.5px] text-[var(--ops-sec)]">
                  <Icon icon={Sparkles} customSize={14} className="shrink-0 text-[var(--ops-title)]" />A ConvertIA escolhe o molde, escreve os slides, sugere imagens e a legenda. Você revisa no editor antes de exportar.
                </div>
              </div>
              <div>
                <CtLabel>Prompts prontos</CtLabel>
                <div className="flex flex-col gap-2">
                  {prompts.map((p, i) => {
                    const on = promptSel === i
                    const t = getTemplate(p.tpl)
                    return (
                      <button
                        key={p.n}
                        type="button"
                        onClick={() => setPromptSel(on ? null : i)}
                        aria-pressed={on}
                        className={cn("flex gap-[11px] rounded-[10px] border bg-[var(--ops-card)] px-3 py-[11px] text-left transition-colors", on ? "border-[#7C3AED] shadow-[0_0_0_3px_rgba(124,58,237,0.14)]" : "border-[var(--ops-border)] hover:border-[var(--ops-mut)]")}
                      >
                        <span className="h-[50px] w-10 shrink-0 rounded-md" style={{ background: `linear-gradient(160deg, ${CT_MOLDE_COR[moldeKeyDoTemplate(t)]}, #041366)` }} />
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-semibold text-[var(--ops-title)]">{p.n}</span>
                          <span className="mt-0.5 block text-[11px] leading-[1.45] text-[var(--ops-sec)]">{p.d}</span>
                          <span className="mt-1 block text-[10.5px] text-[var(--ops-mut)]">
                            {t.nome} · {p.pilar}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {caminho === "inspiracao" && (
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
              <div className="flex flex-col gap-3">
                <CtLabel>Inspiração</CtLabel>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    void addArquivos(e.dataTransfer.files)
                  }}
                  className="cursor-pointer rounded-xl border border-dashed border-[var(--ops-border)] bg-[var(--ops-card)] px-4 py-[26px] text-center hover:bg-[var(--ops-hover)]"
                >
                  <div className="flex justify-center text-[var(--ops-mut)]">
                    <Icon icon={ImageIcon} customSize={22} />
                  </div>
                  <div className="mt-2 text-[13px] font-semibold text-[var(--ops-title)]">Arraste ou clique para subir</div>
                  <div className="mt-[3px] text-[11.5px] text-[var(--ops-mut)]">Slides do carrossel de referência (PNG, JPG, WebP)</div>
                </div>
                {refs.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {refs.map((u, i) => (
                      <div key={i} className="relative aspect-[4/5] overflow-hidden rounded-lg">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" className="h-full w-full object-cover" />
                        <span className="absolute left-[5px] top-[5px] rounded bg-black/60 px-[5px] py-px text-[9.5px] font-bold text-white" style={TNUM}>
                          {i + 1}
                        </span>
                        <button
                          type="button"
                          aria-label="Remover"
                          onClick={() => {
                            setRefs((r) => r.filter((_, j) => j !== i))
                            setAnalise("idle")
                          }}
                          className="absolute right-[5px] top-[5px] flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white"
                        >
                          <Icon icon={X} customSize={9} />
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={() => fileRef.current?.click()} aria-label="Adicionar" className="aspect-[4/5] rounded-lg border border-dashed border-[var(--ops-border)] text-[18px] text-[var(--ops-mut)] hover:bg-[var(--ops-hover)]">
                      +
                    </button>
                  </div>
                )}
                {refs.length > 0 && analise === "idle" && (
                  <button type="button" onClick={analisar} className="flex h-[38px] items-center justify-center gap-2 rounded-[9px] bg-[#0E7490] text-[12.5px] font-semibold text-white">
                    <Icon icon={Sparkles} customSize={14} /> Analisar e converter em template
                  </button>
                )}
                {analise === "loading" && (
                  <div className="flex items-center gap-2.5 rounded-[9px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-3.5 py-3 text-[12px] text-[var(--ops-sec)]">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--ops-mut)] border-t-transparent" />
                    Lendo hierarquia, grade, tipografia e ritmo dos slides
                  </div>
                )}
                <div className="text-[11px] leading-relaxed text-[var(--ops-mut)]">O sistema extrai a estrutura (tipos de frame, posições, proporções) e recria com a identidade Convertfy. Fotos e textos da referência não são copiados.</div>
              </div>
              <div>
                <CtLabel>Estrutura detectada</CtLabel>
                {analise !== "done" || !docPrevia ? (
                  <div className="rounded-[10px] border border-dashed border-[var(--ops-border)] px-5 py-10 text-center text-[12px] text-[var(--ops-mut)]">A estrutura aparece aqui depois da análise.</div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2.5 rounded-[9px] border border-[var(--ops-pos)]/30 bg-[var(--ops-pos)]/10 px-3 py-2.5 text-[12px] text-[var(--ops-pos)]">
                      <Icon icon={Check} customSize={13} /> {estrutura.length} frames reconhecidos · fidelidade {Math.round(inspiracao?.fidelidade ?? 0)}% · {estrutura.filter((e) => e.slotImagem).length} slots de imagem
                    </div>
                    <div className="overflow-hidden rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)]">
                      {estrutura.map((e, i) => (
                        <div key={i} className={cn("flex items-center gap-2.5 px-3 py-2", i > 0 && "border-t border-[var(--ops-border)]")}>
                          <span className="w-[18px] text-[10px] font-bold text-[var(--ops-mut)]" style={TNUM}>
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <CtBadge txt={e.tipo} cor={e.tipo === "capa" || e.tipo === "cta" ? "#4E62D8" : e.tipo === "prova" ? "#7C3AED" : "#6B7280"} />
                          <span className="flex-1 text-[11.5px] text-[var(--ops-text)]">{inspiracao?.frames[i]?.descricao ?? ""}</span>
                          <label className="flex items-center gap-1 text-[10px] text-[var(--ops-mut)]">
                            <input type="checkbox" checked={Boolean(e.slotImagem)} onChange={(ev) => setEstrutura((s) => s.map((x, j) => (j === i ? { ...x, slotImagem: ev.target.checked } : x)))} className="m-0 accent-[var(--ops-accent)]" />
                            foto
                          </label>
                          <select value={e.tipo} onChange={(ev) => setEstrutura((s) => s.map((x, j) => (j === i ? { ...x, tipo: ev.target.value as FrameTipo } : x)))} className="h-6 rounded-md border border-[var(--ops-border)] bg-[var(--ops-page)] px-1 text-[10.5px] text-[var(--ops-sec)] outline-none">
                            {TIPOS.map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[0, 1, Math.min(4, docPrevia.frames.length - 2), docPrevia.frames.length - 1].map((i, k) => (
                        <div key={k} className="relative aspect-[4/5] overflow-hidden rounded-[7px]">
                          <div className="absolute inset-0">
                            <ThumbFit doc={docPrevia} ix={Math.max(0, Math.min(i, docPrevia.frames.length - 1))} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="text-[11px] text-[var(--ops-mut)]">Prévia com a identidade Convertfy aplicada. Ajuste os tipos acima se algum frame foi lido errado.</div>
                    {inspiracao?.observacoes && <div className="text-[11px] italic text-[var(--ops-sec)]">{inspiracao.observacoes}</div>}
                    {modoTemplate && (
                      <div>
                        <CtLabel>Nome do template</CtLabel>
                        <input value={nomeTpl} onChange={(e) => setNomeTpl(e.target.value)} placeholder="Ex.: Editorial preto e branco" className={cn(inputCls, "h-[42px] bg-[var(--ops-card)] text-[14px] font-medium")} />
                      </div>
                    )}
                    {!modoTemplate && (
                      <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[var(--ops-title)]">
                        <input type="checkbox" checked={salvarComoTemplate} onChange={(e) => setSalvarComoTemplate(e.target.checked)} className="m-0 accent-[var(--ops-accent)]" /> Salvar também como template reutilizável
                      </label>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {caminho && !modoTemplate && (
            <div className="grid grid-cols-1 gap-3 border-t border-[var(--ops-border)] pt-5 md:grid-cols-[1fr_220px]">
              <div>
                <CtLabel>Nome do carrossel</CtLabel>
                <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: 8% dos clientes fazem 41% do faturamento" className={cn(inputCls, "h-[42px] bg-[var(--ops-card)] text-[14px] font-medium")} />
              </div>
              <div>
                <CtLabel>Perfil</CtLabel>
                <select value={perfil} onChange={(e) => setPerfil(e.target.value as PerfilEditavel)} className={cn(selectCls, "h-[42px] bg-[var(--ops-card)] text-[12.5px]")}>
                  <option value="convertfy">Convertfy</option>
                  <option value="bruno">Bruno</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void addArquivos(e.target.files)} />
    </div>
  )
}
