/**
 * Pós-processamento compartilhado de outputs de documento HTML completo.
 *
 * Extraído do html.chain (split do agente HTML em 4 agentes, migration
 * 20261039) — a cadeia de formatação (text-format) e qualquer chain que
 * emita documento completo usam o MESMO pipeline defensivo que o agente
 * monolítico usava: colapso de spacers desgovernados, guard de truncamento,
 * conserto de spacer divs órfãos, limpeza de placeholders não-resolvidos e
 * lang forçado pro locale da loja.
 *
 * Puro exceto logging (observabilidade dos strips).
 */

import { logger } from "@/lib/logger"
import { fixOrphanSpacerDivs, fixSpacerColumnWidths } from "./orphan-spacer"

const log = logger.child("HtmlPostProcess")

export { fixOrphanSpacerDivs, fixSpacerColumnWidths }

/** Erro de output truncado — o modelo nao fechou o documento (`</html>`).
 *  Carrega o output CRU pro runner persistir em raw_output do run de erro —
 *  sem isso o "OUTPUT BRUTO" do painel de logs ficava vazio e era impossivel
 *  inspecionar ONDE o modelo parou (debug do truncamento do z-ai/glm-5.2). */
export class HtmlTruncatedError extends Error {
  readonly raw: string
  constructor(htmlLength: number, raw = "") {
    super(`HTML output truncado (sem </html>, ${htmlLength} chars)`)
    this.name = "HtmlTruncatedError"
    this.raw = raw
  }
}

/**
 * Colapsa "spacer hacks" descontrolados de preheader. Modelos as vezes entram
 * num loop gerando `&nbsp;‌&nbsp;‌...` milhares de vezes (preheader padding),
 * estouram o max_tokens e TRUNCAM o email antes do corpo. Cortar qualquer run
 * >= 12 de nbsp/zero-width pra 3 evita o desperdicio e o bloat. Defensivo: o
 * prompt ja proibe o spacer, isto e a rede de seguranca.
 */
export function collapseRunawaySpacers(html: string): string {
  // Cobre &nbsp; / &#160; / U+00A0 e zero-width: U+200C U+200D U+200B U+FEFF.
  return html.replace(
    /(?:&nbsp;|&#160;|\u00A0|\u200C|\u200D|\u200B|\uFEFF){12,}/gi,
    "&nbsp;&nbsp;&nbsp;",
  )
}

// Placeholders de CONTEUDO do Montador: {{HEADLINE}}, {{HERO_TEXT}},
// {{USP_1_TITLE}} etc — sempre MAIUSCULAS. NAO casa merge tags do provedor
// (`{{ unsubscribe }}` minusculo/espacado, `{% ... %}`, `*|...|*`,
// `[unsubscribe_link]`), que devem permanecer literais.
const UNRESOLVED_CONTENT_TOKEN = /\{\{\s*[A-Z][A-Z0-9_]*\s*\}\}/g

/**
 * Limpa placeholders de conteudo nao-substituidos pela cadeia. Se o Montador
 * usou `{{HEADLINE}}` mas nenhum agente casou com a copy, o token chegaria
 * LITERAL ao cliente. Aqui logamos (observabilidade) e removemos — melhor um
 * campo vazio do que `{{HEADLINE}}` visivel no email.
 */
export function stripUnresolvedPlaceholders(html: string): string {
  const matches = html.match(UNRESOLVED_CONTENT_TOKEN)
  if (matches && matches.length > 0) {
    const unique = Array.from(new Set(matches))
    // Slot de IMAGEM perdido é mais grave que copy não preenchida: o email
    // sai sem um visual que o Montador pediu, e com QA desligado ninguém vê.
    // Warn dedicado separa os dois casos na telemetria.
    const imageTokens = unique.filter((t) =>
      /_(?:IMAGE|THUMB)(?:_\d+)?\s*\}\}$/.test(t),
    )
    if (imageTokens.length > 0) {
      log.warn("html.image_slot_unfilled", {
        count: imageTokens.length,
        tokens: imageTokens.slice(0, 10),
      })
    }
    log.warn("html.unresolved_placeholders", {
      count: matches.length,
      sample: unique.slice(0, 10),
    })
    return html.replace(UNRESOLVED_CONTENT_TOKEN, "")
  }
  return html
}

/**
 * Forca o atributo `lang` do <html> pro locale da loja. O modelo escolhia
 * o lang arbitrariamente (lang="en" em loja pt-BR e vice-versa — batch de
 * jul/2026 saiu misturado). O locale ja e' resolvido/normalizado por
 * build-vars, entao a correcao aqui e' deterministica: substitui o atributo
 * se existir, injeta se faltar. No-op com locale vazio.
 */
export function enforceLangAttribute(html: string, locale: string): string {
  const trimmed = locale?.trim()
  if (!trimmed || !/^[a-z]{2}(-[A-Z]{2})?$/.test(trimmed)) return html
  if (/<html[^>]*\slang\s*=\s*["'][^"']*["']/i.test(html)) {
    return html.replace(
      /(<html[^>]*\slang\s*=\s*["'])[^"']*(["'])/i,
      `$1${trimmed}$2`,
    )
  }
  return html.replace(/<html(\s|>)/i, `<html lang="${trimmed}"$1`)
}

// SYNC: mesmo formato de BLOCK_MARKER_PATTERN (component-assembler) e do
// hero-locator. Os marcadores são infraestrutura interna — jamais podem
// chegar ao email do cliente.
const CFY_BLOCK_MARKER =
  /<!--\s*cfy:block:\d+:[A-Za-z0-9_-]+:(?:start|end)\s*-->[ \t]*\n?/g

/** Remove os marcadores de bloco do Montador (limpeza final da cadeia). */
export function stripCfyBlockMarkers(html: string): string {
  return html.replace(CFY_BLOCK_MARKER, "")
}

/**
 * Remove indentação com &nbsp;/U+00A0 no INÍCIO de linha. Origem do caso
 * Luxe Lift (jul/2026): o collapseRunawaySpacers regrediu na extração do
 * html.chain (U+00A0 virou ESPAÇO comum na alternação) e passou a colapsar
 * indentação normal de 12+ espaços em "&nbsp;&nbsp;&nbsp;" — corrigido
 * acima com escapes \uXXXX. Este strip fica como defesa permanente: run de
 * nbsp no começo de linha nunca é conteúdo legítimo de email; &nbsp; no
 * MEIO de texto fica intacto.
 */
export function stripNbspIndentation(html: string): string {
  return html.replace(
    /(^|\n)([ \t]*)(?:&nbsp;|&#160;|\u00A0)+[ \t]*/g,
    "$1$2",
  )
}

/**
 * Pipeline completo: remove fences markdown, extrai o fragmento
 * <!DOCTYPE...</html>, colapsa spacers, guard de truncamento (lança
 * HtmlTruncatedError com o raw), conserta spacer divs, limpa placeholders
 * e força o lang. Era o postProcessHtml do html.chain.
 */
export function postProcessFullDocument(
  rawText: string,
  locale?: string,
): string {
  let raw = postProcessDocumentPreserveTags(rawText)
  raw = stripUnresolvedPlaceholders(raw)
  if (locale) raw = enforceLangAttribute(raw, locale)
  return raw
}

/**
 * Variante da cadeia de formatação: MESMO pipeline defensivo, mas SEM o
 * strip de placeholders e sem o lang — os agentes de texto/hero emitem
 * documentos INTERMEDIÁRIOS cujas tags {{*_IMAGE}} pertencem ao próximo
 * agente. O strip + lang rodam UMA vez no fim da cadeia (runner), depois
 * do agente de imagem.
 */
export function postProcessDocumentPreserveTags(rawText: string): string {
  let raw = rawText.replace(/```(?:html)?\s*/gi, "").trim()
  raw = collapseRunawaySpacers(raw)
  const doctypeMatch = raw.match(/(<!DOCTYPE[\s\S]*<\/html>)/i)
  if (doctypeMatch) raw = doctypeMatch[1]
  // Guard de truncamento: sem `</html>` o documento esta incompleto (ex.: o
  // modelo estourou max_tokens num spacer runaway antes de gerar o corpo).
  // Lancar aqui faz o runner marcar o step como erro (retry 1x → failed)
  // em vez de salvar um email quebrado como "sucesso" → render vazio.
  if (!/<\/html>\s*$/i.test(raw)) {
    throw new HtmlTruncatedError(raw.length, raw)
  }
  raw = fixOrphanSpacerDivs(raw)
  raw = fixSpacerColumnWidths(raw)
  return raw
}
