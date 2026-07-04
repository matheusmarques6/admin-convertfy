/**
 * Import automático dos emails por loja a partir do Figma (Tela 2 "Subir
 * Campanha por Loja").
 *
 * Convenção com os designers: no arquivo do Figma da campanha
 * (deliverable figma_structure_link da etapa estrutura), 1 frame
 * TOP-LEVEL por loja, nomeado exatamente com o nome da loja.
 *
 * Fluxo: getCampaignHandoff (link + lojas) → figmaGetFile (frames) →
 * matchNamesToStores (conservador: ambíguo nunca chuta) → UM batch
 * figmaExportImages → download/medida/upload por loja com pool de 3.
 *
 * FALHA PARCIAL ESTRUTURADA: erro no export ou numa loja específica não
 * derruba o import inteiro — cada loja sai com status
 * imported/no_frame/ambiguous/failed e o modal oferece retry individual
 * (novo POST com store_ids).
 */

import sharp from "sharp"
import { createAdminClient } from "@/lib/supabase/server"
import { AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { getCampaignHandoff } from "./campaign-handoff.service"
import {
  FigmaError,
  figmaExportImages,
  figmaGetFile,
  isFigmaConfigured,
  parseFigmaUrl,
  type FigmaNode,
} from "@/lib/integrations/figma/client"
import {
  matchNamesToStores,
  normalizeKey,
  type StoreRef,
} from "@/lib/campaign-cuts/store-match"
import type {
  FigmaImportResult,
  FigmaImportStoreResult,
} from "@/types/campaign-store-emails"

const log = logger.child("CampaignFigmaImport")

const BUCKET = "onboarding-visual-assets"
const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const DOWNLOAD_CONCURRENCY = 3

interface FrameInfo {
  id: string
  name: string
}

/** Frames top-level de todas as páginas (FRAME/COMPONENT/INSTANCE). */
function collectTopLevelFrames(document: FigmaNode): FrameInfo[] {
  const frames: FrameInfo[] = []
  for (const page of document.children ?? []) {
    for (const node of page.children ?? []) {
      if (["FRAME", "COMPONENT", "INSTANCE"].includes(node.type)) {
        frames.push({ id: node.id, name: node.name })
      }
    }
  }
  return frames
}

/** Pool simples de concorrência: roda `fn` para cada item, no máx `limit` por vez. */
async function runPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const item = items[next]
        next += 1
        await fn(item)
      }
    },
  )
  await Promise.all(workers)
}

export async function importStoreEmailsFromFigma(
  suggestionId: string,
  orgId: string,
  userId: string,
  opts: { storeIds?: string[] } = {},
): Promise<FigmaImportResult> {
  if (!isFigmaConfigured()) {
    throw new AppError(
      "FIGMA_PERSONAL_TOKEN não configurado — use o upload manual",
      422,
    )
  }

  const handoff = await getCampaignHandoff(suggestionId, orgId)
  const parsed = parseFigmaUrl(handoff.figma_link)
  if (!parsed) {
    throw new AppError(
      "Campanha sem link válido do Figma (deliverable da etapa estrutura)",
      422,
    )
  }

  let targets: StoreRef[] = handoff.stores.map((s) => ({
    store_id: s.store_id,
    store_name: s.store_name,
  }))
  if (opts.storeIds?.length) {
    const wanted = new Set(opts.storeIds)
    targets = targets.filter((t) => wanted.has(t.store_id))
  }
  if (targets.length === 0) {
    throw new AppError("Nenhuma loja alvo para importar", 422)
  }

  const file = await figmaGetFile(parsed.fileKey, { depth: 2 })
  const frames = collectTopLevelFrames(file.document)
  const frameNames = frames.map((f) => f.name)

  // Frames com nome (chave) duplicado nunca casam sozinhos — a loja
  // correspondente sai "ambiguous" e resolve no manual.
  const framesByKey = new Map<string, FrameInfo[]>()
  for (const f of frames) {
    const key = normalizeKey(f.name)
    if (!key) continue
    const arr = framesByKey.get(key) ?? []
    arr.push(f)
    framesByKey.set(key, arr)
  }
  const uniqueFrames = frames.filter((f) => {
    const key = normalizeKey(f.name)
    return key && framesByKey.get(key)?.length === 1
  })

  const match = matchNamesToStores(
    uniqueFrames.map((f) => f.name),
    targets,
  )
  const frameByName = new Map(uniqueFrames.map((f) => [f.name, f]))
  const ambiguousStoreIds = new Set(
    match.ambiguous.flatMap((a) => a.candidates.map((c) => c.store_id)),
  )

  const results = new Map<string, FigmaImportStoreResult>()
  const toImport: Array<{ store: StoreRef; frame: FrameInfo }> = []

  for (const store of targets) {
    const hit = match.matched.find((m) => m.store.store_id === store.store_id)
    if (hit) {
      const frame = frameByName.get(hit.name)
      if (frame) {
        toImport.push({ store, frame })
        continue
      }
    }
    const storeKey = normalizeKey(store.store_name)
    if ((framesByKey.get(storeKey)?.length ?? 0) > 1) {
      results.set(store.store_id, {
        store_id: store.store_id,
        store_name: store.store_name,
        status: "ambiguous",
        error: `Mais de um frame chamado "${store.store_name}" no arquivo`,
      })
    } else if (ambiguousStoreIds.has(store.store_id)) {
      results.set(store.store_id, {
        store_id: store.store_id,
        store_name: store.store_name,
        status: "ambiguous",
        error: "Mais de um frame parecido com o nome da loja",
      })
    } else {
      results.set(store.store_id, {
        store_id: store.store_id,
        store_name: store.store_name,
        status: "no_frame",
      })
    }
  }

  // UM batch de export para todos os frames casados. Se o batch inteiro
  // falhar (ex.: 429 sem Retry-After honrável), todas as lojas casadas
  // viram failed — sem 500, o caller mostra retry individual.
  let images: Record<string, string | null> = {}
  if (toImport.length > 0) {
    try {
      images = await figmaExportImages(
        parsed.fileKey,
        toImport.map((t) => t.frame.id),
        { scale: 2, format: "png" },
      )
    } catch (error) {
      const msg =
        error instanceof FigmaError ? error.message : "Erro no export do Figma"
      log.error("export.failed", { suggestionId, error: msg })
      for (const { store, frame } of toImport) {
        results.set(store.store_id, {
          store_id: store.store_id,
          store_name: store.store_name,
          status: "failed",
          frame_name: frame.name,
          error: msg,
        })
      }
      toImport.length = 0
    }
  }

  // Status atual das linhas existentes (preservar "concluida" no re-import).
  const admin = createAdminClient()
  const { data: existingRows } = await admin
    .from("campaign_store_emails")
    .select("store_id, status")
    .eq("suggestion_id", suggestionId)
    .eq("org_id", orgId)
  const existingStatus = new Map(
    (existingRows ?? []).map((r) => [r.store_id as string, r.status as string]),
  )

  await runPool(toImport, DOWNLOAD_CONCURRENCY, async ({ store, frame }) => {
    try {
      const url = images[frame.id]
      if (!url) {
        throw new Error("Figma não renderizou o frame (imagem vazia)")
      }

      const res = await fetch(url)
      if (!res.ok) throw new Error(`Download da imagem falhou (${res.status})`)
      const buffer = Buffer.from(await res.arrayBuffer())
      if (buffer.byteLength > MAX_IMAGE_BYTES) {
        throw new Error(
          "PNG exportado acima de 25MB — reduza o frame ou use upload manual",
        )
      }

      const meta = await sharp(buffer).metadata()
      if (!meta.width || !meta.height) {
        throw new Error("Não foi possível medir a imagem exportada")
      }

      const path = `campaigns/${suggestionId}/store-emails/${store.store_id}.png`
      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: "image/png", upsert: true })
      if (upErr) throw new Error(`Upload no storage falhou: ${upErr.message}`)

      const { data: signed } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(path, 365 * 24 * 60 * 60)
      const imageUrl = signed?.signedUrl ?? null
      if (!imageUrl) throw new Error("Não foi possível assinar a URL da imagem")

      const prev = existingStatus.get(store.store_id)
      const { error: rowErr } = await admin.from("campaign_store_emails").upsert(
        {
          org_id: orgId,
          suggestion_id: suggestionId,
          store_id: store.store_id,
          image_url: imageUrl,
          image_path: path,
          image_filename: `${frame.name}.png`,
          image_natural_w: meta.width,
          image_natural_h: meta.height,
          source: "figma",
          figma_node_id: frame.id,
          status: prev === "concluida" ? "concluida" : "andamento",
          uploaded_by: userId,
        },
        { onConflict: "suggestion_id,store_id" },
      )
      if (rowErr) throw new Error(`Erro ao gravar registro: ${rowErr.message}`)

      results.set(store.store_id, {
        store_id: store.store_id,
        store_name: store.store_name,
        status: "imported",
        frame_name: frame.name,
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido"
      log.error("store.import_failed", {
        suggestionId,
        storeId: store.store_id,
        error: msg,
      })
      results.set(store.store_id, {
        store_id: store.store_id,
        store_name: store.store_name,
        status: "failed",
        frame_name: frame.name,
        error: msg,
      })
    }
  })

  const ordered = targets.map((t) => results.get(t.store_id)!).filter(Boolean)
  log.info("import.done", {
    suggestionId,
    frames: frames.length,
    imported: ordered.filter((r) => r.status === "imported").length,
    failed: ordered.filter((r) => r.status === "failed").length,
  })

  return {
    file_key: parsed.fileKey,
    frames_found: frames.length,
    frame_names: frameNames,
    results: ordered,
  }
}
