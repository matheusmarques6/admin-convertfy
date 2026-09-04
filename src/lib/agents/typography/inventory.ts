/**
 * Inventário tipográfico — a entrada do agente de tipografia.
 *
 * O agente NÃO recebe o documento. Recebe esta lista numerada de todos os
 * lugares onde há `font-family` declarada, com o que é preciso para decidir:
 * bloco/seção, tamanho, peso, caixa, espaçamento, cor de fundo e o texto que
 * está ali. Ele responde por NÚMERO DE ITEM e o código aplica (`apply.ts`).
 *
 * É o desenho do `color_format` (inventário de cores → ops → código pinta) e
 * a lição do `text_format`: LLM que recebe 86 KB de HTML e devolve 86 KB
 * reescreve o documento inteiro — quebra tabela, come botão, perde tag de
 * imagem. Aqui o modelo devolve intenção; só código escreve.
 *
 * CONTRATO INTERNO: `apply.ts` percorre o MESMO regex, na MESMA ordem, para
 * casar o índice. Mexer em `FONT_FAMILY_RE` aqui quebra lá.
 *
 * Puro (zero I/O) — testável.
 */

/** Uma declaração de fonte no documento. */
export interface TypographyOccurrence {
  /** Ordem da ocorrência no corpo — é o "item" que o agente endereça. */
  index: number
  /** Índice do bloco (marcador `cfy:block`), quando disponível. */
  blockIndex: number | null
  /** Seção do bloco ("hero", "offer"…), quando disponível. */
  section: string | null
  tag: string
  family: string
  sizePx: number | null
  weight: number | null
  uppercase: boolean
  tracking: string | null
  /** Fundo da seção mais próxima (hex) — base da regra de fundo escuro. */
  bg: string | null
  bgDark: boolean
  /** Rótulo de link/botão: nunca troca de família (regra do CTA). */
  isCta: boolean
  /** Texto sem letra nem dígito (aspa decorativa, dingbat) — é ornamento. */
  soPontuacao: boolean
  text: string
}

// font-family DENTRO de style="" inline. Varremos só o corpo (após <body>),
// então o <style> do head nunca entra.
export const FONT_FAMILY_RE = /font-family\s*:\s*([^;"}<]+)/gi

const BLOCK_MARKER_RE = /<!--\s*cfy:block:(\d+):([a-z_]+):start\s*-->/gi
const BG_RE = /background(?:-color)?\s*:\s*(#[0-9a-f]{3,8})/gi

/** Divide em head+corpo para nunca tocar o <style> do head. */
export function splitAtBody(html: string): { head: string; body: string } {
  const m = /<body[^>]*>/i.exec(html)
  if (!m || m.index === undefined) return { head: "", body: html }
  const cut = m.index + m[0].length
  return { head: html.slice(0, cut), body: html.slice(cut) }
}

/**
 * A declaração (`style="…"` ou regra CSS) que contém o offset — a mesma
 * régua do `declarationContext` do enxerto da hero: quem decide o papel de
 * uma ocorrência é o bloco de estilo dela, não uma janela de N caracteres.
 */
function declarationAt(body: string, offset: number): string {
  // A aspa SIMPLES não delimita: ela aparece dentro da própria cadeia de
  // fontes (`'Playfair Display', Georgia, 'Times New Roman', serif`). Cortar
  // ali fazia o font-weight ao lado sumir do inventário.
  const OPEN = `"{>`
  const CLOSE = `"}<`
  let start = offset
  while (start > 0 && !OPEN.includes(body[start - 1])) start--
  let end = offset
  while (end < body.length && !CLOSE.includes(body[end])) end++
  return body.slice(start, end)
}

function tagAt(body: string, offset: number): string {
  const before = body.slice(Math.max(0, offset - 400), offset)
  const m = before.match(/<([a-zA-Z][a-zA-Z0-9]*)[^<]*$/)
  return m ? m[1].toLowerCase() : "?"
}

/**
 * Texto do elemento que carrega o estilo — o PRIMEIRO trecho de texto, sem
 * atravessar a próxima declaração de fonte. Varrer uma janela fixa juntava o
 * email inteiro num item só (a hero da Innova saía com o cupom, o CTA e o
 * rodapé colados).
 */
function textAt(body: string, offset: number): string {
  const tagEnd = body.indexOf(">", offset)
  if (tagEnd === -1) return ""
  let pos = tagEnd + 1
  const limite = Math.min(body.length, tagEnd + 2000)
  let texto = ""
  while (pos < limite) {
    const prox = body.indexOf("<", pos)
    const fim = prox === -1 ? limite : prox
    texto += ` ${body.slice(pos, fim)}`
    if (texto.trim().length > 0) break
    if (prox === -1) break
    const tagFim = body.indexOf(">", prox)
    if (tagFim === -1) break
    // Outra declaração de fonte começa aqui: o texto dali em diante é do
    // próximo item do inventário, não deste.
    if (/font-family\s*:/i.test(body.slice(prox, tagFim))) break
    pos = tagFim + 1
  }
  return texto.replace(/\s+/g, " ").trim().slice(0, 80)
}

function numberIn(decl: string, prop: string): number | null {
  const m = new RegExp(`${prop}\\s*:\\s*([\\d.]+)px`, "i").exec(decl)
  return m ? Math.round(parseFloat(m[1])) : null
}

/** "bold"/"bolder" viram 700; nome desconhecido vira null (não se inventa). */
export function parseWeight(decl: string): number | null {
  const m = /font-weight\s*:\s*([a-z]+|\d{3})/i.exec(decl)
  if (!m) return null
  const raw = m[1].toLowerCase()
  if (/^\d{3}$/.test(raw)) return Number(raw)
  if (raw === "bold" || raw === "bolder") return 700
  if (raw === "normal") return 400
  return null
}

/** Luminância relativa simplificada — decide o "fundo escuro" da regra 8. */
export function isDarkHex(hex: string | null): boolean {
  if (!hex) return false
  let h = hex.replace("#", "")
  if (h.length === 3) h = h.split("").map((c) => c + c).join("")
  if (h.length < 6) return false
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  if ([r, g, b].some(Number.isNaN)) return false
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5
}

/**
 * Fundo em vigor no offset: a última cor de fundo declarada antes dele.
 * Heurística assumida: em email de tabela o fundo da seção é declarado no
 * `<td>`/`<table>` que abre a seção, sempre ANTES do texto dentro dela.
 */
function backgroundAt(body: string, offset: number): string | null {
  const re = new RegExp(BG_RE.source, BG_RE.flags)
  let last: string | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    if (m.index > offset) break
    last = m[1].toUpperCase()
  }
  return last
}

/** Marcador de bloco em vigor no offset (o último aberto antes dele). */
function blockAt(
  body: string,
  offset: number,
): { blockIndex: number | null; section: string | null } {
  const re = new RegExp(BLOCK_MARKER_RE.source, BLOCK_MARKER_RE.flags)
  let block: { blockIndex: number; section: string } | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    if (m.index > offset) break
    block = { blockIndex: Number(m[1]), section: m[2] }
  }
  return block ?? { blockIndex: null, section: null }
}

/** Sem letra nem dígito: aspa decorativa, seta, dingbat — é ornamento. */
export function soPontuacao(text: string): boolean {
  const semEntidades = text.replace(/&[a-z]+\d*;|&#\d+;/gi, "")
  return semEntidades.trim().length > 0
    ? !/[\p{L}\p{N}]/u.test(semEntidades)
    : true
}

/**
 * Lista numerada de todas as declarações de fonte do corpo do email.
 * A ordem É o contrato: `applyTypographyOps` percorre igual.
 */
export function extractTypographyInventory(html: string): TypographyOccurrence[] {
  const { body } = splitAtBody(html)
  const out: TypographyOccurrence[] = []
  const re = new RegExp(FONT_FAMILY_RE.source, FONT_FAMILY_RE.flags)
  let m: RegExpExecArray | null
  let index = 0
  while ((m = re.exec(body)) !== null) {
    const decl = declarationAt(body, m.index)
    const tag = tagAt(body, m.index)
    const text = textAt(body, m.index)
    const bg = backgroundAt(body, m.index)
    const { blockIndex, section } = blockAt(body, m.index)
    const trackingMatch = /letter-spacing\s*:\s*(-?[\d.]+(?:px|em))/i.exec(decl)
    out.push({
      index,
      blockIndex,
      section,
      tag,
      family: m[1].trim().slice(0, 80),
      sizePx: numberIn(decl, "font-size"),
      weight: parseWeight(decl),
      uppercase: /text-transform\s*:\s*uppercase/i.test(decl),
      tracking: trackingMatch ? trackingMatch[1] : null,
      bg,
      bgDark: isDarkHex(bg),
      // O rótulo do botão é o <a>/<button>: é onde a família nunca entra.
      isCta: tag === "a" || tag === "button",
      soPontuacao: soPontuacao(text),
      text,
    })
    index++
  }
  return out
}

/** O inventário como o agente lê — uma entrada por linha, sem HTML. */
export function renderInventoryForPrompt(
  occurrences: TypographyOccurrence[],
): string {
  const linhas = occurrences.map((o) => {
    const onde = o.blockIndex !== null ? `bloco ${o.blockIndex} (${o.section})` : "fora de bloco"
    const partes = [
      `${o.family.split(",")[0].trim()} ${o.sizePx ?? "?"}px`,
      `peso ${o.weight ?? "herdado"}`,
      o.uppercase ? "CAIXA ALTA" : "caixa normal",
      o.tracking ? `tracking ${o.tracking}` : "sem tracking",
    ]
    const marcas = [
      o.bg ? `fundo ${o.bg}${o.bgDark ? " (escuro)" : " (claro)"}` : null,
      o.isCta ? "rótulo de link/botão" : null,
      o.soPontuacao ? "só pontuação (ornamento)" : null,
    ].filter(Boolean)
    return [
      `#${o.index} ${onde} · <${o.tag}>`,
      `    ${partes.join(" · ")}`,
      marcas.length > 0 ? `    ${marcas.join(" · ")}` : null,
      o.text ? `    texto: "${o.text}"` : null,
    ]
      .filter(Boolean)
      .join("\n")
  })
  return linhas.join("\n\n")
}
