/**
 * overlay-luminance — mede quão clara é a faixa da imagem que recebe texto
 * sobreposto.
 *
 * Por que existe: na hero, o texto é `color:#FFFFFF` sobre um
 * `background-image`. Branco é o CERTO para texto sobre foto — o problema é
 * a foto. Na Luxe Lift (22/08) o `image_spec` da variante pedia, com todas
 * as letras, "parede lisa em tom neutro quente ocupando os 43% superiores,
 * sem objeto nem sombra dura, PARA RECEBER TODO O OVERLAY". O modelo
 * entregou exatamente isso — em creme. O spec diz ONDE o overlay cai, nunca
 * QUÃO ESCURA a faixa precisa ser, e nada media a imagem depois.
 *
 * Aritmética de contraste sobre hex não alcança foto: o fundo ali não é um
 * valor, é um bitmap. A saída é medir.
 *
 * `sharp` já é dependência do pipeline (usada no resize de
 * `chains/image.chain.ts`).
 */

import sharp from "sharp"
import { logger } from "@/lib/logger"

const log = logger.child("OverlayLuminance")

/** Fração da altura ocupada pelo overlay quando o cadastro não diz. */
export const DEFAULT_OVERLAY_FRACTION = 0.45

/**
 * O campo é um slot cuja imagem recebe texto por cima?
 *
 * A régua é o texto do cadastro: os specs que têm overlay dizem isso
 * explicitamente ("sobrepostos aos 43% superiores", "para receber todo o
 * overlay"). Sem menção, a imagem é ilustração e o texto vive fora dela.
 */
export function hasOverlay(text: string | null | undefined): boolean {
  return /sobrepost|sobrepõe|overlay/i.test(text ?? "")
}

/**
 * Fração da altura que o overlay ocupa, lida do próprio cadastro
 * ("43% superiores" → 0.43). Sem número, o default.
 *
 * Só aceita 5%–95%: um "100%" viraria medir a foto inteira e diluiria a
 * faixa que interessa; abaixo de 5% a amostra é ruído.
 */
export function overlayFraction(text: string | null | undefined): number {
  const m =
    /(\d{1,3})\s*%\s*(?:superior|de cima|do topo|top|inferior|de baixo|da base|embaixo|bottom)/i.exec(
      text ?? "",
    )
  const pct = Number(m?.[1])
  if (!Number.isFinite(pct)) return DEFAULT_OVERLAY_FRACTION
  const frac = pct / 100
  return frac >= 0.05 && frac <= 0.95 ? frac : DEFAULT_OVERLAY_FRACTION
}

/** Lado da imagem que recebe o texto sobreposto. */
export type OverlaySide = "top" | "bottom"

export interface OverlaySpec {
  side: OverlaySide
  /** Fração da altura ocupada pelo overlay (0.05–0.95). */
  fraction: number
}

/**
 * O cadastro do campo descreve overlay? Onde e quanto?
 *
 * É a MESMA leitura que decide a instrução dada ao modelo de imagem e a
 * faixa que a medição de luminância confere depois. Um segundo parser em
 * outro módulo divergiria do primeiro no primeiro texto ambíguo, e aí a
 * imagem seria gerada com uma régua e auditada com outra.
 *
 * Sem lado explícito → `top`: é o padrão da biblioteca (das 15 declarações
 * de overlay, as que dizem o lado dizem "superiores"/"do topo").
 */
export function overlaySpec(text: string | null | undefined): OverlaySpec | null {
  if (!hasOverlay(text)) return null
  const t = text ?? ""
  const side: OverlaySide = /inferior|de baixo|da base|embaixo|bottom/i.test(t)
    ? "bottom"
    : "top"
  return { side, fraction: overlayFraction(t) }
}

/**
 * Luminância relativa média (0..1) da faixa que recebe o overlay.
 *
 * Usa a mesma linearização sRGB de `relativeLuminance` (WCAG 2.1), aplicada
 * às médias por canal que o `sharp` devolve — é a aproximação certa para
 * decidir "esta faixa aguenta texto branco?", e custa uma passada de stats
 * em vez de varrer pixel a pixel.
 *
 * Best-effort: qualquer falha devolve null e o chamador segue sem a
 * informação. Medir é polimento, não pode derrubar a geração da imagem.
 */
export async function measureOverlayLuminance(
  buffer: Buffer,
  fraction: number = DEFAULT_OVERLAY_FRACTION,
  side: OverlaySide = "top",
): Promise<number | null> {
  try {
    const img = sharp(buffer)
    const meta = await img.metadata()
    const w = meta.width ?? 0
    const h = meta.height ?? 0
    if (w <= 0 || h <= 0) return null

    const faixa = Math.max(1, Math.round(h * fraction))
    // O recorte é MATERIALIZADO antes do stats: `sharp().extract().stats()`
    // devolve as estatísticas da imagem de ENTRADA, ignorando as operações
    // do pipeline. Encadeado, uma hero com topo escuro e base clara media a
    // média das duas metades e a faixa que interessa sumia na conta.
    const recorte = await sharp(buffer)
      .extract({
        left: 0,
        top: side === "bottom" ? h - faixa : 0,
        width: w,
        height: faixa,
      })
      .toBuffer()
    const stats = await sharp(recorte).stats()

    const [r, g, b] = stats.channels
    if (!r || !g || !b) return null

    const lin = (mean: number) => {
      const c = mean / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * lin(r.mean) + 0.7152 * lin(g.mean) + 0.0722 * lin(b.mean)
  } catch (err) {
    log.warn("overlay_luminance.failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * A faixa é clara demais para texto branco?
 *
 * Mesmo corte de `fix-dark-canvas.ts` (0.55), que é onde o repo já traça a
 * fronteira claro/escuro. Manter o número igual evita duas réguas dizendo
 * coisas diferentes sobre a mesma pergunta.
 */
export const LIGHT_OVERLAY_THRESHOLD = 0.55

export function overlayIsLight(luminance: number | null): boolean {
  return luminance != null && luminance >= LIGHT_OVERLAY_THRESHOLD
}
