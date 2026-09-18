/**
 * separador-asset — o SVG da forma vira PNG hospedado.
 *
 * SVG não renderiza no Outlook nem no Gmail, então a separação tem de ser
 * raster. Endpoint vivo (uma rota que desenha sob demanda) foi recusado: o
 * e-mail é aberto por meses, num arquivo de newsletter ou num
 * encaminhamento, e viraria dependência eterna de um serviço nosso estar de
 * pé. O PNG é assado na geração e fica no Storage.
 *
 * **O path é o HASH do SVG**, o mesmo desenho de
 * `base64-para-storage.service.ts`: a onda entre branco e verde é UM
 * arquivo para todas as peças daquela loja, regerar não cria nada novo, e
 * o `upsert:false` respondendo "já existe" é o caminho normal a partir da
 * segunda peça.
 *
 * **Falha aqui NÃO derruba o passo de cor.** Devolve `null`, o tradutor
 * deixa a op sem `src` e o aplicador a descarta com `sem_imagem`: a peça
 * sai com a emenda seca, que é o estado de hoje. Uma exceção aqui
 * derrubaria o step inteiro (ele é fail-open) e levaria junto faixas,
 * botões e valores.
 */

import { createHash } from "crypto"

import { rasterizeSvgToPng } from "@/lib/brand/rasterize-svg"
import {
  BIBLIOTECA_ASSETS_BUCKET,
} from "@/lib/email-workspace/base64-para-storage.service"
import { logger } from "@/lib/logger"
import { createAdminClient } from "@/lib/supabase/server"

import type { FormatOp } from "./apply-patches"
import { formaPorId } from "./separador-catalogo"

const log = logger.child("SeparadorAsset")

/** Prefixo próprio: a forma é da BIBLIOTECA, não de uma loja. */
export function separadorPath(sha: string): string {
  return `biblioteca/separadores/${sha}.png`
}

/**
 * A largura do PNG.
 *
 * 1200 e não 600: o e-mail é aberto em tela retina, e uma onda de 600px
 * esticada para 600 CSS pixels sai com a borda serrilhada — o defeito que
 * denuncia arte de e-mail. O `<img>` declara 600 e o dobro é só densidade.
 */
const LARGURA_RASTER = 1200

async function subirPng(svg: string, alturaPx: number): Promise<string | null> {
  const sha = createHash("sha256").update(svg).digest("hex").slice(0, 32)
  const path = separadorPath(sha)
  const admin = createAdminClient()
  const png = await rasterizeSvgToPng(Buffer.from(svg, "utf-8"), {
    width: LARGURA_RASTER,
    // A densidade tem de acompanhar a largura, senão o sharp rasteriza em
    // 600 e AMPLIA: a onda sai borrada em vez de nítida.
    density: Math.round((LARGURA_RASTER / 600) * 96 * 2),
  })
  const { error } = await admin.storage
    .from(BIBLIOTECA_ASSETS_BUCKET)
    .upload(path, png, { contentType: "image/png", upsert: false })
  // "Already exists" é o dedupe por hash funcionando, não falha.
  if (error && !/exist/i.test(error.message)) throw new Error(error.message)
  const { data } = admin.storage.from(BIBLIOTECA_ASSETS_BUCKET).getPublicUrl(path)
  log.debug("separador.asset", { path, alturaPx, bytes: png.length })
  return data.publicUrl
}

export interface ResolucaoDeAssets {
  ops: FormatOp[]
  /** Quantos PNGs foram resolvidos (novos + reusados). */
  resolvidos: number
  /** Formas que ficaram sem imagem, com a causa. */
  falhas: { formaId: string; erro: string }[]
}

/**
 * Preenche o `src` de cada `add_separador` que precisa de imagem.
 *
 * Roda no runner, ANTES de `applyFormatOps`: `planoParaOps` é puro e não
 * faz I/O, e a URL não pode ser inventada por quem não subiu o arquivo.
 */
export async function resolverAssetsDeSeparacao(
  ops: readonly FormatOp[],
): Promise<ResolucaoDeAssets> {
  const falhas: ResolucaoDeAssets["falhas"] = []
  let resolvidos = 0
  const cache = new Map<string, string | null>()
  const out: FormatOp[] = []

  for (const op of ops) {
    if (op.action !== "add_separador") {
      out.push(op)
      continue
    }
    const forma = formaPorId(op.formaId)
    // Forma desconhecida ou desenhada em HTML não precisa de imagem: segue
    // como veio, e quem decide o desfecho é o aplicador.
    if (!forma || forma.render === "html" || !forma.svg) {
      out.push(op)
      continue
    }
    const svg = forma.svg({ fundo: op.fundo, tinta: op.tinta })
    let url = cache.get(svg)
    if (url === undefined) {
      try {
        url = await subirPng(svg, forma.alturaPx)
        resolvidos++
      } catch (e) {
        url = null
        const erro = e instanceof Error ? e.message : String(e)
        falhas.push({ formaId: op.formaId, erro })
        log.warn("separador.asset_failed", { formaId: op.formaId, erro })
      }
      cache.set(svg, url)
    }
    out.push(url ? { ...op, src: url } : op)
  }
  return { ops: out, resolvidos, falhas }
}
