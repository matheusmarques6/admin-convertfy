import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Cadeia de formatação (split do HTML agent): orquestração no runner.
 * Cobre: caminho feliz legado (4 steps, sha8 encadeado), retry 1x, 2º erro
 * → failed com reason do agente, fail-open do color_format, out_of_budget
 * persistindo o estágio, resume pulando steps concluídos, enxerto da hero
 * e o MERGE POR EXAMPLE (caso-mestre: biblioteca real sem placeholder —
 * copy por splice, text_format pulado, guard da hero).
 *
 * hero-locator/apply-patches/copy-merge/anchor-match são REAIS (puros); só
 * os invokes de LLM, o contexto e a telemetria são mockados.
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
vi.mock("./image/limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./image/limits")>()),
  MAX_AI_IMAGES: 3,
}))
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
// `runSchemaChecks` vem do ORIGINAL: é ele que está sendo testado (o check
// de contrato que passou a rodar com o QA desligado). Só o agente LLM é
// mockado.
vi.mock("./chains/qa.chain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./chains/qa.chain")>()),
  runQaAgent: vi.fn(),
}))

// ── Telemetria: grava runs nas tabelas do mock (retry usa o count) ────
vi.mock("./callbacks/telemetry.callback", () => ({
  logGenerationRun: vi.fn(async (p: Record<string, unknown>) => {
    const id = h.nextRunId()
    ;(h.tables.email_generation_runs ??= []).push({
      id,
      email_id: p.emailId ?? null,
      agent: p.agent,
      status: p.status,
      model: p.model ?? null,
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
vi.mock("./chains/text-format.chain", async (importActual) => {
  const actual = await importActual<typeof import("./chains/text-format.chain")>()
  return {
    ...actual,
    invokeTextFormatChain: (...a: unknown[]) => invokeTextFormatChain(...a),
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
  mismatch: false,
}))
const buildHeroVars = vi.fn(
  (_ctx: unknown, _params: unknown) => ({}) as Record<string, string>,
)

// MC-5: a origem da reference decide se o enxerto da hero roda. Default
// "global" = comportamento anterior (enxerta), para não mexer nos demais
// testes; o caso "assembler" tem teste próprio.
const refSource = vi.hoisted(() => ({ value: "global" as string }))
// Campos extras do contexto (caso-mestre injeta blocks/blueprint/brand).
const ctxExtra = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))

vi.mock("./html/format-context", () => ({
  loadFormatChainContext: vi.fn(async () => ({
    referenceHtml: REFERENCE_HTML,
    slotMap: null,
    locale: "pt-BR",
    fontHeading: "Playfair Display",
    fontBody: "Inter",
    referenceSource: refSource.value,
    roles: {
      bg: "#FFFFFF",
      text: "#1F1F1F",
      heading: "#1F1F1F",
      button_bg: "#1F1F1F",
      button_text: "#FFFFFF",
      accent: "#333333",
      surface: "#F2F2F2",
      surface_strong: "#E3E3E3",
    },
    // Imagem por CÓDIGO (F3): a URL vem do imageMap; a tag legada
    // {{BODY_IMAGE}} é preenchida pelo caminho {{}} do image-merge.
    imageMap: [
      { id: "IMG_3", url: "https://cdn/body.png", tag: "BODY_IMAGE", block_type: "body" },
    ],
    ...ctxExtra.value,
  })),
  resolveHeroVariant: (...a: unknown[]) =>
    (resolveHeroVariant as unknown as (...x: unknown[]) => unknown)(...a),
  buildHeroVars: (...a: unknown[]) =>
    (buildHeroVars as unknown as (...x: unknown[]) => unknown)(...a),
  buildTextFormatVars: vi.fn(() => ({
    blocks_with_content_json: '[{"headline":"Copy do n8n"}]',
  })),
  buildImageFormatVars: vi.fn(() => ({})),
  buildColorFormatVars: vi.fn(() => ({})),
}))

import { runPhase2HtmlQa } from "./phase2-runner.service"
import { spliceHero, locateHeroRegion } from "./html/hero-locator"
import { missingTelemetryKeys } from "./shared/telemetry-contract"

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
  invokeColorFormatChain.mockResolvedValue({
    ...chainResultBase,
    ops: [],
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
  invokeColorFormatChain.mockReset()
  buildHeroVars.mockReset()
  buildHeroVars.mockReturnValue({})
  resolveHeroVariant.mockReset()
  resolveHeroVariant.mockResolvedValue({
    variant: null,
    source: null,
    mismatch: false,
  })
  refSource.value = "global"
  ctxExtra.value = {}
}

const email = () => h.tables.email_flow_emails[0]
const runsOf = (agent: string) =>
  (h.tables.email_generation_runs ?? []).filter((r) => r.agent === agent)

beforeEach(() => reset())

/** Row de config do agente na aba Agentes (toggle = is_active). */
const agentConfig = (agent_type: string, is_active: boolean) => ({
  id: `cfg-${agent_type}`,
  agent_type,
  is_active,
  version: 1,
  model: "moonshotai/kimi-k3",
  temperature: 0.3,
  max_tokens: 8192,
  system_prompt: "",
  user_template: "",
})

// Toggle da aba Agentes como kill-switch: agente DESATIVADO tem o step
// pulado. Antes, is_active=false só apagava a config e o chain rodava
// igual com os defaults in-code — o toggle não desligava nada.
describe("toggle is_active desliga o step", () => {
  it("image_format e color_format desativados: chains não são invocados", async () => {
    mockHappyChains()
    h.tables.email_agent_configs = [
      agentConfig("image_format", false),
      agentConfig("color_format", false),
    ]
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("ready")
    expect(invokeColorFormatChain).not.toHaveBeenCalled()
    // Hero e texto seguem rodando (sem row → defaults).
    expect(invokeHeroChain).toHaveBeenCalledTimes(1)

    for (const agent of ["image_format", "color_format"]) {
      const run = runsOf(agent)[0]
      expect(run.status).toBe("skipped")
      expect((run.parsed_output as Row).reason).toBe("agent_disabled")
    }
    // O HTML atravessa intacto: nada de imagem trocada nem recolor.
    expect(email().html as string).toContain("{{BODY_IMAGE}}")
  })

  it("hero_section desativado: cadeia segue da reference, sem LLM na hero", async () => {
    mockHappyChains()
    // Com a hero desligada o input do texto mantém {{HERO_IMAGE}} — o
    // full-doc devolve o MESMO documento (o guard cobra as tags de imagem).
    invokeTextFormatChain.mockImplementation(async () => ({
      ...chainResultBase,
      html: REFERENCE_HTML.replace("{{BODY_TEXT}}", "corpo final da copy"),
    }))
    h.tables.email_agent_configs = [agentConfig("hero_section", false)]
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("ready")
    expect(invokeHeroChain).not.toHaveBeenCalled()
    const run = runsOf("hero_section")[0]
    expect(run.status).toBe("skipped")
    expect((run.parsed_output as Row).reason).toBe("agent_disabled")
    // Sem o agente, a hero da reference sobrevive (não vira "Hero pronta").
    expect(email().html as string).not.toContain("Hero pronta")
  })

  it("row ATIVA continua rodando o agente (regressão do toggle)", async () => {
    mockHappyChains()
    h.tables.email_agent_configs = [
      agentConfig("image_format", true),
      agentConfig("color_format", true),
    ]
    await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    // Imagem virou código: a "execução" é o run deterministic com sucesso.
    const imgRun = runsOf("image_format")[0]
    expect(imgRun.status).toBe("success")
    expect(imgRun.model).toBe("deterministic")
    expect(invokeColorFormatChain).toHaveBeenCalledTimes(1)
  })
})

describe("cadeia de formatação — runner (legado full-doc)", () => {
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

    // Sem schema no blueprint (doc legado), o texto cai no full-doc — o
    // caminho que coloca a copy quando o merge não tem campos.
    expect(invokeTextFormatChain).toHaveBeenCalledTimes(1)

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
      source: "blueprint",
      mismatch: false,
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
    expect(runsOf("image_format")[0].status).toBe("success")
    expect(invokeColorFormatChain).toHaveBeenCalledTimes(1)
    expect((email().html as string)).toContain("copy já posicionada")
    expect((email().html as string)).toContain("https://cdn/body.png")
  })
})

// ── MC-5: o enxerto da hero não roda sobre documento montado por código ──
describe("enxerto da hero × reference montada", () => {
  it("reference do assembler: NÃO reenxerta (a hero canônica já está lá)", async () => {
    // Desde a CM-2 o assembleDocument concatena o HTML canônico das
    // variantes escolhidas — a hero do documento JÁ é a da biblioteca.
    // Reenxertar refazia o mesmo trabalho e normalizava fontes duas vezes.
    refSource.value = "assembler"
    mockHappyChains()

    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })

    expect(res.status).toBe("ready")
    // A variante CONTINUA sendo resolvida — é dela que sai o design_system,
    // a especificação escrita a mao de como a hero deve ficar. Pular a
    // resolucao junto com o enxerto tirava o <design_system> do prompt, e o
    // contrato do agente le ausencia de spec como "faca so substituicao".
    expect(resolveHeroVariant).toHaveBeenCalled()
    const run = runsOf("hero_section")[0]
    expect(
      (run?.parsed_output as Record<string, unknown>)?.graft_status,
    ).toBe("skipped_assembled")
    // A região JÁ é canônica: o agente faz substituição pura, não
    // restauração estrutural. Sem isto, pular o enxerto reintroduziria o
    // modo `montador` — o oposto do que a montagem por código conquistou.
    expect(
      (run?.parsed_output as Record<string, unknown>)?.hero_source,
    ).toBe("library")
  })

  it("reference do assembler: o design_system da variante CHEGA no agente", async () => {
    // Regressao de 10/08: pular a resolucao junto com o enxerto deixava
    // `variant` null, e `hero_variant_design_system` (8k chars de spec
    // escrita a mao) sumia do prompt. O agente entrava em substituicao
    // pura e a hero saia achatada.
    refSource.value = "assembler"
    mockHappyChains()
    resolveHeroVariant.mockResolvedValue({
      variant: {
        id: "v-hero-9",
        html: "<tr><td>{{HERO_HEADLINE}}</td></tr>",
        design_system: "ANATOMIA: banda escura no topo, 2 botoes empilhados",
      },
      source: "slot_map",
      mismatch: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })

    const [, params] = buildHeroVars.mock.calls[0] as [
      unknown,
      { variant?: { design_system?: string } | null },
    ]
    expect(params.variant?.design_system).toContain("ANATOMIA")
  })

  it("fallback global: continua enxertando", async () => {
    // Aqui a hero do documento é a do template global, não a da variante
    // escolhida — é o caso em que o enxerto tem função.
    refSource.value = "global"
    mockHappyChains()

    await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })

    expect(resolveHeroVariant).toHaveBeenCalled()
  })
})

// ── Caso-mestre: merge por EXAMPLE (biblioteca real, sem placeholder) ────
// A reference é HTML autorado: as frases SÃO os examples do schema, a
// imagem é src="URL_DA_IMAGEM_1", a arte fixa é base64 e a marca é
// NOME_DA_MARCA. Nenhum {{TAG}} de texto.
const EXAMPLE_REFERENCE = [
  "<!DOCTYPE html><html><body>",
  "<!-- cfy:block:0:header:start -->",
  '<table role="presentation"><tr><td><img src="URL_DO_LOGO_AQUI" alt="NOME_DA_MARCA" width="120"></td></tr></table>',
  "<!-- cfy:block:0:header:end -->",
  "<!-- cfy:block:1:hero:start -->",
  '<table role="presentation"><tr><td>Don&rsquo;t miss the Summer Sale</td></tr><tr><td><a href="#">Shop the collection</a></td></tr></table>',
  "<!-- cfy:block:1:hero:end -->",
  "<!-- cfy:block:2:beneficios:start -->",
  '<table role="presentation"><tr><td>Body copy example here</td></tr><tr><td><img src="URL_DA_IMAGEM_1" alt="ALT_DA_IMAGEM_1"></td></tr>',
  '<tr><td><img src="data:image/png;base64,AAAA" alt=""></td></tr></table>',
  "<!-- cfy:block:2:beneficios:end -->",
  "</body></html>",
].join("\n")

const EXAMPLE_BLUEPRINT = {
  blocks: [
    { type: "header", fields: [] },
    {
      type: "hero",
      fields: [
        { key: "hero_headline", type: "text_short", example: "Don't miss the Summer Sale" },
        { key: "hero_cta_label", type: "text_short", example: "Shop the collection" },
        { key: "hero_note", type: "text_short", example: "Frase que nao existe no HTML" },
      ],
    },
    {
      type: "beneficios",
      fields: [
        { key: "body_text", type: "text_long", example: "Body copy example here" },
        { key: "body_image", type: "image", example: "" },
      ],
    },
  ],
}

const EXAMPLE_BLOCKS = [
  { id: "b-header", position: 1, block_type: "header", content: {} },
  {
    id: "b-hero",
    position: 2,
    block_type: "hero",
    content: {
      hero_headline: "Última chamada do inverno",
      hero_cta_label: "Ver ofertas",
      hero_note: "valor sem lugar",
    },
  },
  {
    id: "b-body",
    position: 3,
    block_type: "beneficios",
    content: { body_text: "Corpo final da copy" },
  },
]

const EXAMPLE_HERO_FRAGMENT = [
  '<table role="presentation"><tr><td>Última chamada do inverno</td></tr>',
  '<tr><td><a href="https://loja.com/colecao">Ver ofertas</a></td></tr></table>',
].join("\n")

function setupExampleCase() {
  refSource.value = "assembler" // sem enxerto — a reference já é canônica
  ctxExtra.value = {
    referenceHtml: EXAMPLE_REFERENCE,
    blocks: EXAMPLE_BLOCKS,
    blueprint: EXAMPLE_BLUEPRINT,
    brandName: "Loja Bonita",
    logoLight: '<img src="https://cdn/logo.png" alt="Loja Bonita">',
    emailRow: { name: "Welcome #1", subject: "Oi", preheader: "pre" },
    // A imagem GERADA do bloco beneficios (position 3) — o image-merge
    // determinístico a escreve no token src="URL_DA_IMAGEM_1".
    imageMap: [
      { id: "IMG_3", url: "https://cdn/gerada.png", tag: null, block_type: "beneficios" },
    ],
  }
  invokeHeroChain.mockResolvedValue({
    ...chainResultBase,
    output: EXAMPLE_HERO_FRAGMENT,
    mode: "fragment",
  })
  invokeColorFormatChain.mockResolvedValue({ ...chainResultBase, ops: [] })
}

describe("merge por example — caso-mestre", () => {
  it("copy por splice, hero com copy final, text_format pulado, sem_lugar registrado", async () => {
    setupExampleCase()
    // ctxExtra troca a reference — o mock de format-context lê no momento
    // da chamada, então basta setar antes do run.
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("ready")

    // (1) Run copy_merge success com o contrato de telemetria completo.
    const mergeRun = runsOf("copy_merge")[0]
    expect(mergeRun.status).toBe("success")
    const parsed = mergeRun.parsed_output as Row
    expect(missingTelemetryKeys("copy_merge", parsed)).toEqual([])
    expect(parsed.slots_total).toBe(4)
    expect(parsed.merged).toBe(3)
    expect(parsed.sem_lugar).toEqual([
      { block_id: "b-hero", key: "hero_note", motivo: "nao_encontrado" },
    ])
    const campos = parsed.campos as Array<Record<string, unknown>>
    expect(campos).toHaveLength(4)
    expect(
      campos.find((c) => c.key === "body_text"),
    ).toMatchObject({
      block_id: "b-body",
      desfecho: "ancorado_exemplo",
      de: "Body copy example here",
      para: "Corpo final da copy",
    })
    // Estruturais por código: logo (URL crua) e marca (alt).
    const estruturais = parsed.estruturais as Array<{ token: string }>
    expect(estruturais.map((e) => e.token)).toContain("URL_DO_LOGO_AQUI")
    expect(estruturais.map((e) => e.token)).toContain("NOME_DA_MARCA")

    // (2) O agente de hero recebeu a região JÁ com a copy final aplicada,
    // e o hero_pending carrega SÓ o campo que o merge não escreveu.
    const [, heroParams] = buildHeroVars.mock.calls[0] as [
      unknown,
      {
        regionHtml: string
        heroPending?: Array<{ key: string; motivo: string; tem_valor: boolean }>
      },
    ]
    expect(heroParams.regionHtml).toContain("Última chamada do inverno")
    expect(heroParams.regionHtml).toContain("Ver ofertas")
    expect(heroParams.heroPending).toEqual([
      { key: "hero_note", motivo: "nao_encontrado", tem_valor: true },
    ])

    // (3) text_format PULADO — o merge é o caminho único de texto.
    expect(invokeTextFormatChain).not.toHaveBeenCalled()
    const textRun = runsOf("text_format")[0]
    expect(textRun.status).toBe("skipped")
    expect((textRun.parsed_output as Row).skip_reason).toBe("merge_por_exemplo")

    // (4) Imagem DETERMINÍSTICA (F3): run image_format sem LLM, URL gerada
    // no lugar do token, alt cru limpo.
    const imgRun = runsOf("image_format")[0]
    expect(imgRun.status).toBe("success")
    expect(imgRun.model).toBe("deterministic")
    const imgParsed = imgRun.parsed_output as Row
    expect(imgParsed.merged).toBe(1)
    expect(
      (imgParsed.campos as Array<Record<string, unknown>>).find(
        (c) => c.key === "body_image",
      ),
    ).toMatchObject({ desfecho: "ancorado_token", de: "URL_DA_IMAGEM_1" })

    // (5) HTML final: copy nova no lugar das frases de example; imagem
    // gerada no token; logo e marca preenchidos; arte fixa intacta; nenhum
    // token cru sobrando.
    const html = email().html as string
    expect(html).toContain("Corpo final da copy")
    expect(html).not.toContain("Body copy example here")
    expect(html).toContain('src="https://cdn/gerada.png"')
    expect(html).not.toContain("URL_DA_IMAGEM_1")
    expect(html).not.toContain("ALT_DA_IMAGEM_1")
    expect(html).toContain('src="https://cdn/logo.png"')
    expect(html).toContain('alt="Loja Bonita"')
    expect(html).toContain("data:image/png;base64,AAAA")
    expect(html).not.toContain("{{")
  })

  it("guard da hero: fragmento que perdeu a copy do merge derruba o step (hero_failed)", async () => {
    setupExampleCase()
    // O agente "reescreveu" a headline — o valor aplicado pelo merge sumiu.
    invokeHeroChain.mockResolvedValue({
      ...chainResultBase,
      output:
        '<table role="presentation"><tr><td>Headline inventada</td></tr></table>',
      mode: "fragment",
    })
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("failed")
    expect(email().failure_reason).toBe("hero_failed")
    const rs = runsOf("hero_section")
    expect(rs).toHaveLength(2)
    expect(
      rs.every((r) => String(r.error_message ?? "").includes("hero_copy_lost")),
    ).toBe(true)
  })

  it("guard da hero: wordmark trocado pelo logo passa — a marca fica no alt", async () => {
    // Incidente Luxe Lift 23/08: o prompt da hero MANDA trocar o nome da
    // marca em texto pelo <img> do logo, e o guard matava o e-mail por
    // isso — o strip de tags apagava o alt junto com a tag.
    setupExampleCase()
    invokeHeroChain.mockResolvedValue({
      ...chainResultBase,
      output: [
        '<table role="presentation">',
        '<tr><td><img src="https://cdn/logo.png" alt="Última chamada do inverno" /></td></tr>',
        '<tr><td><a href="https://loja.com/colecao">Ver ofertas</a></td></tr></table>',
      ].join("\n"),
      mode: "fragment",
    })
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("ready")
    const run = runsOf("hero_section")[0]
    expect(run.status).toBe("success")
    expect((run.parsed_output as Row).hero_copy_via_alt).toEqual([
      "Última chamada do inverno",
    ])
  })

  it("retry da hero recebe as frases que faltaram na tentativa anterior", async () => {
    setupExampleCase()
    // 1ª tentativa perde a copy; 2ª devolve o fragmento correto.
    invokeHeroChain
      .mockResolvedValueOnce({
        ...chainResultBase,
        output: '<table role="presentation"><tr><td>Headline inventada</td></tr></table>',
        mode: "fragment",
      })
      .mockResolvedValue({
        ...chainResultBase,
        output: EXAMPLE_HERO_FRAGMENT,
        mode: "fragment",
      })
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("ready")

    // A 1ª chamada não carrega nota; a 2ª carrega o que o guard acusou.
    const primeira = invokeHeroChain.mock.calls[0][0] as { missingCopy?: string[] }
    const segunda = invokeHeroChain.mock.calls[1][0] as { missingCopy?: string[] }
    expect(primeira.missingCopy ?? []).toEqual([])
    expect(segunda.missingCopy).toEqual([
      "Última chamada do inverno",
      "Ver ofertas",
    ])
  })

  it("copy acima do max_len vira issue no e-mail mesmo com o QA desligado", async () => {
    // Luxe Lift 23/08: SEIS campos estouraram o limite e ninguém viu. O
    // check existia, mas só dentro do agente de QA — que nesta loja está
    // desligado. O e-mail saiu com o botão final quebrado em duas linhas.
    setupExampleCase()
    h.tables.email_blocks = [
      {
        id: "b-produtos",
        email_id: "e1",
        position: 1,
        block_type: "products",
        content: { final_cta_label: "SHOP THE COMFORT LIFT COLLECTION" },
        fields: [
          {
            key: "final_cta_label",
            type: "text_short",
            nature: "copy",
            max_len: 26,
            required: false,
          },
        ],
      },
    ]
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("ready")
    const issues = (email().qa_issues ?? []) as Array<Record<string, unknown>>
    const estouro = issues.find((i) => i.type === "copy_excede_max_len")
    expect(estouro).toBeDefined()
    expect(String(estouro?.message)).toContain("final_cta_label")
  })

  it("copy dentro do limite não gera issue", async () => {
    setupExampleCase()
    h.tables.email_blocks = [
      {
        id: "b-produtos",
        email_id: "e1",
        position: 1,
        block_type: "products",
        content: { final_cta_label: "SHOP COLLECTION" },
        fields: [
          {
            key: "final_cta_label",
            type: "text_short",
            nature: "copy",
            max_len: 26,
            required: false,
          },
        ],
      },
    ]
    await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    const issues = (email().qa_issues ?? []) as Array<Record<string, unknown>>
    expect(issues.some((i) => i.type === "copy_excede_max_len")).toBe(false)
  })

  it("guard da hero: fragmento re-espaçado passa (mesma régua do casamento)", async () => {
    setupExampleCase()
    invokeHeroChain.mockResolvedValue({
      ...chainResultBase,
      output: [
        '<table role="presentation"><tr><td>Última  chamada',
        "do inverno</td></tr>",
        '<tr><td><a href="https://loja.com/colecao">Ver ofertas</a></td></tr></table>',
      ].join("\n"),
      mode: "fragment",
    })
    const res = await runPhase2HtmlQa({ storeId: "store1", emailId: "e1" })
    expect(res.status).toBe("ready")
    expect(runsOf("hero_section")[0].status).toBe("success")
  })
})
