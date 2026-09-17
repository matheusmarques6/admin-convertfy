/**
 * O progresso do leque, gravado posição a posição.
 *
 * ── Por que isto existe ──────────────────────────────────────────────
 *
 * O leque chama o modelo uma vez por posição, em série, até acabar. Quem
 * interrompe isso não é o laço: é o RUNTIME. Quando o `maxDuration` da
 * função acaba, o processo é morto sem `catch`, sem `finally` e sem
 * resposta — e as posições já decididas se perdem com ele. A invocação
 * seguinte recomeçava do zero, pagando o Curador inteiro de novo
 * (US$ 1,7–2,5 medidos em 15/09). É o mesmo defeito que o cron tinha
 * antes da Fase 0: "sobrevivia morrendo no meio e recomeçando o e-mail no
 * tick seguinte, pagando o Curador de novo" (`fase1-orcamento.ts`).
 *
 * Com a decisão gravada assim que sai, "continuar até acabar" ATRAVESSA o
 * limite do runtime em vez de esbarrar nele: se couber, termina numa
 * invocação; se não couber, a próxima retoma da posição seguinte. É a
 * saída que o próprio código já apontava — "com cada agente num passo
 * durável, ninguém divide janela com ninguém".
 *
 * ── O escopo da retomada é o BATCH ───────────────────────────────────
 *
 * A chave é (email_id, batch_id): mesmo batch é a MESMA geração, então
 * reaproveitar é continuar. Batch novo é geração nova — decisão velha ali
 * seria escolha de outra rodada entrando calada numa peça que ninguém
 * mandou reusar.
 *
 * A run anterior pode estar `running` (o processo morreu e ninguém a
 * fechou) ou `error` (o watchdog a fechou passados 20 min). As duas
 * servem: o que vale é o que ela GRAVOU, não como ela terminou.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { updateGenerationRun } from "@/lib/agents/callbacks/telemetry.callback"
import type { EscolhaDaPosicao } from "./curador-leque"

const log = logger.child("CuradorLequeProgresso")

/** O que uma gravação parcial guarda. Subconjunto do `parsed_output` final. */
export interface ProgressoDoLeque {
  escolhas: EscolhaDaPosicao[]
  /** Marca a gravação de meio de caminho — some quando a run fecha. */
  parcial: true
  atualizado_em: string
}

/**
 * Lê as posições já decididas nesta geração, se houver.
 *
 * Fail-open em tudo: sem banco, sem coluna ou com JSON estranho, devolve
 * lista vazia e o leque roda inteiro. Retomada é economia, nunca
 * requisito — e uma leitura frouxa que devolvesse lixo custaria a peça.
 */
export async function carregarEscolhasGravadas(p: {
  emailId?: string | null
  batchId?: string | null
  exceptRunId?: string
}): Promise<EscolhaDaPosicao[]> {
  if (!p.emailId || !p.batchId) return []
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("email_generation_runs")
      .select("id, parsed_output")
      .eq("email_id", p.emailId)
      .eq("batch_id", p.batchId)
      .eq("agent", "assembler_chooser")
      .order("created_at", { ascending: false })
      .limit(4)
    if (error || !data) return []
    for (const row of data) {
      if (p.exceptRunId && row.id === p.exceptRunId) continue
      const escolhas = escolhasDoParsed(row.parsed_output)
      if (escolhas.length > 0) {
        log.info("leque.retomada.encontrada", { runAnterior: row.id, posicoes: escolhas.length })
        return escolhas
      }
    }
  } catch (e) {
    log.warn("leque.retomada.falhou", { erro: e instanceof Error ? e.message : String(e) })
  }
  return []
}

/**
 * Extrai as escolhas de um `parsed_output`, seja ele parcial ou final.
 *
 * Aceita as duas formas de propósito: a parcial (`{leque:{escolhas}}`,
 * escrita no meio do laço) e a final (o mesmo caminho, escrito no
 * fechamento). Exigir a flag `parcial` faria a retomada ignorar
 * justamente a run que terminou de gravar e morreu logo depois.
 */
export function escolhasDoParsed(parsed: unknown): EscolhaDaPosicao[] {
  if (!parsed || typeof parsed !== "object") return []
  const leque = (parsed as Record<string, unknown>).leque
  if (!leque || typeof leque !== "object") return []
  const escolhas = (leque as Record<string, unknown>).escolhas
  if (!Array.isArray(escolhas)) return []
  return escolhas.filter(
    (e): e is EscolhaDaPosicao =>
      !!e && typeof e === "object" && typeof (e as EscolhaDaPosicao).block_index === "number",
  )
}

/**
 * Grava o que já foi decidido, mantendo a run em `running`.
 *
 * Fail-open e sem `await` no caller crítico: a decisão está na memória e
 * vai no fechamento de qualquer jeito; o que esta escrita compra é a
 * sobrevivência dela à morte do processo.
 */
export async function gravarProgressoDoLeque(
  runId: string,
  escolhas: ReadonlyArray<EscolhaDaPosicao>,
): Promise<void> {
  if (!runId) return
  const progresso: ProgressoDoLeque = {
    escolhas: [...escolhas],
    parcial: true,
    atualizado_em: new Date().toISOString(),
  }
  await updateGenerationRun(runId, { status: "running", parsedOutput: { leque: progresso } })
}
