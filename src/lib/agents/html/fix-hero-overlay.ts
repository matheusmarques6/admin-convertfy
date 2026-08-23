/**
 * fix-hero-overlay — escurece o texto sobreposto quando a FOTO de fundo
 * saiu clara.
 *
 * Irmão de `fix-dark-canvas.ts`: mesma ideia (uma correção cirúrgica de
 * legibilidade, por código, com o corte 0.55 de luminância), do outro lado
 * do problema. Lá o canvas escuro engolia o container; aqui o texto claro
 * some sobre a foto clara.
 *
 * Por que não dá para resolver no agente de cor: o fundo da hero é um
 * `background-image`, não um hex. `auditContrast` devolve `kind:"image"` ali
 * de propósito — contraste sobre bitmap não se calcula com aritmética de
 * cor. Quem sabe é a medição da imagem gerada
 * (`image/overlay-luminance.ts`), e é ela que dispara este transform.
 *
 * O alvo é a URL, não a região do bloco: `review 7` tem TRÊS bandas com
 * overlay no mesmo bloco e cada uma tem a sua luminância. Corrigir o bloco
 * inteiro escureceria também o texto que pousa na foto escura — o defeito
 * oposto. A URL é única por slot e já está no documento.
 *
 * Escopo deliberado: só as declarações de texto CLARO que pousam direto na
 * imagem alvo. Botão com fundo sólido próprio sobre a mesma foto fica
 * intacto — o `#3D2820` da hero da Luxe Lift está em 11:1 e escurecer o
 * rótulo dele o tornaria ilegível.
 *
 * Puro (zero I/O) — testável.
 */

import { relativeLuminance } from "./color-roles"
import { buildAncestorChain } from "./dom-locator"
import { resolveEffectiveBackground } from "./color-contrast"
import { canonicalHex } from "./color-inventory"

/** Acima disto, a cor é "clara" — mesmo corte de fix-dark-canvas. */
const LIGHT_TEXT_MIN = 0.55

const HEX = "#(?:[0-9a-f]{6}|[0-9a-f]{3})"
const TEXT_COLOR_RE = new RegExp(`(^|[^-\\w])color\\s*:\\s*(${HEX})`, "gi")

/**
 * Duas URLs apontam para o mesmo arquivo?
 *
 * Compara SEM query string: as URLs do storage são assinadas, e o token da
 * que foi persistida em `content.images` pode não ser o mesmo que o agente
 * de hero escreveu no documento. O caminho do objeto é o que identifica o
 * arquivo.
 */
export function sameAsset(a: string, b: string): boolean {
  const path = (u: string) => u.trim().split("#")[0].split("?")[0]
  const pa = path(a)
  const pb = path(b)
  return pa.length > 0 && pa === pb
}

export interface FixHeroOverlayResult {
  html: string
  /** Declarações de texto escurecidas. */
  fixed: number
}

/**
 * Troca por `darkText` as cores CLARAS de texto cujo fundo efetivo é a
 * imagem `targetUrl`.
 *
 * URL ausente do documento → devolve o HTML intacto. É o caso do slot cuja
 * URL nunca chegou ao HTML (token de imagem dentro de `style`, que o
 * slot-finder não preenche): não agir é o certo.
 */
export function fixHeroOverlayText(
  html: string,
  targetUrl: string,
  darkText: string,
): FixHeroOverlayResult {
  if (!targetUrl.trim()) return { html, fixed: 0 }

  const chainAt = buildAncestorChain(html)
  const alvos: Array<{ offset: number; len: number }> = []

  for (const m of html.matchAll(TEXT_COLOR_RE)) {
    const offset = (m.index ?? 0) + m[0].length - m[2].length
    if (relativeLuminance(canonicalHex(m[2])) < LIGHT_TEXT_MIN) continue
    // Só o que pousa NESTA foto. Texto sobre fundo sólido (um botão dentro
    // da hero) tem contraste próprio; texto sobre outra foto tem outra
    // medição.
    const bg = resolveEffectiveBackground(html, offset, chainAt)
    if (bg.kind !== "image" || !bg.url || !sameAsset(bg.url, targetUrl)) {
      continue
    }
    alvos.push({ offset, len: m[2].length })
  }

  if (alvos.length === 0) return { html, fixed: 0 }

  // De trás pra frente: cada splice só desloca offsets maiores que ele.
  let out = html
  for (const a of [...alvos].sort((x, y) => y.offset - x.offset)) {
    out = out.slice(0, a.offset) + darkText + out.slice(a.offset + a.len)
  }
  return { html: out, fixed: alvos.length }
}
