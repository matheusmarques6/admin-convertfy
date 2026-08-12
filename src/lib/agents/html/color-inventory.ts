/**
 * color-inventory — extrator + aplicador de recolor da arquitetura por
 * views (F4, agente Cores & Botões).
 *
 * O agente color_format NÃO recebe mais o documento: recebe um INVENTÁRIO
 * de cores extraído por código ({valor, ocorrencias, contextos}) e emite
 * ops `recolor {from, to}` — find/replace POR VALOR DE COR, aplicado
 * globalmente por código em todas as formas textuais equivalentes
 * (#AABBCC, #abc, rgb(r,g,b)). Atômico: impossível quebrar estrutura
 * HTML trocando cor.
 *
 * Limitação documentada: recolor é global — a mesma cor em contextos
 * diferentes troca junto. O inventário expõe os contextos justamente pra
 * o agente decidir NÃO emitir a op quando a cor tem papéis conflitantes.
 *
 * Puro (zero I/O) — testável.
 */

export interface ColorInventoryEntry {
  /** Valor canônico (#AABBCC maiúsculo). */
  valor: string
  /** Total de ocorrências no documento (todas as formas). */
  ocorrencias: number
  /** Onde aparece: background | color | border | bgcolor | css-var | outro. */
  contextos: string[]
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

/** Contexto da ocorrência a partir do trecho imediatamente anterior. */
function contextOf(html: string, idx: number): string {
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
  const acc = new Map<string, { count: number; ctx: Set<string> }>()
  const add = (canonical: string, idx: number) => {
    const cur = acc.get(canonical) ?? { count: 0, ctx: new Set<string>() }
    cur.count++
    cur.ctx.add(contextOf(html, idx))
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
      contextos: Array.from(v.ctx).sort(),
    }))
    .sort((a, b) => b.ocorrencias - a.ocorrencias)
}

/** Cor aceitável numa op recolor (hex 3/6). O parse rejeita o resto. */
export function isColorLiteral(s: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim())
}

/**
 * Troca TODAS as formas textuais da cor `from` pela cor `to` (literal):
 * hex completo, hex curto equivalente e rgb(r,g,b)/rgba(r,g,b,a) — o alpha
 * do rgba é preservado. Case-insensitive. Retorna o doc + nº de trocas.
 */
export function applyRecolor(
  html: string,
  from: string,
  to: string,
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

  let out = html
  let replaced = 0
  for (const re of forms) {
    out = out.replace(re, () => {
      replaced++
      return to
    })
  }
  out = out.replace(rgbForm, (_m, alpha: string | undefined) => {
    replaced++
    if (!alpha) return to
    // rgba com alpha: preserva a transparência convertendo `to` pra rgba.
    const toFull = canonicalHex(to).slice(1)
    const tr = parseInt(toFull.slice(0, 2), 16)
    const tg = parseInt(toFull.slice(2, 4), 16)
    const tb = parseInt(toFull.slice(4, 6), 16)
    return `rgba(${tr}, ${tg}, ${tb}${alpha.replace(/\s+$/, "")})`
  })
  return { html: out, replaced }
}
