/**
 * O run descartado em silêncio — e o que o log tem de dizer.
 *
 * `logGenerationRun` engole erro de INSERT de propósito ("telemetria não
 * deve bloquear a geração"), e essa decisão está certa. O que estava errado
 * era a linha de log: dizia só "insert_failed". O `copy_fit` passou de
 * 28/08 a 01/09 sem gravar um único run — prompt, raw_output, de_para com o
 * motivo de cada recusa, tokens e custo, tudo perdido — porque a migration
 * que criou o agente não abriu o CHECK de `agent`. Quatro dias de "o agente
 * não aparece na UI" que uma mensagem de log teria resolvido em dois
 * minutos.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const h = vi.hoisted(() => ({
  erro: null as { code?: string; message: string } | null,
  logs: [] as Array<{ msg: string; ctx: Record<string, unknown> }>,
}))

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: () => ({
        select: () => ({
          single: () =>
            Promise.resolve(
              h.erro ? { data: null, error: h.erro } : { data: { id: "run-1" }, error: null },
            ),
        }),
      }),
    }),
  }),
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: () => {},
      warn: () => {},
      error: (msg: string, ctx: Record<string, unknown>) => h.logs.push({ msg, ctx }),
    }),
  },
}))

import { logGenerationRun } from "./telemetry.callback"

const base = {
  storeId: "s1",
  batchId: "b1",
  agent: "copy_fit" as const,
  status: "success" as const,
}

beforeEach(() => {
  h.erro = null
  h.logs.length = 0
})

describe("logGenerationRun — agente fora do CHECK", () => {
  it("nomeia a causa quando o Postgres devolve check_violation", async () => {
    h.erro = {
      code: "23514",
      message:
        'new row for relation "email_generation_runs" violates check constraint "email_generation_runs_agent_check"',
    }
    const id = await logGenerationRun(base)

    // Fail-open preservado: a geração segue sem run.
    expect(id).toBe("")
    expect(h.logs[0].msg).toBe("telemetry.insert_failed.agent_fora_do_check")
    // O nome do agente e o remédio (migration) têm de estar no contexto —
    // é o que faltava para o buraco ser visto.
    expect(h.logs[0].ctx.agent).toBe("copy_fit")
    expect(String(h.logs[0].ctx.hint)).toContain("copy_fit")
    expect(String(h.logs[0].ctx.hint)).toContain("migration")
  })

  it("outro erro de insert segue na mensagem genérica, sem hint enganoso", async () => {
    h.erro = { code: "22P02", message: "invalid input syntax for type uuid" }
    await logGenerationRun(base)

    expect(h.logs[0].msg).toBe("telemetry.insert_failed")
    expect(h.logs[0].ctx.hint).toBeUndefined()
  })

  it("insert que passa não loga nada e devolve o id", async () => {
    expect(await logGenerationRun(base)).toBe("run-1")
    expect(h.logs).toHaveLength(0)
  })
})
