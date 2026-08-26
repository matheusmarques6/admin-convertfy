import { describe, it, expect, vi, beforeEach } from "vitest"

// Estado mutável: spy do upsert (store_email_blueprints) + blueprint global
// curado (email_blueprints) que o fallback deve consultar.
const h = vi.hoisted(() => ({
  upsertSpy: vi.fn().mockResolvedValue({ error: null }),
  globalBlueprint: null as Record<string, unknown> | null,
}))

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "store_email_blueprints") {
        return {
          upsert: (...args: unknown[]) => {
            h.upsertSpy(...args)
            return Promise.resolve({ error: null })
          },
        }
      }
      // loadEffectiveBlueprint(storeId=null) consulta apenas email_blueprints.
      if (table === "email_blueprints") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: h.globalBlueprint, error: null }),
              }),
            }),
          }),
        }
      }
      return {}
    },
  }),
  createClient: () => ({}),
}))

const invokeAgent = vi.fn()
vi.mock("./llm-invoke", async (importActual) => {
  const actual = await importActual<typeof import("./llm-invoke")>()
  return {
    ...actual,
    invokeAgent: (...a: unknown[]) => invokeAgent(...a),
    loadActiveAgentConfig: vi.fn().mockResolvedValue(null), // usa DEFAULT config
  }
})

const startGenerationRun = vi.fn().mockResolvedValue("run-1")
const finishGenerationRun = vi.fn().mockResolvedValue("run-1")
vi.mock("../callbacks/telemetry.callback", () => ({
  logGenerationRun: vi.fn().mockResolvedValue(""),
  startGenerationRun: (...a: unknown[]) => startGenerationRun(...a),
  finishGenerationRun: (...a: unknown[]) => finishGenerationRun(...a),
  computeCostCents: () => 0,
  resolveCostCents: () => 0,
}))

import { generateStoreBlueprint } from "./blueprint-generator.service"
import { missingProvenance } from "../shared/telemetry-contract"

const baseInput = {
  storeId: "s1",
  flowType: "welcome",
  emailNumber: 1,
  batchId: "b1",
  brandName: "Loja",
  nicho: "",
  posicionamento: "",
  persona: "",
  tomVoz: "",
  topProductNames: [],
  outline: null,
  referenceHtml: "<html><body><div>hero</div></body></html>",
  pesquisa: "",
}

beforeEach(() => {
  h.upsertSpy.mockClear()
  h.globalBlueprint = null
  invokeAgent.mockReset()
  startGenerationRun.mockClear()
  finishGenerationRun.mockClear()
})

describe("generateStoreBlueprint — fallback usa o blueprint global curado", () => {
  it("grava o blueprint quando o LLM gera JSON válido (source=ai)", async () => {
    invokeAgent.mockResolvedValue({
      raw: '{"objective":"o","messaging":"m","subject_hint":"s","blocks":[{"type":"hero","label":"H","purpose":"p"}]}',
      tokensInput: 10,
      tokensOutput: 20,
    })
    const res = await generateStoreBlueprint(baseInput)
    expect(res.source).toBe("ai")
    expect(h.upsertSpy).toHaveBeenCalledTimes(1)
  })

  it("LLM falha + global curado existe → usa o global, NÃO persiste (source=manual)", async () => {
    invokeAgent.mockRejectedValue(new Error("timeout"))
    h.globalBlueprint = {
      flow_type: "welcome",
      email_number: 1,
      objective: "obj-global",
      messaging: "msg-global",
      subject_hint: "s",
      blocks: [
        { type: "hero", label: "H", purpose: "p", needs_image: true },
        { type: "footer", label: "F", purpose: "p" },
      ],
    }
    const res = await generateStoreBlueprint(baseInput)
    expect(res.source).toBe("manual")
    expect(h.upsertSpy).not.toHaveBeenCalled()
    // o blueprint do run corrente é o global curado (não o mínimo).
    expect(res.blueprint.objective).toBe("obj-global")
    expect(res.blueprint.blocks.length).toBe(2)
  })

  it("LLM falha + SEM global → cai no DEFAULT_BLUEPRINTS in-code (source=manual)", async () => {
    invokeAgent.mockRejectedValue(new Error("timeout"))
    h.globalBlueprint = null
    const res = await generateStoreBlueprint(baseInput)
    expect(res.source).toBe("manual")
    expect(h.upsertSpy).not.toHaveBeenCalled()
    // welcome/1 existe em DEFAULT_BLUEPRINTS → estrutura completa (não o mínimo).
    expect(res.blueprint.blocks.length).toBeGreaterThan(0)
  })
})

// ── Proveniência (migration 20261085) ───────────────────────────────────
// A rota B do blueprint lê o HTML do Montador (upstream) e a pesquisa da
// loja; sem os segmentos, a run só guardava texto opaco.
describe("generateStoreBlueprint — proveniência do prompt", () => {
  const runOf = (agent: string) =>
    (finishGenerationRun.mock.calls.find(
      (c) => (c[1] as { agent?: string }).agent === agent,
    )?.[1] as
      | { promptSegments?: unknown; inputSummary?: unknown; renderedPrompt?: unknown }
      | undefined) ?? {}

  it("grava prompt segmentado + Entrada estruturada no run do blueprint", async () => {
    invokeAgent.mockResolvedValue({
      raw: '{"objective":"o","messaging":"m","subject_hint":"s","blocks":[{"type":"hero","label":"H","purpose":"p"}]}',
      tokensInput: 10,
      tokensOutput: 20,
    })
    await generateStoreBlueprint(baseInput)
    const run = runOf("blueprint")
    expect(
      missingProvenance("blueprint", {
        prompt_segments: run.promptSegments,
        input_summary: run.inputSummary,
      }),
    ).toEqual([])
    // O HTML do Montador é marcado como upstream — é a razão de existir a
    // classe: dá para ver que o blueprint leu a saída do agente anterior.
    const segs = (run.promptSegments ?? []) as Array<Record<string, unknown>>
    expect(segs.some((sg) => sg.cls === "upstream")).toBe(true)
  })

  it("recompõe o prompt enviado byte a byte a partir dos segmentos", async () => {
    invokeAgent.mockResolvedValue({
      raw: '{"objective":"o","messaging":"m","subject_hint":"s","blocks":[{"type":"hero","label":"H","purpose":"p"}]}',
      tokensInput: 10,
      tokensOutput: 20,
    })
    await generateStoreBlueprint(baseInput)
    const run = runOf("blueprint")
    const segs = (run.promptSegments ?? []) as Array<{
      texto?: string
      parte?: string
    }>
    const user = segs
      .filter((sg) => sg.parte === "user")
      .map((sg) => sg.texto ?? "")
      .join("")
    expect(user).toBe(run.renderedPrompt)
  })
})
