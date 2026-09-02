/**
 * compose-background — monta o arquivo de fundo no tamanho que o elemento
 * declara: faixa chapada na cor do elemento + a foto gerada encostada na
 * base (ou no topo).
 *
 * É a metade com I/O da regra de `html/background-fit.ts`. `sharp` já é
 * dependência do pipeline (resize da geração, luminância do overlay).
 *
 * Idempotente por construção: foto com a altura do box (ou maior) devolve
 * null — nada a compor. É o que permite rodar de novo num resume sem
 * empilhar faixa sobre faixa.
 */

import sharp from "sharp"
import type { PhotoSide } from "../html/background-fit"

export interface ComposeBackgroundInput {
  /** A foto gerada (PNG/JPG). */
  photo: Buffer
  /** Tamanho que o elemento declara. */
  width: number
  height: number
  /** Cor da faixa chapada (`#RRGGBB`). */
  color: string
  side: PhotoSide
}

export interface ComposeBackgroundResult {
  png: Buffer
  /** Altura da faixa chapada que sobrou acima/abaixo da foto. */
  band_height: number
  /** Tamanho da foto DEPOIS de ajustada à largura do box. */
  photo: { width: number; height: number }
}

const HEX6 = /^#[0-9a-f]{6}$/i

/**
 * Devolve null quando não há o que compor (foto já cobre o box, box
 * inválido, cor inválida). Lança só em erro do sharp — o chamador é
 * fail-open.
 */
export async function composeBackground(
  input: ComposeBackgroundInput,
): Promise<ComposeBackgroundResult | null> {
  const { width, height, side } = input
  if (!(width > 0 && height > 0)) return null
  const color = input.color.trim().toUpperCase()
  if (!HEX6.test(color)) return null

  const meta = await sharp(input.photo).metadata()
  const pw = meta.width ?? 0
  const ph = meta.height ?? 0
  if (pw <= 0 || ph <= 0) return null

  // Foto ajustada à LARGURA do box (a altura acompanha a proporção). Foto
  // já na largura certa passa intacta — sem reamostrar o que está certo.
  let photoBuf = input.photo
  let fw = pw
  let fh = ph
  if (pw !== width) {
    fh = Math.round((ph * width) / pw)
    fw = width
    photoBuf = await sharp(input.photo).resize(fw, fh).png().toBuffer()
  }
  if (fh >= height) return null

  const bandHeight = height - fh
  const png = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .composite([
      {
        input: photoBuf,
        left: 0,
        top: side === "bottom" ? bandHeight : 0,
      },
    ])
    .png()
    .toBuffer()

  return { png, band_height: bandHeight, photo: { width: fw, height: fh } }
}
