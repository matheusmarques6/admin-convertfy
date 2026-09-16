/**
 * Família "Post" — o print de tweet, medido slide a slide da referência.
 *
 * O formato é um cartão de perfil sobre fundo quase preto: avatar redondo,
 * nome em peso 700 com o selo azul ao lado, `@handle` em cinza do MESMO
 * tamanho do nome, e o texto grande embaixo. Sem contador, sem rodapé de
 * marca, sem filete — a peça imita uma captura de tela, e qualquer enfeite
 * da casa denuncia que não é uma.
 *
 * **As medidas são do print, convertidas.** A referência tem 1170 px de
 * largura e o canvas do Estúdio tem 1080 (`FRAME_W`), então todo valor aqui
 * é `medida_do_print × 0,923`. Guardar o número já convertido é o que
 * permite conferir a peça contra a referência sem refazer a conta: quem
 * mexer numa medida compara com a coluna do print, na tabela abaixo.
 *
 * | item                          | print | base 1080 |
 * |-------------------------------|-------|-----------|
 * | margem lateral do texto       |    95 |        88 |
 * | avatar ⌀ (slide com print)    |   145 |       134 |
 * | avatar ⌀ (slide de texto)     |   112 |       104 |
 * | espaço avatar → nome          |    38 |        35 |
 * | espaço cabeçalho → texto      |    53 |        49 |
 * | corpo do texto                |    47 |        44 |
 * | espaço texto → imagem         |    40 |        37 |
 * | margem lateral da imagem      |   130 |       120 |
 *
 * Duas POSES, porque a referência tem duas: o slide que carrega o print
 * abre no TOPO (cabeçalho maior, texto, imagem grande embaixo) e os slides
 * só de texto ficam no CENTRO ÓPTICO — centro geométrico puxado 3% para
 * cima, que é onde os três slides de texto da referência estão. Centralizar
 * no meio exato deixa o bloco visualmente baixo.
 *
 * Puro e testado: quem desenha é o `frame.tsx`, que não tem medida própria.
 */

import type { Campo, FrameTipo, VarianteLayout } from "./types"

/** Da largura da referência para a do canvas. */
export const FATOR_DO_PRINT = 1080 / 1170

/** Medida do print (1170 de largura) na base do canvas (1080). */
export function doPrint(px: number): number {
  return Math.round(px * FATOR_DO_PRINT)
}

export interface MedidasPost {
  /** Margem lateral do cabeçalho e do texto. */
  margem: number
  /** Margem lateral da imagem — maior que a do texto, como na referência. */
  margemImagem: number
  /** Diâmetro do avatar. */
  avatar: number
  /** Espaço entre o avatar e o bloco nome/@handle. */
  gapAvatar: number
  /** Corpo do nome e do `@handle` (os dois têm o mesmo tamanho). */
  nome: number
  /** Diâmetro do selo verificado. */
  selo: number
  /** Espaço entre o cabeçalho e o texto. */
  gapCabecalho: number
  /** Corpo do texto do post. */
  texto: number
  /** Entrelinha do texto. */
  entrelinha: number
  /** Espaço entre o título em negrito e o parágrafo. */
  gapTitulo: number
  /** Espaço entre o texto e a imagem. */
  gapImagem: number
  /** Distância do topo do slide até o avatar, na pose de topo. */
  topo: number
  /**
   * Margem INFERIOR na pose de topo. Bem menor que a de cima: na
   * referência a captura sangra até ~1% da borda, e é esse quase-corte
   * que faz o slide parecer um print e não um card com moldura.
   */
  rodape: number
  /** Raio dos cantos da captura. */
  raioImagem: number
  /** Vão entre as duas fotos da colagem (0 = sem colagem). */
  gapGaleria: number
  /**
   * Halo claro em volta do avatar, em px da base (0 = sem halo). A
   * referência do formato largo tem esse brilho; o desenhado, não.
   */
  halo: number
}

/** O cabeçalho do slide que carrega o print é maior — é o da referência. */
export const POST_GRANDE: MedidasPost = {
  margem: doPrint(95),
  margemImagem: doPrint(130),
  avatar: doPrint(145),
  gapAvatar: doPrint(38),
  nome: doPrint(54),
  selo: doPrint(36),
  gapCabecalho: doPrint(53),
  texto: doPrint(45),
  entrelinha: 1.28,
  gapTitulo: doPrint(41),
  gapImagem: doPrint(40),
  topo: doPrint(30),
  rodape: doPrint(17),
  raioImagem: doPrint(10),
  gapGaleria: 0,
  halo: 0,
}

/** Slides só de texto: o mesmo desenho, um passo menor. */
export const POST_PADRAO: MedidasPost = {
  ...POST_GRANDE,
  avatar: doPrint(112),
  gapAvatar: doPrint(34),
  nome: doPrint(46),
  selo: doPrint(31),
  texto: doPrint(46),
}

/**
 * O slide de GANCHO (a capa): mesma cabeça dos slides de texto, com a
 * frase bem maior e mais respiro entre ela e o perfil.
 *
 * Medido na referência: a linha do gancho ocupa 62% da largura com 24
 * caracteres, contra 79% com 42 no slide de texto — 22% maior, e é isso
 * que faz o primeiro slide parar o dedo. O respiro cresce junto: o perfil
 * e a frase ficam a ~120px um do outro, contra ~50 nos demais.
 */
export const POST_GANCHO: MedidasPost = {
  ...POST_PADRAO,
  texto: doPrint(54),
  gapCabecalho: doPrint(110),
}

// ── Formato LARGO (a segunda referência) ────────────────────────────────
//
// Mesmo gênero, outro desenho: margem lateral bem menor (o texto ocupa
// quase a largura toda), entrelinha mais aberta, avatar com halo e uma
// COLAGEM de duas fotos no lugar da captura única. A fonte é neutra, não
// geométrica — a peça parece a captura crua do aplicativo, não uma arte.
//
// | item                     | print | base 1080 |
// |--------------------------|-------|-----------|
// | margem lateral           |    78 |        72 |
// | avatar ⌀                 |   124 |       114 |
// | espaço avatar → nome      |    20 |        18 |
// | nome e @handle            |    54 |        50 |
// | corpo do texto            |    46 |        42 |
// | entrelinha                |     — |      1,37 |
// | cabeçalho → texto         |    60 |        55 |
// | vão entre as duas fotos   |     8 |         7 |
// | raio da foto              |    16 |        15 |

export const POST_LARGO: MedidasPost = {
  margem: doPrint(78),
  margemImagem: doPrint(78),
  avatar: doPrint(124),
  gapAvatar: doPrint(20),
  nome: doPrint(54),
  selo: doPrint(34),
  gapCabecalho: doPrint(60),
  texto: doPrint(46),
  entrelinha: 1.37,
  gapTitulo: doPrint(44),
  gapImagem: doPrint(56),
  topo: doPrint(112),
  rodape: doPrint(78),
  raioImagem: doPrint(16),
  gapGaleria: doPrint(8),
  halo: doPrint(46),
}

/** O gancho do formato largo: a mesma cabeça, a frase um passo maior. */
export const POST_LARGO_GANCHO: MedidasPost = {
  ...POST_LARGO,
  texto: doPrint(56),
  gapCabecalho: doPrint(96),
}

/**
 * Os dois desenhos do mesmo gênero. A família aponta para um deles; o
 * renderer não escolhe nada sozinho.
 */
export type EstiloPost = "post" | "post-largo"

const TABELAS: Record<EstiloPost, { topo: MedidasPost; centro: MedidasPost; gancho: MedidasPost }> = {
  post: { topo: POST_GRANDE, centro: POST_PADRAO, gancho: POST_GANCHO },
  "post-largo": { topo: POST_LARGO, centro: POST_LARGO, gancho: POST_LARGO_GANCHO },
}

/** Cores do formato — fundo quase preto, nunca #000 (o preto puro chapa). */
export const POST_CORES = {
  fundo: "#0D0D0D",
  texto: "#FFFFFF",
  handle: "#808080",
  selo: "#1D9BF0",
} as const

/**
 * Onde o bloco pousa no slide.
 *
 * `topo` é a pose do slide que mostra um print; `centro` é a dos slides de
 * texto. A escolha vem da IMAGEM, não do tipo do frame: um slide com foto
 * precisa do espaço de baixo inteiro, e um sem foto fica perdido no topo.
 * A variante `b` força o topo mesmo sem imagem — é a saída para quem quer
 * o cabeçalho colado em cima num slide de texto.
 */
export type PosePost = "topo" | "centro"

export function posePost(temImagem: boolean, variante: VarianteLayout | undefined): PosePost {
  if (variante === "b") return "topo"
  if (variante === "c") return "centro"
  return temImagem ? "topo" : "centro"
}

/**
 * Medidas do slide: o cabeçalho grande só no que carrega o print, e a
 * frase grande só no gancho (a capa).
 *
 * O tipo vence a pose porque a capa é o único slide com PAPEL declarado
 * no formato — os demais são o mesmo cartão, com ou sem print.
 */
export function medidasPost(pose: PosePost, tipo?: FrameTipo, estilo: EstiloPost = "post"): MedidasPost {
  const t = TABELAS[estilo] ?? TABELAS.post
  if (tipo === "capa") return t.gancho
  return pose === "topo" ? t.topo : t.centro
}

/**
 * Quanto o bloco centralizado sobe, em fração da altura.
 *
 * Os três slides de texto da referência têm o centro do bloco acima do
 * centro do slide — é o centro ÓPTICO, e sem ele a peça parece afundada.
 */
export const SUBIDA_OPTICA = 0.03

/**
 * No formato largo o bloco fica praticamente no centro geométrico: medido
 * nos cinco slides da referência, o centro do bloco fica a 0,8% acima do
 * centro do slide, contra 3% no desenhado. Subir mais deixa o bloco alto
 * num texto de oito linhas.
 */
export const SUBIDA_OPTICA_LARGO = 0.008

export function subidaOptica(estilo: EstiloPost): number {
  return estilo === "post-largo" ? SUBIDA_OPTICA_LARGO : SUBIDA_OPTICA
}

/**
 * Limites de texto do formato.
 *
 * O texto do post ocupa a peça inteira, sem título gigante concorrendo, e
 * por isso cabe muito mais do que num slide da casa: o slide 2 da
 * referência tem 232 caracteres e sai com o corpo no tamanho cheio. Usar o
 * limite do tipo (`corpo: 180` em `texto`) faria o auto-fit ENCOLHER a
 * fonte, e a peça deixaria de ser idêntica sem que nada avisasse.
 */
export const LIMITES_POST: Partial<Record<Campo, number>> = {
  titulo: 120,
  corpo: 420,
  subtitulo: 200,
  botao: 26,
  gancho: 60,
  anotacao: 60,
}

export function limitePost(campo: Campo): number | null {
  return LIMITES_POST[campo] ?? null
}

/**
 * Campos que o formato desenha, por tipo de frame.
 *
 * O cartão de perfil tem UM desenho, então o tipo do frame quase não
 * importa: sobra o `titulo` (a linha em negrito, como o "Why it works:" da
 * referência) e o `corpo` (o texto). `cta` mantém o botão, porque é a única
 * coisa que o último slide tem a mais.
 */
export function camposPost(tipo: FrameTipo): Campo[] {
  return tipo === "cta" ? ["titulo", "corpo", "botao"] : ["titulo", "corpo"]
}
