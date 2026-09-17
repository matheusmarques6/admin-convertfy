import type { Campo } from "./types"

/**
 * Família "Thread" — o cartão de thread comentada.
 *
 * Medida dos quatro prints do construtor da referência (o "Template
 * Twitter"). É outro gênero do print de tweet que já existe aqui: aquele
 * simula UM post; este simula uma peça EDITORIAL com cara de thread —
 * cartão claro, barra de metadados no topo, bloco de autoria, e um fio de
 * parágrafos com uma foto no meio.
 *
 * O que a define, e o que a separa da `post`:
 *
 * | | `post` (print de tweet) | `thread` (esta) |
 * |---|---|---|
 * | fundo do cartão | quase preto | **branco**, sobre página creme |
 * | topo | nada | **barra de metadados**: `@handle` · marca · copyright |
 * | autoria | avatar + nome + selo + handle | igual, porém em CLARO |
 * | corpo | um bloco | **fio**: parágrafos com foto no meio |
 * | fecho | mesmo cartão | slide **PRETO** com avatar, handle e a frase |
 *
 * ## De onde vêm os números
 *
 * Dos prints do construtor, com o canvas em 100%: o cartão mede 459 px de
 * tela para uma peça de 1080, ou seja **escala 0,425** — cada medida daqui
 * é a da tela dividida por ela. `doTela()` deixa a conta no código em vez
 * de num comentário, para quem for reconferir não ter de refazê-la.
 *
 * É a mesma classe de precisão das duas famílias de print (medida de
 * imagem renderizada), e um degrau abaixo de ter o arquivo: o que o print
 * do construtor entrega é a peça em 42,5% do tamanho.
 */

/** Medida de tela do print (canvas a 100%) convertida para a base 1080. */
export const ESCALA_DO_PRINT = 0.425
export const doTela = (px: number): number => Math.round(px / ESCALA_DO_PRINT)

export const THREAD = {
  /** Margem lateral do cartão — a mesma para a barra, o texto e a foto. */
  margem: 56,
  /** Barra de metadados: `@handle` · marca · copyright. */
  metaTopo: 52,
  metaTexto: 24,
  /** Bloco de autoria. */
  autoriaTopo: 150,
  avatar: 88,
  avatarGap: 26,
  nome: 44,
  handle: 34,
  /** O fio de parágrafos. */
  corpo: 38,
  corpoEntrelinha: 1.28,
  /** Respiro entre um parágrafo e o seguinte (a linha em branco da thread). */
  paragrafoGap: 30,
  /** Respiro entre a autoria e o primeiro parágrafo. */
  autoriaGap: 46,
  imagemRaio: 10,
  imagemGap: 34,
  /** O fecho preto: avatar e handle no topo, a frase no meio. */
  fechoTopo: 190,
  fechoTexto: 52,
} as const

export const THREAD_CORES = {
  /** O cartão. Branco puro — a página creme é do aplicativo, não da peça. */
  cartao: "#FFFFFF",
  /** O fecho. */
  preto: "#000000",
  /** Tinta do corpo e do nome. */
  tinta: "#000000",
  /** Metadados, handle e selo: o cinza que a referência declara. */
  metadado: "#9C9C9C",
} as const

/**
 * O peso do corpo.
 *
 * Na referência o fio NÃO é regular: é semibold, e é isso que faz o cartão
 * ler como peça editorial em vez de captura de tela. Com 400 a peça fica
 * leve demais e perde a ênfase que o formato usa para marcar o argumento.
 */
export const THREAD_PESO_CORPO = 600

/**
 * Onde a barra de metadados aparece.
 *
 * Só no cartão CLARO. O fecho preto da referência tem avatar e `@handle` no
 * topo e mais nada — pôr a barra ali repetiria a marca duas vezes no slide
 * que existe justamente para deixar uma frase sozinha.
 */
export function temBarraDeMetadados(tipo: string): boolean {
  return tipo !== "cta"
}

/**
 * Limites de texto do formato.
 *
 * O fio é longo de propósito — na referência um slide chega a quatro
 * parágrafos —, então o limite do TIPO (que foi desenhado para uma
 * afirmação curta) encolheria a letra sem necessidade. O fecho é o oposto:
 * uma frase, e ela precisa caber grande.
 */
export const LIMITES_THREAD: Partial<Record<string, number>> = {
  titulo: 260,
  corpo: 260,
  subtitulo: 200,
  botao: 26,
}

/**
 * Os campos que o cartão de thread DESENHA.
 *
 * `titulo` é o parágrafo antes da foto e `corpo` o de depois — é assim que
 * o fio quebra em volta da imagem. O FECHO preto desenha só a frase: nem
 * `corpo` nem `botao`, porque na referência ele é uma afirmação sozinha e
 * campo que a identidade não desenha é campo fantasma.
 */
export function camposThread(tipo: string): Campo[] {
  return tipo === "cta" ? ["titulo"] : ["titulo", "corpo"]
}
