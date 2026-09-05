/**
 * Chamadas de LLM do módulo — tópicos e linha de contexto do chunk.
 *
 * Self-contained de propósito: o worker importa este arquivo e não pode
 * arrastar nada de Next junto. Só `fetch` e o logger (que não importa nada).
 *
 * As duas chamadas são FAIL-OPEN. Sem tópicos, o chunking cai no corte por
 * tamanho e a transcrição continua utilizável; sem contexto, o embedding é
 * feito sobre o texto puro e recupera pior, mas recupera. Derrubar a
 * transcrição inteira porque o resumo falhou seria a troca errada.
 */

import { logger } from "@/lib/logger"
import type { TopicoDetectado } from "./types"

const log = logger.child("TranscricoesLLM")

const URL_CHAT = "https://openrouter.ai/api/v1/chat/completions"
/** Barato e bom o bastante: as duas tarefas são de sumarização curta. */
export const MODELO_AUXILIAR = process.env.TRANSCRICOES_MODELO_AUXILIAR || "google/gemini-3.5-flash"

interface RespostaChat {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
}

async function chamar(
  system: string,
  user: string,
  opts: { maxTokens?: number; timeoutMs?: number } = {},
): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 90_000)
  try {
    const resp = await fetch(URL_CHAT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://admin.convertfy.com.br",
        "X-Title": "Convertfy Transcrições",
      },
      body: JSON.stringify({
        model: MODELO_AUXILIAR,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        max_tokens: opts.maxTokens ?? 1200,
      }),
      signal: controller.signal,
    })
    if (!resp.ok) {
      log.warn("LLM auxiliar recusou", { status: resp.status, corpo: (await resp.text().catch(() => "")).slice(0, 200) })
      return null
    }
    const json = (await resp.json()) as RespostaChat
    return json.choices?.[0]?.message?.content?.trim() ?? null
  } catch (e) {
    log.warn("LLM auxiliar falhou", { erro: e instanceof Error ? e.message : String(e) })
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Extrai o primeiro bloco JSON de uma resposta que pode vir com cerca. */
export function extrairJson(texto: string): unknown {
  const semCerca = texto.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "")
  const inicio = semCerca.search(/[[{]/)
  if (inicio < 0) return null
  const fecha = semCerca[inicio] === "[" ? "]" : "}"
  const fim = semCerca.lastIndexOf(fecha)
  if (fim <= inicio) return null
  try {
    return JSON.parse(semCerca.slice(inicio, fim + 1))
  } catch {
    return null
  }
}

// ── Tópicos ─────────────────────────────────────────────────────────────

const SYSTEM_TOPICOS = `Você marca os pontos de MUDANÇA DE ASSUNTO numa transcrição em português.

Regras:
- Responda SÓ com um array JSON: [{"s": 96, "titulo": "Cupom no primeiro e-mail"}]
- "s" é o segundo em que o novo assunto começa, copiado de um marcador da entrada.
- Título curto (3 a 8 palavras), afirmativo, no vocabulário de quem fala.
- Entre 3 e 14 tópicos. Aula curta tem menos; não invente divisão que não existe.
- O primeiro tópico começa em 0.
- Nada de numeração ("1.", "Parte 2") e nada de reticências.`

/** Marcadores + falas, cortados para caber no contexto do modelo. */
function amostraParaTopicos(blocos: Array<{ s: number; texto: string }>, maxChars = 60_000): string {
  const linhas = blocos.map((b) => `[${Math.round(b.s)}] ${b.texto}`)
  let total = 0
  const out: string[] = []
  for (const l of linhas) {
    if (total + l.length > maxChars) break
    out.push(l)
    total += l.length + 1
  }
  return out.join("\n")
}

export async function detectarTopicos(
  blocos: Array<{ s: number; texto: string }>,
  titulo: string,
): Promise<TopicoDetectado[]> {
  if (blocos.length < 4) return []
  const resposta = await chamar(
    SYSTEM_TOPICOS,
    `Transcrição: ${titulo}\n\n${amostraParaTopicos(blocos)}`,
    { maxTokens: 900 },
  )
  if (!resposta) return []
  const bruto = extrairJson(resposta)
  if (!Array.isArray(bruto)) return []

  const fimReal = Math.max(...blocos.map((b) => b.s))
  const vistos = new Set<number>()
  const topicos: TopicoDetectado[] = []
  for (const item of bruto) {
    const o = item as { s?: unknown; titulo?: unknown }
    const s = Math.round(Number(o?.s))
    const t = typeof o?.titulo === "string" ? o.titulo.trim() : ""
    // Timestamp fora da transcrição é alucinação: um marcador em 9000 s
    // numa aula de 2832 s deixaria o índice apontando para o vazio.
    if (!t || !Number.isFinite(s) || s < 0 || s > fimReal || vistos.has(s)) continue
    vistos.add(s)
    topicos.push({ s, titulo: t.slice(0, 120) })
  }
  return topicos.sort((a, b) => a.s - b.s).slice(0, 16)
}

// ── Contexto do chunk ───────────────────────────────────────────────────

const SYSTEM_CONTEXTO = `Você escreve UMA linha situando um trecho dentro de uma aula, para busca semântica.

Regras:
- Uma frase, no máximo 20 palavras, em português.
- Diga o ASSUNTO do trecho e onde ele se encaixa na aula. Não resuma o que foi dito.
- Não comece com "Neste trecho" nem "O trecho".
- Responda só com a frase, sem aspas.`

/**
 * Gera a linha de contexto de vários chunks numa chamada só. Uma chamada
 * por chunk numa aula de 47 min seriam ~30 requisições — é a diferença
 * entre indexar em segundos e indexar em minutos.
 */
export async function gerarContextos(
  titulo: string,
  chunks: Array<{ s: number; texto: string; topico: string | null }>,
): Promise<Array<string | null>> {
  if (!chunks.length) return []
  const lote = chunks
    .map((c, i) => `### ${i + 1} — ${c.topico ?? "sem tópico"} (${Math.round(c.s)}s)\n${c.texto.slice(0, 1200)}`)
    .join("\n\n")

  const resposta = await chamar(
    `${SYSTEM_CONTEXTO}

Você receberá vários trechos numerados. Responda com um array JSON de strings, UMA por trecho, na mesma ordem e com o mesmo tamanho da entrada.`,
    `Aula: ${titulo}\n\n${lote}`,
    { maxTokens: 100 * chunks.length + 200 },
  )
  if (!resposta) return chunks.map(() => null)

  const bruto = extrairJson(resposta)
  if (!Array.isArray(bruto)) return chunks.map(() => null)
  // Tamanho diferente do pedido significa que o alinhamento se perdeu: um
  // contexto na posição errada é pior que nenhum, porque desloca o vetor.
  if (bruto.length !== chunks.length) {
    log.warn("contextos desalinhados", { pedidos: chunks.length, recebidos: bruto.length })
    return chunks.map(() => null)
  }
  return bruto.map((v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null))
}
