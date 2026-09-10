/**
 * base64-para-storage — tira a imagem de dentro do HTML e a põe no Storage.
 *
 * O par com I/O do módulo puro `email-base64.ts`, que explica POR QUE isto
 * existe (o corte de 102 KB do Gmail e o Outlook que não renderiza `data:`).
 *
 * Duas decisões que valem mais que o código:
 *
 * **O path é o HASH do conteúdo.** O mesmo ícone de Instagram aparece em
 * quatro variantes de rodapé; por hash, ele vira UM arquivo para a
 * biblioteca inteira, e rodar a varredura duas vezes não cria nada novo — o
 * upload com `upsert:false` devolve "já existe" e o caminho segue. Nome
 * aleatório daria um arquivo por execução e a idempotência morreria junto.
 *
 * **A URL é PÚBLICA, não assinada.** `uploadEmailAsset` assina por 365
 * dias, o que serve para imagem gerada de uma peça; aqui não serve: o
 * e-mail vai ao Klaviyo/Omnisend e pode ser aberto anos depois, num arquivo
 * de newsletter ou num encaminhamento. URL que expira transforma o ícone
 * de hoje na imagem quebrada de amanhã — trocar um defeito por outro com
 * prazo.
 */

import { createHash } from "crypto"

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import {
  encontrarDataUris,
  extensaoDoMime,
  extraiveis,
  trocarDataUris,
  type DataUriAchado,
} from "./email-base64"

const log = logger.child("Base64ParaStorage")

/**
 * Bucket PRÓPRIO e PÚBLICO (migration 20261138).
 *
 * O `onboarding-visual-assets`, que os outros uploads usam, é PRIVADO —
 * `getPublicUrl` nele devolve um endereço que responde 403, e a troca
 * entregaria imagem quebrada em todo cliente de e-mail: pior que o base64
 * que se foi corrigir. Abri-lo também não serve: ele guarda gerações e
 * assets por LOJA.
 */
export const BIBLIOTECA_ASSETS_BUCKET = "email-library-assets"

/** Prefixo próprio: estes assets são da BIBLIOTECA, não de uma loja. */
export function assetPath(sha: string, ext: string): string {
  return `biblioteca/email-assets/${sha}.${ext}`
}

export function shaDoConteudo(base64: string): string {
  return createHash("sha256").update(base64).digest("hex").slice(0, 32)
}

export interface ExtracaoResultado {
  html: string
  /** Quantas ocorrências foram trocadas no HTML. */
  trocados: number
  /** Quantos arquivos distintos foram para o Storage (novos + reusados). */
  arquivos: number
  bytes: number
  /** Payloads que falharam no upload — ficaram embutidos, de propósito. */
  falhas: { bytes: number; mime: string; erro: string }[]
}

/**
 * O bucket é público?
 *
 * Este caminho troca um `data:` que FUNCIONA (fora do Outlook) por uma URL.
 * Se a URL não for acessível, a troca é uma regressão em todo cliente — e
 * silenciosa, porque nada no upload falha. Conferido uma vez por processo.
 */
let bucketPublico: boolean | null = null
async function garantirBucketPublico(
  admin: ReturnType<typeof createAdminClient>,
): Promise<void> {
  if (bucketPublico) return
  const { data, error } = await admin.storage.getBucket(BIBLIOTECA_ASSETS_BUCKET)
  if (error || !data) {
    throw new Error(
      `bucket '${BIBLIOTECA_ASSETS_BUCKET}' não encontrado — aplique a migration 20261138`,
    )
  }
  if (!data.public) {
    throw new Error(
      `bucket '${BIBLIOTECA_ASSETS_BUCKET}' está privado: a URL pública responderia 403 e a troca entregaria imagem quebrada`,
    )
  }
  bucketPublico = true
}

async function subir(a: DataUriAchado): Promise<string> {
  const admin = createAdminClient()
  await garantirBucketPublico(admin)
  const sha = shaDoConteudo(a.base64)
  const path = assetPath(sha, extensaoDoMime(a.mime))

  const { error } = await admin.storage
    .from(BIBLIOTECA_ASSETS_BUCKET)
    .upload(path, Buffer.from(a.base64, "base64"), {
      contentType: a.mime,
      upsert: false,
    })

  // "Already exists" NÃO é falha: é o dedupe por hash funcionando, e é o
  // caminho normal a partir da segunda variante que usa o mesmo ícone.
  if (error && !/exist/i.test(error.message)) {
    throw new Error(error.message)
  }

  const { data } = admin.storage.from(BIBLIOTECA_ASSETS_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/**
 * Sobe as imagens embutidas deste HTML e devolve o HTML com URLs.
 *
 * Falha de upload NÃO derruba a extração: aquele payload fica embutido e é
 * reportado. Meia extração é melhor que nenhuma, e muito melhor que um
 * `src` apontando para um arquivo que não subiu.
 */
export async function extrairBase64ParaStorage(
  html: string,
): Promise<ExtracaoResultado> {
  const alvos = extraiveis(encontrarDataUris(html))
  if (alvos.length === 0) {
    return { html, trocados: 0, arquivos: 0, bytes: 0, falhas: [] }
  }

  const urlPorBase64 = new Map<string, string>()
  const falhas: ExtracaoResultado["falhas"] = []
  let bytes = 0

  for (const a of alvos) {
    try {
      urlPorBase64.set(a.base64, await subir(a))
      bytes += a.bytes
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e)
      log.warn("base64.upload_falhou", { mime: a.mime, bytes: a.bytes, erro })
      falhas.push({ bytes: a.bytes, mime: a.mime, erro })
    }
  }

  const { html: out, trocados } = trocarDataUris(html, urlPorBase64)
  return { html: out, trocados, arquivos: urlPorBase64.size, bytes, falhas }
}
