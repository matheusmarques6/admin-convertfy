/**
 * Família "Manchete" — lida dos cinco slides da referência.
 *
 * A peça é uma TESE em cinco tempos: capa de impacto sobre foto, o erro,
 * o problema, a virada e a chamada. O que a define visualmente:
 *
 * - **Título condensado em caixa alta**, pesado, entrelinha apertada. É a
 *   massa da peça — em todo slide ele ocupa mais espaço que o corpo.
 * - **Três cores e nada mais**: preto, branco e um azul elétrico. O azul
 *   nunca é fundo de seção: é título realçado e a CAIXA sólida de
 *   destaque.
 * - **A peça é CLARA com dois escuros**: a capa e o slide do problema. O
 *   preto marca a tensão; o branco, o argumento.
 * - **Sem contador e sem rodapé de marca** — só o ícone da marca, pequeno,
 *   no topo. A peça parece um editorial, não um card de rede social.
 *
 * ## De onde vêm os números
 *
 * **Lidos da referência renderizada, não extraídos do arquivo.** As duas
 * famílias de print (`post`, `post-largo`) têm tabela de/para medida pixel
 * a pixel do original; aqui as proporções foram lidas dos cinco slides e
 * conferidas renderizando lado a lado. É um degrau acima da identidade
 * anterior (construída só da descrição escrita) e um abaixo dos prints.
 *
 * | item                          | base 1080 |
 * |-------------------------------|-----------|
 * | margem lateral do texto       |       135 |
 * | margem lateral da imagem      |       118 |
 * | ícone da marca (topo)         |        46 |
 * | topo do ícone                 |        95 |
 * | corpo do título               |        78 |
 * | corpo do título na capa       |        96 |
 * | entrelinha do título          |      0,92 |
 * | corpo do texto                |        37 |
 * | entrelinha do texto           |      1,38 |
 * | raio da imagem                |        18 |
 * | caixa de destaque: texto      |        34 |
 * | caixa de destaque: respiro    |     36/40 |
 *
 * Puro: quem desenha é o `frame.tsx`, que não tem medida própria.
 */

/** Medidas da identidade, na base 1080 do canvas. */
export const MANCHETE = {
  margem: 135,
  margemImagem: 118,
  logoTam: 46,
  logoTopo: 95,
  titulo: 78,
  tituloCapa: 96,
  entrelinhaTitulo: 0.92,
  texto: 37,
  entrelinhaTexto: 1.38,
  raioImagem: 18,
  destaqueTexto: 34,
  destaquePadY: 36,
  destaquePadX: 40,
  destaqueRaio: 10,
  /** Espaço acima e abaixo da régua do slide de chamada. */
  reguaRespiro: 42,
} as const

/** Paleta: três cores, e o azul nunca é fundo de seção. */
export const MANCHETE_CORES = {
  preto: "#000000",
  claro: "#FFFFFF",
  azul: "#3355FF",
  /** Tinta do corpo no fundo claro — preto puro no corpo cansa a leitura. */
  tinta: "#111111",
} as const

/**
 * Escada do título: cada linha um passo menor que a anterior.
 *
 * É o que a capa faz ("DATAS SAZONAIS" / "FORAM CRIADAS PARA" / "VOCÊ
 * VENDER MAIS") e o que dá o tom de manchete. **Vale só no fundo ESCURO**,
 * e isso foi LIDO da referência, não inventado: os dois slides escuros têm
 * escada e os três claros têm o título todo do mesmo corpo. É a diferença
 * entre o modo "manchete" e o modo "artigo" dentro da mesma peça.
 *
 * **Limite declarado**: a escada é sempre DECRESCENTE. O slide do problema
 * na referência põe a frase entre aspas no meio, maior que as vizinhas —
 * isso exigiria marcar a linha protagonista, campo que ninguém pediu.
 */
export const ESCADA = [1, 0.66, 0.56, 0.5] as const

export function fatoresDaEscada(linhas: number): number[] {
  return Array.from({ length: Math.max(0, linhas) }, (_, i) => ESCADA[Math.min(i, ESCADA.length - 1)])
}

/**
 * As linhas do título, como o operador as escreveu.
 *
 * A quebra é do TEXTO (`\n`), nunca da largura: quebra automática não tem
 * como receber corpo diferente, e é a quebra escolhida que faz a escada.
 */
export function linhasDoTitulo(texto: string): string[] {
  return texto.split("\n")
}

/**
 * Limites de texto da identidade.
 *
 * O título ocupa a peça e a referência tem 58 caracteres em quatro linhas
 * no slide do erro; com o limite do tipo (`titulo: 60` em `texto`) o
 * auto-fit já começaria a encolher. O corpo é curto de propósito — três
 * linhas —, então ele NÃO é afrouxado: afrouxar convidaria a escrever o
 * parágrafo que este formato não tem.
 */
export const LIMITES_MANCHETE: Partial<Record<string, number>> = {
  titulo: 90,
  subtitulo: 90,
  corpo: 180,
  destaque: 140,
  botao: 26,
}
