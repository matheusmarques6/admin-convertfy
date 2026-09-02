/**
 * background-fit.service — roda a regra "o fundo tem o tamanho que o
 * elemento declara" sobre o documento final da cadeia de formatação.
 *
 * Para cada `<td background="URL">` com tamanho declarado
 * (`html/background-fit.ts`), quando a URL é uma imagem gerada deste email
 * e a foto é mais baixa que o box: compõe faixa chapada (na cor que o
 * PRÓPRIO elemento tem nesse momento — a que o Cores & Botões já decidiu,
 * então texto e faixa contrastam por construção) + foto na base, sobe o
 * PNG e troca a URL em todas as ocorrências. Grava
 * `content.images[key].composed` no bloco (a URL original fica).
 *
 * FAIL-OPEN por box: falha de fetch/sharp/upload vira item em `falhas` e o
 * documento segue como estava. Roda DEPOIS do step de cor, mesmo quando
 * ele foi pulado ou caiu em fail-open.
 *
 * As dependências com I/O (`fetchImage`, `upload`, `persistComposed`) são
 * injetáveis — o teste roda a composição real com sharp e nada de rede.
 */

import { logger } from "@/lib/logger"
import {
  findBackgroundBoxes,
  photoSide,
  replaceUrlEverywhere,
  type BackgroundBox,
  type PhotoSide,
} from "../html/background-fit"
import { composeBackground } from "./compose-background"
import { uploadEmailAsset } from "./upload-email-asset"
import type { EmailBlockRow } from "../html/build-vars"

const log = logger.child("BackgroundFit")

export interface BackgroundComposed {
  block_id: string
  key: string
  de: string
  para: string
  width: number
  height: number
  band_color: string
  band_height: number
  side: PhotoSide
  /** Ocorrências da URL trocadas no documento (atributo, url(), v:fill). */
  replaced: number
}

export interface BackgroundFitReport {
  /** Boxes com tamanho declarado encontrados no documento. */
  boxes: Array<Pick<BackgroundBox, "url" | "width" | "height" | "color" | "size_source"> & { key: string | null }>
  compostos: BackgroundComposed[]
  /** Boxes cuja foto já cobre o tamanho declarado (ou sem imagem gerada). */
  sem_ajuste: Array<{ key: string | null; motivo: string }>
  falhas: Array<{ key: string | null; erro: string }>
}

export interface BackgroundFitDeps {
  fetchImage: (url: string) => Promise<Buffer>
  upload: (storeId: string, png: Buffer) => Promise<string>
  persistComposed: (
    blockId: string,
    key: string,
    composed: Omit<BackgroundComposed, "block_id" | "key" | "de" | "replaced">,
  ) => Promise<void>
}

export interface BackgroundFitInput {
  html: string
  blocks: EmailBlockRow[]
  storeId: string
  /** Cor da faixa quando o elemento não declara a sua (papel `surface_strong`). */
  fallbackColor: string | null | undefined
}

async function defaultFetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

export const defaultBackgroundFitDeps: Omit<BackgroundFitDeps, "persistComposed"> = {
  fetchImage: defaultFetchImage,
  upload: async (storeId, png) => (await uploadEmailAsset(storeId, png)).url,
}

interface GeneratedImageRef {
  block_id: string
  key: string
  /** guidance + image_spec do campo — de onde sai o lado da foto. */
  cadastro: string
}

/** URL gerada → bloco/campo dono + cadastro do campo. */
function indexGeneratedImages(blocks: EmailBlockRow[]): Map<string, GeneratedImageRef> {
  const map = new Map<string, GeneratedImageRef>()
  for (const b of blocks) {
    const images = (b.content as { images?: unknown } | null)?.images
    if (!images || typeof images !== "object") continue
    const fields = Array.isArray(b.fields)
      ? (b.fields as Array<{ key?: string; guidance?: string | null; image_spec?: string | null }>)
      : []
    for (const [key, val] of Object.entries(images as Record<string, { url?: unknown; composed?: { url?: unknown } }>)) {
      const f = fields.find((x) => x.key === key)
      const cadastro = `${f?.guidance ?? ""} ${f?.image_spec ?? ""}`
      const ref: GeneratedImageRef = { block_id: b.id, key, cadastro }
      if (typeof val?.url === "string" && val.url) map.set(val.url, ref)
      // Resume: a URL composta de uma passada anterior também é "deste
      // email" — cai em `sem_ajuste` porque já cobre o box.
      const cu = val?.composed?.url
      if (typeof cu === "string" && cu) map.set(cu, ref)
    }
  }
  return map
}

export async function fitBackgrounds(
  input: BackgroundFitInput,
  deps: BackgroundFitDeps,
): Promise<{ html: string; report: BackgroundFitReport }> {
  const report: BackgroundFitReport = { boxes: [], compostos: [], sem_ajuste: [], falhas: [] }
  let html = input.html
  const boxes = findBackgroundBoxes(html)
  if (boxes.length === 0) return { html, report }

  const generated = indexGeneratedImages(input.blocks)

  for (const box of boxes) {
    const ref = generated.get(box.url) ?? null
    report.boxes.push({
      url: box.url,
      width: box.width,
      height: box.height,
      color: box.color,
      size_source: box.size_source,
      key: ref?.key ?? null,
    })
    if (!ref) {
      report.sem_ajuste.push({ key: null, motivo: "url_nao_gerada_neste_email" })
      continue
    }
    const color = box.color ?? input.fallbackColor ?? null
    if (!color) {
      report.sem_ajuste.push({ key: ref.key, motivo: "sem_cor_para_a_faixa" })
      continue
    }
    const side = photoSide(ref.cadastro)
    try {
      const photo = await deps.fetchImage(box.url)
      const composed = await composeBackground({
        photo,
        width: box.width,
        height: box.height,
        color,
        side,
      })
      if (!composed) {
        report.sem_ajuste.push({ key: ref.key, motivo: "foto_ja_cobre_o_box" })
        continue
      }
      const para = await deps.upload(input.storeId, composed.png)
      const r = replaceUrlEverywhere(html, box.url, para)
      html = r.html
      const item: BackgroundComposed = {
        block_id: ref.block_id,
        key: ref.key,
        de: box.url,
        para,
        width: box.width,
        height: box.height,
        band_color: color.toUpperCase(),
        band_height: composed.band_height,
        side,
        replaced: r.replaced,
      }
      report.compostos.push(item)
      try {
        await deps.persistComposed(ref.block_id, ref.key, {
          para,
          width: item.width,
          height: item.height,
          band_color: item.band_color,
          band_height: item.band_height,
          side,
        })
      } catch (err) {
        log.warn("background_fit.persist_failed", {
          blockId: ref.block_id,
          key: ref.key,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      report.falhas.push({ key: ref.key, erro: msg.slice(0, 300) })
      log.warn("background_fit.box_failed", { key: ref.key, error: msg })
    }
  }

  return { html, report }
}
