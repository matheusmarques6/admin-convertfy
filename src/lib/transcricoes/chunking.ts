/**
 * Recorte semântico para a base de conhecimento — puro.
 *
 * Não corta por número fixo de tokens. Aula é fala contínua: o assunto
 * muda sem parágrafo, e um chunk que começa no meio de um raciocínio
 * recupera mal. Os pontos de corte primários são os TÓPICOS já detectados;
 * um tópico longo demais é subdividido na fronteira de bloco mais próxima
 * do alvo, nunca no meio de uma fala.
 *
 * O embedding é feito sobre `contexto + "\n\n" + texto`: um chunk isolado
 * que diz "e aí você aumenta pra 3 dias" é inútil sem saber que o assunto
 * era intervalo entre e-mails de carrinho abandonado. Esse passo é o que
 * mais melhora a recuperação, e por isso o contexto é gerado por LLM em
 * `indexar.ts` a partir do que sai daqui.
 */

import type { Bloco, TopicoDetectado } from "./types"

/** Alvo de tamanho por chunk, em caracteres (~350 tokens em pt-BR). */
export const ALVO_CHARS = 1400
/** Acima disso, o tópico é subdividido. */
export const MAX_CHARS = 2400
/** Abaixo disso, o chunk é fundido com o vizinho seguinte. */
export const MIN_CHARS = 260

export interface ChunkBruto {
  s: number
  fim: number
  texto: string
  /** Título do tópico que cobre o trecho — semente do contexto. */
  topico: string | null
  /** Locutores que falam no trecho, na ordem de aparição. */
  locutores: string[]
}

interface Fatia {
  blocos: Bloco[]
  topico: string | null
}

/**
 * Agrupa os blocos por tópico. Bloco anterior ao primeiro tópico entra na
 * fatia inicial sem título (é a abertura da aula).
 */
function fatiarPorTopico(blocos: Bloco[], topicos: TopicoDetectado[]): Fatia[] {
  if (blocos.length === 0) return []
  const marcos = [...topicos].sort((a, b) => a.s - b.s)
  const fatias: Fatia[] = []
  let atual: Fatia = { blocos: [], topico: null }
  let proximo = 0

  for (const b of blocos) {
    while (proximo < marcos.length && b.s >= marcos[proximo].s) {
      if (atual.blocos.length) fatias.push(atual)
      atual = { blocos: [], topico: marcos[proximo].titulo }
      proximo++
    }
    atual.blocos.push(b)
  }
  if (atual.blocos.length) fatias.push(atual)
  return fatias
}

function montar(blocos: Bloco[], topico: string | null): ChunkBruto {
  const locutores: string[] = []
  for (const b of blocos) if (b.locutor && !locutores.includes(b.locutor)) locutores.push(b.locutor)
  return {
    s: blocos[0].s,
    fim: blocos[blocos.length - 1].fim,
    texto: blocos.map((b) => b.texto.trim()).filter(Boolean).join(" "),
    topico,
    locutores,
  }
}

/** Subdivide uma fatia longa na fronteira de BLOCO mais próxima do alvo. */
function subdividir(fatia: Fatia): ChunkBruto[] {
  const out: ChunkBruto[] = []
  let buffer: Bloco[] = []
  let chars = 0
  for (const b of fatia.blocos) {
    buffer.push(b)
    chars += b.texto.length + 1
    if (chars >= ALVO_CHARS) {
      out.push(montar(buffer, fatia.topico))
      buffer = []
      chars = 0
    }
  }
  if (buffer.length) out.push(montar(buffer, fatia.topico))
  return out
}

/**
 * Funde chunks curtos demais com o seguinte. Um chunk de 40 caracteres
 * ("Boa pergunta.") vira ruído no vetor e rouba a vaga de um trecho útil.
 */
function fundirCurtos(chunks: ChunkBruto[]): ChunkBruto[] {
  const out: ChunkBruto[] = []
  for (const c of chunks) {
    const ant = out[out.length - 1]
    if (
      ant &&
      ant.texto.length < MIN_CHARS &&
      ant.texto.length + c.texto.length <= MAX_CHARS &&
      ant.topico === c.topico
    ) {
      out[out.length - 1] = {
        s: ant.s,
        fim: c.fim,
        texto: `${ant.texto} ${c.texto}`.trim(),
        topico: ant.topico,
        locutores: [...new Set([...ant.locutores, ...c.locutores])],
      }
      continue
    }
    out.push(c)
  }
  // O último pode ter ficado curto e sem vizinho à frente: funde para trás.
  // O mesmo guarda de tópico do laço vale aqui — fundir através da
  // fronteira rotularia o último tópico do vídeo com o título do anterior.
  if (out.length > 1) {
    const ultimo = out[out.length - 1]
    const penultimo = out[out.length - 2]
    if (
      ultimo.texto.length < MIN_CHARS &&
      penultimo.topico === ultimo.topico &&
      penultimo.texto.length + ultimo.texto.length <= MAX_CHARS
    ) {
      out.splice(out.length - 2, 2, {
        s: penultimo.s,
        fim: ultimo.fim,
        texto: `${penultimo.texto} ${ultimo.texto}`.trim(),
        topico: penultimo.topico,
        locutores: [...new Set([...penultimo.locutores, ...ultimo.locutores])],
      })
    }
  }
  return out
}

export function montarChunks(blocos: Bloco[], topicos: TopicoDetectado[]): ChunkBruto[] {
  const ordenados = [...blocos].sort((a, b) => a.s - b.s)
  const fatias = fatiarPorTopico(ordenados, topicos)
  const brutos = fatias.flatMap((f) => {
    const total = f.blocos.reduce((a, b) => a + b.texto.length + 1, 0)
    return total > MAX_CHARS ? subdividir(f) : [montar(f.blocos, f.topico)]
  })
  return fundirCurtos(brutos.filter((c) => c.texto.trim().length > 0))
}

/** Texto que vira o vetor. Sem contexto, cai no texto puro. */
export function textoParaEmbedding(chunk: { contexto: string | null; texto: string }): string {
  return chunk.contexto ? `${chunk.contexto}\n\n${chunk.texto}` : chunk.texto
}

/**
 * Chunks que cobrem o intervalo de um bloco editado. Editar uma fala tem
 * de marcar esses para reindexação — sem isso a base de conhecimento
 * diverge do texto que o usuário está vendo, em silêncio.
 */
export function chunksQueCobrem<T extends { s: number; fim: number }>(
  chunks: T[],
  intervalo: { s: number; fim: number },
): T[] {
  return chunks.filter((c) => c.s <= intervalo.fim && c.fim >= intervalo.s)
}
