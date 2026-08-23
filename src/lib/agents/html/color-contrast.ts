/**
 * color-contrast — resolve o FUNDO EFETIVO de uma declaração de cor e mede
 * o contraste do par.
 *
 * Por que existe: em lugar nenhum do pipeline existia o dado "este texto
 * está SOBRE aquele fundo". O agente de cor recebe um inventário plano
 * (`{valor, ocorrencias, contextos}`) e `contextOf` olha 60 caracteres para
 * trás — sabe o PAPEL da declaração, nunca sobre o quê ela está. Resultado
 * medido na Luxe Lift (22/08): o agente trocou `#BEBEBE → #FAF5F3` no fundo
 * de um botão, o que pelas regras dele estava certo, e o `color:#FFFFFF` do
 * rótulo ficou intacto — contraste 1,05:1, texto invisível. A "guarda de
 * contraste" que existia comparava strings de destino de ops da mesma
 * execução e não barrou nada.
 *
 * Contraste é aritmética (luminância relativa WCAG), não julgamento. As
 * funções já existiam em `color-roles.ts` e nunca eram chamadas no caminho
 * que decide as cores do documento.
 *
 * Puro (zero I/O) — testável.
 */

import { buildAncestorChain, type Range } from "./dom-locator"
import { contrastRatio, relativeLuminance } from "./color-roles"
import { canonicalHex, type ColorInventoryEntry } from "./color-inventory"

export { contrastRatio, relativeLuminance }

/**
 * Fundo sob uma declaração de cor.
 *
 * `image` não é ignorância: é a hero, onde o fundo é uma FOTO. Chutar um hex
 * ali (ou assumir o branco do container) produziria um veredito de contraste
 * sobre algo que não existe — pior que não decidir. Quem resolve esse caso é
 * a medição da imagem gerada, não esta função.
 */
export type EffectiveBg =
  | { kind: "color"; hex: string }
  | { kind: "image" }
  | { kind: "unknown" }

/**
 * Fundo do container padrão do e-mail. O Montador fixa o wrapper de 600px em
 * branco (`architect/assemble-document.ts`), então texto sem nenhum fundo
 * declarado acima pousa nele.
 */
export const DEFAULT_CANVAS = "#FFFFFF"

const HEX = "#(?:[0-9a-f]{6}|[0-9a-f]{3})"

/** Primeiro hex de uma declaração `background`/`background-color`. */
function bgFromStyle(openTag: string): EffectiveBg | null {
  const style = /style\s*=\s*"([^"]*)"/i.exec(openTag)?.[1]
  if (style) {
    // Imagem vence: `background:#FFF url(...)` é foto, não cor chapada.
    if (/background(?:-image)?\s*:[^;]*url\s*\(/i.test(style)) {
      return { kind: "image" }
    }
    const m =
      new RegExp(`background-color\\s*:\\s*(${HEX})`, "i").exec(style) ??
      new RegExp(`background\\s*:\\s*(?:[^;]*?\\s)?(${HEX})`, "i").exec(style)
    if (m) return { kind: "color", hex: canonicalHex(m[1]) }
  }
  const bgcolor = new RegExp(`bgcolor\\s*=\\s*"?(${HEX})`, "i").exec(openTag)
  if (bgcolor) return { kind: "color", hex: canonicalHex(bgcolor[1]) }
  // `background="url"` como ATRIBUTO (padrão antigo de e-mail).
  if (/\sbackground\s*=\s*"[^"]*\S/i.test(openTag)) return { kind: "image" }
  return null
}

/** Trecho do tag de ABERTURA de um elemento, a partir do range dele. */
function openTagOf(html: string, range: Range): string {
  const end = html.indexOf(">", range.start)
  return end === -1 || end > range.end
    ? html.slice(range.start, range.end)
    : html.slice(range.start, end + 1)
}

/**
 * Sobe `[próprio, ...ancestrais]` até achar um fundo. O mais interno vence —
 * é o que o cliente de e-mail pinta por último.
 *
 * `chainAt` vem de `buildAncestorChain`: quem varre o documento inteiro passa
 * a MESMA closure para todas as consultas e paga uma indexação só.
 */
export function resolveEffectiveBackground(
  html: string,
  offset: number,
  chainAt: ReturnType<typeof buildAncestorChain>,
): EffectiveBg {
  const chain = chainAt(offset)
  if (!chain) return { kind: "unknown" }
  for (const el of chain) {
    const bg = bgFromStyle(openTagOf(html, el.range))
    if (bg) return bg
  }
  return { kind: "color", hex: DEFAULT_CANVAS }
}

// ── Limiar AA ─────────────────────────────────────────────────────────
//
// 4,5:1 para texto normal e 3:1 para texto GRANDE (WCAG 2.1: ≥24px, ou
// ≥18.66px com peso ≥700). Sem a distinção, metade dos títulos de e-mail —
// que são grandes de propósito — viraria falso positivo e o check perderia
// credibilidade no primeiro uso.
export const AA_NORMAL = 4.5
export const AA_LARGE = 3

export function isLargeText(styleDecl: string): boolean {
  const px = Number(/font-size\s*:\s*(\d+(?:\.\d+)?)px/i.exec(styleDecl)?.[1])
  if (!Number.isFinite(px)) return false
  if (px >= 24) return true
  const weightRaw = /font-weight\s*:\s*(\d{3}|bold)/i.exec(styleDecl)?.[1]
  const bold = weightRaw === "bold" || Number(weightRaw) >= 700
  return bold && px >= 18.66
}

export interface ContrastFinding {
  /** Offset do VALOR da cor de texto no documento. */
  offset: number
  textHex: string
  /** null quando o fundo é foto ou indecidível. */
  bgHex: string | null
  /** null quando não dá para medir (fundo foto). */
  ratio: number | null
  /** Mínimo exigido para este texto (4.5 ou 3). */
  min: number
  large: boolean
  /** Por que não dá para medir, quando `ratio` é null. */
  motivo?: "fundo_imagem" | "fundo_desconhecido"
}

// Declaração de cor de TEXTO: `color: #hex` que não seja `background-color`
// nem `border-color`. O `[^-\w]` antes evita casar o sufixo dessas duas.
const TEXT_COLOR_RE = new RegExp(`(^|[^-\\w])color\\s*:\\s*(${HEX})`, "gi")

/**
 * Todos os pares texto↔fundo do documento que ficam abaixo do mínimo AA.
 *
 * Fundo em foto NÃO entra como reprovação: entra com `ratio: null` e motivo,
 * para quem quiser tratar (é a hero, resolvida medindo a imagem).
 */
export function auditContrast(html: string): ContrastFinding[] {
  const chainAt = buildAncestorChain(html)
  const out: ContrastFinding[] = []
  for (const m of html.matchAll(TEXT_COLOR_RE)) {
    const valueOffset = (m.index ?? 0) + m[0].length - m[2].length
    const textHex = canonicalHex(m[2])
    // O `style` inteiro da declaração, para decidir texto grande.
    const declStart = html.lastIndexOf('style="', valueOffset)
    const declEnd = declStart === -1 ? -1 : html.indexOf('"', declStart + 7)
    const styleDecl =
      declStart !== -1 && declEnd > valueOffset
        ? html.slice(declStart, declEnd)
        : ""
    const large = isLargeText(styleDecl)
    const min = large ? AA_LARGE : AA_NORMAL

    const bg = resolveEffectiveBackground(html, valueOffset, chainAt)
    if (bg.kind !== "color") {
      out.push({
        offset: valueOffset,
        textHex,
        bgHex: null,
        ratio: null,
        min,
        large,
        motivo: bg.kind === "image" ? "fundo_imagem" : "fundo_desconhecido",
      })
      continue
    }
    const ratio = contrastRatio(textHex, bg.hex)
    if (ratio >= min) continue
    out.push({ offset: valueOffset, textHex, bgHex: bg.hex, ratio, min, large })
  }
  return out
}

/**
 * Anota o inventário com os pares texto↔fundo.
 *
 * Vive aqui, e não em color-inventory, porque precisa do DOM — e porque
 * color-contrast já depende de color-inventory para o `canonicalHex`.
 * Inverter a direção criaria import circular.
 *
 * Só cores usadas como TEXTO ganham `sobre`/`contraste_min`. Cor que só
 * aparece como fundo não tem "sobre o quê" — anotá-la só incharia o prompt.
 */
export function annotateInventoryPairs(
  html: string,
  entries: ColorInventoryEntry[],
): ColorInventoryEntry[] {
  const chainAt = buildAncestorChain(html)
  const porTexto = new Map<string, Map<string, number>>()

  for (const m of html.matchAll(TEXT_COLOR_RE)) {
    const valueOffset = (m.index ?? 0) + m[0].length - m[2].length
    const textHex = canonicalHex(m[2])
    const bg = resolveEffectiveBackground(html, valueOffset, chainAt)
    const rotulo =
      bg.kind === "color" ? bg.hex : bg.kind === "image" ? "imagem" : "?"
    const mapa = porTexto.get(textHex) ?? new Map<string, number>()
    mapa.set(rotulo, (mapa.get(rotulo) ?? 0) + 1)
    porTexto.set(textHex, mapa)
  }

  return entries.map((e) => {
    const mapa = porTexto.get(e.valor)
    if (!mapa) return e
    const medidos = [...mapa.keys()].filter((k) => k.startsWith("#"))
    const pior = medidos.length
      ? Math.min(...medidos.map((bg) => contrastRatio(e.valor, bg)))
      : null
    return {
      ...e,
      sobre: Object.fromEntries(
        [...mapa.entries()].sort((a, b) => b[1] - a[1]),
      ),
      contraste_min: pior == null ? null : Number(pior.toFixed(2)),
    }
  })
}
