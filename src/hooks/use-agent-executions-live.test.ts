/**
 * Reconciliação da aba Execuções ao vivo.
 *
 * Os casos vêm do modo de falha que o hook existe para não ter: um evento
 * de RUN (agente acionado) não move o `updated_at` do e-mail, só a lista de
 * runs. Desempatar por `updated_at` — como o hook de runs faz — descartaria
 * em silêncio justamente o evento que acende o nó no canvas.
 */

import { describe, it, expect } from "vitest"
import {
  execRecency,
  mergeExecutionsSnapshot,
  upsertExecution,
} from "./use-agent-executions-live"
import type { AgentExecution } from "@/types/agent-executions"

function exec(
  id: string,
  updatedAt: string,
  runs: Array<{ agent: string; status: string; createdAt: string }> = [],
): AgentExecution {
  return {
    email_id: id,
    email_name: `Email ${id}`,
    email_number: 1,
    email_status: "rendering",
    bucket: "running",
    failure_reason: null,
    updated_at: updatedAt,
    ready_at: null,
    failed_at: null,
    store_id: "loja",
    store_name: "Hero Boxers",
    flow_id: "flow",
    flow_type: "welcome",
    flow_type_label: "Welcome",
    cost_cents: 0,
    runs: runs.map((r) => ({
      run_id: `${id}-${r.agent}`,
      agent: r.agent as AgentExecution["runs"][number]["agent"],
      model: null,
      status: r.status,
      duration_ms: null,
      cost_cents: null,
      tokens_input: null,
      tokens_output: null,
      retry_count: null,
      error_message: null,
      created_at: r.createdAt,
    })),
  }
}

describe("execRecency", () => {
  it("é o maior carimbo do payload, não só o do e-mail", () => {
    const e = exec("a", "2026-09-08T11:00:00Z", [
      { agent: "hero_section", status: "success", createdAt: "2026-09-08T11:02:00Z" },
      { agent: "text_format", status: "running", createdAt: "2026-09-08T11:05:00Z" },
    ])
    expect(execRecency(e)).toBe("2026-09-08T11:05:00Z")
  })

  it("sem runs, é o updated_at do e-mail", () => {
    expect(execRecency(exec("a", "2026-09-08T11:00:00Z"))).toBe(
      "2026-09-08T11:00:00Z",
    )
  })
})

describe("upsertExecution", () => {
  it("substitui mesmo com updated_at IDÊNTICO — é o evento de run", () => {
    const antes = exec("a", "2026-09-08T11:00:00Z", [
      { agent: "hero_section", status: "success", createdAt: "2026-09-08T11:02:00Z" },
    ])
    // O agente seguinte foi acionado: o e-mail não mudou de status, então
    // `updated_at` é o mesmo. Só a lista de runs cresceu.
    const depois = exec("a", "2026-09-08T11:00:00Z", [
      { agent: "hero_section", status: "success", createdAt: "2026-09-08T11:02:00Z" },
      { agent: "text_format", status: "running", createdAt: "2026-09-08T11:03:00Z" },
    ])
    const out = upsertExecution([antes], depois)
    expect(out).toHaveLength(1)
    expect(out[0].runs.map((r) => r.agent)).toEqual([
      "hero_section",
      "text_format",
    ])
  })

  it("insere execução nova e ordena por updated_at desc", () => {
    const velha = exec("a", "2026-09-08T10:00:00Z")
    const nova = exec("b", "2026-09-08T12:00:00Z")
    const out = upsertExecution([velha], nova)
    expect(out.map((e) => e.email_id)).toEqual(["b", "a"])
  })

  it("respeita o teto da lista", () => {
    const muitas = Array.from({ length: 60 }, (_, i) =>
      exec(`e${i}`, `2026-09-08T10:${String(i).padStart(2, "0")}:00Z`),
    )
    const out = upsertExecution(muitas, exec("nova", "2026-09-08T23:00:00Z"))
    expect(out).toHaveLength(60)
    expect(out[0].email_id).toBe("nova")
  })
})

describe("mergeExecutionsSnapshot", () => {
  it("empate vai para o SNAPSHOT — é a leitura mais fresca do banco", () => {
    // Com o SSE morto nenhum evento local chega, a recência local nunca
    // passa a do snapshot, e o fallback tem de assumir sozinho.
    const local = exec("a", "2026-09-08T11:00:00Z", [
      { agent: "hero_section", status: "running", createdAt: "2026-09-08T11:02:00Z" },
    ])
    const snapshot = exec("a", "2026-09-08T11:00:00Z", [
      { agent: "hero_section", status: "success", createdAt: "2026-09-08T11:02:00Z" },
    ])
    const out = mergeExecutionsSnapshot([local], [snapshot])
    expect(out[0].runs[0].status).toBe("success")
  })

  it("local estritamente mais novo não regride", () => {
    const local = exec("a", "2026-09-08T11:00:00Z", [
      { agent: "text_format", status: "running", createdAt: "2026-09-08T11:09:00Z" },
    ])
    const snapshot = exec("a", "2026-09-08T11:00:00Z", [
      { agent: "hero_section", status: "success", createdAt: "2026-09-08T11:02:00Z" },
    ])
    const out = mergeExecutionsSnapshot([local], [snapshot])
    expect(out[0].runs[0].agent).toBe("text_format")
  })

  it("execução que o SSE trouxe e a janela do snapshot não cobre é PRESERVADA", () => {
    // Sem isto ela pisca: entra pelo evento, sai no refresh, volta no
    // próximo evento.
    const soNoSse = exec("fora", "2026-09-08T09:00:00Z")
    const out = mergeExecutionsSnapshot(
      [soNoSse],
      [exec("a", "2026-09-08T11:00:00Z")],
    )
    expect(out.map((e) => e.email_id)).toEqual(["a", "fora"])
  })

  it("o snapshot define a janela e a ordem", () => {
    const out = mergeExecutionsSnapshot(
      [],
      [exec("a", "2026-09-08T10:00:00Z"), exec("b", "2026-09-08T12:00:00Z")],
    )
    expect(out.map((e) => e.email_id)).toEqual(["b", "a"])
  })
})
