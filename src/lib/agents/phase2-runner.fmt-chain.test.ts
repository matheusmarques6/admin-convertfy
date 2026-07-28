import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Cadeia de formatação (split do HTML agent): orquestração no runner.
 * Cobre: caminho feliz (4 steps, sha8 encadeado), retry 1x, 2º erro →
 * failed com reason do agente, fail-open do color_format, out_of_budget
 * persistindo o estágio, resume pulando steps concluídos e re-splice
 * determinístico quando o agente de texto mexe na hero.
 *
 * hero-locator/apply-patches/guards são REAIS (puros); só os invokes de
 * LLM, o contexto e a telemetria são mockados.
 */

type Row = Record<string, unknown>

const h = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {}
  let runSeq = 0

  function builder(table: string) {
    const filters: Array<(r: Row) => boolean> = []
    let op: "select" | "update" = "select"
    let updatePatch: Row = {}

    const exec = () => {
      const rows = tables[table] ?? (tables[table] = [])
      const matched = rows.filter((r) => filters.every((f) => f(r)))
      if (op === "update") {
        for (const r of matched) Object.assign(r, updatePatch)
      }
      return { data: matched, error: null, count: matched.length }
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
      is: (c: string, v: unknown) => {
        filters.push((r) => r[c] === v)
        return api
      },
      order: () => api,
      limit: () => api,
      maybeSingle: () =>
        Promise.resolve({ data: exec().data[0] ?? null, error: null }),
      single: () =>
        Promise.resolve({ data: exec().data[0] ?? null, error: null }),
      update: (p: Row) => {
        op = "update"
        updatePatch = p
        return api
      },
      then: (
        onF?: (v: { data: Row[]; error: null; count: number }) => unknown,
        onR?: (e: unknown) => unknown,
      ) => Promise.resolve(exec()).then(onF, onR),
    }
    return api
  }

  return {
    tables,
    nextRunId: () => `run-${++runSeq}`,
    makeClient: () => ({ from: (t: string) => builder(t) }),
  }
})

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => h.makeClient(),
  createClient: () => ({}),
}))

// ── Imagem (fase 1) — irrelevante aqui, mock raso ─────────────────────
vi.mock("./chains/image.chain", () => ({
  generateEmailImage: vi.fn(),
  DEFAULT_IMAGE_PROMPT_TEMPLATE: "",
  renderImagePrompt: vi.fn(() => ""),
}))
vi.mock("./image/template-renderer", () => ({ renderImageTemplate: vi.fn(() => "") }))
vi.mock("./image/aspect-ratio", () => ({
  resolveAspectForBlock: vi.fn(() => "4:5"),
  blockAspectFromBlueprint: vi.fn(() => null),
  imageDimsFromBlueprint: vi.fn(() => null),
  aspectInstructionForPrompt: vi.fn(() => ""),
  dimsInstructionForPrompt: vi.fn(() => ""),
  isAspectKey: vi.fn(() => true),
}))
vi.mock("./image/mode-resolution", () => ({
  resolveImageMode: vi.fn(() => "auto"),
  productRefDescriptionFallback: vi.fn(() => ""),
}))
vi.mock("./image/product-image-guard", () => ({ isUsableProductImage: vi.fn(() => true) }))
vi.mock("./image/resolve-block-prompt.service", () => ({ buildImageAlt: vi.fn(() => "") }))
vi.mock("./email-generation.service", () => ({ buildImagePromptVars: vi.fn(async () => ({})) }))
vi.mock("./image/limits", () => ({ MAX_AI_IMAGES: 3 }))
vi.mock("./top-products", () => ({ loadTopProducts: vi.fn(async () => []) }))
vi.mock("./architect/blueprint-loader", () => ({
  loadEffectiveBlueprint: vi.fn(async () => null),
  isTextOnlyEmail: vi.fn(async () => false),
}))
vi.mock("./html/brand-guards", () => ({ isBrandConfirmed: vi.fn(async () => true) }))
vi.mock("./generation-notify.service", () => ({
  notifyEmailFailed: vi.fn(async () => undefined),
  notifyBatchComplete: vi.fn(async () => undefined),
  notifyBatchAllFailed: vi.fn(async () => undefined),
}))
vi.mock("./chains/qa.chain", () => ({ runQaAgent: vi.fn() }))

// ── Telemetria: grava runs nas tabelas do mock (retry usa o count) ────
vi.mock("./callbacks/telemetry.callback", () => ({
  logGenerationRun: vi.fn(async (p: Record<string, unknown>) => {
    const id = h.nextRunId()
    ;(h.tables.email_generation_runs ??= []).push({
      id,
      email_id: p.emailId ?? null,
      agent: p.agent,
      status: p.status,
      batch_id: (p.batchId as string) || null,
      input_vars: p.inputVars ?? null,
      parsed_output: p.parsedOutput ?? null,
      cost_cents: 0,
    })
    return id
  }),
  startGenerationRun: vi.fn(async (p: Record<string, unknown>) => {
    const id = h.nextRunId()
    ;(h.tables.email_generation_runs ??= []).push({
      id,
      email_id: p.emailId ?? null,
      agent: p.agent,
      status: "running",
      batch_id: (p.batchId as string) || null,
      input_vars: p.inputVars ?? null,
      parsed_output: null,
      cost_cents: 0,
    })
    return id
  }),
  finishGenerationRun: vi.fn(async (id: string, p: Record<string, unknown>) => {
    const row = (h.tables.email_generation_runs ?? []).find((r) => r.id === id)
    if (row) {
      Object.assign(row, {
        status: p.status,
        parsed_output: p.parsedOutput ?? row.parsed_output,
        input_vars: p.inputVars ?? row.input_vars,
        error_message: p.errorMessage ?? null,
        raw_output: p.rawOutput ?? null,
      })
    }
    return id
  }),
  resolveCostCents: vi.fn(() => 0),
}))

// ── Chains: invokes mockados; guards REAIS (importActual) ─────────────
const invokeHeroChain = vi.fn()
vi.mock("./chains/hero.chain", async (importActual) => {
  const actual = await importActual<typeof import("./chains/hero.chain")>()
  return { ...actual, invokeHeroChain: (...a: unknown[]) => invokeHeroChain(...a) }
})
const invokeTextFormatChain = vi.fn()
const invokeTextExceptionChain = vi.fn()
vi.mock("./chains/text-format.chain", async (importActual) => {
  const actual = await importActual<typeof import("./chains/text-format.chain")>()
  return {
    ...actual,
    invokeTextFormatChain: (...a: unknown[]) => invokeTextFormatChain(...a),
    invokeTextExceptionChain: (...a: unknown[]) => invokeTextExceptionChain(...a),
  }
})
const invokeImageFormatChain = vi.fn()
vi.mock("./chains/image-format.chain", async (importActual) => {
  const actual = await importActual<typeof import("./chains/image-format.chain")>()
  return {
    ...actual,
    invokeImageFormatChain: (...a: unknown[]) => invokeImageFormatChain(...a),
  }
})
const invokeColorFormatChain = vi.fn()
vi.mock("./chains/color-format.chain", async (importActual) => {
  const actual = await importActual<typeof import("./chains/color-format.chain")>()
  return {
    ...actual,
    invokeColorFormatChain: (...a: unknown[]) => invokeColorFormatChain(...a),
  }
})
const invokeMergeVerifierChain = vi.fn()
vi.mock("./chains/merge-verifier.chain", async (importActual) => {
  const actual =
    await importActual<typeof import("./chains/merge-verifier.chain")>()
  return {
    ...actual,
    invokeMergeVerifierChain: (...a: unknown[]) => invokeMergeVerifierChain(...a),
  }
})

// ── Contexto da cadeia: reference com marcadores (modo marker real) ───
const REFERENCE_HTML = [
  "<!DOCTYPE html><html><body>",
  "<!-- cfy:block:0:header:start -->",
  '<table role="presentation"><tr><td>{{LOGO}}</td></tr></table>',
  "<!-- cfy:block:0:header:end -->",
  "<!-- cfy:block:1:hero:start -->",
  '<table role="presentation"><tr><td><img src="{{HERO_IMAGE}}">{{HERO_HEADLINE}}</td></tr></table>',
  "<!-- cfy:block:1:hero:end -->",
  "<!-- cfy:block:2:body:start -->",
  '<table role="presentation"><tr><td>{{BODY_TEXT}}</td></tr><tr><td><img src="{{BODY_IMAGE}}"></td></tr></table>',
  "<!-- cfy:block:2:body:end -->",
  "</body></html>",
].join("\n")

// Enxerto da hero: por padrão SEM variante (graft='no_variant' → região do
// Montador, comportamento legado). O teste do enxerto troca o retorno.
const resolveHeroVariant = vi.fn(async () => ({
  variant: null as { id: string; html: string } | null,
  source: null as string | null,
}))
const buildHeroVars = vi.fn(
  (_ctx: unknown, _params: unknown) => ({}) as Record<string, string>,
)

vi.mock("./html/format-context", () => ({
  loadFormatChainContext: vi.fn(async () => ({
    referenceHtml: REFERENCE_HTML,
    slotMap: null,
    locale: "pt-BR",
    fontHeading: "Playfair Display",
    fontBody: "Inter",
  })),
  resolveHeroVariant: (...a: unknown[]) =>
    (resolveHeroVariant as unknown as (...x: unknown[]) => unknown)(...a),
  buildHeroVars: (...a: unknown[]) =>
    (buildHeroVars as unknown as (...x: unknown[]) => unknown)(...a),
  // A copy REAL do email — o agente de exceção precisa recebê-la em
  // blocks_with_content_json (regressão: chave errada => sempre "[]").
  buildTextFormatVars: vi.fn(() => ({
    blocks_with_content_json: '[{"headline":"Copy do n8n"}]',
  })),
  buildImageFormatVars: vi.fn(() => ({})),
  buildColorFormatVars: vi.fn(() => ({})),
}))

import { runPhase2HtmlQa } from "./phase2-runner.service"
import { spliceHero, locateHeroRegion } from "./html/hero-locator"

const HERO_FRAGMENT =
  '<table role="presentation"><tr><td><img src="https://cdn/hero.png">Hero pronta</td></tr></table>'

/** Documento após o splice da hero (o que o step de texto recebe). */
function docAfterHero(): string {
  const region = locateHeroRegion(REFERENCE_HTML)!
  return spliceHero(REFERENCE_HTML, region, HERO_FRAGMENT)
}

const chainResultBase = {
  tokensInput: 10,
  tokensOutput: 20,
  costUsd: 0.01,
  renderedPrompt: "prompt",
  rawOutput: "raw",
}

function mockHappyChains() {
  invokeHeroChain.mockResolvedValue({
    ...chainResultBase,
    output: HERO_FRAGMENT,
    mode: "fragment",
  })
  invokeTextFormatChain.mockImplementation(async () => ({
    ...chainResultBase,
    html: docAfterHero().replace("{{BODY_TEXT}}", "corpo final da copy"),
  }))
  // A3b: com slots pendentes (LOGO/BODY_TEXT) o runner usa o agente de
  // EXCEÇÃO (ops do protocolo do Integrador), não o full-doc.
  invokeTextExceptionChain.mockResolvedValue({
    ...chainResultBase,
    rawOps: JSON.stringify({
      ops: [
        { action: "set_text", tag: "LOGO", value: "LogoX" },
        { action: "set_text", tag: "BODY_TEXT", value: "corpo final da copy" },
      ],
    }),
  })
  invokeImageFormatChain.mockResolvedValue({
    ...chainResultBase,
    ops: [{ action: "img", tag: "BODY_IMAGE", url: "https://cdn/body.png" }],
  })
  invokeColorFormatChain.mockResolvedValue({
    ...chainResultBase,
    ops: [],
  })
  // 7b: triagem padrão — pareia a sobra de COPY com a copy candidata.
  // (LOGO é tag ESTRUTURAL: preenchida por código, nunca entra na fila.)
  invokeMergeVerifierChain.mockResolvedValue({
    ...chainResultBase,
    result: {
      aprovado: true,
      excecoes: [
        {
          block_id: null,
          tag: "BODY_TEXT",
          motivo: "slot_vazio",
          copy_candidata: { key: "body", valor: "corpo final da copy" },
          acao_sugerida: "preencher",
        },
      ],
    },
  })
}

function reset(overrides: Row = {}) {
  for (const k of Object.keys(h.tables)) delete h.tables[k]
  h.tables.email_flow_emails = [
    {
      id: "e1",
      flow_id: "flow1",
      number: 1,
      status: "image_done",
      generation_batch_id: null,
      html: null,
      html_pipeline_stage: null,
      name: "Welcome #1",
      subject: "Oi",
      preheader: "pre",
      ...overrides,
    },
  ]
  h.tables.email_flows = [{ id: "flow1", store_id: "store1", flow_type: "welcome" }]
  h.tables.client_stores = [{ id: "store1", store_name: "Loja", language: "pt-BR" }]
  h.tables.email_blocks = []
  h.tables.email_generation_runs = []
  h.tables.store_brand_identity = []
  h.tables.store_briefings = []
  h.tables.email_agent_configs = []
  h.tables.store_image_overrides = []
  invokeHeroChain.mockReset()
  invokeTextFormatChain.mockReset()
  invokeTextExceptionChain.mockReset()
  invokeImageFormatChain.mockReset()
  invokeColorFormatChain.mockReset()
  invokeMergeVerifierChain.mockReset()
  buildHeroVars.mockReset()
  buildHeroVars.mockReturnValue({})
  resolveHeroVariant.mockReset()
  resolveHeroVariant.mockResolvedValue({ variant: null, source: null })
}

const email = () => h.tables.email_flow_emails[0]
const runsOf = (agent: string) =>
  (h.tables.email_generation_runs ?? []).filter((r) => r.agent === agent)

beforeEach(() => reset())

describe("cadeia de formatação — runner", () => {
  it("caminho feliz: 4 steps, sha8 encadeado, sentinelas removidas, ready", async () => {
    mockHappyChains()
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("ready")

    const e = email()
    expect(e.status).toBe("ready")
    expect(e.html_pipeline_stage).toBeNull()
    const html = e.html as string
    expect(html).toContain("Hero pronta")
    expect(html).toContain("corpo final da copy")
    expect(html).toContain("https://cdn/body.png")
    expect(html).not.toContain("cfy:hero")
    expect(html).not.toContain("{{BODY_TEXT}}")

    for (const agent of ["hero_section", "text_format", "image_format", "color_format"]) {
      const rs = runsOf(agent)
      expect(rs).toHaveLength(1)
      expect(rs[0].status).toBe("success")
    }

    // sha8 encadeado: output do hero = input do texto; output do texto =
    // input da imagem.
    const heroOut = (runsOf("hero_section")[0].parsed_output as Row).output_sha8
    const textIn = (runsOf("text_format")[0].input_vars as Row).input_sha8
    expect(textIn).toBe(heroOut)
    const textOut = (runsOf("text_format")[0].parsed_output as Row).output_sha8
    const imgIn = (runsOf("image_format")[0].input_vars as Row).input_sha8
    expect(imgIn).toBe(textOut)
  })

  it("retry 1x: hero falha na 1ª tentativa e passa na 2ª", async () => {
    mockHappyChains()
    invokeHeroChain
      .mockRejectedValueOnce(new Error("timeout simulado"))
      .mockResolvedValueOnce({
        ...chainResultBase,
        output: HERO_FRAGMENT,
        mode: "fragment",
      })
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("ready")
    const rs = runsOf("hero_section")
    expect(rs).toHaveLength(2)
    expect(rs[0].status).toBe("error")
    expect(rs[1].status).toBe("success")
  })

  it("2º erro do hero → failed com hero_failed", async () => {
    mockHappyChains()
    invokeHeroChain.mockRejectedValue(new Error("sempre falha"))
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("failed")
    expect(email().status).toBe("failed")
    expect(email().failure_reason).toBe("hero_failed")
    expect(runsOf("hero_section")).toHaveLength(2)
    expect(invokeTextFormatChain).not.toHaveBeenCalled()
  })

  it("color_format falha 2x → FAIL-OPEN: email vai pra ready mesmo assim", async () => {
    mockHappyChains()
    invokeColorFormatChain.mockRejectedValue(new Error("cores quebraram"))
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("ready")
    expect(email().status).toBe("ready")
    expect((email().html as string)).toContain("https://cdn/body.png")
    expect(runsOf("color_format").filter((r) => r.status === "error")).toHaveLength(2)
  })

  // ── Enxerto da hero por ID (hero-graft) ──────────────────────────
  it("enxerto: a região da hero vira o HTML canônico da variante", async () => {
    mockHappyChains()
    resolveHeroVariant.mockResolvedValue({
      variant: {
        id: "v-hero-8",
        html: [
          '<tr><td bgcolor="#111111"><img src="{{LOGO}}"></td></tr>',
          '<tr><td style="font-family:Courier;font-size:30px">{{HERO_HEADLINE}}</td></tr>',
          '<tr><td><a href="{{HERO_CTA_URL}}">{{HERO_CTA_LABEL}}</a></td></tr>',
        ].join("\n"),
      },
      source: "slot_map",
    })
    await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })

    const [, params] = buildHeroVars.mock.calls[0] as [
      unknown,
      { grafted?: boolean; regionHtml: string },
    ]
    expect(params.grafted).toBe(true)
    // A estrutura rica da variante (banda escura + 2º slot de CTA) chega
    // ao agente — era exatamente o que o Montador achatava.
    expect(params.regionHtml).toContain('bgcolor="#111111"')
    expect(params.regionHtml).toContain("{{HERO_CTA_LABEL}}")
    // Tipografia da loja aplicada por código na região enxertada.
    expect(params.regionHtml).toContain("'Playfair Display'")
    expect(params.regionHtml).not.toContain("Courier")

    const run = runsOf("hero_section")[0].parsed_output as Row
    expect(run.hero_source).toBe("library")
    expect(run.graft_status).toBe("grafted")
    expect(run.variant_id).toBe("v-hero-8")
  })

  it("enxerto: sem variante mantém a região do Montador (fallback)", async () => {
    mockHappyChains()
    await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    const [, params] = buildHeroVars.mock.calls[0] as [
      unknown,
      { grafted?: boolean; regionHtml: string },
    ]
    expect(params.grafted).toBe(false)
    expect(params.regionHtml).toContain("{{HERO_HEADLINE}}")
    const run = runsOf("hero_section")[0].parsed_output as Row
    expect(run.hero_source).toBe("montador")
    expect(run.graft_status).toBe("no_variant")
  })

  it("out_of_budget: estágio persiste, status continua rendering (skipped)", async () => {
    mockHappyChains()
    // Budget minúsculo: nenhum step cabe → out_of_budget antes do hero.
    const res = await runPhase2HtmlQa({
      storeId: "store1",
      emailId: "e1",
      budgetMs: 1_000,
    })
    expect(res.status).toBe("skipped")
    expect(email().status).toBe("rendering")
    expect(email().html_pipeline_stage).toBeNull()
    expect(invokeHeroChain).not.toHaveBeenCalled()
  })

  it("resume: stage='text' pula hero e texto, roda imagem e cores", async () => {
    mockHappyChains()
    const resumedHtml = docAfterHero().replace("{{BODY_TEXT}}", "copy já posicionada")
    reset({ html: resumedHtml, html_pipeline_stage: "text", status: "rendering" })
    mockHappyChains()
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("ready")
    expect(invokeHeroChain).not.toHaveBeenCalled()
    expect(invokeTextFormatChain).not.toHaveBeenCalled()
    expect(invokeImageFormatChain).toHaveBeenCalledTimes(1)
    expect(invokeColorFormatChain).toHaveBeenCalledTimes(1)
    expect((email().html as string)).toContain("copy já posicionada")
    expect((email().html as string)).toContain("https://cdn/body.png")
  })

  it("A3b: op do agente de exceção mirando a hero é REJEITADA (posse)", async () => {
    mockHappyChains()
    invokeTextExceptionChain.mockResolvedValue({
      ...chainResultBase,
      rawOps: JSON.stringify({
        ops: [
          { action: "set_text", tag: "BODY_TEXT", value: "corpo final da copy" },
          { action: "set_text", tag: "LOGO", value: "LogoX" },
          // fora da fila do merge → ownership_rejected; hero intacta
          { action: "set_text", tag: "HERO_HEADLINE", value: "invasão" },
        ],
      }),
    })
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("ready")
    const html = email().html as string
    expect(html).toContain("Hero pronta")
    expect(html).not.toContain("invasão")
    const parsed = runsOf("text_format")[0].parsed_output as Row
    expect(parsed.mode).toBe("exception_slots")
    expect(
      (parsed.ops_skipped as Array<{ reason: string }>).some(
        (o) => o.reason === "ownership_rejected",
      ),
    ).toBe(true)
  })

  it("A3b: agente de exceção recebe a copy em blocks_with_content_json (não [])", async () => {
    mockHappyChains()
    await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(invokeTextExceptionChain).toHaveBeenCalledWith(
      expect.objectContaining({
        vars: expect.objectContaining({
          blocks_with_content_json: '[{"headline":"Copy do n8n"}]',
        }),
      }),
    )
  })
})

describe("7b — Verificador de merge", () => {
  it("triagem do verificador enriquece a fila do agente de exceção", async () => {
    mockHappyChains()
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("ready")
    // Run próprio, com a fila triada na telemetria.
    const vRuns = runsOf("merge_verifier")
    expect(vRuns.some((r) => r.status === "success")).toBe(true)
    // As views do 7c carregam a triagem (motivo + copy candidata pareada).
    const call = invokeTextExceptionChain.mock.calls[0][0] as {
      vars: Record<string, string>
    }
    expect(call.vars.exception_slots_json).toContain("copy_candidata")
    expect(call.vars.exception_slots_json).toContain("corpo final da copy")
    expect(call.vars.exception_slots_json).toContain("slot_vazio")
    // LOGO é estrutural — preenchida por código, fora da fila do LLM.
    expect(call.vars.exception_slots_json).not.toContain("LOGO")
  })

  it("verificador falha → fallback mecânico: exceção roda com a fila crua e o email conclui", async () => {
    mockHappyChains()
    invokeMergeVerifierChain.mockRejectedValue(new Error("boom do verificador"))
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("ready")
    expect(runsOf("merge_verifier")[0]?.status).toBe("error")
    const call = invokeTextExceptionChain.mock.calls[0][0] as {
      vars: Record<string, string>
    }
    // Sem triagem — view mecânica pura (nada de copy_candidata).
    expect(call.vars.exception_slots_json).not.toContain("copy_candidata")
    expect(call.vars.exception_slots_json).toContain("BODY_TEXT")
  })

  it("merge_verifier_mode=off → verificador nem roda (comportamento pré-7b)", async () => {
    mockHappyChains()
    h.tables.client_stores[0].org_id = "org1"
    h.tables.email_generation_settings = [
      { org_id: "org1", merge_verifier_mode: "off" },
    ]
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("ready")
    expect(invokeMergeVerifierChain).not.toHaveBeenCalled()
    expect(runsOf("merge_verifier")).toHaveLength(0)
  })
})
