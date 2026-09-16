/**
 * Ler o texto de um campo editado na tela — com as QUEBRAS DE LINHA.
 *
 * `textContent` não serve. O `contentEditable` do Chrome insere um `<div>`
 * por parágrafo ao teclar Enter (o Safari e o Firefox usam `<br>`), e
 * `textContent` de `<div>a</div><div>b</div>` devolve **"ab"** — sem o
 * `\n`, sem nem um espaço. Colar três linhas gravava as três grudadas.
 *
 * Foi o que produziu, em produção, o subtítulo
 * `"FORAM CRIADAS PARAVOCÊ VENDER MAISE a Black Friday é a maior delas..."`:
 * "PARA"+"VOCÊ" e "MAIS"+"E a Black" coladas na fronteira que sumiu.
 *
 * O efeito é maior que o texto feio: **a escada do título da Manchete
 * depende de `\n`** (cada linha um corpo), então ela era fisicamente
 * inalcançável por quem edita pela tela — a peça nunca ia ficar igual à
 * referência, por mais certas que fossem as medidas.
 *
 * O tipo é estrutural de propósito: o módulo é PURO e testável sem DOM.
 */

/** O mínimo de um nó do DOM que esta leitura precisa. */
export interface NoEditavel {
  nodeType: number
  nodeName: string
  /** Conteúdo do nó de texto (`Text.data`). */
  data?: string | null
  childNodes?: ArrayLike<NoEditavel>
}

const TEXTO = 3
const ELEMENTO = 1

/**
 * Elementos que o navegador cria para separar PARÁGRAFO. A fronteira deles
 * vira `\n`; qualquer outro elemento (`<span>`, `<b>`, `<font>` do
 * `execCommand`) é tratado como inline e não quebra nada.
 */
const BLOCOS = new Set(["DIV", "P", "LI", "TR", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "SECTION", "ARTICLE"])

/**
 * O texto do campo, com um `\n` por fronteira de parágrafo.
 *
 * Regras (todas cobertas por teste, porque cada uma erra em silêncio):
 *
 * - `<br>` vira `\n` — é a quebra do Safari e do Firefox.
 * - Bloco vira `\n` ANTES do conteúdo, e só quando já há algo escrito: o
 *   primeiro parágrafo não pode nascer com linha em branco na frente.
 * - O `\n` de bloco NÃO é emitido em sequência: `<div><div>a</div></div>`
 *   é um parágrafo só, e `<div><br></div>` (a linha vazia do Chrome) já
 *   trouxe o seu `\n` pelo `<br>`.
 * - `\r\n` colado de fora vira `\n` — senão a contagem de linhas da escada
 *   enxerga um caractere invisível no fim de cada linha.
 */
export function textoDoEditavel(raiz: NoEditavel | null | undefined): string {
  if (!raiz) return ""
  const partes: string[] = []

  const emitirQuebra = () => {
    if (partes.length === 0) return // nada escrito ainda
    if (partes[partes.length - 1].endsWith("\n")) return // já quebrou
    partes.push("\n")
  }

  const andar = (no: NoEditavel, raizDaChamada: boolean) => {
    if (no.nodeType === TEXTO) {
      if (no.data) partes.push(no.data)
      return
    }
    if (no.nodeType !== ELEMENTO) return
    const tag = no.nodeName.toUpperCase()
    if (tag === "BR") {
      partes.push("\n")
      return
    }
    if (!raizDaChamada && BLOCOS.has(tag)) emitirQuebra()
    const filhos = no.childNodes
    if (filhos) for (let i = 0; i < filhos.length; i++) andar(filhos[i], false)
  }

  andar(raiz, true)
  return partes.join("").replace(/\r\n?/g, "\n")
}

/**
 * O texto que vai para o `contentEditable` ao ENTRAR na edição.
 *
 * Devolvido como está: o container tem `white-space: pre-wrap`, então o
 * `\n` aparece como quebra sem precisar de `<br>`. Existe para deixar
 * explícito que a ida e a volta são simétricas — quem escrever `<br>`
 * aqui faria o Chrome duplicar a quebra no primeiro Enter.
 */
export function textoParaOEditavel(texto: string): string {
  return texto
}
