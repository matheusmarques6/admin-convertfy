/**
 * Transcrição via OpenRouter (`/api/v1/audio/transcriptions`).
 *
 * Modelo padrão `microsoft/mai-transcribe-2`, mas o modelo EFETIVO vem da
 * coleção e é gravado na linha: o painel de informações lê do banco, nunca
 * de constante.
 *
 * Decisões e o porquê:
 *  - multipart, nunca base64: base64 infla o corpo em ~33% e o limite de
 *    upload do endpoint é 25 MB.
 *  - `verbatim` e não `clean`: a transcrição bruta é a fonte da verdade; a
 *    limpeza acontece no chunking, onde dá para auditar o que foi cortado.
 *  - diarização ligada: aula tem professor e aluno. Sem separar, a dúvida
 *    do aluno entra na base com o mesmo peso da resposta do professor.
 *  - `phraseList` da coleção: é o parâmetro que mais afeta qualidade. Sem
 *    ele "Omnisend" vira "omni send" e a busca nunca encontra.
 *
 * O nome do campo de locutor no `verbose_json` não é o mesmo em todo
 * provedor (speaker / speaker_id / speaker_label, e há resposta em
 * `diarized_json`). A leitura aqui é defensiva de propósito: um campo com
 * nome diferente não pode custar a diarização inteira.
 */

import { logger } from "@/lib/logger"

const log = logger.child("Transcrever")

const URL_TRANSCRICOES = "https://openrouter.ai/api/v1/audio/transcriptions"
export const MODELO_PADRAO = "microsoft/mai-transcribe-2"
/** Limite de upload multipart do endpoint (25 MB); cortamos com folga. */
export const LIMITE_AUDIO_BYTES = 24 * 1024 * 1024
/** Duração de cada pedaço quando o áudio passa do limite. */
export const SEGUNDOS_POR_PEDACO = 600

export interface SegmentoBruto {
  s: number
  fim: number
  texto: string
  /** Rótulo do provedor, normalizado para `speaker_N`. */
  locutor: string | null
}

export interface ResultadoTranscricao {
  texto: string
  segmentos: SegmentoBruto[]
  /** Modelo que o provedor reportou ter usado (cai no pedido quando falta). */
  modelo: string
  /** Custo reportado pelo OpenRouter, quando vem. */
  custoUsd: number | null
  idiomaDetectado: string | null
}

export class ErroTranscricao extends Error {
  status: number
  constructor(msg: string, status = 502) {
    super(msg)
    this.name = "ErroTranscricao"
    this.status = status
  }
}

// ── Leitura defensiva da resposta ───────────────────────────────────────

interface SegmentoJson {
  start?: number
  end?: number
  text?: string
  speaker?: unknown
  speaker_id?: unknown
  speaker_label?: unknown
  speakerId?: unknown
}

interface RespostaJson {
  text?: string
  language?: string
  model?: string
  segments?: SegmentoJson[]
  /** Alguns provedores devolvem a diarização em uma lista separada. */
  diarization?: SegmentoJson[]
  speakers?: SegmentoJson[]
  usage?: { cost?: number; total_cost?: number }
  cost?: number
}

/**
 * Normaliza qualquer forma de rótulo (`0`, `"SPEAKER_1"`, `"Speaker 2"`)
 * para `speaker_N`. É esse rótulo que vira a chave estável de
 * `transcricoes_locutores.rotulo_original`.
 */
export function normalizarLocutor(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === "number" && Number.isFinite(v)) return `speaker_${v}`
  if (typeof v !== "string") return null
  const s = v.trim()
  if (!s) return null
  const m = s.match(/(\d+)\s*$/)
  if (m) return `speaker_${Number(m[1])}`
  // Nome já humano ("Bruno"): serve como rótulo estável do jeito que veio.
  return s.toLowerCase().replace(/\s+/g, "_")
}

function locutorDoSegmento(seg: SegmentoJson): string | null {
  return (
    normalizarLocutor(seg.speaker) ??
    normalizarLocutor(seg.speaker_id) ??
    normalizarLocutor(seg.speakerId) ??
    normalizarLocutor(seg.speaker_label)
  )
}

/**
 * Converte a resposta em segmentos com offset aplicado.
 *
 * `offsetSeg` é o deslocamento do pedaço dentro do áudio inteiro. Errar
 * isso invalida TODOS os timestamps a partir do segundo pedaço, e o
 * sintoma só aparece em vídeo longo — por isso é parâmetro explícito.
 */
export function segmentosDaResposta(json: RespostaJson, offsetSeg = 0): SegmentoBruto[] {
  const brutos = json.segments ?? json.diarization ?? json.speakers ?? []
  const out: SegmentoBruto[] = []
  for (const seg of brutos) {
    const texto = (seg.text ?? "").trim()
    if (!texto) continue
    const s = Number(seg.start)
    const fim = Number(seg.end)
    if (!Number.isFinite(s)) continue
    out.push({
      s: s + offsetSeg,
      fim: (Number.isFinite(fim) ? fim : s) + offsetSeg,
      texto,
      locutor: locutorDoSegmento(seg),
    })
  }
  // Sem segmentos mas com texto: o provedor não devolveu verbose_json. Vale
  // guardar o texto num bloco só — perder a transcrição inteira por causa
  // do formato seria pior que perder os timestamps.
  if (out.length === 0 && (json.text ?? "").trim()) {
    out.push({ s: offsetSeg, fim: offsetSeg, texto: json.text!.trim(), locutor: null })
  }
  return out
}

function custoDaResposta(json: RespostaJson): number | null {
  const v = json.usage?.cost ?? json.usage?.total_cost ?? json.cost
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

// ── Chamada ─────────────────────────────────────────────────────────────

export interface OpcoesTranscricao {
  modelo?: string
  idioma?: string
  /** Jargão da coleção — o parâmetro de maior impacto na qualidade. */
  phraseList?: string[]
  /** Deslocamento do pedaço dentro do áudio completo. */
  offsetSeg?: number
  timeoutMs?: number
  nomeArquivo?: string
}

export function transcricaoDisponivel(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY)
}

export async function transcreverAudio(
  audio: Blob | Buffer | Uint8Array,
  opts: OpcoesTranscricao = {},
): Promise<ResultadoTranscricao> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new ErroTranscricao("OPENROUTER_API_KEY não configurada.", 500)

  const modelo = opts.modelo || MODELO_PADRAO
  const blob =
    audio instanceof Blob
      ? audio
      : new Blob([new Uint8Array(audio as Uint8Array)], { type: "audio/flac" })

  if (blob.size > LIMITE_AUDIO_BYTES + 1024 * 1024) {
    throw new ErroTranscricao(
      `Áudio de ${(blob.size / 1024 / 1024).toFixed(1)} MB passa do limite do provedor; divida em pedaços antes.`,
      413,
    )
  }

  const form = new FormData()
  form.append("file", blob, opts.nomeArquivo || "audio.flac")
  form.append("model", modelo)
  if (opts.idioma) form.append("language", curtoIdioma(opts.idioma))
  form.append("response_format", "verbose_json")
  form.append(
    "provider",
    JSON.stringify({
      options: {
        azure: {
          diarization: { enabled: true },
          ...(opts.phraseList?.length ? { phraseList: { phrases: opts.phraseList.slice(0, 500) } } : {}),
          enhancedMode: { modelOptions: { transcribeStyle: "verbatim" } },
        },
      },
    }),
  )

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15 * 60_000)
  try {
    const resp = await fetch(URL_TRANSCRICOES, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://admin.convertfy.com.br",
        "X-Title": "Convertfy Transcrições",
      },
      body: form,
      signal: controller.signal,
    })
    if (!resp.ok) {
      const corpo = (await resp.text().catch(() => "")).slice(0, 400)
      throw new ErroTranscricao(`OpenRouter ${resp.status}: ${corpo || resp.statusText}`, resp.status)
    }
    const json = (await resp.json()) as RespostaJson
    const segmentos = segmentosDaResposta(json, opts.offsetSeg ?? 0)
    if (segmentos.length === 0) {
      throw new ErroTranscricao("O provedor devolveu uma transcrição vazia.", 502)
    }
    return {
      texto: (json.text ?? segmentos.map((s) => s.texto).join(" ")).trim(),
      segmentos,
      modelo: json.model || modelo,
      custoUsd: custoDaResposta(json),
      idiomaDetectado: json.language ?? null,
    }
  } catch (e) {
    if (e instanceof ErroTranscricao) throw e
    const msg = e instanceof Error ? e.message : String(e)
    log.warn("falha ao transcrever", { erro: msg, modelo })
    throw new ErroTranscricao(msg)
  } finally {
    clearTimeout(timer)
  }
}

/** "pt-BR" → "pt": o campo `language` do endpoint é ISO-639-1. */
export function curtoIdioma(idioma: string): string {
  return idioma.split("-")[0].toLowerCase()
}

/**
 * Junta os resultados dos pedaços numa transcrição só. Cada pedaço já vem
 * com o offset aplicado; aqui a ordem é garantida e os custos somados.
 */
export function juntarPedacos(partes: ResultadoTranscricao[]): ResultadoTranscricao {
  const segmentos = partes.flatMap((p) => p.segmentos).sort((a, b) => a.s - b.s)
  const custos = partes.map((p) => p.custoUsd).filter((c): c is number => c != null)
  return {
    texto: partes.map((p) => p.texto).join(" ").trim(),
    segmentos,
    modelo: partes[0]?.modelo ?? MODELO_PADRAO,
    custoUsd: custos.length ? custos.reduce((a, b) => a + b, 0) : null,
    idiomaDetectado: partes[0]?.idiomaDetectado ?? null,
  }
}
