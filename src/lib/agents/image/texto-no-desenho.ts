/**
 * texto-no-desenho — quando o slot PEDE letra, a proibição de letra sai do
 * prompt.
 *
 * Medido em 11/09 (Hero Boxers, welcome 1, batch de 10/09 21:58). Os três
 * selos do bloco `body` têm copy no banco — "REAL FIT", "EASY RETURN",
 * "DIRECT BRAND", cada um com a frase do arco — e natureza
 * `copy_no_desenho`, que quer dizer: este texto não tem endereço no HTML,
 * ele é DESENHADO dentro da imagem. `buildImageSlots` serve isso ao modelo
 * com todas as letras ("DESENHE estas palavras DENTRO da imagem, exatamente
 * como estão entre aspas").
 *
 * E o mesmo prompt, mais abaixo, proíbe duas vezes:
 *
 *   NEVER render any of this text.
 *   UNIVERSAL RESTRICTIONS:
 *   - No text, letters, numbers, logos or watermarks rendered in the image
 *     (text is added in the design layer downstream).
 *
 * A proibição venceu — ela aparece duas vezes, está sob um título
 * categórico e é a última coisa lida antes de gerar. Saíram três círculos
 * de cor sólida, sem uma letra: branco, preto e #B0C4AB, exatamente os
 * fundos que a direção da variante nomeia. Três chamadas de imagem pagas
 * para produzir o que uma linha de CSS desenharia.
 *
 * **Por que substituir e não apagar.** A frase proibitiva faz um trabalho
 * real: sem ela o modelo escreve na imagem a `especificidade` do slot, o
 * nome do bloco, a ideia do e-mail — tudo que ele leu. Apagá-la trocaria
 * "nenhuma letra" por "qualquer letra". O que entra no lugar mantém a
 * restrição e move a exceção para onde ela vale: só as palavras listadas,
 * exatamente como vieram.
 *
 * **Por que no TEMPLATE e não no prompt pronto.** `buildImagePromptWithSegments`
 * segmenta o template para a proveniência e o guard é a recomposição byte a
 * byte. Reescrever depois faria os segmentos divergirem do enviado e a run
 * gravaria sem marcação — perder a proveniência para consertar o prompt
 * seria trocar um defeito silencioso por outro.
 *
 * **O que NÃO é tocado, de propósito**: `Photographic realism, campaign
 * quality`. Um selo com palavra em arco é arte gráfica e o realismo ali é
 * incoerente — mas `copy_no_desenho` também cobre rótulo sobre foto (um
 * preço num badge, um selo sobre a cena), onde o realismo é o certo. Não há
 * sinal no schema que separe os dois casos, e adivinhar mudaria a arte de
 * slots que querem foto. Fica declarado como lacuna em vez de resolvido no
 * chute.
 *
 * Puro (zero I/O) — testável.
 */

/** A marca que `buildImageSlots` escreve quando há campo `copy_no_desenho`. */
const MARCA_TEXTO_NO_DESENHO = "texto_no_desenho"

/**
 * O bloco de slots pede letra desenhada?
 *
 * A pergunta é feita ao TEXTO já montado, não aos campos: assim vale para
 * os dois caminhos que montam prompt de imagem (o runner da fase 2 e o
 * `resolve-block-prompt`) sem cada um precisar lembrar de decidir, e
 * continua valendo se um terceiro aparecer.
 */
export function pedeTextoNoDesenho(imageSlots: string | null | undefined): boolean {
  return typeof imageSlots === "string" && imageSlots.includes(MARCA_TEXTO_NO_DESENHO)
}

/** Uma frase do template que muda, e o que ela vira. */
interface Troca {
  /** Nome curto para a telemetria. */
  nome: string
  de: RegExp
  para: string
}

const TROCAS: Troca[] = [
  {
    // Cabeçalho de CFY_THIS_FRAME. Ela fala do bloco de slots — que é
    // justamente onde `texto_no_desenho` mora, daí o conflito direto.
    nome: "never_render",
    de: /NEVER render any of this text\./g,
    para:
      "Render ONLY the words listed under \"texto_no_desenho\" below, and only if that list is present. " +
      "Everything else in this block is description for you to read, never lettering to draw.",
  },
  {
    // UNIVERSAL RESTRICTIONS, o item que o modelo obedeceu.
    nome: "no_text",
    de: /- No text, letters, numbers, logos or watermarks rendered in the image \(text is added in the design layer downstream\)\./g,
    para:
      "- The ONLY text allowed in the image is the one listed under \"texto_no_desenho\": render those words exactly as quoted, " +
      "with correct spelling and accents, legible at the slot's final size. No other letters, numbers, logos or watermarks — " +
      "every other piece of copy is added in the design layer downstream.",
  },
]

export interface TemplateLiberado {
  template: string
  /** Quais frases foram trocadas — vai para a telemetria da run. */
  trocas: string[]
}

/**
 * Devolve o template com a proibição de letras reescrita.
 *
 * Idempotente e fail-open: template que não contém as frases (outro
 * cadastro, prompt reescrito à mão, dialeto diferente) volta intacto com
 * `trocas: []`. Nunca é erro — apenas nada a fazer.
 */
export function liberarTextoNoDesenho(template: string): TemplateLiberado {
  let out = template
  const trocas: string[] = []
  for (const t of TROCAS) {
    if (!t.de.test(out)) continue
    t.de.lastIndex = 0
    out = out.replace(t.de, t.para)
    trocas.push(t.nome)
  }
  return { template: out, trocas }
}
