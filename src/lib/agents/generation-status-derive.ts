/**
 * Status agregado de UM batch de geração — puro, sem I/O.
 *
 * Extraído da rota `generation-status/[batchId]` (08/09) porque a regra
 * nasceu de um incidente e precisa de teste: a timeline da aba Teste ficava
 * MUDA do começo ao fim, e a segunda causa (depois da chave do SWR nascer só
 * no retorno do POST) era esta derivação dizer "done" no primeiro tique.
 *
 * O motivo: o claim de uma geração nova grava `generation_batch_id` no
 * e-mail e NÃO mexe no `status` — que continua `ready`, da geração anterior.
 * Medido em produção: o batch 31f290bb fechou 14:19 em `ready` e o batch
 * 255db479 começou 14:26 com o e-mail ainda `ready`. Lendo o status como
 * autoridade, a resposta saía `done` aos 2 segundos, o cliente parava o
 * polling e a tela congelava com todos os agentes pendentes.
 *
 * A prova de que o `ready` é DESTA geração é temporal: o e-mail só vira
 * terminal DEPOIS que a última run do batch já existe (a linha da run nasce
 * no início do passo; o e-mail vira `ready` depois do QA). Na run medida:
 * última run criada 14:34:38.648, e-mail atualizado 14:34:38.725.
 *
 * IMPORTANTE: a comparação é com o `created_at` da run, nunca com o fim dela
 * (`created_at + duration_ms`) — na mesma run o fim é 14:34:39.02, DEPOIS do
 * `updated_at` do e-mail, e a regra se inverteria.
 */

export type BatchStatus = "pending" | "running" | "done" | "error"

export interface RunSnapshot {
  status: string
  created_at?: string | null
}

function ts(value: string | null | undefined): number | null {
  if (!value) return null
  const t = Date.parse(value)
  return Number.isNaN(t) ? null : t
}

/** Decide pelas próprias runs — sem o e-mail como autoridade. */
function statusPelasRuns(runs: RunSnapshot[]): BatchStatus {
  if (runs.some((r) => r.status === "running")) return "running"
  if (runs.some((r) => r.status === "error")) return "error"
  return "done"
}

export function derivarStatusDoBatch(opts: {
  /** Runs DESTE batch (as de outros batches não entram na conta). */
  runs: RunSnapshot[]
  /** `email_flow_emails.generation_batch_id` é este batch? */
  emailOwnsBatch: boolean
  emailStatus?: string | null
  emailUpdatedAt?: string | null
}): BatchStatus {
  const { runs, emailOwnsBatch, emailStatus, emailUpdatedAt } = opts

  // Batch sem run nenhuma nunca é "done": ou o trabalho ainda não começou
  // (a janela entre o clique e a primeira run), ou ele morreu antes de
  // abrir a primeira. Nos dois casos o `ready` que estiver no e-mail é de
  // outra geração.
  if (runs.length === 0) return "pending"

  // Sem e-mail dono (geração superada por outra, ou e-mail sem status), o
  // batch responde por si.
  if (!emailOwnsBatch || !emailStatus) return statusPelasRuns(runs)

  const ultimaRun = runs.reduce<number | null>((max, r) => {
    const t = ts(r.created_at)
    if (t == null) return max
    return max == null || t > max ? t : max
  }, null)
  const atualizado = ts(emailUpdatedAt)
  const assentou =
    ultimaRun == null || (atualizado != null && atualizado >= ultimaRun)

  if (assentou && emailStatus === "ready") return "done"
  if (assentou && emailStatus === "failed") return "error"

  // Tudo o mais é geração em voo — inclusive o `ready`/`failed` que ainda
  // não assentou (o da geração anterior) e os status intermediários
  // (copy_generating, rendering, qa_running…).
  return "running"
}
