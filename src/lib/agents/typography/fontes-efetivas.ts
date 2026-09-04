/**
 * As fontes QUE ESTE E-MAIL usa — módulo puro, client-safe.
 *
 * `store_brand_identity` diz qual é a fonte da MARCA. Desde 04/09 uma peça
 * pode divergir dela: quem revisa o e-mail no Workspace troca a fonte só
 * daquela peça (`email_flow_emails.typography_override`), sem criar versão
 * nova da identidade nem pedir re-aprovação.
 *
 * Quem lê a fonte para DECIDIR alguma coisa tem de ler daqui, não da marca.
 * O caso que dói: `classe_principal` do prompt do tipógrafo sai de
 * `classifyFontFamily(fonteDeTitulo)`. Se o humano trocou a peça para uma
 * serifada e o agente continuar vendo a grotesca da marca, o guard do par
 * (regra 7 — sans + sans some no substituto) avalia contra a classe errada:
 * aprova um par ruim ou recusa um bom, e a justificativa dele fica falando
 * de uma fonte que não está no documento.
 */

import { classifyFontFamily } from "./font-name"
import type { TypographyOpHumana } from "./rules"

/** O que a tela grava em `email_flow_emails.typography_override`. */
export interface TypographyOverride {
  fontes: {
    heading?: string | null
    heading_weight?: string | null
    body?: string | null
    body_weight?: string | null
  } | null
  /**
   * As ops por item, guardadas como REGISTRO do que a pessoa fez.
   *
   * Não são script de replay: elas endereçam por índice do inventário, e um
   * re-render regera o documento — o item 14 deixa de ser o mesmo elemento.
   * Reaplicá-las por índice depois disso escreveria no lugar errado com cara
   * de sucesso.
   */
  ops: TypographyOpHumana[]
  atualizado_em?: string
  atualizado_por?: string | null
}

export interface FontesEfetivas {
  heading: string
  headingWeight: string
  body: string
  bodyWeight: string
  classePrincipal: "serif" | "sans" | "mono" | "display"
  /** true quando a peça diverge da identidade da marca. */
  daPeca: boolean
}

interface FontesDaMarca {
  font_heading?: string | null
  font_heading_weight?: string | null
  font_body?: string | null
  font_body_weight?: string | null
}

const PADRAO_FAMILIA = "Inter"
const PADRAO_PESO = "400"

/** Campo do override vence o da marca; vazio não conta como escolha. */
function preferir(a: string | null | undefined, b: string | null | undefined, padrao: string): {
  valor: string
  doOverride: boolean
} {
  const doOverride = (a ?? "").trim()
  if (doOverride) return { valor: doOverride, doOverride: true }
  return { valor: (b ?? "").trim() || padrao, doOverride: false }
}

export function fontesEfetivas(
  marca: FontesDaMarca | null | undefined,
  override: TypographyOverride | null | undefined,
): FontesEfetivas {
  const o = override?.fontes ?? null
  const heading = preferir(o?.heading, marca?.font_heading, PADRAO_FAMILIA)
  const headingWeight = preferir(o?.heading_weight, marca?.font_heading_weight, PADRAO_PESO)
  const body = preferir(o?.body, marca?.font_body, PADRAO_FAMILIA)
  const bodyWeight = preferir(o?.body_weight, marca?.font_body_weight, PADRAO_PESO)

  return {
    heading: heading.valor,
    headingWeight: headingWeight.valor,
    body: body.valor,
    bodyWeight: bodyWeight.valor,
    classePrincipal: classifyFontFamily(heading.valor),
    daPeca:
      heading.doOverride ||
      headingWeight.doOverride ||
      body.doOverride ||
      bodyWeight.doOverride,
  }
}

/** Lê o JSONB da coluna com tolerância — linha antiga vem null. */
export function parseTypographyOverride(raw: unknown): TypographyOverride | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const fontes =
    o.fontes && typeof o.fontes === "object"
      ? (o.fontes as TypographyOverride["fontes"])
      : null
  const ops = Array.isArray(o.ops) ? (o.ops as TypographyOpHumana[]) : []
  if (!fontes && ops.length === 0) return null
  return {
    fontes,
    ops,
    atualizado_em: typeof o.atualizado_em === "string" ? o.atualizado_em : undefined,
    atualizado_por: typeof o.atualizado_por === "string" ? o.atualizado_por : null,
  }
}
