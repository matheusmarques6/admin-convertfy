import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Step 2.5 — Refinador Tipográfico no runPhase2HtmlQa (fail-open).
 *
 * Harness espelha phase2-runner.text-only.test.ts (mock supabase in-memory,
 * chains pesadas mockadas). O invokeRefinerChain é mockado; os módulos
 * PUROS do refiner (extract/apply/guards/whitelist) rodam DE VERDADE —
 * o teste cobre o wiring real da aplicação do delta.
 */

type Row = Record<string, unknown>

const h = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {}
  const flags = { textOnly: false }

  function builder(table: string) {
    const filters: Array<(r: Row) => boolean> = []
    let op: "select" | "update" = "select"
    let updatePatch: Row = {}

    const exec = () => {
      const rows = tables[table] ?? (tables[table] = [])
      if (op === "update") {
        const matched = rows.filter((r) => filters.every((f) => f(r)))
        for (const r of matched) Object.assign(r, updatePatch)
        return { data: matched, error: null }
      }
      return { data: rows.filter((r) => filters.every((f) => f(r))), error: null }
    }

    const api: Record<string, unknown> = {
      select: () => api,
      eq: (c: string, v: unknown) => {
        filters.push((r) => r[c] === v)
        return api
      },
      in: (c: string, vs: unknown[]) => {
        filters.push((r) => vs.includes(r[c]))
        return api
      },
      order: () => api,
      limit: () => api,
      maybeSingle: () => Promise.resolve({ data: exec().data[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: exec().data[0] ?? null, error: null }),
      update: (p: Row) => {
        op = "update"
        updatePatch = p
        return api
      },
      then: (onF?: (v: { data: Row[]; error: null }) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve(exec()).then(onF, onR),
    }
    return api
  }

  return { tables, flags, makeClient: () => ({ from: (t: string) => builder(t) }) }
})

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => h.makeClient(),
  createClient: () => ({}),
}))

vi.mock("./chains/image.chain", () => ({
  generateEmailImage: vi.fn(),
  DEFAULT_IMAGE_PROMPT_TEMPLATE: "",
  renderImagePrompt: vi.fn(() => ""),
}))
vi.mock("./image/template-renderer", () => ({ renderImageTemplate: vi.fn(() => "") }))
vi.mock("./image/aspect-ratio", () => ({
  resolveAspectForBlock: vi.fn(() => "4:5"),
  aspectInstructionForPrompt: vi.fn(() => ""),
  isAspectKey: vi.fn(() => true),
}))
vi.mock("./image/mode-resolution", () => ({
  resolveImageMode: vi.fn(() => "auto"),
  productRefDescriptionFallback: vi.fn(() => ""),
}))
vi.mock("./image/product-image-guard", () => ({ isUsableProductImage: vi.fn(() => true) }))
vi.mock("./image/resolve-block-prompt.service", () => ({ buildImageAlt: vi.fn(() => "") }))

// HTML gerado pelo agente HTML — 2 ocorrências de font-family no body.
const BASE_HTML = `<!DOCTYPE html><html><head><style>
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap');
</style></head><body><table>
<tr><td style="font-family:'Montserrat',Arial,sans-serif;font-size:48px;">RADIANTLYHERS</td></tr>
<tr><td style="font-family:'Montserrat',Arial,sans-serif;font-size:16px;">Body text about the products here.</td></tr>
</table></body></html>`

const invokeHtmlChain = vi.fn()
vi.mock("./chains/html.chain", () => ({
  DEFAULT_HTML_SYSTEM_PROMPT: "",
  DEFAULT_HTML_USER_TEMPLATE: "",
  invokeHtmlChain: (...a: unknown[]) => invokeHtmlChain(...a),
}))
vi.mock("./html/build-vars", () => ({ buildHtmlPromptVars: vi.fn(async () => ({})) }))
vi.mock("./chains/qa.chain", () => ({ runQaAgent: vi.fn() }))

const invokeRefinerChain = vi.fn()
vi.mock("./chains/refiner.chain", () => ({
  invokeRefinerChain: (...a: unknown[]) => invokeRefinerChain(...a),
}))

const startGenerationRun = vi.fn(async (..._a: unknown[]) => "run-1")
const finishGenerationRun = vi.fn(async (..._a: unknown[]) => "run-1")
vi.mock("./callbacks/telemetry.callback", () => ({
  logGenerationRun: vi.fn(async () => ""),
  startGenerationRun: (...a: unknown[]) => startGenerationRun(...a),
  finishGenerationRun: (...a: unknown[]) => finishGenerationRun(...a),
  computeCostCents: vi.fn(() => 0),
}))
vi.mock("./email-generation.service", () => ({ buildImagePromptVars: vi.fn(async () => ({})) }))
vi.mock("./image/limits", () => ({ MAX_AI_IMAGES: 3 }))
vi.mock("./top-products", () => ({ loadTopProducts: vi.fn(async () => []) }))
vi.mock("./architect/blueprint-loader", () => ({
  loadEffectiveBlueprint: vi.fn(async () => null),
  isTextOnlyEmail: () => Promise.resolve(h.flags.textOnly),
}))
vi.mock("./html/brand-guards", () => ({ isBrandConfirmed: vi.fn(async () => true) }))
vi.mock("./generation-notify.service", () => ({
  notifyEmailFailed: vi.fn(async () => undefined),
  notifyBatchComplete: vi.fn(async () => undefined),
  notifyBatchAllFailed: vi.fn(async () => undefined),
}))

import { runPhase2HtmlQa } from "./phase2-runner.service"

function reset(opts: { refinerActive: boolean }) {
  for (const k of Object.keys(h.tables)) delete h.tables[k]
  h.tables.email_flow_emails = [
    {
      id: "e1",
      flow_id: "flow1",
      number: 1,
      status: "image_done",
      generation_batch_id: null,
      html: null,
      name: "Welcome 1",
      subject: "Your 10% off",
    },
  ]
  h.tables.email_flows = [{ id: "flow1", store_id: "store1", flow_type: "welcome" }]
  h.tables.email_blocks = []
  h.tables.client_stores = [
    { id: "store1", store_name: "Radiantlyhers", niche: "moda", language: "en" },
  ]
  h.tables.store_brand_identity = [
    { store_id: "store1", version: 1, font_heading: "Montserrat", font_body: "Arial", confirmed_at: "2026-07-08" },
  ]
  h.tables.email_agent_configs = opts.refinerActive
    ? [
        {
          id: "cfg-refiner",
          agent_type: "refiner",
          is_active: true,
          model: "anthropic/claude-sonnet-4.6",
          temperature: 0.4,
          max_tokens: 2048,
          system_prompt: "",
          user_template: "",
        },
      ]
    : []
  h.flags.textOnly = false

  invokeHtmlChain.mockResolvedValue({
    html: BASE_HTML,
    tokensInput: 100,
    tokensOutput: 200,
    renderedPrompt: "prompt",
  })
}

beforeEach(() => {
  invokeHtmlChain.mockReset()
  invokeRefinerChain.mockReset()
  startGenerationRun.mockClear()
  finishGenerationRun.mockClear()
})

const emailRow = () => h.tables.email_flow_emails[0]

describe("Step 2.5 — Refinador Tipográfico", () => {
  it("sem config ativa → no-op total (nem run, html cru, ready)", async () => {
    reset({ refinerActive: false })
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("ready")
    expect(invokeRefinerChain).not.toHaveBeenCalled()
    expect(emailRow().html).toBe(BASE_HTML)
    const refinerRuns = startGenerationRun.mock.calls.filter(
      (c) => (c[0] as { agent: string }).agent === "refiner",
    )
    expect(refinerRuns).toHaveLength(0)
  })

  it("delta válido → html refinado persistido (fonte + @import) e run success", async () => {
    reset({ refinerActive: true })
    invokeRefinerChain.mockResolvedValue({
      delta: {
        strategy: "serif_luxury",
        rationale: "moda premium",
        display_font: { family: "Playfair Display", weights: [700] },
        targets: [{ index: 0, role: "brand_name", font_weight: 700, letter_spacing: "-1.5px" }],
      },
      tokensInput: 500,
      tokensOutput: 100,
      renderedPrompt: "rp",
      rawOutput: "{...}",
    })
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("ready")
    const html = emailRow().html as string
    expect(html).toContain("'Playfair Display'")
    expect(html).toContain("family=Playfair+Display")
    // O corpo (índice 1) fica intacto:
    expect(html).toContain(`font-family:'Montserrat',Arial,sans-serif;font-size:16px`)
    const finish = finishGenerationRun.mock.calls
      .map((c) => c[1] as Record<string, unknown>)
      .find((p) => p.agent === "refiner")
    expect(finish?.status).toBe("success")
    expect((finish?.parsedOutput as Record<string, unknown>).applied).toBe(true)
  })

  it("chain lança → fail-open: html cru, run error, ready", async () => {
    reset({ refinerActive: true })
    invokeRefinerChain.mockRejectedValue(new Error("timeout"))
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("ready")
    expect(emailRow().html).toBe(BASE_HTML)
    const finish = finishGenerationRun.mock.calls
      .map((c) => c[1] as Record<string, unknown>)
      .find((p) => p.agent === "refiner")
    expect(finish?.status).toBe("error")
  })

  it("guard reprova (fonte fora da whitelist) → fail-open: html cru, ready", async () => {
    reset({ refinerActive: true })
    invokeRefinerChain.mockResolvedValue({
      delta: {
        strategy: "serif_luxury",
        rationale: "",
        display_font: { family: "Comic Sans MS", weights: [] },
        targets: [{ index: 0, role: "brand_name" }],
      },
      tokensInput: 1,
      tokensOutput: 1,
      renderedPrompt: "",
      rawOutput: "",
    })
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("ready")
    expect(emailRow().html).toBe(BASE_HTML)
    const finish = finishGenerationRun.mock.calls
      .map((c) => c[1] as Record<string, unknown>)
      .find((p) => p.agent === "refiner")
    expect(finish?.status).toBe("error")
    expect(String(finish?.errorMessage)).toContain("fonte_fora_da_whitelist")
  })

  it("strategy none → html cru, run success sem aplicar", async () => {
    reset({ refinerActive: true })
    invokeRefinerChain.mockResolvedValue({
      delta: { strategy: "none", rationale: "já comunica", display_font: null, targets: [] },
      tokensInput: 1,
      tokensOutput: 1,
      renderedPrompt: "",
      rawOutput: "",
    })
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("ready")
    expect(emailRow().html).toBe(BASE_HTML)
    const finish = finishGenerationRun.mock.calls
      .map((c) => c[1] as Record<string, unknown>)
      .find((p) => p.agent === "refiner")
    expect(finish?.status).toBe("success")
    expect((finish?.parsedOutput as Record<string, unknown>).applied).toBe(false)
  })
})
