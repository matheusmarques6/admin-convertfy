import sharp from "sharp"

/**
 * Rasteriza um SVG (buffer) em PNG.
 *
 * Motivo: modelos de imagem (OpenRouter/gpt-image) NÃO baixam/decodificam SVG —
 * mandar um SVG como referência visual causa 400 "Error while downloading file".
 * No upload de logo, sempre geramos um PNG a partir do SVG pra o agente de
 * imagem ter um raster utilizável (o SVG segue guardado pro brand kit/e-mail).
 *
 * `density` alto garante nitidez ao rasterizar o vetor; a largura é limitada pra
 * não gerar um PNG gigante. Mantém o canal alpha (logo com fundo transparente).
 */
export async function rasterizeSvgToPng(
  svg: Buffer,
  opts?: { width?: number; density?: number },
): Promise<Buffer> {
  const width = opts?.width ?? 1024
  const density = opts?.density ?? 384
  return sharp(svg, { density })
    .resize({ width, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer()
}
