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
 * cores por valor canônico. Ordena por ocorrências desc.
 */
export function extractColorInventory(html: string): ColorInventoryEntry[] {
  const acc = new Map<string, { count: number; ctx: Map<ColorContext, number> }>()
  const add = (canonical: string, idx: number) => {
    const cur = acc.get(canonical) ?? {
      count: 0,
      ctx: new Map<ColorContext, number>(),
    }
    cur.count++
    const c = contextOf(html, idx)
    cur.ctx.set(c, (cur.ctx.get(c) ?? 0) + 1)
    acc.set(canonical, cur)
  }
  for (const m of html.matchAll(HEX_RE)) {
    add(canonicalHex(m[0]), m.index ?? 0)
  }
  for (const m of html.matchAll(RGB_RE)) {
    const hex = rgbToHex(Number(m[1]), Number(m[2]), Number(m[3]))
    if (hex) add(hex, m.index ?? 0)
  }
  return Array.from(acc.entries())
    .map(([valor, v]) => ({
      valor,
      ocorrencias: v.count,
      // Papel mais usado primeiro — a ordem sugere onde a troca rende mais.
      contextos: Object.fromEntries(
        Array.from(v.ctx.entries()).sort((a, b) => b[1] - a[1]),
      ) as Partial<Record<ColorContext, number>>,
    }))
    .sort((a, b) => b.ocorrencias - a.ocorrencias)
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
