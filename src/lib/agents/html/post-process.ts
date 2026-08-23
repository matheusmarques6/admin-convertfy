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
import {
  locateEmptyShells,
  applySplices,
  textNodes,
  type Splice,
} from "./dom-locator"
import { findAttrSlots } from "./slot-finder"

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
 * Remove as CASCAS que sobraram vazias depois do strip de placeholders.
 *
 * "Melhor um campo vazio do que `{{HEADLINE}}` visível" vale para texto
 * corrido — o `<td>` some sozinho. Não vale para botão: apagar o token de
 * `<a style="border:1.5px solid #000">{{FOOTER_LINK_1_LABEL}}</a>` deixa a
 * borda, o padding e a altura no lugar, sem nada dentro. Foi assim que o
 * rodapé da Luxe Lift (12/08) saiu com seis retângulos ocos em 2×3 e a
 * pílula vazia do logo acima deles.
 *
 * A casca é resolvida pela ÁRVORE (dom-locator) e removida por splice no
 * source — os conditional comments do Outlook seguem intactos.
 */
export function pruneEmptyShells(html: string): string {
  let current = html
  let total = 0
  // Itera: remover a `<table>` vazia esvazia a `<td>` que a continha, que
  // esvazia a `<tr>`. Uma passada só pararia na tabela e deixaria a linha
  // com o padding original. O teto existe porque isto roda em documento de
  // origem desconhecida — convergir é o caso normal, travar não pode.
  for (let pass = 0; pass < 4; pass++) {
    const shells = locateEmptyShells(current)
    if (shells.length === 0) break
    current = applySplices(
      current,
      shells.map((s) => ({ ...s, replacement: "" })),
    ).html
    total += shells.length
  }
  if (total === 0) return html
  log.warn("html.empty_shells_pruned", { count: total })
  return current
}

/** `href=""` / `href=''` — o que sobra de `href="{{CTA_URL}}"` após o strip. */
const DEAD_HREF = /\shref\s*=\s*(?:""|'')/gi

/**
 * Tira o `href` que ficou VAZIO — o botão continua, o link morto não.
 *
 * Caso irmão do `pruneEmptyShells`: quando o rótulo resolve mas a URL não,
 * sobra `<a href="">Finalizar pedido</a>`. Não é cosmético: `href=""`
 * resolve para o documento ATUAL, então clicar num webmail navega para a
 * própria URL do cliente de email. Sem o atributo, o elemento deixa de ser
 * link — o texto e o estilo inline (fundo, padding, borda) ficam de pé.
 *
 * Remoção de ATRIBUTO é edição local: não desbalanceia o documento, então
 * aqui regex é seguro e cobre também o `<v:roundrect href="">` do branch
 * MSO, que vive dentro de conditional comment e não existe na árvore.
 *
 * `href="#"` NÃO é tocado: é placeholder deliberado de template e o
 * render-checks já o reporta ao designer.
 */
export function neutralizeDeadLinks(html: string): string {
  const dead = html.match(DEAD_HREF)?.length ?? 0
  if (dead === 0) return html
  log.warn("html.dead_href_removed", { count: dead })
  return html.replace(DEAD_HREF, "")
}

/**
 * Limpa placeholders de conteudo nao-substituidos pela cadeia. Se o Montador
 * usou `{{HEADLINE}}` mas nenhum agente casou com a copy, o token chegaria
 * LITERAL ao cliente. Aqui logamos (observabilidade) e removemos — melhor um
 * campo vazio do que `{{HEADLINE}}` visivel no email.
 *
 * E, logo em seguida, arruma o que o token deixou para trás: a casca que
 * ficou sem conteúdo nenhum (`pruneEmptyShells`) e o `href` que ficou vazio
 * (`neutralizeDeadLinks`). Apagar o texto do botão sem apagar o botão, ou o
 * destino sem apagar o link, troca um defeito visível por outro.
 *
 * Nesta ordem: a poda primeiro, porque quando rótulo E URL somem o botão
 * inteiro sai — e aí não há href morto que sobre para neutralizar.
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
    return neutralizeDeadLinks(
      pruneEmptyShells(html.replace(UNRESOLVED_CONTENT_TOKEN, "")),
    )
  }
  return html
}

/**
 * Limpa os TOKENS DE ATRIBUTO que sobraram sem valor (vocabulário sem
 * placeholder, F3): `src="URL_FOTO_1"` cru vira `src=""`, `alt="ALT_X"`
 * vira `alt=""`, `NOME_DA_MARCA` em texto corrido some — e a casca que
 * ficou oca é podada (pruneEmptyShells) e o link morto neutralizado, o
 * mesmo tratamento do strip de `{{TAG}}`. Token cru no cliente de email é
 * pior que campo vazio: `<img src="URL_FOTO_1">` renderiza ícone quebrado
 * e "NOME_DA_MARCA" sai impresso na tela.
 */
export function stripUnresolvedAttrTokens(html: string): string {
  const splices: Splice[] = []
  for (const slot of findAttrSlots(html)) {
    // Sintético = base64 de placeholder que não recebeu URL. Esvaziar o
    // `src` trocaria o xadrez cinza do designer por ícone quebrado — pior
    // que o placeholder. Fica como está.
    if (slot.synthetic) continue
    splices.push({ ...slot.valueRange, replacement: "" })
  }
  for (const node of textNodes(html)) {
    let at = node.text.indexOf("NOME_DA_MARCA")
    while (at !== -1) {
      splices.push({
        start: node.range.start + at,
        end: node.range.start + at + "NOME_DA_MARCA".length,
        replacement: "",
      })
      at = node.text.indexOf("NOME_DA_MARCA", at + 1)
    }
  }
  if (splices.length === 0) return html
  log.warn("html.unresolved_attr_tokens", { count: splices.length })
  return neutralizeDeadLinks(
    pruneEmptyShells(applySplices(html, splices).html),
  )
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
 * Remove os atributos internos de endereçamento (data-cfy-slot/data-cfy-row)
 * que a anotação de slots injetava. A anotação morreu com o vocabulário
 * {{TAG}} (20/08) — o strip fica porque documentos persistidos em estágio
 * intermediário ainda podem carregá-los, e atributo interno jamais chega
 * ao cliente de email. Migrado de slot-annotate na remoção do módulo.
 */
const CFY_SLOT_ATTR = /\s+data-cfy-(?:slot|row)\s*=\s*"[^"]*"/gi

export function stripSlotAttributes(html: string): string {
  return html.replace(CFY_SLOT_ATTR, "")
}

/**
 * Remove os wrappers de PROTOCOLO dos agentes e o que houver dentro deles.
 *
 * `<CFY_HERO_OUTPUT>` e `<CFY_HERO_REPORT>` existem para delimitar a
 * resposta do modelo; nada disso é conteúdo. Um cliente de email trata tag
 * desconhecida como invisível mas RENDERIZA o texto de dentro — foi assim
 * que o JSON do relatório da hero (`{"imagem":"aplicada",…}`) apareceu
 * impresso no rodapé de um email entregue.
 *
 * O `parseHeroFragment` já corta o relatório na origem. Isto é a rede de
 * baixo, na última limpeza antes do email ir para o designer: qualquer
 * agente que passe a usar um wrapper `CFY_*` fica coberto sem precisar
 * lembrar deste caminho.
 */
const CFY_PROTOCOL_BLOCK = /<CFY_[A-Z0-9_]+>[\s\S]*?<\/CFY_[A-Z0-9_]+>/gi
const CFY_PROTOCOL_TAG = /<\/?CFY_[A-Z0-9_]+>/gi

export function stripAgentProtocolBlocks(html: string): string {
  return html.replace(CFY_PROTOCOL_BLOCK, "").replace(CFY_PROTOCOL_TAG, "")
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
