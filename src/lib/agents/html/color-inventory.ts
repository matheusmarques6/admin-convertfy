/**
 * color-inventory — extrator + aplicador de recolor da arquitetura por
 * views (F4, agente Cores & Botões).
 *
 * O agente color_format NÃO recebe mais o documento: recebe um INVENTÁRIO
 * de cores extraído por código ({valor, ocorrencias, contextos}) e emite
 * ops `recolor {from, to, where?}` — troca POR VALOR DE COR, aplicada por
 * código em todas as formas textuais equivalentes (#AABBCC, #abc,
 * rgb(r,g,b)). Atômico: impossível quebrar estrutura HTML trocando cor.
 *
 * ESCOPO POR CONTEXTO (20/08): sem `where`, a troca é global — o
 * comportamento histórico. Com `where`, só as ocorrências daquele papel
 * (background / color / border / bgcolor / css-var / outro) mudam.
 *
 * Por que existe: as cores DOMINANTES de um email são dominantes porque
 * servem a vários papéis (#000000 é fundo de botão E texto de corpo). O
 * prompt manda conformar a identidade, mas a troca global não tem
 * resposta correta para elas — e o agente, certo, pulava. Na Luxe Lift
 * (20/08) isso deixou 114 de 132 ocorrências fora da marca: as 11 ops
 * emitidas só alcançaram cores de 2-3 ocorrências. Com escopo, "fundo de
 * botão preto" e "texto preto" viram decisões separadas.
 *
 * `contextos` é um MAPA contexto→contagem (não uma lista): o agente
 * precisa saber que #000000 é 30x texto e 12x fundo para escolher onde
 * mexer. A lista sozinha só dizia que havia conflito.
 *
 * Puro (zero I/O) — testável.
 */

/** Papéis que `contextOf` sabe distinguir — vocabulário fechado do `where`. */
export const COLOR_CONTEXTS = [
  "background",
  "color",
  "border",
  "bgcolor",
  "css-var",
  "outro",
] as const

export type ColorContext = (typeof COLOR_CONTEXTS)[number]

export function isColorContext(s: unknown): s is ColorContext {
  return typeof s === "string" && (COLOR_CONTEXTS as readonly string[]).includes(s)
}

export interface ColorInventoryEntry {
  /** Valor canônico (#AABBCC maiúsculo). */
  valor: string
  /** Total de ocorrências no documento (todas as formas). */
  ocorrencias: number
  /**
   * Contexto → quantas ocorrências naquele papel, do mais frequente ao
   * menos. É o que permite ao agente escopar a op em vez de pular a cor.
   */
  contextos: Partial<Record<ColorContext, number>>
  /**
   * Só para cor usada como TEXTO: sobre quais fundos ela pousa, e quantas
   * vezes em cada um. É o dado que faltava — o agente via `#FFFFFF` como
   * uma linha só, somando o branco da hero escura, o do container e o do
   * botão, e trocar o fundo debaixo de um deles era invisível para ele.
   * Fundo em foto entra como "imagem".
   */
  sobre?: Record<string, number>
  /** Pior contraste desta cor de texto no documento (null = só sobre foto). */
  contraste_min?: number | null
  /**
   * Só para cor usada como FUNDO: a maior largura declarada, em px, do
   * container que ela pinta.
   *
   * É a única medida de ÁREA do inventário. Sem ela o agente enxerga um
   * ranking de CONTAGEM, e contagem não é peso visual: na Luxe Lift
   * (24/08) o `#B1B3B6` que pinta a seção inteira de produtos entrava em
   * 18º de 20 com `ocorrencias: 1`, enquanto o `#130E31` de uma borda de
   * 1px entrava em 3º com 24 — a hairline pesando 24× mais que o fundo do
   * bloco. Não era regra dura ("1 ocorrência não conta"): o `#E8E8E8`,
   * também com 1 e também fundo, FOI recolorido. O agente escolhia sem o
   * dado.
   *
   * Ausente quando a largura não está declarada no próprio tag (fundo em
   * `<td>` cujo `<table>` pai carrega a largura, ou largura em %) — falso
   * negativo silencioso, que é o lado seguro do erro.
   */
  cobre_px?: number
  /**
   * Só para cor usada como FUNDO: sobre quais fundos ELA pousa, e quantas
   * vezes. É o espelho do `sobre` do texto, e existe pela mesma razão — o
   * agente não vê o documento, então o que não chega no inventário ele não
   * sabe.
   *
   * O que faltava saber: que `#D9D9D9` é um PAINEL dentro de `#FFFFFF`.
   * Sem isso o agente mandou os dois para o mesmo destino em quatro
   * gerações seguidas (Luxe Lift, 23-24/08) — decisão que apaga o painel e
   * que ele não tinha como enxergar como tal. Fundo em foto entra como
   * "imagem"; sem fundo declarado acima, o canvas do Montador.
   */
  dentro_de?: Record<string, number>
}

// Hex completo/curto e rgb()/rgba() — as formas que emails usam na prática.
//
// O `(?<!&)` não é detalhe: referência numérica de caractere tem a forma
// `&#847;`, e o `#847` de dentro dela casa como hex de três dígitos. O
// spacer do preheader é `&#847;&zwnj;&nbsp;` repetido cinco vezes, então o
// inventário do email da Luxe Lift (12/08) listava `#884477` — expansão de
// `#847` — com exatamente 5 ocorrências. Cor que não existe em lugar nenhum
// do documento. O agente de cor, fazendo o certo pela informação errada,
// gastou sua ÚNICA op tentando corrigi-la; a op foi rejeitada por
// `find_not_found` e o email saiu sem nenhuma cor de marca.
const HEX_RE = /(?<!&)#([0-9a-f]{6}|[0-9a-f]{3})\b/gi
const RGB_RE = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)/gi

/** #abc → #AABBCC; #aabbcc → #AABBCC. */
export function canonicalHex(raw: string): string {
  const h = raw.replace("#", "").toLowerCase()
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h
  return `#${full.toUpperCase()}`
}

function rgbToHex(r: number, g: number, b: number): string | null {
  if ([r, g, b].some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null
  const to2 = (n: number) => n.toString(16).padStart(2, "0")
  return `#${to2(r)}${to2(g)}${to2(b)}`.toUpperCase()
}

// Largura a partir da qual um fundo é SEÇÃO, não chip. O container do e-mail
// tem 600px: 400 é "atravessa a largura", e deixa de fora fundo de botão
// (~260px), pílula e badge, que não competem com a superfície do bloco.
const LARGURA_DE_SECAO = 400

// `(?!\d|%)` — `width="100%"` é a largura mais comum de e-mail (o wrapper) e
// sem a guarda ela entraria como 100px: um container que atravessa a tela
// registrado como estreito. Percentual não é medida de área aqui: sem saber
// de quê é a porcentagem, não há px a declarar.
const WIDTH_ATTR = /\swidth\s*=\s*"?(\d{2,4})(?!\d|%)/i
const WIDTH_CSS = /(?:^|[;\s"])(?:max-|min-)?width\s*:\s*(\d{2,4})px/gi

/**
 * Maior largura em px declarada NO PRÓPRIO tag de abertura.
 *
 * Só o próprio tag, de propósito: subir a árvore atrás da largura de um
 * ancestral creditaria 598px a um `<span>` de destaque dentro da seção, e
 * uma medida de área inflada é pior que medida nenhuma — mandaria o agente
 * tratar um grifo como fundo de bloco. No documento entregue da Luxe Lift,
 * 29 das 53 declarações de fundo trazem a largura no mesmo tag.
 */
export function declaredWidth(openTag: string): number | null {
  const larguras: number[] = []
  const attr = WIDTH_ATTR.exec(openTag)
  if (attr) larguras.push(Number(attr[1]))
  for (const m of openTag.matchAll(WIDTH_CSS)) larguras.push(Number(m[1]))
  return larguras.length ? Math.max(...larguras) : null
}

/**
 * Tag de ABERTURA que contém o offset — null quando o offset não está
 * dentro de um.
 *
 * O `>` anterior ao offset é o que separa os dois casos: a cor de uma regra
 * dentro de `<style>` tem como `<` mais próximo o do próprio `<style>`, cujo
 * `>` já ficou para trás. Sem essa guarda, toda cor do bloco de dark mode
 * herdaria a largura do primeiro tag do documento.
 */
function openTagAt(html: string, idx: number): string | null {
  const lt = html.lastIndexOf("<", idx)
  if (lt === -1 || !/[a-zA-Z]/.test(html[lt + 1] ?? "")) return null
  const gt = html.indexOf(">", lt)
  if (gt === -1 || gt < idx) return null
  return html.slice(lt, gt + 1)
}

/**
 * Contexto da ocorrência a partir do trecho imediatamente anterior.
 * Exportado porque o inventário e o aplicador PRECISAM usar a mesma
 * régua: o agente escolhe pelo que o inventário mostrou, e o recolor
 * escopado tem de casar exatamente aquelas ocorrências.
 */
export function contextOf(html: string, idx: number): ColorContext {
  const before = html.slice(Math.max(0, idx - 60), idx).toLowerCase()
  if (/bgcolor\s*=\s*["']?$/.test(before)) return "bgcolor"
  if (/--[a-z0-9-]+\s*:\s*$/.test(before)) return "css-var"
  if (/background(?:-color)?\s*:\s*$/.test(before)) return "background"
  if (/border[a-z-]*\s*:[^;]*$/.test(before)) return "border"
  if (/[^-]color\s*:\s*$/.test(before)) return "color"
  return "outro"
}

/**
 * Varre o documento (inclui blocos <style> — dark mode entra) e agrega
 * cores por valor canônico. Ordena fundo de seção primeiro (por largura) e
 * depois por ocorrências desc.
 *
 * Os campos `sobre`/`contraste_min` da entrada NÃO são preenchidos aqui:
 * quem os anota é `annotateInventoryPairs` (color-contrast.ts), que precisa
 * do DOM. Manter a dependência nessa direção evita import circular —
 * color-contrast já consome o `canonicalHex` daqui.
 */
export function extractColorInventory(html: string): ColorInventoryEntry[] {
  const acc = new Map<
    string,
    { count: number; ctx: Map<ColorContext, number>; largura: number }
  >()
  const add = (canonical: string, idx: number) => {
    const cur = acc.get(canonical) ?? {
      count: 0,
      ctx: new Map<ColorContext, number>(),
      largura: 0,
    }
    cur.count++
    const c = contextOf(html, idx)
    cur.ctx.set(c, (cur.ctx.get(c) ?? 0) + 1)
    // Área só faz sentido para FUNDO: a largura do tag onde um `color:` mora
    // é a largura do container, não a do texto.
    if (c === "background" || c === "bgcolor") {
      const tag = openTagAt(html, idx)
      const w = tag ? declaredWidth(tag) : null
      if (w && w > cur.largura) cur.largura = w
    }
    acc.set(canonical, cur)
  }
  for (const m of html.matchAll(HEX_RE)) {
    add(canonicalHex(m[0]), m.index ?? 0)
  }
  for (const m of html.matchAll(RGB_RE)) {
    const hex = rgbToHex(Number(m[1]), Number(m[2]), Number(m[3]))
    if (hex) add(hex, m.index ?? 0)
  }
  const entries: ColorInventoryEntry[] = Array.from(acc.entries()).map(
    ([valor, v]) => ({
      valor,
      ocorrencias: v.count,
      // Papel mais usado primeiro — a ordem sugere onde a troca rende mais.
      contextos: Object.fromEntries(
        Array.from(v.ctx.entries()).sort((a, b) => b[1] - a[1]),
      ) as Partial<Record<ColorContext, number>>,
      ...(v.largura > 0 ? { cobre_px: v.largura } : {}),
    }),
  )

  // Fundo de SEÇÃO primeiro, e só depois a contagem.
  //
  // Ordenar só por ocorrências é um ranking de FREQUÊNCIA apresentado como
  // ranking de importância: a borda de 1px repetida 24 vezes chegava antes
  // do fundo do bloco inteiro, que aparece uma vez. O agente lê a lista de
  // cima para baixo e tem orçamento de ops — a ordem é uma recomendação,
  // ainda que nunca tenha sido escrita como tal.
  const secao = (e: ColorInventoryEntry) => (e.cobre_px ?? 0) >= LARGURA_DE_SECAO
  return entries.sort((a, b) => {
    if (secao(a) !== secao(b)) return secao(a) ? -1 : 1
    if (secao(a) && a.cobre_px !== b.cobre_px) return b.cobre_px! - a.cobre_px!
    return b.ocorrencias - a.ocorrencias
  })
}

/**
 * Total de ocorrências de cor no documento — denominador do `brand_share`
 * da telemetria (quanto do email o recolor alcançou).
 */
export function colorOccurrenceCount(html: string): number {
  return extractColorInventory(html).reduce((s, e) => s + e.ocorrencias, 0)
}

/** Cor aceitável numa op recolor (hex 3/6). O parse rejeita o resto. */
export function isColorLiteral(s: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim())
}

/**
 * Troca as formas textuais da cor `from` pela cor `to` (literal): hex
 * completo, hex curto equivalente e rgb(r,g,b)/rgba(r,g,b,a) — o alpha do
 * rgba é preservado. Case-insensitive.
 *
 * `where` restringe ao papel daquela ocorrência (mesma régua do
 * inventário, via `contextOf`); omitido = troca global, comportamento
 * histórico.
 *
 * As trocas são coletadas ANTES e aplicadas de TRÁS PRA FRENTE. Sem isso
 * o escopo seria uma armadilha: `contextOf` julga pelos 60 chars
 * anteriores, e um `to` de comprimento diferente do `from` empurra todos
 * os offsets seguintes — a segunda ocorrência seria avaliada contra a
 * posição errada do documento. Ninguém percebe em teste com cores de
 * mesmo tamanho; quebra em produção no primeiro `rgb()` → `#hex`.
 */
export function applyRecolor(
  html: string,
  from: string,
  to: string,
  where?: ColorContext,
): { html: string; replaced: number } {
  const canonical = canonicalHex(from)
  const full = canonical.slice(1) // AABBCC
  // `(?<!&)` — o `#` NÃO pode vir logo depois de um `&`: aí ele não é
  // cor, é entidade HTML numérica. O preheader usa `&#847;` (combining
  // grapheme joiner) como espaçador invisível, e um recolor de #884477
  // monta a forma curta `#847`, que casava DENTRO da entidade — o `\b`
  // vale entre o `7` e o `;`. Na Luxe Lift (10/08) uma única op de cor
  // transformou `&#847;` em `&#3D2820;` e quebrou o preheader de todos
  // os emails que usam esse espaçador (ou seja, o padrão da biblioteca).
  const forms: RegExp[] = []
  forms.push(new RegExp(`(?<!&)#${full}\\b`, "gi"))
  // Forma curta só existe quando os pares se repetem (AABBCC → ABC).
  if (full[0] === full[1] && full[2] === full[3] && full[4] === full[5]) {
    forms.push(new RegExp(`(?<!&)#${full[0]}${full[2]}${full[4]}\\b`, "gi"))
  }
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  const rgbForm = new RegExp(
    `rgba?\\(\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\s*(,\\s*[\\d.]+\\s*)?\\)`,
    "gi",
  )

  // to em rgba, preservando o alpha da origem.
  const toRgba = (alpha: string): string => {
    const toFull = canonicalHex(to).slice(1)
    const tr = parseInt(toFull.slice(0, 2), 16)
    const tg = parseInt(toFull.slice(2, 4), 16)
    const tb = parseInt(toFull.slice(4, 6), 16)
    return `rgba(${tr}, ${tg}, ${tb}${alpha.replace(/\s+$/, "")})`
  }

  interface Hit {
    start: number
    end: number
    replacement: string
  }
  const hits: Hit[] = []
  const collect = (re: RegExp, replacementOf: (m: RegExpExecArray) => string) => {
    for (const m of html.matchAll(re)) {
      const start = m.index ?? 0
      // Escopo: o papel é julgado no documento ORIGINAL, igual ao
      // inventário que o agente leu.
      if (where && contextOf(html, start) !== where) continue
      hits.push({ start, end: start + m[0].length, replacement: replacementOf(m) })
    }
  }
  for (const re of forms) collect(re, () => to)
  collect(rgbForm, (m) => (m[1] ? toRgba(m[1]) : to))

  if (hits.length === 0) return { html, replaced: 0 }

  // Desc por posição: cada splice só mexe em offsets maiores que ele.
  hits.sort((a, b) => b.start - a.start)
  let out = html
  let replaced = 0
  let lastStart = Number.POSITIVE_INFINITY
  for (const h of hits) {
    // Guarda anti-sobreposição (formas distintas não colidem na prática,
    // mas um splice sobre outro corromperia o documento em silêncio).
    if (h.end > lastStart) continue
    out = out.slice(0, h.start) + h.replacement + out.slice(h.end)
    lastStart = h.start
    replaced++
  }
  return { html: out, replaced }
}

// ── Guard de paleta (02/09) ─────────────────────────────────────────────

/** Saturação e luminosidade HSL de um hex canônico. */
export function hslDe(hex: string): { s: number; l: number } {
  const full = canonicalHex(hex).slice(1)
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  return { s, l }
}

export interface CorForaDaPaleta {
  valor: string
  /** Papel dominante da cor no documento (o que decide o destino). */
  contexto: ColorContext
  ocorrencias: number
  para: string
}

/**
 * Cores SATURADAS que o agente de cor deixou no documento e que não são
 * papel da paleta.
 *
 * Innova Bay, 02/09: o `#D00000` do exemplo da variante body-4 (itens e
 * títulos das colunas) estava no inventário de 149 ocorrências, o agente
 * emitiu 15 ops trocando pretos e cinzas pelo verde da marca e não mapeou
 * o vermelho. Fail-open sem guard: a cor da biblioteca foi ao cliente.
 *
 * A régua é conservadora: só cor com saturação alta (s > 0,5) e fora dos
 * extremos de luminosidade — o vermelho de exemplo, não um cinza de borda
 * nem um branco quase-branco. Cinza/neutro fora da paleta é escolha de
 * design que o agente já viu e deixou; vermelho de biblioteca não é.
 *
 * Destino por papel: texto → `accent` (uma cor saturada em texto é
 * ênfase, e ênfase da marca é o accent); fundo → `surface`; borda →
 * `accent`. O aplicador (`applyOps`) traz a guarda de contraste — texto
 * que ficar ilegível sobre o fundo é reescrito por ela.
 */
export function coresForaDaPaleta(
  html: string,
  paleta: { text: string; accent: string; surface: string; heading?: string; bg?: string; button_bg?: string; button_text?: string; surface_strong?: string },
): CorForaDaPaleta[] {
  const aprovadas = new Set(
    [paleta.text, paleta.accent, paleta.surface, paleta.heading, paleta.bg, paleta.button_bg, paleta.button_text, paleta.surface_strong, "#FFFFFF", "#000000"]
      .filter((c): c is string => typeof c === "string" && isColorLiteral(c))
      .map(canonicalHex),
  )
  const out: CorForaDaPaleta[] = []
  for (const e of extractColorInventory(html)) {
    const valor = canonicalHex(e.valor)
    if (aprovadas.has(valor)) continue
    const { s, l } = hslDe(valor)
    if (s <= 0.5 || l < 0.12 || l > 0.9) continue
    const contexto = (Object.entries(e.contextos).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ??
      "outro") as ColorContext
    if (contexto === "css-var" || contexto === "outro") continue
    const para =
      contexto === "background" || contexto === "bgcolor" ? paleta.surface : paleta.accent
    if (!isColorLiteral(para) || canonicalHex(para) === valor) continue
    out.push({ valor, contexto, ocorrencias: e.ocorrencias, para: canonicalHex(para) })
  }
  return out
}
