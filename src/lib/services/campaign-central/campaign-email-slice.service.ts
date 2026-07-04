/**
 * Recorte server-side das fatias ("portas") do email de uma loja.
 *
 * Os cortes do mapa aprovado são convertidos em pixels DO MODELO e
 * escalados pela LARGURA da imagem de cada loja (portPixelRectWidthScaled)
 * — as dimensões da loja saem do buffer real medido com sharp. A última
 * porta absorve o resto da imagem (rodapés de alturas diferentes não
 * deslocam os cortes anteriores).
 *
 * Usado pelas rotas slice (1 porta) e download-zip (todas as portas —
 * baixa o buffer UMA vez).
 */

import sharp from "sharp"
import { createAdminClient } from "@/lib/supabase/server"
import { AppError } from "@/lib/api/errors"
import {
  portPixelRect,
  portPixelRectWidthScaled,
} from "@/lib/campaign-cuts/geometry"
import type { CampaignCutMap, CutPort } from "@/types/campaign-cuts"
import type { CampaignStoreEmail } from "@/types/campaign-store-emails"
import { logger } from "@/lib/logger"

const log = logger.child("CampaignEmailSlice")

const BUCKET = "onboarding-visual-assets"

/** Nome seguro de arquivo (sem acento/espaço), mesmo padrão do download-zip. */
export function sanitizeFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "corte"
  )
}

/** Baixa o buffer da imagem da loja: storage.download com fallback na URL. */
export async function getStoreEmailBuffer(
  row: CampaignStoreEmail,
): Promise<Buffer> {
  const admin = createAdminClient()
  if (row.image_path) {
    const { data } = await admin.storage.from(BUCKET).download(row.image_path)
    if (data) return Buffer.from(await data.arrayBuffer())
  }
  if (row.image_url) {
    const res = await fetch(row.image_url)
    if (res.ok) return Buffer.from(await res.arrayBuffer())
  }
  throw new AppError("Não foi possível baixar a imagem da loja", 502)
}

export interface SlicedPort {
  port: CutPort
  /** Posição da porta no mapa (1-based) — usada no nome do arquivo. */
  index: number
  buffer: Buffer
  filename: string
}

function sliceFilename(storeName: string, port: CutPort, index: number): string {
  const nn = String(index).padStart(2, "0")
  return `${sanitizeFilename(storeName)}-${nn}-${sanitizeFilename(port.label)}.png`
}

/**
 * Fatia TODAS as portas do mapa a partir de um único download/decodificação.
 * A altura vem do metadata do buffer real (fonte da verdade).
 */
export async function sliceStoreEmailPorts(
  map: CampaignCutMap,
  row: CampaignStoreEmail,
  storeName: string,
  opts: { portIds?: string[] } = {},
): Promise<SlicedPort[]> {
  const buffer = await getStoreEmailBuffer(row)
  const meta = await sharp(buffer).metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (!width || !height) {
    throw new AppError("Não foi possível medir a imagem da loja", 422)
  }

  const wanted = opts.portIds ? new Set(opts.portIds) : null
  const out: SlicedPort[] = []

  // Ajuste fino por loja tem prioridade (frações da imagem DA LOJA);
  // sem ele, escala por largura a partir do mapa.
  const overrideById = new Map(
    (row.cut_ports_override ?? []).map((p) => [p.id, p]),
  )

  for (let i = 0; i < map.portas.length; i++) {
    const port = map.portas[i]
    if (wanted && !wanted.has(port.id)) continue
    const override = overrideById.get(port.id)
    const { top, height: sliceH } = override
      ? portPixelRect(override, height)
      : portPixelRectWidthScaled(
          port,
          { w: map.image_natural_w, h: map.image_natural_h },
          { w: width, h: height },
        )
    const slice = await sharp(buffer)
      .extract({ left: 0, top, width, height: sliceH })
      .png()
      .toBuffer()
    out.push({
      port,
      index: i + 1,
      buffer: slice,
      filename: sliceFilename(storeName, port, i + 1),
    })
  }

  if (out.length === 0) {
    throw new AppError("Nenhuma porta encontrada no mapa", 404)
  }
  log.info("slice.done", {
    suggestionId: map.suggestion_id,
    storeId: row.store_id,
    ports: out.length,
  })
  return out
}
