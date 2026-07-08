/**
 * Import da IMAGEM DE REFERÊNCIA do corte modelo direto do Figma (Tela 1).
 *
 * O implementador cola o link do frame do email modelo (Copy link to
 * selection → vem com node-id) e o servidor exporta o frame em PNG 2x —
 * o MESMO scale usado no import por loja da Tela 2. Assim a referência é
 * proporcional por construção aos emails que serão cortados, eliminando
 * a causa raiz dos desvios (referência de outro render).
 *
 * Sem node-id no link: só funciona se o arquivo tiver exatamente 1 frame
 * top-level (senão o erro orienta a copiar o link do frame específico).
 */

import sharp from "sharp"
import { createAdminClient } from "@/lib/supabase/server"
import { AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import {
  figmaExportImages,
  figmaGetFile,
  isFigmaConfigured,
  parseFigmaUrl,
} from "@/lib/integrations/figma/client"
import { collectTopLevelFrames } from "./campaign-figma-import.service"

const log = logger.child("CampaignCutModelImport")

const BUCKET = "onboarding-visual-assets"
const MAX_IMAGE_BYTES = 25 * 1024 * 1024

export interface CutModelImportResult {
  url: string
  path: string
  filename: string
  image_natural_w: number
  image_natural_h: number
}

export async function importCutModelImageFromFigma(
  suggestionId: string,
  figmaUrl: string,
): Promise<CutModelImportResult> {
  if (!isFigmaConfigured()) {
    throw new AppError(
      "FIGMA_PERSONAL_TOKEN não configurado — use o upload manual",
      422,
    )
  }

  const parsed = parseFigmaUrl(figmaUrl)
  if (!parsed) {
    throw new AppError("Link do Figma inválido — cole o link do frame do email modelo", 422)
  }

  // Com node-id no link, exporta direto; sem, só se o arquivo tiver 1 frame.
  let nodeId = parsed.nodeId
  let frameName = "email-modelo"
  if (!nodeId) {
    const file = await figmaGetFile(parsed.fileKey, { depth: 2 })
    const frames = collectTopLevelFrames(file.document)
    if (frames.length === 1) {
      nodeId = frames[0].id
      frameName = frames[0].name
    } else {
      throw new AppError(
        `O arquivo tem ${frames.length} frames — no Figma, clique com o botão direito no frame do email modelo → "Copy link to selection" e cole aqui`,
        422,
      )
    }
  }

  // scale=2: MESMO scale do import por loja — referência proporcional por construção.
  const images = await figmaExportImages(parsed.fileKey, [nodeId], {
    scale: 2,
    format: "png",
  })
  const imageUrl = images[nodeId]
  if (!imageUrl) {
    throw new AppError(
      "O Figma não renderizou esse frame — confira se o link aponta pro frame do email",
      422,
    )
  }

  const res = await fetch(imageUrl)
  if (!res.ok) {
    throw new AppError(`Download da imagem do Figma falhou (${res.status})`, 502)
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new AppError("PNG exportado acima de 25MB — use o upload manual", 422)
  }

  const meta = await sharp(buffer).metadata()
  if (!meta.width || !meta.height) {
    throw new AppError("Não foi possível medir a imagem exportada", 422)
  }

  const admin = createAdminClient()
  const filename = `${frameName.replace(/[^a-zA-Z0-9.-]/g, "_")}.png`
  const path = `campaigns/${suggestionId}/cut-map/${Date.now()}-figma-${filename}`
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: "image/png", upsert: false })
  if (upErr) {
    log.error("upload.failed", { suggestionId, error: upErr.message })
    throw new AppError(`Erro no upload: ${upErr.message}`, 500)
  }

  const { data: signed } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, 365 * 24 * 60 * 60)
  const url = signed?.signedUrl ?? null
  if (!url) throw new AppError("Não foi possível assinar a URL da imagem", 500)

  log.info("import.ok", {
    suggestionId,
    nodeId,
    w: meta.width,
    h: meta.height,
  })
  return {
    url,
    path,
    filename,
    image_natural_w: meta.width,
    image_natural_h: meta.height,
  }
}
