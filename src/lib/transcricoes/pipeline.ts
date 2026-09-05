/**
 * Estado do pipeline — puro. Classificação de erro, backoff e o que a
 * barra de etapas pode dizer.
 *
 * Duas regras que a UI depende e que não podem ser afrouxadas:
 *
 * 1. A etapa de transcrição NÃO tem porcentagem. É uma chamada síncrona ao
 *    provedor: não existe progresso para reportar. O segmento fica em
 *    "em andamento" e pronto. Preencher com número inventado é a mentira
 *    que faz o usuário achar que travou em 70%.
 *
 * 2. Bloqueio de IP de datacenter é comportamento ESPERADO das três
 *    plataformas, não exceção rara. Tem mensagem própria, retry com
 *    backoff e slot de proxy. Nunca vira "falha genérica".
 */

import { ETAPAS, type EtapaPipeline, type StatusTranscricao } from "./types"

export type CodigoErro =
  /** A plataforma recusou o IP do servidor (o caso mais comum em produção). */
  | "ip_bloqueado"
  /** Vídeo privado, removido, ou exige login. */
  | "indisponivel"
  /** A plataforma pediu verificação humana. */
  | "login_exigido"
  /** Áudio maior que o limite do provedor mesmo depois de dividir. */
  | "audio_grande"
  /** O provedor de transcrição recusou (chave, cota, indisponível). */
  | "provedor"
  /** Sem áudio no arquivo. */
  | "sem_audio"
  /** Rede, disco, qualquer outra coisa. */
  | "desconhecido"

/** Erro que vale nova tentativa sozinho (o resto precisa de humano). */
const RETENTAVEIS: ReadonlySet<CodigoErro> = new Set<CodigoErro>([
  "ip_bloqueado",
  "provedor",
  "desconhecido",
])

export const MAX_TENTATIVAS = 5

/**
 * Traduz a saída bruta de yt-dlp/ffmpeg/provedor em um código estável.
 * A saída do yt-dlp é texto livre em inglês e muda entre versões, então o
 * casamento é por assinatura, não por frase exata.
 */
export function classificarErro(bruto: string): CodigoErro {
  const s = (bruto || "").toLowerCase()
  if (
    s.includes("sign in to confirm you're not a bot") ||
    s.includes("confirm you are not a bot") ||
    s.includes("http error 429") ||
    s.includes("too many requests") ||
    s.includes("blocked it in your country") ||
    s.includes("unusual traffic") ||
    s.includes("http error 403") ||
    s.includes("please solve the captcha")
  ) {
    return "ip_bloqueado"
  }
  if (s.includes("login required") || s.includes("requires authentication") || s.includes("private video")) {
    return "login_exigido"
  }
  if (
    s.includes("video unavailable") ||
    s.includes("this content isn't available") ||
    s.includes("removed by the uploader") ||
    s.includes("http error 404")
  ) {
    return "indisponivel"
  }
  if (s.includes("does not contain any stream") || s.includes("no audio")) return "sem_audio"
  if (s.includes("maximum content size") || s.includes("file too large") || s.includes("413")) return "audio_grande"
  if (s.includes("openrouter") || s.includes("transcription") || s.includes("insufficient credits")) return "provedor"
  return "desconhecido"
}

/** O que aparece no card. Frase inteira, sem jargão de stack trace. */
export function mensagemDeErro(codigo: CodigoErro, plataformaLabel: string): string {
  switch (codigo) {
    case "ip_bloqueado":
      return `O ${plataformaLabel} bloqueou o acesso a partir do servidor. Tentando novamente em instantes.`
    case "login_exigido":
      return `O ${plataformaLabel} exige login para este vídeo. Baixe o arquivo e envie por upload.`
    case "indisponivel":
      return "O vídeo não está mais disponível nesta URL."
    case "sem_audio":
      return "O arquivo não tem faixa de áudio."
    case "audio_grande":
      return "O áudio ficou grande demais para o provedor mesmo depois de dividir."
    case "provedor":
      return "O provedor de transcrição recusou a chamada. Verifique a chave e os créditos."
    default:
      return "Não foi possível processar. Veja o detalhe e tente reprocessar."
  }
}

export function ehRetentavel(codigo: CodigoErro, tentativas: number): boolean {
  return RETENTAVEIS.has(codigo) && tentativas < MAX_TENTATIVAS
}

/**
 * Backoff exponencial com teto e jitter. Sem jitter, cinco itens que
 * falharam no mesmo minuto voltam juntos e tomam bloqueio de novo.
 */
export function proximaTentativaMs(tentativas: number, aleatorio = Math.random): number {
  const base = Math.min(30 * 60_000, 30_000 * 2 ** Math.max(0, tentativas - 1))
  return Math.round(base * (0.75 + aleatorio() * 0.5))
}

// ── Barra de etapas ─────────────────────────────────────────────────────

export interface SegmentoEtapa {
  i: EtapaPipeline
  nome: string
  estado: "feita" | "atual" | "futura"
  /** null = etapa em andamento sem porcentagem real (nunca inventar). */
  preenchimento: number | null
}

export function segmentosDaEtapa(
  status: StatusTranscricao,
  etapa: EtapaPipeline,
  progresso: number | null,
): SegmentoEtapa[] {
  return ETAPAS.map((e) => {
    if (status === "pronta") return { ...e, estado: "feita" as const, preenchimento: 100 }
    if (e.i < etapa) return { ...e, estado: "feita" as const, preenchimento: 100 }
    if (e.i > etapa) return { ...e, estado: "futura" as const, preenchimento: 0 }
    return {
      ...e,
      estado: "atual" as const,
      preenchimento: e.mensuravel && progresso != null ? clamp(progresso) : null,
    }
  }).map(({ i, nome, estado, preenchimento }) => ({ i, nome, estado, preenchimento }))
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)))

/** Rótulo curto do card ("Transcrevendo", "Baixando 62%"). */
export function rotuloDaEtapa(
  status: StatusTranscricao,
  etapa: EtapaPipeline,
  progresso: number | null,
): string {
  if (status === "pronta") return "Pronta"
  if (status === "erro") return "Erro"
  if (status === "aguardando") return "Na fila"
  const e = ETAPAS[etapa]
  if (!e) return "Processando"
  return e.mensuravel && progresso != null ? `${e.nome} ${clamp(progresso)}%` : e.nome
}

// ── Tempo ───────────────────────────────────────────────────────────────

/** 47:12 ou 1:12:40 — o formato que o design usa em card, player e chip. */
export function fmtDuracao(seg: number | null | undefined): string {
  if (seg == null || !Number.isFinite(seg) || seg < 0) return "—"
  const t = Math.round(seg)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  const dd = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${dd(m)}:${dd(s)}` : `${m}:${dd(s)}`
}

/** "8h 12min" do subtítulo da biblioteca. Zero vira "0min", não "—". */
export function fmtDuracaoLonga(seg: number | null | undefined): string {
  if (seg == null || !Number.isFinite(seg) || seg < 0) return "—"
  const t = Math.round(seg)
  const h = Math.floor(t / 3600)
  const m = Math.round((t % 3600) / 60)
  if (h > 0) return m > 0 ? `${h}h ${m}min` : `${h}h`
  return `${m}min`
}

/** MM:SS ou H:MM:SS aceito no `?t=` da URL. */
export function parseTimestamp(v: string | null | undefined): number | null {
  if (!v) return null
  const t = v.trim()
  if (/^\d+$/.test(t)) return Number(t)
  const partes = t.split(":").map((p) => Number(p))
  if (partes.some((p) => !Number.isFinite(p) || p < 0)) return null
  if (partes.length === 2) return partes[0] * 60 + partes[1]
  if (partes.length === 3) return partes[0] * 3600 + partes[1] * 60 + partes[2]
  return null
}
