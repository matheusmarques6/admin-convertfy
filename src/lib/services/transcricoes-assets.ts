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
 * Janela em que o áudio fica guardado depois da transcrição pronta.
 *
 * O vídeo sai na hora (o player é o embed da plataforma). O áudio fica
 * porque é ELE que o pipeline usa para retranscrever, e é ~10x menor:
 * transcrição que sai ruim — idioma errado, jargão da coleção faltando —
 * tem uma janela para ser refeita sem reenviar o arquivo. Passada a
 * janela, o texto já foi conferido e o áudio vira só custo.
 */
export const DIAS_RETENCAO_AUDIO = Math.max(0, Number(process.env.TRANSCRICOES_AUDIO_RETENCAO_DIAS) || 3)

/** Quando o áudio desta transcrição some. Null = já foi, ou ainda não terminou. */
export function audioExpiraEm(concluidoEm: string | null, audioPath: string | null): Date | null {
  if (!audioPath || !concluidoEm) return null
  const base = new Date(concluidoEm)
  if (Number.isNaN(base.getTime())) return null
  return new Date(base.getTime() + DIAS_RETENCAO_AUDIO * 24 * 3600 * 1000)
}

/**
 * Apaga o áudio das transcrições cuja janela de retomada venceu.
 *
 * Roda no cron do admin (não no worker): quem terminou de processar já
 * saiu de cena, e o prazo é medido a partir de `concluido_em`. Falha de
 * Storage não trava a varredura — o arquivo entra na próxima rodada.
 */
export async function varrerAudioExpirado(admin: Admin, limite = 200): Promise<number> {
  if (DIAS_RETENCAO_AUDIO <= 0) return 0

  const corte = new Date(Date.now() - DIAS_RETENCAO_AUDIO * 24 * 3600 * 1000).toISOString()
  const { data, error } = await admin
    .from("transcricoes")
    .select("id, audio_path")
    .eq("status", "pronta")
    .not("audio_path", "is", null)
    .lt("concluido_em", corte)
    .limit(limite)
    .returns<Array<{ id: string; audio_path: string }>>()
  if (error) {
    log.warn("varredura de áudio expirado falhou", { erro: error.message })
    return 0
  }

  const linhas = data ?? []
  if (!linhas.length) return 0

  const { error: erroStorage } = await admin.storage.from(BUCKET_MEDIA).remove(linhas.map((l) => l.audio_path))
  if (erroStorage) {
    // Arquivo órfão custa armazenamento, não corretude. A coluna NÃO é
    // limpa: limpar sem apagar deixaria o arquivo invisível e eterno.
    log.warn("não foi possível apagar áudio expirado", { erro: erroStorage.message, itens: linhas.length })
    return 0
  }

  await admin
    .from("transcricoes")
    .update({ audio_path: null, audio_bytes: null })
    .in("id", linhas.map((l) => l.id))
  return linhas.length
}

/** Capa maior que isso não é capa: é alguém servindo outra coisa. */
const MAX_THUMB_BYTES = 4 * 1024 * 1024
const TIMEOUT_THUMB_MS = 8000

/**
 * Guarda a capa que a prévia trouxe (YouTube/TikTok devolvem no oEmbed).
 *
 * A URL do CDN da plataforma NÃO é guardada: ela expira e some, e o card
 * fica com um vazio sem explicação — foi a lição dos avatares do módulo
 * Conteúdo. Aqui o arquivo é regravado no nosso bucket.
 *
 * Sem isso, o card só ganha imagem quando o worker extrai um frame — ou
 * seja, nunca, enquanto o container não estiver de pé. Devolve o caminho
 * gravado ou null; falhar aqui NUNCA impede a transcrição de entrar na fila.
 */
export async function guardarThumbDaUrl(
  admin: Admin,
  orgId: string,
  transcricaoId: string,
  url: string | null,
): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_THUMB_MS)
  try {
    const resp = await fetch(url, { signal: controller.signal, cache: "no-store" })
    if (!resp.ok) return null

    const tipo = resp.headers.get("content-type") ?? ""
    if (!tipo.startsWith("image/")) return null

    const bytes = new Uint8Array(await resp.arrayBuffer())
    if (!bytes.byteLength || bytes.byteLength > MAX_THUMB_BYTES) return null

    const caminho = caminhoThumb(orgId, transcricaoId)
    const { error } = await admin.storage
      .from(BUCKET_THUMBS)
      .upload(caminho, bytes, { contentType: tipo.split(";")[0], upsert: true })
    if (error) {
      log.warn("não foi possível guardar a capa", { transcricaoId, erro: error.message })
      return null
    }
    return caminho
  } catch (e) {
    log.warn("capa da prévia não pôde ser baixada", {
      transcricaoId,
      erro: e instanceof Error ? e.message : String(e),
    })
    return null
  } finally {
    clearTimeout(timer)
  }
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
