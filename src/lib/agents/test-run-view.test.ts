import { describe, expect, it } from "vitest"

import { STUDIO_NODES } from "./studio-graph"
import {
  TEST_AGENT_LABELS,
  TEST_BASE_AGENT_KEYS,
  canRecoverAfterInterrupt,
  isNetworkFailure,
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
    const t = new Error("x")
    expect(canRecoverAfterInterrupt(t, "__timeout__: x", true)).toBe(true)
    expect(canRecoverAfterInterrupt(t, "__timeout__: x", false)).toBe(false)
    expect(canRecoverAfterInterrupt(t, "outro erro", true)).toBe(false)
  })
})

// O fetch morre na REDE e nenhuma resposta HTTP chega: era o irmão do 504
// tratado ao contrário dele — "Erro na geração: Failed to fetch" numa
// geração que terminou em `ready` com 73k de HTML (Innova, 27/08).
describe("isNetworkFailure", () => {
  it("reconhece a queda de conexão em cada navegador", () => {
    expect(isNetworkFailure(new TypeError("Failed to fetch"))).toBe(true)
    expect(
      isNetworkFailure(
        new TypeError("NetworkError when attempting to fetch resource."),
      ),
    ).toBe(true)
    expect(isNetworkFailure(new TypeError("Load failed"))).toBe(true)
  })

  // A checagem de TIPO é o que separa "não falei com o servidor" de "o
  // servidor relatou uma falha": resposta HTTP nunca vira TypeError.
  it("erro que NÃO é TypeError não conta, mesmo com a mesma mensagem", () => {
    expect(isNetworkFailure(new Error("Failed to fetch"))).toBe(false)
    expect(isNetworkFailure("Failed to fetch")).toBe(false)
    expect(isNetworkFailure(null)).toBe(false)
  })

  it("TypeError de outra natureza não conta", () => {
    expect(isNetworkFailure(new TypeError("x.map is not a function"))).toBe(
      false,
    )
  })
})

describe("canRecoverAfterInterrupt", () => {
  const rede = new TypeError("Failed to fetch")
  const servidor = new Error("Falha na fase 1 (Architect): boom")

  it("timeout do gateway E queda de rede recuperam no fullPipeline", () => {
    expect(canRecoverAfterInterrupt(rede, "Failed to fetch", true)).toBe(true)
    expect(canRecoverAfterInterrupt(servidor, "__timeout__: x", true)).toBe(true)
  })

  it("nenhum dos dois recupera fora do fullPipeline", () => {
    expect(canRecoverAfterInterrupt(rede, "Failed to fetch", false)).toBe(false)
    expect(canRecoverAfterInterrupt(servidor, "__timeout__: x", false)).toBe(
      false,
    )
  })

  it("erro relatado pelo servidor nunca recupera", () => {
    expect(
      canRecoverAfterInterrupt(servidor, servidor.message, true),
    ).toBe(false)
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

  // O caso da Innova (27/08): o email falhou com `hero_failed`, a cadeia
  // morreu antes de abrir uma run e a tela mostrou "Erro na geração" com um
  // aviso de brand tolerante embaixo — que não tinha relação com a causa.
  it("erro carrega o motivo traduzido quando o email diz por que falhou", () => {
    expect(
      runHeaderLabel({
        resultStatus: null,
        pollStatus: "error",
        emailStatus: "failed",
        hasRun: true,
        failureReason: "hero_failed",
      }),
    ).toBe("Erro na geração — Falha ao montar a hero section")
  })

  it("motivo desconhecido vai CRU (o código é mais útil que uma frase vaga)", () => {
    expect(
      runHeaderLabel({
        resultStatus: "error",
        pollStatus: null,
        emailStatus: null,
        hasRun: true,
        failureReason: "motivo_inedito_xyz",
      }),
    ).toBe("Erro na geração — motivo_inedito_xyz")
  })

  it("sem motivo, o texto de sempre", () => {
    expect(
      runHeaderLabel({
        resultStatus: "error",
        pollStatus: null,
        emailStatus: null,
        hasRun: true,
        failureReason: "   ",
      }),
    ).toBe("Erro na geração")
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
