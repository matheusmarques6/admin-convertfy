/**
 * Documento do Estúdio — funções PURAS. Todo comportamento que muda o
 * carrossel (trocar template, reordenar, dividir, distribuir texto, aplicar
 * brand kit) vive aqui, testado, e o editor só despacha.
 *
 * Regra: o documento é dono da estrutura dos frames. Os templates da casa
 * (`templates.ts`) são somente leitura.
 */

import { BRAND_KIT_PADRAO, CORES_PADRAO, GRADIENTE_PADRAO, SLIDE } from "./brand"
import { camposDoTipo, getTemplate } from "./templates"
import type {
  BrandKit,
  Campo,
  DocFrame,
  Documento,
  FrameTipo,
  PerfilEditavel,
  PropostaSlide,
  Template,
  TemplateFrame,
} from "./types"

// ── Ids e datas ─────────────────────────────────────────────────────────

let seq = 0
export function novoId(prefixo = "id"): string {
  seq = (seq + 1) % 1000
  return `${prefixo}${Date.now().toString(36)}${seq.toString(36)}`
}

export function dataCurta(d = new Date()): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function carimbo(d = new Date()): string {
  return `${dataCurta(d)} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

// ── Textos-guia (documento novo não abre vazio) ─────────────────────────

const GUIA: Record<FrameTipo, [string, string]> = {
  capa: ["Sua afirmação forte aqui", "apoio em uma linha"],
  dado: ["41%", "o que esse número significa"],
  texto: ["Título da ideia", "Uma ideia por slide, em duas ou três linhas."],
  prova: ["Nome do case: resultado", "contexto em uma linha"],
  lista: ["Item da lista", "explicação curta e acionável"],
  mec: ["Nome do papel", "o que essa pessoa faz e por que importa"],
  cta: ["Comente PALAVRA", "e eu te mando no direct"],
}

const GUIA_RE = /^(Título da ideia|Sua afirmação forte aqui|Item da lista|Nome do papel|Nome do case: resultado|41%|Comente PALAVRA)$/

/** O frame ainda está com o texto-guia (não foi escrito)? */
export function ehTextoGuia(frame: DocFrame): boolean {
  return GUIA_RE.test(frame.textos.titulo ?? "")
}

export function textosGuia(tipo: FrameTipo, campos: Campo[]): Partial<Record<Campo, string>> {
  const g = GUIA[tipo] ?? GUIA.texto
  return Object.fromEntries(
    campos.map((c, i) => [c, c === "botao" ? "Comente PALAVRA" : g[Math.min(i, 1)]]),
  )
}

/** Fundo padrão por posição (capa/cta/prova = gradiente; ritmo claro/escuro no meio). */
export function fundoPadrao(tipo: FrameTipo, indice: number): string {
  if (tipo === "capa" || tipo === "cta" || tipo === "prova") return "gradiente"
  return indice % 3 === 0 ? SLIDE.escuro : SLIDE.fundoClaro
}

export function frameDoTemplate(tf: TemplateFrame): DocFrame {
  return {
    frameId: tf.id,
    tipo: tf.tipo,
    label: tf.label,
    slotsImagem: tf.slotsImagem,
    campos: tf.campos,
    textos: textosGuia(tf.tipo, tf.campos),
    imagens: {},
  }
}

// ── Criação ─────────────────────────────────────────────────────────────

export function novoDocumento(
  nome: string,
  perfil: PerfilEditavel,
  templateId: string,
  opts: { projeto?: string; brandKit?: BrandKit; agora?: Date } = {},
): Documento {
  const t = getTemplate(templateId)
  const agora = opts.agora ?? new Date()
  return {
    id: novoId("d"),
    nome,
    projeto: opts.projeto ?? "Convertfy · setembro",
    templateId: t.id,
    perfil,
    proporcaoExport: "4:5",
    status: "rascunho",
    versao: "v1",
    data: dataCurta(agora),
    brandKit: { ...(opts.brandKit ?? BRAND_KIT_PADRAO[perfil]) },
    ocultos: {},
    cores: { ...CORES_PADRAO },
    fundoPorFrame: Object.fromEntries(t.frames.map((f, i) => [f.id, fundoPadrao(f.tipo, i)])),
    gradiente: { ...GRADIENTE_PADRAO },
    cta: { mostrar: true, texto: "Comente PALAVRA", fundo: SLIDE.escuro, cor: "#FFFFFF" },
    estilos: {},
    frames: t.frames.map(frameDoTemplate),
    legenda: "",
    palavraChave: "",
    historico: [{ id: novoId("h"), label: `Documento criado a partir do template ${t.nome}`, ts: carimbo(agora) }],
    criadoEm: agora.toISOString(),
    atualizadoEm: agora.toISOString(),
  }
}

/** Registra um evento no histórico (mais recente primeiro). */
export function comHistorico(doc: Documento, label: string | null, agora = new Date()): Documento {
  if (!label) return doc
  return {
    ...doc,
    historico: [{ id: novoId("h"), label, ts: carimbo(agora) }, ...doc.historico].slice(0, 200),
  }
}

// ── Trocar template preservando textos por tipo ─────────────────────────

export interface ResultadoTroca {
  doc: Documento
  /** Frames antigos com texto escrito que não encontraram lugar. */
  naoCoube: DocFrame[]
}

/**
 * Casa os frames antigos com os novos POR TIPO, na ordem (FIFO). Um frame
 * antigo só é usado uma vez. Novo frame sem par recebe texto-guia. Antigos
 * escritos sem par voltam em `naoCoube` para a UI avisar.
 */
export function trocarTemplate(doc: Documento, novo: Template): ResultadoTroca {
  const usados = new Set<number>()
  const frames: DocFrame[] = novo.frames.map((nf) => {
    const k = doc.frames.findIndex((o, j) => !usados.has(j) && o.tipo === nf.tipo)
    const old = k >= 0 ? doc.frames[k] : undefined
    if (k >= 0) usados.add(k)
    const base = frameDoTemplate(nf)
    if (!old) return base
    return {
      ...base,
      textos: Object.fromEntries(
        nf.campos.map((c) => [c, old.textos[c] ?? base.textos[c] ?? ""]),
      ),
      imagens: nf.slotsImagem ? old.imagens : {},
      variante: old.variante,
    }
  })
  const naoCoube = doc.frames.filter((o, j) => !usados.has(j) && !ehTextoGuia(o) && o.tipo !== "capa" && o.tipo !== "cta")
  const fundoPorFrame = Object.fromEntries(
    novo.frames.map((nf, i) => {
      const antigo = doc.frames[i] ? doc.fundoPorFrame[doc.frames[i].frameId] : undefined
      return [nf.id, antigo ?? fundoPadrao(nf.tipo, i)]
    }),
  )
  // Estilos e cores nomeadas seguem por frameId (mesmo id = mesma posição).
  const estilos = Object.fromEntries(
    Object.entries(doc.estilos).filter(([fid]) => frames.some((f) => f.frameId === fid)),
  )
  return {
    doc: comHistorico({ ...doc, templateId: novo.id, frames, fundoPorFrame, estilos }, `Template trocado para ${novo.nome}`),
    naoCoube,
  }
}

// ── Estrutura de frames ─────────────────────────────────────────────────

export function reordenarFrames(doc: Documento, de: number, para: number): Documento {
  if (de === para || de < 0 || para < 0 || de >= doc.frames.length || para >= doc.frames.length) return doc
  const a = [...doc.frames]
  const [m] = a.splice(de, 1)
  a.splice(para, 0, m)
  return comHistorico({ ...doc, frames: a }, "Frames reordenados")
}

export function duplicarFrame(doc: Documento, i: number): Documento {
  const o = doc.frames[i]
  if (!o) return doc
  const id = novoId("f")
  const copia: DocFrame = { ...o, frameId: id, label: `${o.label} (cópia)`, imagens: { ...o.imagens } }
  const frames = [...doc.frames]
  frames.splice(i + 1, 0, copia)
  return comHistorico(
    {
      ...doc,
      frames,
      fundoPorFrame: { ...doc.fundoPorFrame, [id]: doc.fundoPorFrame[o.frameId] ?? SLIDE.fundoClaro },
      estilos: doc.estilos[o.frameId] ? { ...doc.estilos, [id]: doc.estilos[o.frameId] } : doc.estilos,
    },
    `${o.label} duplicado`,
  )
}

/** Divide o corpo ao meio (na fronteira de frase mais próxima) em dois frames. */
export function dividirFrame(doc: Documento, i: number): Documento {
  const o = doc.frames[i]
  if (!o) return doc
  const corpo = o.textos.corpo ?? ""
  const [a, b] = dividirTexto(corpo)
  const id = novoId("f")
  const primeiro: DocFrame = { ...o, textos: { ...o.textos, corpo: a } }
  const segundo: DocFrame = {
    ...o,
    frameId: id,
    label: `${o.label} (cont.)`,
    slotsImagem: 0,
    textos: { ...o.textos, titulo: `${o.textos.titulo ?? ""} (cont.)`.trim(), corpo: b },
    imagens: {},
  }
  const frames = [...doc.frames]
  frames.splice(i, 1, primeiro, segundo)
  return comHistorico(
    { ...doc, frames, fundoPorFrame: { ...doc.fundoPorFrame, [id]: doc.fundoPorFrame[o.frameId] ?? SLIDE.fundoClaro } },
    `${o.label} dividido em dois`,
  )
}

/** Parte um texto em duas metades respeitando o fim de frase quando possível. */
export function dividirTexto(texto: string): [string, string] {
  const t = texto.trim()
  if (!t) return ["", ""]
  const meio = Math.ceil(t.length / 2)
  // fronteira de frase mais próxima do meio
  let melhor = -1
  const re = /[.!?]\s+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    const pos = m.index + m[0].length
    if (melhor < 0 || Math.abs(pos - meio) < Math.abs(melhor - meio)) melhor = pos
  }
  if (melhor > 0 && melhor < t.length) return [t.slice(0, melhor).trim(), t.slice(melhor).trim()]
  // senão, no espaço mais próximo do meio
  const esp = t.lastIndexOf(" ", meio)
  const corte = esp > 0 ? esp : meio
  return [t.slice(0, corte).trim(), t.slice(corte).trim()]
}

export function adicionarFrame(doc: Documento, tipo: FrameTipo = "texto"): Documento {
  const id = novoId("f")
  const campos = camposDoTipo(tipo)
  const nf: DocFrame = {
    frameId: id,
    tipo,
    label: `Slide ${doc.frames.length + 1}`,
    slotsImagem: 0,
    campos,
    textos: textosGuia(tipo, campos),
    imagens: {},
  }
  const frames = [...doc.frames]
  // antes do CTA, se o último for CTA
  const pos = frames.length && frames[frames.length - 1].tipo === "cta" ? frames.length - 1 : frames.length
  frames.splice(pos, 0, nf)
  return comHistorico(
    { ...doc, frames, fundoPorFrame: { ...doc.fundoPorFrame, [id]: SLIDE.fundoClaro } },
    "Frame adicionado",
  )
}

export const MIN_FRAMES = 3
export const MAX_FRAMES_API = 10

export function excluirFrame(doc: Documento, i: number): Documento {
  if (doc.frames.length <= MIN_FRAMES || !doc.frames[i]) return doc
  const o = doc.frames[i]
  const frames = doc.frames.filter((_, j) => j !== i)
  const { [o.frameId]: _f, ...fundoPorFrame } = doc.fundoPorFrame
  const { [o.frameId]: _e, ...estilos } = doc.estilos
  return comHistorico({ ...doc, frames, fundoPorFrame, estilos }, `${o.label} excluído`)
}

export function trocarTipoFrame(doc: Documento, i: number, tipo: FrameTipo): Documento {
  const o = doc.frames[i]
  if (!o || o.tipo === tipo) return doc
  const campos = camposDoTipo(tipo)
  const guia = textosGuia(tipo, campos)
  const textos = Object.fromEntries(campos.map((c) => [c, o.textos[c] ?? guia[c] ?? ""]))
  return comHistorico(
    { ...doc, frames: doc.frames.map((f, j) => (j === i ? { ...f, tipo, campos, textos } : f)) },
    `${o.label} trocado para ${tipo}`,
  )
}

export function atualizarFrame(doc: Documento, i: number, patch: Partial<DocFrame>): Documento {
  if (!doc.frames[i]) return doc
  return { ...doc, frames: doc.frames.map((f, j) => (j === i ? { ...f, ...patch } : f)) }
}

export function setTexto(doc: Documento, frameId: string, campo: Campo, valor: string): Documento {
  const i = doc.frames.findIndex((f) => f.frameId === frameId)
  if (i < 0 || doc.frames[i].textos[campo] === valor) return doc
  return atualizarFrame(doc, i, { textos: { ...doc.frames[i].textos, [campo]: valor } })
}

// ── Distribuir texto colado ─────────────────────────────────────────────

/** Linhas úteis de um texto colado (sem marcadores de lista e numeração). */
export function linhasDeTexto(texto: string): string[] {
  return texto
    .split("\n")
    .map((s) => s.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter(Boolean)
}

/** Índices dos frames do meio (nem capa nem CTA). */
export function indicesDoMeio(doc: Documento): number[] {
  return doc.frames.map((f, i) => (f.tipo === "capa" || f.tipo === "cta" ? -1 : i)).filter((i) => i >= 0)
}

/**
 * "Uma linha vira um slide": a primeira frase vira título, o resto corpo.
 * Ignora capa e CTA. Devolve propostas (a UI mostra e aplica com um clique).
 */
export function propostasDeLinhas(doc: Documento, texto: string): PropostaSlide[] {
  const linhas = linhasDeTexto(texto)
  const meio = indicesDoMeio(doc)
  return meio.slice(0, linhas.length).map((i, k) => {
    const f = doc.frames[i]
    const [t, ...r] = linhas[k].split(/[:.!?]\s+/)
    return { frameId: f.frameId, label: f.label, titulo: t.trim(), corpo: r.join(". ").trim() || undefined }
  })
}

export function aplicarPropostas(doc: Documento, props: PropostaSlide[], label?: string): Documento {
  const frames = doc.frames.map((fr) => {
    const p = props.find((x) => x.frameId === fr.frameId)
    if (!p) return fr
    const textos = { ...fr.textos, titulo: p.titulo }
    if (p.corpo) {
      if (fr.campos.includes("corpo")) textos.corpo = p.corpo
      else if (fr.campos.includes("subtitulo")) textos.subtitulo = p.corpo
    }
    return { ...fr, textos }
  })
  return comHistorico({ ...doc, frames }, label ?? `Texto distribuído em ${props.length} slides`)
}

// ── Brand kit / perfil ──────────────────────────────────────────────────

export function aplicarPerfil(doc: Documento, perfil: PerfilEditavel, brandKit?: BrandKit): Documento {
  return comHistorico(
    { ...doc, perfil, brandKit: { ...(brandKit ?? BRAND_KIT_PADRAO[perfil]) } },
    `Perfil trocado para ${perfil === "bruno" ? "Bruno" : "Convertfy"} (Brand Kit aplicado)`,
  )
}

// ── Contagens úteis ─────────────────────────────────────────────────────

export function contarPalavras(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length
}

export function slotsDeImagem(doc: Documento): { total: number; cheios: number; semSlot: number[] } {
  const total = doc.frames.filter((f) => f.slotsImagem > 0).length
  const cheios = doc.frames.filter((f) => f.slotsImagem > 0 && f.imagens.slot1).length
  const semSlot = doc.frames.map((f, i) => (f.slotsImagem === 0 ? i + 1 : -1)).filter((i) => i > 0)
  return { total, cheios, semSlot }
}

export function novaVersao(versao: string): string {
  const n = parseInt(versao.replace(/\D/g, ""), 10)
  return `v${Number.isFinite(n) ? n + 1 : 2}`
}
