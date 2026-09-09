/**
 * Destaque dentro do texto do slide: `**palavra**` sai na cor de destaque.
 *
 * É a marcação que o formato Editorial usa no corpo ("palavras em destaque
 * marrom") e a única concessão a texto rico no Estúdio — nada de HTML, nada
 * de editor de rich text: o documento continua guardando string simples, e
 * quem interpreta é o renderer.
 *
 * Duas consequências que os testes fixam:
 *
 * 1. O limite de caracteres conta o texto SEM os marcadores. Senão marcar
 *    três palavras encolheria a fonte do slide sem uma letra a mais na tela.
 * 2. Ao editar no canvas o texto volta CRU (com os asteriscos) — o
 *    `contentEditable` devolve `textContent`, e renderizar formatado durante
 *    a edição apagaria a marcação no primeiro clique.
 */

export interface PedacoTexto {
  texto: string
  destaque: boolean
}

/** `**x**` — não casa vazio (`****`) nem asterisco solto. */
const MARCA = /\*\*([^*]+?)\*\*/g

export function temDestaque(texto: string): boolean {
  MARCA.lastIndex = 0
  return MARCA.test(texto)
}

/** Quebra o texto em pedaços normais e destacados, na ordem. */
export function partesDestacadas(texto: string): PedacoTexto[] {
  const out: PedacoTexto[] = []
  let i = 0
  for (const m of texto.matchAll(new RegExp(MARCA.source, "g"))) {
    const inicio = m.index ?? 0
    if (inicio > i) out.push({ texto: texto.slice(i, inicio), destaque: false })
    out.push({ texto: m[1], destaque: true })
    i = inicio + m[0].length
  }
  if (i < texto.length) out.push({ texto: texto.slice(i), destaque: false })
  return out.filter((p) => p.texto.length > 0)
}

/** O texto como o leitor vê: sem os marcadores. Base para contar limite. */
export function textoLimpo(texto: string): string {
  return texto.replace(new RegExp(MARCA.source, "g"), "$1")
}
