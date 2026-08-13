/**
 * Colisão de key entre variantes da biblioteca.
 *
 * Duas variantes com a mesma key no `output_schema` viram o mesmo
 * `{{PLACEHOLDER}}`, porque o endereço é `{{MAIÚSCULA_DA_KEY}}` e nada mais
 * (migration 20261064). E o `set_text` do merge troca TODAS as ocorrências
 * do token no documento — a premissa é que repetição de tag é o mesmo
 * conteúdo duplicado no branch MSO do Outlook.
 *
 * Essa premissa cai quando as duas variantes estão no MESMO email, em
 * seções diferentes: a copy de uma é escrita na outra. Foi o que pôs
 * "Buy 1, Get 3 Free — Real Support" no título dos produtos, no dos
 * depoimentos e no da seção de baixo do email da Luxe Lift (12/08) —
 * `section_headline` existe em 13 variantes, de três seções.
 *
 * Mas repetição não é problema por si: `hero_headline` está em 8 variantes
 * e nenhuma delas convive com outra, porque só existe uma hero por email.
 * O que decide é a SEÇÃO, não a contagem.
 *
 * Puro — sem I/O, testável.
 */

export interface KeyUser {
  id: string
  name: string
  block_type: string
}

/**
 * Índice key → variantes que a usam, a partir da lista já carregada na tela.
 *
 * Dedup por variante: campo repetido dentro do MESMO schema não é colisão
 * entre variantes e contaria duas vezes. Só variante ativa entra — a
 * inativa não vai para email nenhum.
 */
export function buildKeyUsage(
  variants: ReadonlyArray<{
    id: string
    name: string
    block_type: string
    is_active?: boolean | null
    output_schema?: ReadonlyArray<{ key?: string | null }> | null
  }>,
): Record<string, KeyUser[]> {
  const usage: Record<string, KeyUser[]> = {}
  for (const v of variants) {
    if (v.is_active === false) continue
    const keys = new Set(
      (v.output_schema ?? [])
        .map((f) => f?.key?.trim())
        .filter((k): k is string => !!k),
    )
    for (const key of keys) {
      ;(usage[key] ??= []).push({
        id: v.id,
        name: v.name,
        block_type: v.block_type,
      })
    }
  }
  return usage
}

export type CollisionSeverity =
  /** Outra variante de OUTRA seção usa a key — as duas convivem no email. */
  | "conflita"
  /** Só variantes da mesma seção — não convivem, é reuso legítimo. */
  | "mesma_secao"
  /** Ninguém mais usa. */
  | "livre"

export interface KeyCollision {
  severity: CollisionSeverity
  /** Variantes de OUTRA seção — as que causam o vazamento. */
  outras_secoes: KeyUser[]
  /** Variantes da mesma seção — informativo. */
  mesma_secao: KeyUser[]
}

/**
 * Classifica a key de uma variante contra o uso na biblioteca.
 *
 * `users` é o uso cru — pode incluir a própria variante, descartada por
 * `selfId`. Sem `selfId` (variante ainda não salva), a comparação é só por
 * seção: quem está em outra seção conflita.
 */
export function classifyKeyCollision(
  blockType: string,
  users: KeyUser[],
  selfId?: string | null,
): KeyCollision {
  const outros = (users ?? []).filter((u) => u.id !== selfId)
  const outras_secoes = outros.filter((u) => u.block_type !== blockType)
  const mesma_secao = outros.filter((u) => u.block_type === blockType)

  return {
    severity:
      outras_secoes.length > 0
        ? "conflita"
        : mesma_secao.length > 0
          ? "mesma_secao"
          : "livre",
    outras_secoes,
    mesma_secao,
  }
}

/**
 * Sugestão de key sem colisão: prefixa com a seção.
 *
 * `section_headline` numa variante de produtos vira `products_headline` —
 * é a convenção que resolve a família `section_*`, que é onde o problema
 * se concentra. Key que já começa pela seção volta inalterada, para o
 * botão de conserto não propor `products_products_headline`.
 */
export function suggestScopedKey(blockType: string, key: string): string {
  const secao = (blockType ?? "").trim().toLowerCase()
  const k = (key ?? "").trim().toLowerCase()
  if (!secao || !k) return k
  if (k.startsWith(`${secao}_`)) return k
  // Tira o prefixo genérico `section_` antes de aplicar o da seção real —
  // senão `section_headline` viraria `products_section_headline`.
  const semGenerico = k.replace(/^section_/, "")
  return `${secao}_${semGenerico}`
}
