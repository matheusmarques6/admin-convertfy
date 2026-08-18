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
    expect(runs.copy_merge.status).toBe("aguardando")
    expect(runs.qa.status).toBe("aguardando")
    expect(runs.out.status).toBe("aguardando")
    // Fase 1 sem run (reusada de geração anterior) não fica "aguardando".
    expect(runs.assembler.status).toBe("pulado")
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
      [run("image", "success"), run("hero_section", "success")],
      "running",
    )
    expect(edgeVisual("image", "hero_section", runs).stroke).toBe("#6EBB9A")
    expect(edgeVisual("copy_merge", "merge_verifier", runs).dash).toBe("5 5")
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
