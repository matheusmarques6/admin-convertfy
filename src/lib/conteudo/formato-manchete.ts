/**
 * Família "Manchete" — medida dos slides da referência.
 *
 * A peça é uma TESE em cinco tempos: capa de impacto sobre foto, o erro, o
 * problema, a virada e a chamada. O que a define:
 *
 * - **Título condensado em caixa alta**, pesado, entrelinha apertada. É a
 *   massa da peça — ocupa mais da metade do slide de argumento.
 * - **O título é AZUL no fundo claro e CREME no escuro.** Não é a tinta do
 *   corpo; é a cor que carrega a afirmação.
 * - **A peça é CLARA com dois escuros**: a capa e o slide do problema.
 * - **Só o ícone da marca**, pequeno — centralizado na capa, no canto
 *   superior esquerdo no resto. Sem rodapé e sem contador.
 *
 * ## De onde vêm os números
 *
 * **Lidos dos três slides em alta resolução** (capa, o slide branco do erro
 * e o slide preto da pergunta), medindo posição e altura de letra como
 * fração da peça de 1080×1350 e conferindo renderizando lado a lado. As
 * duas famílias de print têm tabela de/para do arquivo; aqui a fonte é a
 * imagem renderizada, que é um degrau abaixo — está declarado.
 *
 * | item                          | base 1080 | de onde                        |
 * |-------------------------------|-----------|--------------------------------|
 * | margem lateral (texto E foto) |       122 | título e card do slide branco começam no MESMO x |
 * | ícone da marca                |        42 | slide branco, canto superior esquerdo |
 * | topo do ícone                 |        88 | idem                           |
 * | topo do ícone na capa         |        58 | capa, centralizado             |
 * | corpo do título               |        96 | bloco de 3 linhas em ~18% da altura |
 * | corpo do título na capa       |       112 | bloco da escada em ~18% da altura |
 * | entrelinha do título          |      0,86 | na referência a descendente quase toca a caixa alta seguinte |
 * | corpo do texto                |        40 | corpo do slide branco          |
 * | entrelinha do texto           |      1,35 | idem                           |
 * | raio da imagem                |        20 | card do slide branco           |
 * | caixa de destaque: texto      |        40 | a caixa azul do slide preto    |
 * | caixa de destaque: respiro    |     26/34 | idem                           |
 * | raio da caixa                 |        12 | idem — mais fechado que o card |
 *
 * Puro: quem desenha é o `frame.tsx`, que não tem medida própria.
 */

/** Medidas da identidade, na base 1080 do canvas. */
export const MANCHETE = {
  /**
   * UMA margem para texto e foto. Na referência o card de imagem do slide
   * branco começa e termina exatamente no mesmo x do título — dar à foto
   * uma margem própria a desalinharia do texto que ela ilustra.
   */
  margem: 122,
  logoTam: 42,
  logoTopo: 88,
  /** Na capa o ícone sobe e centraliza; é a única marca sobre a foto. */
  logoTopoCapa: 58,
  titulo: 96,
  tituloCapa: 112,
  entrelinhaTitulo: 0.86,
  texto: 40,
  entrelinhaTexto: 1.35,
  raioImagem: 20,
  destaqueTexto: 40,
  destaquePadY: 26,
  destaquePadX: 34,
  destaqueRaio: 12,
  /** Espaço acima e abaixo da régua do slide de chamada. */
  reguaRespiro: 42,
} as const

/** Paleta: o azul nunca é fundo de seção. */
export const MANCHETE_CORES = {
  preto: "#000000",
  claro: "#FFFFFF",
  azul: "#3355FF",
  /** Tinta do corpo no fundo claro — preto puro no corpo cansa a leitura. */
  tinta: "#111111",
  /**
   * O título no fundo ESCURO. Não é branco puro: na referência ele puxa
   * para o creme, e é isso que o separa do corpo branco logo abaixo.
   */
  creme: "#F5F0E6",
} as const

/**
 * Escada do título: cada linha um passo menor que a anterior.
 *
 * **Vale SÓ na capa**, e isso foi lido: o slide preto da pergunta ("A
 * PERGUNTA QUE VOCÊ / DEVE SE FAZER NÃO É:") tem as duas linhas do MESMO
 * corpo, e o slide branco tem as três iguais. A escada é o gesto de abrir a
 * peça, não um traço do fundo escuro — a primeira versão amarrou ao fundo e
 * errava o slide do problema.
 *
 * Os fatores saem da altura de letra na capa (~88 / 62 / 52 px) e o
 * corpo da primeira linha, do bloco de três linhas ocupando ~18% da altura
 * da peça — a primeira leitura o pôs em 15% e a escada saía tímida.
 *
 * **Limite declarado**: a escada é sempre DECRESCENTE. O slide do problema
 * põe a frase entre aspas maior que as vizinhas — reproduzir isso exigiria
 * marcar a linha protagonista, campo que ninguém pediu.
 */
export const ESCADA = [1, 0.72, 0.61, 0.53] as const

export function fatoresDaEscada(linhas: number): number[] {
  return Array.from({ length: Math.max(0, linhas) }, (_, i) => ESCADA[Math.min(i, ESCADA.length - 1)])
}

/**
 * As linhas do título, como o operador as escreveu.
 *
 * A quebra é do TEXTO (`\n`), nunca da largura: quebra automática não tem
 * como receber corpo diferente, e é a quebra escolhida que faz a escada.
 * Quem garante que o `\n` chega até aqui é `textoDoEditavel` — com
 * `textContent` a escada era inalcançável pela tela.
 */
export function linhasDoTitulo(texto: string): string[] {
  return texto.split("\n")
}

/**
 * A cor do título na Manchete.
 *
 * No claro ele sai no AZUL do destaque (é a afirmação, não o corpo) e no
 * escuro no creme. Ler a tinta do corpo nos dois casos — o que o renderer
 * fazia — deixava o slide do erro com título preto onde a referência tem
 * um bloco azul que ocupa um terço da peça.
 */
export function corDoTituloManchete(escuro: boolean, destaque: string, creme = MANCHETE_CORES.creme): string {
  return escuro ? creme : destaque
}

/**
 * Limites de texto da identidade.
 *
 * O título ocupa a peça: a referência tem 58 caracteres em quatro linhas no
 * slide do erro, e com o limite do tipo (`titulo: 60`) o auto-fit já
 * começaria a encolher. O corpo é curto de propósito — três linhas —, então
 * ele NÃO é afrouxado: afrouxar convidaria a escrever o parágrafo que este
 * formato não tem.
 */
export const LIMITES_MANCHETE: Partial<Record<string, number>> = {
  titulo: 90,
  subtitulo: 90,
  corpo: 180,
  destaque: 140,
  botao: 26,
}
