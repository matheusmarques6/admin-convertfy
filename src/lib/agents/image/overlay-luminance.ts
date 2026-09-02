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
  return /sobrepost|sobrepõe|overlay/i.test(semNegacao(text ?? ""))
}

/**
 * "não recebe nenhum texto sobreposto" NÃO é overlay — é a negação dele.
 *
 * Cadastro real da `welcome - hero section 5` (`hero_lifestyle_consumo`):
 * a foto vive abaixo da faixa chapada e o texto nunca a toca. A leitura
 * pela palavra solta marcou o slot como "com overlay", mediu a luminância
 * do topo (0,5432) e pediu ao modelo um "topo calmo para o texto" num
 * lugar onde não há texto. Remove o trecho negado — partícula de negação
 * seguida de até quatro palavras e da menção — antes do teste positivo,
 * para que "sobrepostos aos 43% superiores … sem sombra" siga positivo.
 */
const NEGACAO_OVERLAY =
  /\b(n[ãa]o|sem|nenhum[a]?|nunca|jamais)\b(?:\s+\S+){0,4}?\s*(sobrepost\w*|sobrep[õo]e|overlay)/gi

function semNegacao(t: string): string {
  return t.replace(NEGACAO_OVERLAY, " ")
}

/**
 * "43% superiores" — o número E o lado, colados, numa única leitura.
 *
 * É o casamento dos dois que dá a resposta confiável: no cadastro real, a
 * porcentagem só aparece grudada na palavra do lado, enquanto "base",
 * "inferior" e "embaixo" pipocam pelo texto inteiro descrevendo a CENA.
 */
/**
 * Vocabulário de lado, um só para as duas leituras (fração e vizinhança).
 * `topo` precisa entrar como palavra inteira: `\btop\b` não casa "no topo",
 * e era por aí que "sobreposta no topo" escapava para o lado errado.
 */
const LADO_TOPO = "superior\\w*|de cima|\\btopo\\b|\\btop\\b|acima"
const LADO_BASE = "inferior\\w*|de baixo|\\bbase\\b|embaixo|bottom|abaixo"

// O conectivo entre o número e o lado é opcional e varia: "43% superiores",
// "60% do topo", "30% da metade inferior".
const FRACAO_E_LADO = new RegExp(
  `(\\d{1,3})\\s*%\\s*(?:d[eoa]s?\\s+)?(?:metade\\s+)?(?:(${LADO_TOPO})|(${LADO_BASE}))`,
  "i",
)

/**
 * Fração da altura que o overlay ocupa, lida do próprio cadastro
 * ("43% superiores" → 0.43). Sem número, o default.
 *
 * Só aceita 5%–95%: um "100%" viraria medir a foto inteira e diluiria a
 * faixa que interessa; abaixo de 5% a amostra é ruído.
 */
export function overlayFraction(text: string | null | undefined): number {
  const m = FRACAO_E_LADO.exec(text ?? "")
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
  return { side: overlaySide(t), fraction: overlayFraction(t) }
}

/** Distância em caracteres, ao redor da menção de overlay, onde o lado vale. */
const JANELA_OVERLAY = 90

/**
 * De que lado o overlay pousa.
 *
 * Nasceu de um erro caro (Luxe Lift, 24/08): a versão anterior testava o
 * texto INTEIRO com /inferior|de baixo|da base|embaixo|bottom/. O
 * `image_spec` da hero diz "sobrepostos aos 43% SUPERIORES" e, na mesma
 * frase seguinte, descreve a CENA — "figuras ocupando a BASE do quadro,
 * cortadas pela borda INFERIOR", "canto INFERIOR", "metade INFERIOR".
 * Quatro menções sobre a figura contra duas sobre o overlay: o lado saía
 * invertido.
 *
 * O estrago foi triplo, porque este parser é fonte única: o prompt pediu a
 * faixa limpa embaixo, a medição de luminância olhou os 43% de baixo (onde
 * está a figura, escura), concluiu "não precisa corrigir", e a hero foi
 * entregue com texto claro sobre parede clara — sem um aviso.
 *
 * Ordem de confiança:
 *   1. número + lado colados ("43% superiores") — no cadastro real a
 *      porcentagem SÓ aparece junto da palavra do lado;
 *   2. lado dito perto da menção de overlay, numa janela estreita;
 *   3. `top`, o padrão da biblioteca.
 */
function overlaySide(t: string): OverlaySide {
  const casado = FRACAO_E_LADO.exec(t)
  if (casado) return casado[2] ? "top" : "bottom"

  const mencao = /sobrepost\w*|sobrep\u00f5e|overlay/i.exec(t)
  if (mencao) {
    const at = mencao.index
    const janela = t.slice(
      Math.max(0, at - JANELA_OVERLAY),
      at + mencao[0].length + JANELA_OVERLAY,
    )
    // O lado dito MAIS PERTO da menção manda — testar um antes do outro
    // faria "sobreposta no topo … sombra na metade inferior" virar bottom
    // só pela ordem do código.
    const perto = new RegExp(`(${LADO_TOPO})|(${LADO_BASE})`, "i").exec(janela)
    if (perto) return perto[1] ? "top" : "bottom"
  }
  return "top"
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
