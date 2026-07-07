/**
 * Polling client-safe dos jobs da fila de imports do Figma (Telas 1 e 2 da
 * Central de Campanhas). Os POSTs import-figma devolvem { job_id } e os
 * modais acompanham aqui até done/failed — o progresso parcial (result
 * cresce a cada loja settlada) chega via onTick.
 *
 * Só fetch — sem imports de servidor (usável em client components).
 */

import type { FigmaImportJobResponse } from "@/types/campaign-store-emails"

const DEFAULT_INTERVAL_MS = 2_500
// Campanha grande em fallback frame-a-frame a 8 exports/min pode levar vários
// ticks do cron — teto generoso; o job continua server-side se estourar.
const DEFAULT_TIMEOUT_MS = 20 * 60_000

export interface PollFigmaImportJobOptions<TResult> {
  /** Chamado a cada poll com o estado atual (progresso parcial incluso). */
  onTick?: (job: FigmaImportJobResponse<TResult>) => void
  intervalMs?: number
  timeoutMs?: number
  signal?: AbortSignal
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(new DOMException("Aborted", "AbortError"))
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

/**
 * Faz polling do job até status terminal (done/failed) e devolve o estado
 * final. Erros transitórios de rede não derrubam o polling — só o timeout.
 */
export async function pollFigmaImportJob<TResult>(
  taskId: string,
  jobId: string,
  opts: PollFigmaImportJobOptions<TResult> = {},
): Promise<FigmaImportJobResponse<TResult>> {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const t0 = Date.now()

  while (true) {
    if (opts.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError")
    }
    if (Date.now() - t0 > timeoutMs) {
      throw new Error(
        "O import está demorando mais que o esperado — ele continua rodando; reabra o modal em alguns minutos",
      )
    }

    try {
      const res = await fetch(`/api/tasks/${taskId}/figma-import-jobs/${jobId}`, {
        signal: opts.signal,
      })
      if (res.ok) {
        const j = await res.json().catch(() => ({}))
        const job = (j.data ?? j) as FigmaImportJobResponse<TResult>
        opts.onTick?.(job)
        if (job.status === "done" || job.status === "failed") return job
      } else if (res.status === 404) {
        // Job sumiu (deleção/campanha trocada) — não adianta insistir.
        throw new Error("Job de import não encontrado")
      }
      // Outros erros HTTP: transitórios (deploy, 5xx) — segue tentando.
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err
      if (err instanceof Error && err.message === "Job de import não encontrado") {
        throw err
      }
      // Erro de rede transitório — segue tentando até o timeout.
    }

    await sleep(intervalMs, opts.signal)
  }
}
