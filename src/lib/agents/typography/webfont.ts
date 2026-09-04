/**
 * Os `<link>` de webfont do documento — declarados, reconciliados e nunca
 * acumulados.
 *
 * `injectSecondaryFontLink` (em `apply.ts`) é idempotente só pelo HREF
 * EXATO e nunca remove nada. Isso bastava enquanto o único escritor era o
 * agente, que decide uma segunda fonte por geração. Com a edição humana o
 * mesmo e-mail é salvo muitas vezes: trocar de fonte quatro vezes deixaria
 * quatro `<link>` no head — quatro requisições, e o Gmail corta a mensagem
 * em ~102 KB.
 *
 * Daí a reconciliação: os links QUE ESTE MÓDULO GERA carregam
 * `data-cfy-font-link`, então dá para apagar todos e reemitir só as famílias
 * em uso. O `<link>` da montagem (a fonte da loja) não tem o atributo e
 * fica onde está — ele não é nosso para remover.
 *
 * Os pesos saem do DOCUMENTO depois da escrita, não das ops: uma op que só
 * troca a família de um item que já era 700 não menciona peso nenhum, e o
 * href sairia sem 700 — o navegador então SINTETIZA o negrito, que é mais
 * pesado e mais feio que o desenho real da fonte.
 *
 * Puro (zero I/O) — testável.
 */

import { extractTypographyInventory } from "./inventory"
import { sanitizarFamilia } from "./rules"
import { familiaPrincipal } from "./swap-fonts"

/** Marca dos links que a reconciliação pode remover. */
export const LINK_ATTR = "data-cfy-font-link"

const LINK_GERENCIADO = new RegExp(
  `\\s*<!--\\[if !mso\\]><!-->\\s*<link[^>]*${LINK_ATTR}[^>]*>\\s*<!--<!\\[endif\\]-->`,
  "gi",
)

/** Pesos declarados no documento para cada família (o que precisa carregar). */
export function pesosPorFamilia(html: string): Map<string, Set<number>> {
  const mapa = new Map<string, Set<number>>()
  for (const oc of extractTypographyInventory(html)) {
    const familia = familiaPrincipal(oc.family)
    if (!familia) continue
    const pesos = mapa.get(familia) ?? new Set<number>()
    if (oc.weight !== null) pesos.add(oc.weight)
    mapa.set(familia, pesos)
  }
  return mapa
}

export function googleFontsHref(familia: string, pesos: number[]): string {
  const wght = Array.from(new Set(pesos.length > 0 ? pesos : [400, 700]))
    .sort((a, b) => a - b)
    .join(";")
  return `https://fonts.googleapis.com/css2?family=${familia.replace(/ /g, "+")}:wght@${wght}&display=swap`
}

/**
 * Reemite os links gerenciados para as famílias pedidas, com os pesos que o
 * documento realmente usa.
 *
 * `jaDeclaradas` são as famílias que a montagem já declarou (a fonte da
 * loja): elas não ganham link novo, senão o mesmo arquivo seria pedido duas
 * vezes. Comparação sem caixa, pelo nome da primeira família da cadeia.
 */
export function reconciliarWebfonts(
  html: string,
  familias: ReadonlyArray<string>,
  jaDeclaradas: ReadonlyArray<string> = [],
): string {
  const limpo = html.replace(LINK_GERENCIADO, "")
  const pesos = pesosPorFamilia(limpo)
  const nativas = new Set(jaDeclaradas.map((f) => familiaPrincipal(f)).filter(Boolean))

  const linhas: string[] = []
  const vistas = new Set<string>()
  for (const bruta of familias) {
    const familia = sanitizarFamilia(bruta)
    if (!familia) continue
    const chave = familiaPrincipal(familia)
    if (vistas.has(chave) || nativas.has(chave)) continue
    // Família que não está mais em nenhuma declaração não precisa de link.
    const emUso = pesos.get(chave)
    if (!emUso) continue
    vistas.add(chave)
    const href = googleFontsHref(familia, [...emUso])
    // O href já presente (o `<link>` da montagem, sem o nosso atributo)
    // dispensa reemissão — seria a mesma requisição duas vezes.
    if (limpo.includes(href)) continue
    linhas.push(`<link rel="stylesheet" ${LINK_ATTR} href="${href}">`)
  }
  if (linhas.length === 0) return limpo

  const bloco = `\n<!--[if !mso]><!-->\n${linhas.join("\n")}\n<!--<![endif]-->`
  const headClose = /<\/head>/i.exec(limpo)
  if (!headClose || headClose.index === undefined) return limpo
  return limpo.slice(0, headClose.index) + bloco + "\n" + limpo.slice(headClose.index)
}
