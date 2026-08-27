import { describe, expect, it } from "vitest"

import { STUDIO_NODES } from "./studio-graph"
import {
  TEST_AGENT_LABELS,
  TEST_BASE_AGENT_KEYS,
  canRecoverAfterTimeout,
  computeStale,
  errText,
  expectedSteps,
  fmtElapsed,
  isTerminalStatus,
  isTimeoutMarker,
  phaseMessage,
} from "./test-run-view"

describe("phaseMessage", () => {
  it("cada status acende a fase certa", () => {
    expect(phaseMessage("pending", null)).toBe("Na fila…")
    expect(phaseMessage("copy_generating", null)).toContain("n8n")
    expect(phaseMessage("copy_ready", null)).toContain("imagens")
    expect(phaseMessage("image_done", null)).toContain("Hero Section")
    expect(phaseMessage("qa_running", null)).toContain("QA")
    expect(phaseMessage("ready", null)).toBeNull()
  })

  it("rendering usa html_pipeline_stage como último step CONCLUÍDO", () => {
    expect(phaseMessage("rendering", null)).toContain("Hero Section")
    expect(phaseMessage("rendering", "hero")).toContain("Formatação de Texto")
    expect(phaseMessage("rendering", "text")).toContain("Formatação de Imagem")
    expect(phaseMessage("rendering", "image")).toContain("Cores & Botões")
  })
})

describe("expectedSteps", () => {
  it("phase2 lista só a fase 2; default/full incluem fase 1 + seed + copy", () => {
    const p2 = expectedSteps("phase2").map((s) => s.agent)
    expect(p2[0]).toBe("image")
    expect(p2).not.toContain("assembler")
    const full = expectedSteps("full").map((s) => s.agent)
    expect(full.slice(0, 8)).toEqual([
      "estruturador",
      "assembler_chooser",
      "assembler",
      "blueprint",
      "subject",
      "seed",
      "copy_dispatch",
      "copy",
    ])
    expect(full).toContain("color_format")
    expect(expectedSteps("default")).toEqual(expectedSteps("full"))
  })
})

describe("errText", () => {
  it("string passa, objeto da API resolve pela chave conhecida", () => {
    expect(errText("boom")).toBe("boom")
    expect(errText({ error: "x" })).toBe("x")
    expect(errText({ message: "y" })).toBe("y")
    expect(errText({ failure_reason: "z" })).toBe("z")
  })

  it("objeto sem chave conhecida vira JSON, nunca [object Object]", () => {
    expect(errText({ code: 42 })).toBe('{"code":42}')
    expect(errText(null)).toBe("")
  })
})

describe("isTerminalStatus", () => {
  it("done/error do batch e failed/ready do email são terminais", () => {
    expect(isTerminalStatus({ status: "done" })).toBe(true)
    expect(isTerminalStatus({ status: "error" })).toBe(true)
    expect(isTerminalStatus({ email_status: "failed" })).toBe(true)
    expect(isTerminalStatus({ email_status: "ready" })).toBe(true)
    expect(isTerminalStatus({ status: "pending", email_status: "rendering" })).toBe(false)
    expect(isTerminalStatus(null)).toBe(false)
  })
})

describe("recovery pós-timeout (incidente Luxe Lift 27/07)", () => {
  it("só o marcador __timeout__ conta — 'timed out' de erro do servidor não", () => {
    expect(isTimeoutMarker("__timeout__: a conexão expirou")).toBe(true)
    expect(isTimeoutMarker("LLM request timed out")).toBe(false)
  })

  it("recovery só vale no fullPipeline (claim grava o batch antes da fase 1)", () => {
    expect(canRecoverAfterTimeout("__timeout__: x", true)).toBe(true)
    expect(canRecoverAfterTimeout("__timeout__: x", false)).toBe(false)
    expect(canRecoverAfterTimeout("outro erro", true)).toBe(false)
  })
})

describe("computeStale", () => {
  const now = Date.parse("2026-08-19T12:00:00Z")
  it("in-flight sem atividade há >90s é stale; fase não in-flight nunca é", () => {
    const old = new Date(now - 120_000).toISOString()
    expect(
      computeStale({ emailStatus: "rendering", lastRunCreatedAt: old, emailUpdatedAt: null, nowMs: now }),
    ).toBe(true)
    expect(
      computeStale({ emailStatus: "copy_generating", lastRunCreatedAt: old, emailUpdatedAt: null, nowMs: now }),
    ).toBe(false)
  })

  it("atividade recente ou sem timestamp não dispara", () => {
    const recent = new Date(now - 30_000).toISOString()
    expect(
      computeStale({ emailStatus: "qa_running", lastRunCreatedAt: recent, emailUpdatedAt: null, nowMs: now }),
    ).toBe(false)
    expect(
      computeStale({ emailStatus: "rendering", lastRunCreatedAt: null, emailUpdatedAt: null, nowMs: now }),
    ).toBe(false)
  })

  it("cai no emailUpdatedAt quando não há run", () => {
    const old = new Date(now - 200_000).toISOString()
    expect(
      computeStale({ emailStatus: "image_done", lastRunCreatedAt: null, emailUpdatedAt: old, nowMs: now }),
    ).toBe(true)
  })
})

describe("fmtElapsed", () => {
  it("segundos e minutos com zero à esquerda", () => {
    expect(fmtElapsed(42_000)).toBe("42s")
    expect(fmtElapsed(187_000)).toBe("3m07s")
    expect(fmtElapsed(-5)).toBe("0s")
  })
})

// ── Correções pós-observação em produção (ago/2026) ──────────────────────

import { runHeaderLabel } from "./test-run-view"

describe("computeStale com run em execução", () => {
  const now = Date.parse("2026-08-19T16:37:00Z")
  it("run running dentro do budget do step NÃO é travada (falso alarme corrigido)", () => {
    // Caso real: text_format retry rodando há ~3,5min (budget do step: 540s).
    const started = new Date(now - 3.5 * 60_000).toISOString()
    expect(
      computeStale({
        emailStatus: "rendering",
        lastRunCreatedAt: started,
        lastRunStatus: "running",
        emailUpdatedAt: null,
        nowMs: now,
      }),
    ).toBe(false)
  })

  it("run running além do limiar estendido (10min) ainda alerta", () => {
    const started = new Date(now - 11 * 60_000).toISOString()
    expect(
      computeStale({
        emailStatus: "rendering",
        lastRunCreatedAt: started,
        lastRunStatus: "running",
        emailUpdatedAt: null,
        nowMs: now,
      }),
    ).toBe(true)
  })

  it("run concluída mantém o limiar curto de 90s", () => {
    const done = new Date(now - 120_000).toISOString()
    expect(
      computeStale({
        emailStatus: "rendering",
        lastRunCreatedAt: done,
        lastRunStatus: "success",
        emailUpdatedAt: null,
        nowMs: now,
      }),
    ).toBe(true)
  })
})

describe("runHeaderLabel", () => {
  it("dispatched vale só ANTES do email progredir além da copy", () => {
    expect(
      runHeaderLabel({
        resultStatus: "dispatched",
        pollStatus: "pending",
        emailStatus: "copy_generating",
        hasRun: true,
      }),
    ).toBe("Copy disparada ao N8N")
    // Caso real: copy voltou e a montagem está rodando — header acompanha.
    expect(
      runHeaderLabel({
        resultStatus: "dispatched",
        pollStatus: "pending",
        emailStatus: "rendering",
        hasRun: true,
      }),
    ).toBe("Gerando email…")
  })

  it("terminais vencem tudo", () => {
    expect(
      runHeaderLabel({
        resultStatus: "dispatched",
        pollStatus: "done",
        emailStatus: "ready",
        hasRun: true,
      }),
    ).toBe("Geração concluída")
    expect(
      runHeaderLabel({
        resultStatus: "error",
        pollStatus: null,
        emailStatus: null,
        hasRun: true,
      }),
    ).toBe("Erro na geração")
  })

  it("sem execução em contexto, sem header", () => {
    expect(
      runHeaderLabel({ resultStatus: null, pollStatus: null, emailStatus: null, hasRun: false }),
    ).toBeNull()
  })
})

// A lista de steps do teste é mantida em paralelo ao mapa do Estúdio, e foi
// isso que deixou o Estruturador e o Dispatch invisíveis nesta tela mesmo
// depois de entrarem no grafo. A checagem é de MÃO ÚNICA de propósito: a
// lista pode ter passos que não são nós do mapa (`seed`, os legados
// html/refiner), o inverso é que é esquecimento.
describe("sincronia com o mapa do Estúdio", () => {
  const doGrafo = STUDIO_NODES.filter((n) => n.type === "agent").map(
    (n) => n.agent as string,
  )

  it("todo agente do mapa tem rótulo na aba Teste", () => {
    const semRotulo = doGrafo.filter((a) => !TEST_AGENT_LABELS[a])
    expect(semRotulo, `sem rótulo em TEST_AGENT_LABELS: ${semRotulo.join(", ")}`).toEqual([])
  })

  it("todo agente do mapa aparece na lista de steps", () => {
    const base: string[] = [...TEST_BASE_AGENT_KEYS]
    // `qavision` é a run de QA com visão (`agent='qa'` + `is_qa_vision`),
    // não um step próprio: no teste ele aparece dentro do QA.
    const esperado = doGrafo.filter((a) => a !== "qavision")
    const fora = esperado.filter((a) => !base.includes(a))
    expect(fora, `fora de TEST_BASE_AGENT_KEYS: ${fora.join(", ")}`).toEqual([])
  })
})
