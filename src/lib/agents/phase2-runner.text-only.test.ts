import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Guards "somente texto" da fase 2 (legado): um email text_only que ainda
 * esteja no meio do pipeline (copy_ready / image_done / rendering) é
 * settlado como `ready` (html null) SEM rodar imagem nem HTML agent.
 * No fluxo novo esses emails nem chegam aqui — o callback de copy já os
 * marca ready. Todos os módulos pesados (chains) são mockados rasos.
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

const generateEmailImage = vi.fn()
vi.mock("./chains/image.chain", () => ({
  generateEmailImage: (...a: unknown[]) => generateEmailImage(...a),
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
const invokeHtmlChain = vi.fn()
vi.mock("./chains/html.chain", () => ({
  DEFAULT_HTML_SYSTEM_PROMPT: "",
  DEFAULT_HTML_USER_TEMPLATE: "",
  invokeHtmlChain: (...a: unknown[]) => invokeHtmlChain(...a),
}))
vi.mock("./html/build-vars", () => ({ buildHtmlPromptVars: vi.fn(async () => ({})) }))
vi.mock("./chains/qa.chain", () => ({ runQaAgent: vi.fn() }))
vi.mock("./callbacks/telemetry.callback", () => ({
  logGenerationRun: vi.fn(async () => undefined),
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

import { runPhase2Image, runPhase2HtmlQa } from "./phase2-runner.service"

function reset(emailStatus: string) {
  for (const k of Object.keys(h.tables)) delete h.tables[k]
  h.tables.email_flow_emails = [
    {
      id: "e1",
      flow_id: "flow1",
      number: 1,
      status: emailStatus,
      generation_batch_id: null,
      html: "<old/>",
    },
  ]
  h.tables.email_flows = [{ id: "flow1", store_id: "store1", flow_type: "welcome" }]
  h.tables.email_blocks = []
  h.flags.textOnly = true
}

beforeEach(() => {
  generateEmailImage.mockReset()
  invokeHtmlChain.mockReset()
})

describe("fase 2 — guards de email somente texto (legado)", () => {
  it("runPhase2Image: text_only em copy_ready vira ready (html null) sem gerar imagem", async () => {
    reset("copy_ready")
    const res = await runPhase2Image({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("skipped")
    const email = h.tables.email_flow_emails[0]
    expect(email.status).toBe("ready")
    expect(email.ready_at).toBeDefined()
    expect(email.html).toBeNull()
    expect(generateEmailImage).not.toHaveBeenCalled()
  })

  it("runPhase2HtmlQa: text_only em image_done vira ready sem invokeHtmlChain", async () => {
    reset("image_done")
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("skipped")
    const email = h.tables.email_flow_emails[0]
    expect(email.status).toBe("ready")
    expect(email.html).toBeNull()
    expect(invokeHtmlChain).not.toHaveBeenCalled()
  })

  it("runPhase2HtmlQa: text_only em rendering (preso no meio) também settla ready", async () => {
    reset("rendering")
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("skipped")
    expect(h.tables.email_flow_emails[0].status).toBe("ready")
  })

  it("email NÃO text_only segue o fluxo normal (guard não intercepta)", async () => {
    reset("copy_ready")
    h.flags.textOnly = false
    // Segue até o claim (copy_ready -> rendering) e adiante; como o contexto
    // mínimo (client_stores etc.) não existe no mock, o runner marca failed —
    // o que importa aqui: NÃO settlou ready pelo guard.
    const res = await runPhase2Image({ storeId: "store1", emailId: "e1" })
    expect(res.status).not.toBe("skipped")
    expect(h.tables.email_flow_emails[0].status).not.toBe("ready")
  })
})
