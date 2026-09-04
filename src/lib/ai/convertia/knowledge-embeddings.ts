/**
 * Embeddings da base de conhecimento — via OpenRouter (a mesma
 * OPENROUTER_API_KEY que a ConvertIA já usa), endpoint OpenAI-compatible
 * `/api/v1/embeddings` com o modelo `openai/text-embedding-3-small`
 * (1536 dims, a coluna `embedding vector(1536)`). Sem a chave, ou se o
 * OpenRouter recusar, devolve null e a busca degrada para full-text —
 * sync e chat continuam funcionando.
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

export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey || texts.length === 0) return null
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
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts, dimensions: EMBEDDING_DIMS }),
      signal: controller.signal,
    })
    if (!resp.ok) {
      const snippet = (await resp.text().catch(() => "")).slice(0, 300)
      throw new Error(`OpenRouter embeddings ${resp.status}: ${snippet}`)
    }
    const json = (await resp.json()) as { data?: Array<{ index: number; embedding: number[] }> }
    const out: number[][] = new Array(texts.length)
    for (const d of json.data ?? []) {
      if (Array.isArray(d.embedding) && d.embedding.length === EMBEDDING_DIMS) out[d.index] = d.embedding
    }
    return out
  } catch (err) {
    log.warn("embedding falhou", { error: err instanceof Error ? err.message : String(err), n: texts.length })
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function embedQuery(text: string): Promise<number[] | null> {
  const r = await embedTexts([text.slice(0, 8_000)])
  return r?.[0] ?? null
}
