/**
 * Storage do módulo Transcrições — buckets e URLs assinadas.
 *
 * Mora em módulo próprio porque a busca e a biblioteca precisam assinar as
 * mesmas thumbs sem importar uma a outra (import circular entre serviços é
 * como a ordem de avaliação vira bug de "undefined is not a function").
 */

import type { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("TranscricoesAssets")

type Admin = ReturnType<typeof createAdminClient>

export const BUCKET_MEDIA = "transcricoes-media"
export const BUCKET_THUMBS = "transcricoes-thumbs"
/** Thumb da biblioteca: 1 h, tempo de sobra para a navegação. */
export const TTL_THUMB_S = 3600
/** Mídia do player: 6 h — uma aula longa não pode expirar no meio. */
export const TTL_MEDIA_S = 6 * 3600

/** Caminho por org: é o prefixo que a policy do Storage confere. */
export function prefixoOrg(orgId: string): string {
  return `org-${orgId}`
}

export function caminhoMedia(orgId: string, transcricaoId: string, ext: string): string {
  return `${prefixoOrg(orgId)}/${transcricaoId}/media.${ext.replace(/^\./, "")}`
}

export function caminhoAudio(orgId: string, transcricaoId: string): string {
  return `${prefixoOrg(orgId)}/${transcricaoId}/audio.flac`
}

export function caminhoThumb(orgId: string, transcricaoId: string): string {
  return `${prefixoOrg(orgId)}/${transcricaoId}/thumb.jpg`
}

/**
 * Assina em lote. Uma chamada por thumb faria 24 round-trips por página —
 * é a diferença entre a biblioteca abrir e a biblioteca demorar.
 */
export async function assinarLote(
  admin: Admin,
  paths: string[],
  ttl = TTL_THUMB_S,
  bucket = BUCKET_THUMBS,
): Promise<Map<string, string>> {
  const unicos = [...new Set(paths.filter(Boolean))]
  if (!unicos.length) return new Map()
  const { data, error } = await admin.storage.from(bucket).createSignedUrls(unicos, ttl)
  if (error) {
    log.warn("falha ao assinar URLs", { bucket, n: unicos.length, erro: error.message })
    return new Map()
  }
  const out = new Map<string, string>()
  // Um path que sumiu do Storage não pode derrubar a página inteira: fica
  // sem thumb e o card mostra o placeholder.
  for (const item of data ?? []) if (item.signedUrl && item.path) out.set(item.path, item.signedUrl)
  return out
}

export async function assinarMedia(admin: Admin, path: string | null): Promise<string | null> {
  if (!path) return null
  const { data, error } = await admin.storage.from(BUCKET_MEDIA).createSignedUrl(path, TTL_MEDIA_S)
  if (error) {
    log.warn("falha ao assinar mídia", { path, erro: error.message })
    return null
  }
  return data?.signedUrl ?? null
}

/** Remove tudo que a transcrição guardou (exclusão não deixa órfão). */
export async function apagarArquivos(admin: Admin, paths: Array<string | null>, bucket: string): Promise<void> {
  const alvos = paths.filter((p): p is string => Boolean(p))
  if (!alvos.length) return
  const { error } = await admin.storage.from(bucket).remove(alvos)
  if (error) log.warn("falha ao apagar arquivos", { bucket, n: alvos.length, erro: error.message })
}
