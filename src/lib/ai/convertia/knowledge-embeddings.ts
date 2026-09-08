/**
 * Embeddings da base de conhecimento — via OpenRouter (a mesma
 * OPENROUTER_API_KEY que a ConvertIA já usa), endpoint OpenAI-compatible
 * `/api/v1/embeddings` com o modelo `openai/text-embedding-3-small`
 * (1536 dims, a coluna `embedding vector(1536)`). Sem a chave, ou se o
 * OpenRouter recusar, a busca degrada para full-text — sync e chat
 * continuam funcionando.
 *
 * Medição 08/09: **124 das 124 notas ativas estavam sem vetor**, e não
 * havia como saber por quê. A falha era engolida num `log.warn` e a
 * função devolvia `null`, indistinguível de "não havia o que fazer": o
 * sync reportava sucesso, o painel de saúde mostrava "embeddings
 * configurados: sim" e a busca respondia com full-text sem avisar que
 * a semântica não tinha rodado. Por isso toda saída daqui carrega a
 * CAUSA junto — quem chama decide se mostra, mas ninguém mais pode
 * fingir que não houve erro.
 */

import { logger } from "@/lib/logger"

const log = logger.child("KnowledgeEmbeddings")

export const EMBEDDING_MODEL = "openai/text-embedding-3-small"
export const EMBEDDING_DIMS = 1536
const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings"
/** ~8k tokens do modelo; cortamos por caracteres com folga. */
const MAX_INPUT_CHARS = 24_000

export function embeddingsAvailable(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY)
}

/** Texto que vira o vetor: título + tags + corpo (cortado). */
export function embeddingInput(note: { title: string; tags: string[]; body: string }): string {
  return `${note.title}\n${note.tags.map((t) => `#${t}`).join(" ")}\n\n${note.body}`.slice(0, MAX_INPUT_CHARS)
}

export interface EmbedResult {
  /** Um vetor por texto de entrada, na mesma ordem; posição vazia = aquele texto não veio. */
  vectors: number[][] | null
  /** Causa da falha, crua o bastante para agir (status + trecho da resposta). */
  error: string | null
}

export async function embedTexts(texts: string[]): Promise<EmbedResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return { vectors: null, error: "OPENROUTER_API_KEY não configurada" }
  if (texts.length === 0) return { vectors: [], error: null }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  try {
    const resp = await fetch(OPENROUTER_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://admin.convertfy.com.br",
        "X-Title": "Convertfy ConvertIA",
      },
      // Sem `dimensions`: 1536 já é o nativo deste modelo, então o
      // parâmetro não muda o resultado e só acrescenta uma forma de a
      // chamada ser recusada por um provedor que não o aceite (o
      // modelo é servido por mais de um). A conferência do tamanho
      // continua sendo feita na resposta, abaixo.
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
      signal: controller.signal,
    })
    if (!resp.ok) {
      const snippet = (await resp.text().catch(() => "")).slice(0, 300)
      throw new Error(`OpenRouter embeddings ${resp.status}: ${snippet}`)
    }
    const json = (await resp.json()) as { data?: Array<{ index: number; embedding: number[] }> }
    const out: number[][] = new Array(texts.length)
    let dimensaoErrada = 0
    for (const d of json.data ?? []) {
      if (!Array.isArray(d.embedding)) continue
      if (d.embedding.length !== EMBEDDING_DIMS) {
        dimensaoErrada++
        continue
      }
      out[d.index] = d.embedding
    }
    const vieram = out.filter(Boolean).length
    if (vieram === 0) {
      // Resposta 200 sem nenhum vetor utilizável é falha — devolver
      // "ok, zero vetores" faria o chamador gravar nada e seguir feliz.
      const causa =
        dimensaoErrada > 0
          ? `o provedor devolveu ${dimensaoErrada} vetor(es) fora de ${EMBEDDING_DIMS} dimensões`
          : "o provedor respondeu sem nenhum vetor"
      log.warn("embedding sem vetor utilizável", { causa, n: texts.length })
      return { vectors: null, error: causa }
    }
    return {
      vectors: out,
      error: dimensaoErrada > 0 ? `${dimensaoErrada} vetor(es) fora de ${EMBEDDING_DIMS} dimensões` : null,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn("embedding falhou", { error: msg, n: texts.length })
    return { vectors: null, error: msg }
  } finally {
    clearTimeout(timer)
  }
}

export interface EmbedQueryResult {
  vector: number[] | null
  error: string | null
}

export async function embedQuery(text: string): Promise<EmbedQueryResult> {
  const r = await embedTexts([text.slice(0, 8_000)])
  return { vector: r.vectors?.[0] ?? null, error: r.error }
}
