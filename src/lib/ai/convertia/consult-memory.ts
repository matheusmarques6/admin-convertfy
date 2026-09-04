/**
 * Memória de consulta da conversa — módulo PURO.
 *
 * O histórico reenviado ao modelo é só user/assistant; os resultados
 * das tools de turnos anteriores não voltam. Consequência: "e o popup
 * que você achou?" forçava uma nova consulta (ou uma resposta de
 * memória). A solução barata é guardar um DIGEST (~300 chars) de cada
 * resultado em `meta.sources[].digest` e injetar, no bloco dinâmico do
 * system prompt, "o que já foi consultado nesta conversa" — o modelo
 * sabe o que já viu e reconsulta só quando o dado pode ter mudado.
 */

export const DIGEST_MAX_CHARS = 300
/** Teto do bloco injetado no prompt (é o bloco DINÂMICO — não cacheia). */
export const CONSULTED_BLOCK_MAX_CHARS = 3_500

/** Colapsa espaços e corta — o digest é pra o modelo se situar, não pra citar. */
export function digestToolOutput(content: string, max = DIGEST_MAX_CHARS): string {
  const flat = content
    .replace(/[{}"[\]]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/([:,])(?=\S)/g, "$1 ")
    .replace(/\s{2,}/g, " ")
    .trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, max - 1)}…`
}

export interface ConsultedSource {
  tool: string
  label: string
  args_summary?: string | null
  summary?: string | null
  digest?: string | null
  write?: boolean
  /** Erro estruturado (não entra como "dado consultado"). */
  error_code?: string | null
}

export interface ConsultedTurn {
  /** Ordem cronológica: 1 = mais antigo. */
  index: number
  sources: ConsultedSource[]
}

/**
 * Monta o bloco a partir dos turnos anteriores (mais recente primeiro
 * por dentro do teto — o que importa mais é o que acabou de acontecer).
 * Devolve string vazia sem consultas.
 */
export function buildConsultedBlock(turns: ConsultedTurn[], maxChars = CONSULTED_BLOCK_MAX_CHARS): string {
  const lines: string[] = []
  let used = 0
  const ordered = [...turns].sort((a, b) => b.index - a.index)
  for (const t of ordered) {
    // dentro do turno também do fim pro começo — o reverse final
    // devolve tudo em ordem cronológica
    for (const s of [...t.sources].reverse()) {
      if (!s.digest && !s.summary) continue
      const verb = s.write ? "executou" : "consultou"
      const head = `- [turno ${t.index}] ${verb} ${s.label}${s.args_summary ? ` (${s.args_summary})` : ""}`
      const body = s.error_code
        ? ` → falhou (${s.error_code})`
        : ` → ${s.digest ?? s.summary}`
      const line = head + body
      if (used + line.length > maxChars) break
      lines.push(line)
      used += line.length + 1
    }
    if (used >= maxChars) break
  }
  if (lines.length === 0) return ""
  // cronológico na saída (o modelo lê de cima pra baixo)
  lines.reverse()
  return [
    "## O que já foi consultado nesta conversa (resumos dos resultados de ferramentas em turnos anteriores)",
    "Use para não repetir consultas cujo resultado não muda; reconsulte quando o dado for volátil (métricas de hoje, status de envio) ou quando precisar do detalhe completo.",
    ...lines,
  ].join("\n")
}
