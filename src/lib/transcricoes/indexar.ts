/**
 * Indexação para a base de conhecimento: chunking → contexto → embedding.
 *
 * Compartilhado entre o worker (etapa 3 do pipeline) e o cron do admin
 * (reindexação depois de uma fala editada, e a fila da faísca quando a
 * coleção entra na base). Recebe o client por parâmetro para servir aos
 * dois sem importar nada de Next.
 *
 * Chunk desatualizado é REGERADO, não recriado: apagar e inserir mudaria o
 * id e quebraria qualquer referência que alguém já tenha guardado.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { embedTexts } from "@/lib/ai/convertia/knowledge-embeddings"
import { montarChunks, textoParaEmbedding } from "./chunking"
import { gerarContextos } from "./llm"
import type { Bloco, TopicoDetectado } from "./types"

const log = logger.child("TranscricoesIndexar")

/** Lote do endpoint de embeddings — acima disso o corpo fica grande demais. */
const LOTE_EMBEDDING = 48
/** Lote da geração de contexto: uma chamada por chunk seria lenta demais. */
const LOTE_CONTEXTO = 12

// O client vem do worker (supabase-js puro) ou do admin (createAdminClient);
// os dois são criados sem os tipos gerados do banco, então o SupabaseClient
// sem parâmetro é exatamente o que os dois lados têm.
type Client = SupabaseClient

export interface ResultadoIndexacao {
  chunks: number
  comEmbedding: number
  /** Faltou chave do OpenRouter, ou o provedor recusou. */
  embeddingIndisponivel: boolean
}

export interface ProgressoIndexacao {
  (pct: number): void | Promise<void>
}

/**
 * (Re)constrói os chunks de uma transcrição. Idempotente: rodar de novo
 * substitui o conjunto pelo que o texto atual produz.
 */
export async function indexarTranscricao(
  db: Client,
  params: {
    transcricaoId: string
    orgId: string
    titulo: string
    blocos: Bloco[]
    topicos: TopicoDetectado[]
  },
  onProgresso?: ProgressoIndexacao,
): Promise<ResultadoIndexacao> {
  const brutos = montarChunks(params.blocos, params.topicos)
  if (!brutos.length) {
    await db.from("transcricoes_chunks").delete().eq("transcricao_id", params.transcricaoId)
    return { chunks: 0, comEmbedding: 0, embeddingIndisponivel: false }
  }

  // Contexto em lotes (fail-open: sem ele o embedding cai no texto puro).
  const contextos: Array<string | null> = []
  for (let i = 0; i < brutos.length; i += LOTE_CONTEXTO) {
    const fatia = brutos.slice(i, i + LOTE_CONTEXTO)
    contextos.push(...(await gerarContextos(params.titulo, fatia)))
    await onProgresso?.(Math.round(((i + fatia.length) / brutos.length) * 50))
  }

  const linhas = brutos.map((c, i) => ({
    transcricao_id: params.transcricaoId,
    org_id: params.orgId,
    s: c.s,
    fim: c.fim,
    contexto: contextos[i] ?? null,
    texto: c.texto,
    desatualizado: false,
  }))

  // Substituição em bloco: o conjunto de chunks é derivado do texto, então
  // o texto novo manda. Apagar depois de inserir deixaria duplicata se o
  // insert falhasse no meio.
  const { error: erroDel } = await db.from("transcricoes_chunks").delete().eq("transcricao_id", params.transcricaoId)
  if (erroDel) throw new Error(`não foi possível limpar os chunks: ${erroDel.message}`)

  const { data: inseridos, error: erroIns } = await db
    .from("transcricoes_chunks")
    .insert(linhas)
    .select("id, contexto, texto")
  if (erroIns) throw new Error(`não foi possível gravar os chunks: ${erroIns.message}`)

  const criados = (inseridos ?? []) as Array<{ id: number; contexto: string | null; texto: string }>
  const comEmbedding = await gerarEmbeddings(db, criados, (p) => onProgresso?.(50 + Math.round(p / 2)))

  return {
    chunks: criados.length,
    comEmbedding,
    // Sem embedding a busca semântica não funciona, mas a full-text sim: a
    // transcrição continua pesquisável e a linha diz o que faltou.
    embeddingIndisponivel: criados.length > 0 && comEmbedding === 0,
  }
}

/**
 * Preenche os embeddings que faltam. Usado logo depois de criar os chunks
 * e pelo cron que varre pendências (fala editada, faísca ligada agora).
 */
export async function gerarEmbeddings(
  db: Client,
  chunks: Array<{ id: number; contexto: string | null; texto: string }>,
  onProgresso?: (pct: number) => void | Promise<void>,
): Promise<number> {
  let ok = 0
  for (let i = 0; i < chunks.length; i += LOTE_EMBEDDING) {
    const fatia = chunks.slice(i, i + LOTE_EMBEDDING)
    const vetores = await embedTexts(fatia.map((c) => textoParaEmbedding(c)))
    if (!vetores) {
      log.warn("embeddings indisponíveis; a busca cai para full-text", { pendentes: chunks.length - ok })
      break
    }
    for (let j = 0; j < fatia.length; j++) {
      const vetor = vetores[j]
      if (!vetor) continue
      const { error } = await db
        .from("transcricoes_chunks")
        .update({ embedding: JSON.stringify(vetor), desatualizado: false, atualizado_em: new Date().toISOString() })
        .eq("id", fatia[j].id)
      if (!error) ok++
    }
    await onProgresso?.(Math.round(((i + fatia.length) / chunks.length) * 100))
  }
  return ok
}

/**
 * Marca para reindexação os chunks que cobrem o intervalo de uma fala
 * editada. É a ponte que impede a base de conhecimento de divergir do
 * texto que o usuário está vendo — e a divergência seria silenciosa.
 */
export async function marcarDesatualizados(
  db: Client,
  transcricaoId: string,
  intervalo: { s: number; fim: number },
): Promise<number> {
  const { data, error } = await db
    .from("transcricoes_chunks")
    .update({ desatualizado: true })
    .eq("transcricao_id", transcricaoId)
    .lte("s", intervalo.fim)
    .gte("fim", intervalo.s)
    .select("id")
  if (error) {
    log.warn("não foi possível marcar chunks para reindexar", { transcricaoId, erro: error.message })
    return 0
  }
  return (data ?? []).length
}
