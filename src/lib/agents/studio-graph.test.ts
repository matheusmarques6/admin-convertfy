import { describe, expect, it } from "vitest"

import {
  STUDIO_EDGES,
  STUDIO_NODES,
  STUDIO_NODE_BY_KEY,
  edgeVisual,
  execCostUsd,
  fmtDur,
  nodeMeta,
  projectRuns,
  rerunPlanFor,
  type ExecutionAgentRun,
} from "./studio-graph"

const run = (
  agent: ExecutionAgentRun["agent"],
  status: string,
  extra: Partial<ExecutionAgentRun> = {},
): ExecutionAgentRun => ({
  run_id: `run-${agent}`,
  agent,
  status,
  duration_ms: 1200,
  cost_cents: 5,
  tokens_input: 1000,
  tokens_output: 200,
  retry_count: 0,
  error_message: null,
  ...extra,
})

describe("grafo", () => {
  it("toda aresta referencia nós existentes", () => {
    for (const [a, b] of STUDIO_EDGES) {
      expect(STUDIO_NODE_BY_KEY[a], `nó ${a}`).toBeDefined()
      expect(STUDIO_NODE_BY_KEY[b], `nó ${b}`).toBeDefined()
    }
  })

  it("chaves de nó são únicas", () => {
    const keys = STUDIO_NODES.map((n) => n.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("todo nó de agente tem visual resolvível", () => {
    for (const n of STUDIO_NODES.filter((n) => n.type === "agent")) {
      const m = nodeMeta(n)
      expect(m.name.length).toBeGreaterThan(0)
      expect(m.color).toMatch(/^#/)
    }
  })

  it("nodeMeta prefere o modelo ativo quando informado", () => {
    const qa = STUDIO_NODE_BY_KEY["qa"]
    const m = nodeMeta(qa, { qa: "claude-sonnet-4-6" })
    expect(m.sub).toBe("claude-sonnet-4-6")
  })
})

describe("projectRuns", () => {
  it("mapeia status da API e preenche métricas", () => {
    const runs = projectRuns(
      [run("qa", "success", { duration_ms: 11400, cost_cents: 1 })],
      "success",
    )
    expect(runs.qa.status).toBe("sucesso")
    expect(runs.qa.durSec).toBeCloseTo(11.4)
    expect(runs.qa.usd).toBeCloseTo(0.01)
    expect(runs.qa.runId).toBe("run-qa")
  })

  it("execução em andamento: nós após a última run ficam aguardando", () => {
    const runs = projectRuns(
      [run("image", "success"), run("hero_section", "running", { duration_ms: null })],
      "running",
    )
    expect(runs.hero_section.status).toBe("rodando")
    expect(runs.text_format.status).toBe("aguardando")
    expect(runs.qa.status).toBe("aguardando")
    expect(runs.out.status).toBe("aguardando")
    // Fase 1 sem run (reusada de geração anterior) não fica "aguardando" —
    // e o copy_merge, que roda ANTES da hero, sem run também é passado.
    expect(runs.assembler.status).toBe("pulado")
    expect(runs.copy_merge.status).toBe("pulado")
  })

  it("execução com sucesso: ausência de run vira pulado (qavision OFF)", () => {
    const runs = projectRuns(
      [run("image", "success"), run("qa", "success")],
      "success",
    )
    expect(runs.qavision.status).toBe("pulado")
    expect(runs.out.status).toBe("sucesso")
  })

  it("execução com erro: downstream pulado e out não conclui", () => {
    const runs = projectRuns(
      [run("image", "error", { error_message: "timeout" })],
      "error",
    )
    expect(runs.image.status).toBe("erro")
    expect(runs.image.err).toBe("timeout")
    expect(runs.qa.status).toBe("pulado")
    expect(runs.out.status).toBe("pulado")
  })

  it("trigger é sempre sucesso sintético", () => {
    expect(projectRuns([], "running").trigger.status).toBe("sucesso")
  })
})

describe("edgeVisual", () => {
  it("sem runs (editor): traço neutro contínuo", () => {
    expect(edgeVisual("qa", "out", null).dash).toBeNull()
  })

  it("aresta até nó com erro fica vermelha", () => {
    const runs = projectRuns([run("qa", "success"), run("qavision", "error")], "error")
    expect(edgeVisual("qa", "qavision", runs).stroke).toBe("#DC8686")
  })

  it("caminho percorrido fica verde; não percorrido tracejado", () => {
    const runs = projectRuns(
      [
        run("image", "success"),
        run("copy_merge", "success"),
        run("hero_section", "success"),
      ],
      "running",
    )
    expect(edgeVisual("copy_merge", "hero_section", runs).stroke).toBe("#6EBB9A")
    expect(edgeVisual("hero_section", "text_format", runs).dash).toBe("5 5")
  })
})

describe("execCostUsd", () => {
  it("soma apenas runs com custo", () => {
    const runs = projectRuns(
      [run("image", "success", { cost_cents: 2 }), run("qa", "success", { cost_cents: 1 })],
      "success",
    )
    expect(execCostUsd(runs)).toBeCloseTo(0.03)
  })
})

describe("rerunPlanFor", () => {
  it("fase 1 → regenerar referência da loja", () => {
    expect(rerunPlanFor("assembler")?.mode).toBe("blueprints")
    expect(rerunPlanFor("blueprint")?.mode).toBe("blueprints")
  })

  it("copy → pipeline completo; fase 2 → phase2_only", () => {
    expect(rerunPlanFor("copy")?.mode).toBe("full_pipeline")
    expect(rerunPlanFor("hero_section")?.mode).toBe("phase2")
    expect(rerunPlanFor("qa")?.mode).toBe("phase2")
  })

  it("trigger e out não têm re-execução", () => {
    expect(rerunPlanFor("trigger")).toBeNull()
    expect(rerunPlanFor("out")).toBeNull()
  })
})

describe("fmtDur", () => {
  it("formata ms, segundos pt-BR e nulo", () => {
    expect(fmtDur(0.4)).toBe("400ms")
    expect(fmtDur(46.25)).toBe("46,3s")
    expect(fmtDur(null)).toBe("—")
  })
})

// ── projectLiveTest (aba Teste — projeção ao vivo) ───────────────────────

import { liveRunningNode, projectLiveTest, type LiveTestRun } from "./studio-graph"

const live = (
  agent: string,
  status: string,
  extra: Partial<LiveTestRun> = {},
): LiveTestRun => ({
  id: `run-${agent}`,
  agent,
  status,
  duration_ms: 1000,
  cost_cents: 2,
  tokens_input: 100,
  tokens_output: 20,
  ...extra,
})

describe("liveRunningNode", () => {
  it("cada status do email acende o nó certo", () => {
    expect(liveRunningNode("copy_generating", null)).toBe("copy")
    expect(liveRunningNode("copy_ready", null)).toBe("image")
    expect(liveRunningNode("image_done", null)).toBe("hero_section")
    expect(liveRunningNode("qa_running", null)).toBe("qa")
    expect(liveRunningNode("ready", null)).toBeNull()
  })

  it("rendering percorre a cadeia pelo html_pipeline_stage (último CONCLUÍDO)", () => {
    expect(liveRunningNode("rendering", null)).toBe("hero_section")
    expect(liveRunningNode("rendering", "hero")).toBe("text_format")
    expect(liveRunningNode("rendering", "text")).toBe("image_format")
    expect(liveRunningNode("rendering", "image")).toBe("color_format")
  })
})

describe("projectLiveTest", () => {
  it("nó rodando derivado do status mesmo sem run; à frente aguardando", () => {
    const runs = projectLiveTest({
      runs: [live("image", "success")],
      emailStatus: "rendering",
      htmlStage: "hero",
      mode: "full",
      terminal: "running",
    })
    expect(runs.image.status).toBe("sucesso")
    expect(runs.text_format.status).toBe("rodando")
    expect(runs.image_format.status).toBe("aguardando")
    expect(runs.qa.status).toBe("aguardando")
    expect(runs.out.status).toBe("aguardando")
  })

  it("modo phase2: fase 1 sem run fica pulado (reusada), nunca aguardando", () => {
    const runs = projectLiveTest({
      runs: [],
      emailStatus: "copy_ready",
      htmlStage: null,
      mode: "phase2",
      terminal: "running",
    })
    expect(runs.assembler.status).toBe("pulado")
    expect(runs.blueprint.status).toBe("pulado")
    expect(runs.image.status).toBe("rodando")
  })

  it("copy_dispatch conta como copy", () => {
    const runs = projectLiveTest({
      runs: [live("copy_dispatch", "success")],
      emailStatus: "copy_generating",
      htmlStage: null,
      mode: "full",
      terminal: "running",
    })
    // status do email diz que a copy está em curso — o vivo vence a run.
    expect(runs.copy.status).toBe("rodando")
    expect(runs.copy.runId).toBe("run-copy_dispatch")
  })

  it("done conclui a saída e o que não rodou vira pulado", () => {
    const runs = projectLiveTest({
      runs: [live("image", "success"), live("qa", "success")],
      emailStatus: "ready",
      htmlStage: null,
      mode: "full",
      terminal: "done",
    })
    expect(runs.out.status).toBe("sucesso")
    expect(runs.qavision.status).toBe("pulado")
    expect(runs.text_format.status).toBe("pulado")
  })

  it("erro congela: run com erro aparece, downstream pulado, out não conclui", () => {
    const runs = projectLiveTest({
      runs: [live("image", "error", { error_message: "timeout" })],
      emailStatus: "failed",
      htmlStage: null,
      mode: "full",
      terminal: "error",
    })
    expect(runs.image.status).toBe("erro")
    expect(runs.image.err).toBe("timeout")
    expect(runs.qa.status).toBe("pulado")
    expect(runs.out.status).toBe("pulado")
  })

  it("run running do banco também projeta rodando", () => {
    const runs = projectLiveTest({
      runs: [live("hero_section", "running", { duration_ms: null })],
      emailStatus: "rendering",
      htmlStage: null,
      mode: "default",
      terminal: "running",
    })
    expect(runs.hero_section.status).toBe("rodando")
  })
})
