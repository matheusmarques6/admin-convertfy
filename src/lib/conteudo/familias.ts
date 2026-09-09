/**
 * Famílias visuais do Estúdio — a "cara" do carrossel, separada da estrutura.
 *
 * O molde (Turbo, Benchmark…) decide a SEQUÊNCIA de slides; a família decide
 * como eles são desenhados: paleta, tipografia, forma do CTA, raio dos
 * cartões. Trocar de família não mexe em uma palavra da copy.
 *
 * `padrao` é a identidade azul da casa, que já existia. `editorial` é o
 * formato que o time mais gosta, medido slide a slide em
 * `docs/conteudo/formatos/editorial-convertfy.md`: fundo bege quente, tinta
 * marrom-preta, destaque marrom queimado, título em PAR (gancho em serif
 * itálica + afirmação em sans pesada) e pílula no lugar do botão sólido.
 *
 * Puro e testado: quem grava é a UI, quem desenha é o `frame.tsx`.
 */

import { CORES_PADRAO, GRADIENTE_PADRAO, SLIDE } from "./brand"
import type { Documento, FamiliaVisual, FrameTipo, Gradiente } from "./types"

export type { FamiliaVisual }

export const FAMILIA_PADRAO: FamiliaVisual = "padrao"

/** Como a família desenha; o renderer não tem constante própria. */
export interface TracoFamilia {
  fonteTitulo: string
  /** Serif itálica da linha de gancho (o "par" do título). */
  fonteGancho: string
  fonteCorpo: string
  fonteMeta: string
  /** Manuscrita da anotação à mão. */
  fonteAnotacao: string
  tituloCaixaAlta: boolean
  tituloPeso: number
  tituloTracking: string
  tituloEntrelinha: number
  /** O corpo é itálico serif (padrão) ou sans regular (editorial)? */
  corpoItalico: boolean
  /** Botão sólido com sombra, ou pílula clara com borda. */
  cta: "botao" | "pilula"
  /** Raio do slot de imagem e dos cartões, na base 1080. */
  raio: number
  /** Inclinação da anotação manuscrita, em graus. */
  anotacaoRotacao: number
  /**
   * Quanto o gancho cresce sobre o tamanho base. Na Editorial ele é quase
   * do tamanho do título — as duas linhas formam UM par, e um gancho
   * pequeno vira legenda, que é outra coisa.
   */
  ganchoFator: number
  /** O gancho sai na tinta do texto ou na cor de destaque. */
  ganchoCor: "tinta" | "destaque"
}

export interface Familia {
  key: FamiliaVisual
  nome: string
  descricao: string
  /** Cores nomeadas do documento (`doc.cores`). */
  cores: Record<string, string>
  gradiente: Gradiente
  fundoClaro: string
  fundoEscuro: string
  cta: { fundo: string; cor: string }
  traco: TracoFamilia
}

const FONTE_CONDENSADA = "'Barlow Condensed', 'Inter Slides', Inter, sans-serif"
const FONTE_SERIF = "Georgia, 'Times New Roman', serif"
const FONTE_SANS = "'Inter Slides', Inter, -apple-system, BlinkMacSystemFont, sans-serif"
const FONTE_SERIF_DISPLAY = "'Instrument Serif', Georgia, 'Times New Roman', serif"
const FONTE_MANUSCRITA = "'Caveat', 'Segoe Script', cursive"

export const FAMILIAS: Record<FamiliaVisual, Familia> = {
  padrao: {
    key: "padrao",
    nome: "Convertfy",
    descricao: "Azul profundo, título condensado em caixa alta, apoio em serif itálica.",
    cores: { ...CORES_PADRAO },
    gradiente: { ...GRADIENTE_PADRAO },
    fundoClaro: SLIDE.fundoClaro,
    fundoEscuro: SLIDE.escuro,
    cta: { fundo: SLIDE.escuro, cor: "#FFFFFF" },
    traco: {
      fonteTitulo: FONTE_CONDENSADA,
      fonteGancho: FONTE_SERIF,
      fonteCorpo: FONTE_SERIF,
      fonteMeta: FONTE_SANS,
      fonteAnotacao: FONTE_MANUSCRITA,
      tituloCaixaAlta: true,
      tituloPeso: 800,
      tituloTracking: "-0.01em",
      tituloEntrelinha: 0.96,
      corpoItalico: true,
      cta: "botao",
      raio: 28,
      anotacaoRotacao: -3,
      ganchoFator: 1,
      ganchoCor: "destaque",
    },
  },
  editorial: {
    key: "editorial",
    nome: "Editorial",
    descricao: "Bege quente e tinta marrom; título em par (gancho itálico + afirmação) e pílula no lugar do botão.",
    cores: {
      hook: "#2A2320",
      destaque: "#8C5A2B",
      metadado: "#8A7A6A",
      "fundo-bloco": "#FBF9F6",
    },
    // O "escuro" da editorial é marrom torrado, não azul: o gradiente é o
    // fundo de capa, prova e CTA.
    gradiente: { de: "#4A3A30", meio: "#2A2320", ate: "#181310", angulo: 160 },
    fundoClaro: "#F1EBE3",
    fundoEscuro: "#2A2320",
    cta: { fundo: "#F7F3EE", cor: "#2A2320" },
    traco: {
      fonteTitulo: FONTE_SANS,
      fonteGancho: FONTE_SERIF_DISPLAY,
      fonteCorpo: FONTE_SANS,
      fonteMeta: FONTE_SANS,
      fonteAnotacao: FONTE_MANUSCRITA,
      // A afirmação é sans pesada em caixa NORMAL — a caixa alta é o que
      // faz a peça parecer anúncio em vez de matéria.
      tituloCaixaAlta: false,
      tituloPeso: 800,
      tituloTracking: "-0.02em",
      tituloEntrelinha: 1.02,
      corpoItalico: false,
      cta: "pilula",
      raio: 24,
      anotacaoRotacao: -4,
      ganchoFator: 1.35,
      ganchoCor: "tinta",
    },
  },
}

export const FAMILIA_OPCOES: Array<[FamiliaVisual, string]> = [
  ["padrao", FAMILIAS.padrao.nome],
  ["editorial", FAMILIAS.editorial.nome],
]

export function ehFamilia(v: unknown): v is FamiliaVisual {
  return v === "padrao" || v === "editorial"
}

export function familiaDe(doc: Pick<Documento, "familia">): FamiliaVisual {
  return ehFamilia(doc.familia) ? doc.familia : FAMILIA_PADRAO
}

export function tracoDe(familia: FamiliaVisual): TracoFamilia {
  return FAMILIAS[familia].traco
}

/** Fundo padrão de um frame na família: capa, CTA e prova pedem o gradiente. */
export function fundoPadraoDaFamilia(familia: FamiliaVisual, tipo: FrameTipo, indice: number): string {
  const f = FAMILIAS[familia]
  if (tipo === "capa" || tipo === "cta" || tipo === "prova") return "gradiente"
  return indice % 3 === 0 ? f.fundoEscuro : f.fundoClaro
}

const mesmoGradiente = (a: Gradiente, b: Gradiente): boolean => a.de === b.de && a.meio === b.meio && a.ate === b.ate

/**
 * Troca a família preservando o que o usuário mexeu à mão.
 *
 * Só o valor que ainda é o DEFAULT da família atual é substituído pelo
 * equivalente da nova. Cor escolhida a dedo, fundo trocado num slide e CTA
 * repintado sobrevivem à troca — a família é uma base, não um rolo de tinta.
 * O ângulo do gradiente é do usuário (ele o edita num slider) e nunca muda.
 */
export function aplicarFamilia(doc: Documento, nova: FamiliaVisual): Documento {
  const atual = familiaDe(doc)
  if (atual === nova) return { ...doc, familia: nova }
  const de = FAMILIAS[atual]
  const para = FAMILIAS[nova]

  const cores: Record<string, string> = { ...doc.cores }
  for (const [chave, valorNovo] of Object.entries(para.cores)) {
    if (doc.cores[chave] === undefined || doc.cores[chave] === de.cores[chave]) cores[chave] = valorNovo
  }

  const gradiente = mesmoGradiente(doc.gradiente, de.gradiente) ? { ...para.gradiente, angulo: doc.gradiente.angulo } : doc.gradiente

  const fundoPorFrame: Record<string, string> = {}
  for (const [id, valor] of Object.entries(doc.fundoPorFrame)) {
    fundoPorFrame[id] = valor === de.fundoClaro ? para.fundoClaro : valor === de.fundoEscuro ? para.fundoEscuro : valor
  }

  const cta =
    doc.cta.fundo === de.cta.fundo && doc.cta.cor === de.cta.cor
      ? { ...doc.cta, fundo: para.cta.fundo, cor: para.cta.cor }
      : doc.cta

  return { ...doc, familia: nova, cores, gradiente, fundoPorFrame, cta }
}
