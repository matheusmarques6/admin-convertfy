/**
 * Testes do núcleo de Geração de Imagens por Loja (Central de Campanhas).
 *
 * Mocka `generateEmailImage` (não chama OpenRouter), `loadTopProducts`,
 * `renderImageTemplate` e `buildImagePromptVars` (puros mas puxam deps
 * pesadas) e o admin Supabase via um fake stateful por tabela (results
 * indexados por batch_id:store_id). Exercita o service real:
 *  - getCampaignImageData monta lojas-alvo (brand) + lotes + resultados
 *  - createBatch valida org e grava o lote
 *  - generateBatch grava 1 result por loja (ready/failed), pool não perde lojas
 *  - headline da copy de produção (heading > subject > vazio)
 *  - regenerateResult: com ajuste -> 'adjustment', sem -> 'ready', falha -> 'failed'
 *  - retry de loja 'failed'
 *  - isolamento por org (suggestion de outra org -> NotFoundError)
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const SUG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const OTHER_ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const STORE_A = "11111111-1111-4111-8111-111111111111"
const STORE_B = "22222222-2222-4222-8222-222222222222"
const STORE_C = "33333333-3333-4333-8333-333333333333"
const BATCH = "44444444-4444-4444-8444-444444444444"

// ── Mock do agente de imagem (núcleo do reuso) ───────────────────────
const generateEmailImageMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/agents/chains/image.chain", () => ({
  generateEmailImage: generateEmailImageMock,
}))

// renderImageTemplate usa a implementação REAL (handlebars-lite puro, sem deps
// pesadas) para que os testes do contexto textual opt-in exercitem o template
// gated de verdade (gates {{#if INCLUDE_*}} caindo/aparecendo).
vi.mock("@/lib/agents/image/template-renderer", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/agents/image/template-renderer")
  >("@/lib/agents/image/template-renderer")
  return { renderImageTemplate: actual.renderImageTemplate }
})
// buildImagePromptVars é mockado (puxa derivers pesados); devolve um bag
// realista de vars-base pra resolver os fallbacks de loja do opt-in.
const buildImagePromptVarsMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/agents/image/prompt-vars-builder", () => ({
  buildImagePromptVars: buildImagePromptVarsMock,
}))

/**
 * Template gated REAL (cópia da migration 20260808). O núcleo visual é
 * incondicional; as 5 linhas textuais são gated por {{#if INCLUDE_*}}.
 * Mantido em sincronia com supabase/migrations/20260808_campaign_image_text_context.sql.
 */
const GATED_TEMPLATE = `Generate a campaign image for the brand {{MARCA}}.

Visual identity (anchor the image to these):
- Palette: {{PALETA_1}} + {{PALETA_2}}, neutral {{NEUTRO}}
- Logo style: {{LOGO_STYLE}}
- Mood: {{MOOD}}
- Scene hint: {{CENARIO}}

Product hero: {{PRODUTO_HEROI}}
{{#if INCLUDE_NICHO}}Niche / context: {{NICHO}}
{{/if}}{{#if INCLUDE_PUBLICO}}Target audience: {{PUBLICO}}
{{/if}}{{#if INCLUDE_TOM}}Tone of voice: {{TOM_VOZ}}
{{/if}}{{#if INCLUDE_MOEDA}}Locale / currency: {{IDIOMA}} / {{MOEDA}}
{{/if}}{{#if INCLUDE_HEADLINE}}Campaign headline to EVOKE (do NOT render literal text in the image): "{{HEADLINE}}"
{{/if}}
{{#if INSTRUCAO_ADICIONAL}}
ART DIRECTION (batch instruction + per-store adaptation):
{{INSTRUCAO_ADICIONAL}}
{{/if}}

Render a single campaign-quality image that {{MARCA}} would proudly use. Anchor it to the brand palette, mood and niche above.`

/** Bag de vars-base realista (espelha o shape de buildImagePromptVars). */
function baseVars(instrucaoAdicional = ""): Record<string, string> {
  return {
    MARCA: "Loja Teste",
    PALETA_1: "#111111",
    PALETA_2: "#222222",
    NEUTRO: "#FFFFFF",
    LOGO_STYLE: "flat",
    MOOD: "bold",
    CENARIO: "studio",
    PRODUTO_HEROI: "Tênis X",
    nicho: "moda fitness",
    PUBLICO: "corredoras urbanas",
    tom_voz: "energético",
    MOEDA: "BRL",
    IDIOMA: "pt-BR",
    INSTRUCAO_ADICIONAL: instrucaoAdicional,
  }
}
const loadTopProductsMock = vi.hoisted(() => vi.fn(async () => [] as unknown[]))
vi.mock("@/lib/agents/top-products", () => ({
  loadTopProducts: loadTopProductsMock,
}))

// ── Mock da telemetria (two-phase: running -> success/error) ─────────
// logGenerationRun devolve um runId fake; updateGenerationRun é um spy. Os
// dois são best-effort no service (não devem quebrar a geração), então os
// testes também exercitam a resiliência (logGenerationRun rejeitando/"".)
const RUN_ID = "run-fake-0000"
const logGenerationRunMock = vi.hoisted(() => vi.fn())
const updateGenerationRunMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/agents/callbacks/telemetry.callback", () => ({
  logGenerationRun: logGenerationRunMock,
  updateGenerationRun: updateGenerationRunMock,
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))

// ── Fake stateful do Supabase admin por tabela ───────────────────────

type Row = Record<string, unknown>

interface SugFixture {
  id: string
  org_id: string
  title: string | null
  send_date: string | null
  targets: Array<{ store_id: string; store_name?: string; country?: string }>
  copy_results: { production?: Record<string, Row> } | null
}

const fx: {
  suggestion: SugFixture | null
  config: Row | null
  batches: Map<string, Row>
  results: Map<string, Row> // key = `${batch_id}:${store_id}`
  insertedBatches: Row[]
  // Override do store_brand_identity single (loadStoreContext) — controla
  // logo_main_png/svg por teste. Null => default (sem logo).
  brandOverride: Row | null
} = {
  suggestion: null,
  config: null,
  batches: new Map(),
  results: new Map(),
  insertedBatches: [],
  brandOverride: null,
}

function resultKey(batchId: unknown, storeId: unknown): string {
  return `${String(batchId)}:${String(storeId)}`
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function makeQuery(table: string): any {
  const filters: Array<{ c: string; v: unknown }> = []
  let action: "select" | "update" | "insert" | "upsert" = "select"
  let payload: Row | Row[] | null = null

  const eqVal = (c: string) => filters.find((f) => f.c === c)?.v

  const applyUpdate = (): Row | null => {
    if (table === "campaign_image_batches") {
      const id = eqVal("id")
      const org = eqVal("org_id")
      const row = id ? fx.batches.get(String(id)) : undefined
      if (!row) return null
      if (org !== undefined && row.org_id !== org) return null
      Object.assign(row, payload as Row)
      return row
    }
    if (table === "campaign_image_results") {
      const key = resultKey(eqVal("batch_id"), eqVal("store_id"))
      const row = fx.results.get(key)
      if (!row) return null
      Object.assign(row, payload as Row)
      return row
    }
    return null
  }

  const applyUpsert = (): void => {
    if (table !== "campaign_image_results") return
    const rows = Array.isArray(payload) ? payload : [payload as Row]
    for (const r of rows) {
      const key = resultKey(r.batch_id, r.store_id)
      const existing = fx.results.get(key)
      if (existing) {
        Object.assign(existing, r)
      } else {
        fx.results.set(key, {
          id: `res-${key}`,
          adjustment_notes: null,
          image_url: null,
          error_message: null,
          generated_via: null,
          generated_at: null,
          ...r,
        })
      }
    }
  }

  const selectData = (): unknown => {
    if (table === "campaign_suggestions") {
      const id = eqVal("id")
      const org = eqVal("org_id")
      const s = fx.suggestion
      if (!s || s.id !== id) return null
      if (org !== undefined && s.org_id !== org) return null
      return {
        id: s.id,
        title: s.title,
        send_date: s.send_date,
        targets: s.targets,
        copy_results: s.copy_results,
      }
    }
    if (table === "email_agent_configs") return fx.config
    if (table === "campaign_image_batches") {
      const id = eqVal("id")
      if (id) {
        const row = fx.batches.get(String(id))
        const org = eqVal("org_id")
        if (!row) return null
        if (org !== undefined && row.org_id !== org) return null
        return row
      }
      // listagem por suggestion
      return [...fx.batches.values()].filter(
        (b) => b.suggestion_id === eqVal("suggestion_id"),
      )
    }
    if (table === "campaign_image_results") {
      const batchId = eqVal("batch_id")
      const storeId = eqVal("store_id")
      if (storeId !== undefined) {
        return fx.results.get(resultKey(batchId, storeId)) ?? null
      }
      // getCampaignImageData usa .in("batch_id", batchIds)
      const inBatchIds = filters.find((f) => f.c === "__in__")?.v as
        | string[]
        | undefined
      if (inBatchIds) {
        return [...fx.results.values()].filter((r) =>
          inBatchIds.includes(r.batch_id as string),
        )
      }
      return [...fx.results.values()].filter((r) => r.batch_id === batchId)
    }
    if (table === "client_stores") {
      const id = eqVal("id")
      if (id) {
        return {
          id,
          store_name: `Loja ${String(id).slice(0, 4)}`,
          store_url: "https://loja.example",
          language: "pt-BR",
          currency: "BRL",
          niche: "moda",
          country: "BR",
        }
      }
      // .in() — devolve uma linha por store-id filtrado
      const inVals = (filters.find((f) => f.c === "__in__")?.v as string[]) ?? []
      return inVals.map((sid) => ({
        id: sid,
        store_name: `Loja ${sid.slice(0, 4)}`,
        country: "BR",
        language: "pt-BR",
      }))
    }
    if (table === "store_brand_identity") {
      const inVals = (filters.find((f) => f.c === "__in__")?.v as string[]) ?? []
      if (inVals.length > 0) {
        return inVals.map((sid) => ({
          store_id: sid,
          logo_main_png: "logo.png",
          logo_main_svg: null,
          colors_primary: [{ hex: "#ABC123" }],
          version: 1,
        }))
      }
      return {
        store_id: eqVal("store_id"),
        colors_primary: [{ hex: "#ABC123" }],
        version: 1,
        logo_main_png: null,
        logo_main_svg: null,
        ...(fx.brandOverride ?? {}),
      }
    }
    if (table === "store_briefings") return null
    return null
  }

  const self: any = {
    select: () => self,
    eq: (c: string, v: unknown) => {
      filters.push({ c, v })
      return self
    },
    in: (_c: string, v: unknown) => {
      filters.push({ c: "__in__", v })
      return self
    },
    order: () => self,
    limit: () => self,
    update: (p: Row) => {
      action = "update"
      payload = p
      return self
    },
    insert: (p: Row | Row[]) => {
      action = "insert"
      payload = p
      return self
    },
    upsert: (p: Row | Row[]) => {
      action = "upsert"
      payload = p
      applyUpsert()
      // upsert sem .select() é aguardado direto
      return self
    },
    maybeSingle: async () => {
      if (action === "update") return { data: applyUpdate(), error: null }
      return { data: selectData(), error: null }
    },
    single: async () => {
      if (action === "insert") {
        const p = payload as Row
        const id = (p.id as string) ?? BATCH
        const row: Row = {
          id,
          adapt_flags: {},
          reference_image_url: null,
          task_id: null,
          created_at: "2026-06-30T00:00:00Z",
          updated_at: "2026-06-30T00:00:00Z",
          ...p,
        }
        fx.batches.set(id, row)
        fx.insertedBatches.push(row)
        return { data: row, error: null }
      }
      return { data: selectData(), error: null }
    },
    // Para chamadas terminadas sem maybeSingle/single (update().eq().eq(),
    // upsert(), select().in()) — thenable que resolve a ação acumulada.
    then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
      if (action === "update") {
        return resolve({ data: applyUpdate(), error: null })
      }
      if (action === "upsert") {
        return resolve({ data: null, error: null })
      }
      return resolve({ data: selectData(), error: null })
    },
  }
  return self
}
/* eslint-enable @typescript-eslint/no-explicit-any */

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: (t: string) => makeQuery(t) })),
}))

function seedSuggestion(over: Partial<SugFixture> = {}): void {
  fx.suggestion = {
    id: SUG,
    org_id: ORG,
    title: "Mid-Year Sale",
    send_date: "2026-07-15",
    targets: [
      { store_id: STORE_A, store_name: "Loja A", country: "BR" },
      { store_id: STORE_B, store_name: "Loja B", country: "PT" },
    ],
    copy_results: {
      production: {
        [STORE_A]: {
          subject: "Sub A",
          blocks: [{ type: "heading", headline: "Headline da Loja A" }],
        },
        [STORE_B]: { subject: "Sub B fallback", blocks: [] },
      },
    },
    ...over,
  }
}

const CONFIG_ID = "cfg-campaign-image-0001"
function seedConfig(): void {
  fx.config = {
    id: CONFIG_ID,
    model: "openai/gpt-5.4-image-2",
    system_prompt: "SYS",
    user_template: GATED_TEMPLATE,
  }
}

function seedBatch(over: Row = {}): void {
  const row: Row = {
    id: BATCH,
    org_id: ORG,
    suggestion_id: SUG,
    task_id: "task-1",
    name: "Hero",
    format: "hero",
    instruction: "banner de verão",
    reference_image_url: null,
    adapt_flags: { cores: true, logo: true },
    created_at: "2026-06-30T00:00:00Z",
    updated_at: "2026-06-30T00:00:00Z",
    ...over,
  }
  fx.batches.set(row.id as string, row)
}

let svc: typeof import("./campaign-image-generation.service")

beforeEach(async () => {
  vi.clearAllMocks()
  fx.suggestion = null
  fx.config = null
  fx.batches = new Map()
  fx.results = new Map()
  fx.insertedBatches = []
  fx.brandOverride = null
  generateEmailImageMock.mockReset()
  loadTopProductsMock.mockReset()
  loadTopProductsMock.mockResolvedValue([])
  buildImagePromptVarsMock.mockReset()
  logGenerationRunMock.mockReset()
  updateGenerationRunMock.mockReset()
  // Default: loga devolvendo o runId fake; update resolve sem efeito.
  logGenerationRunMock.mockResolvedValue(RUN_ID)
  updateGenerationRunMock.mockResolvedValue(undefined)
  // Default: devolve o bag de vars-base, repassando instrucaoAdicional ->
  // INSTRUCAO_ADICIONAL (o service passa instrucaoAdicional pro builder).
  buildImagePromptVarsMock.mockImplementation(
    (input: { instrucaoAdicional?: string }) => baseVars(input.instrucaoAdicional ?? ""),
  )
  svc = await import("./campaign-image-generation.service")
})

describe("getCampaignImageData", () => {
  it("monta lojas-alvo (com brand) + lotes + resultados", async () => {
    seedSuggestion()
    seedBatch()
    fx.results.set(resultKey(BATCH, STORE_A), {
      id: "r1",
      batch_id: BATCH,
      store_id: STORE_A,
      status: "ready",
      image_url: "img-a.png",
      adjustment_notes: null,
      error_message: null,
      generated_via: "campaign_image:m",
      generated_at: "2026-06-30T01:00:00Z",
    })

    const data = await svc.getCampaignImageData(SUG, ORG)
    expect(data.suggestion_id).toBe(SUG)
    expect(data.stores).toHaveLength(2)
    const a = data.stores.find((s) => s.store_id === STORE_A)
    expect(a?.logo_url).toBe("logo.png")
    expect(a?.primary_color).toBe("#ABC123")

    expect(data.batches).toHaveLength(1)
    expect(data.batches[0].results).toHaveLength(1)
    expect(data.batches[0].results[0].status).toBe("ready")
    expect(data.batches[0].results[0].image_url).toBe("img-a.png")
  })

  it("suggestion de outra org -> NotFoundError", async () => {
    seedSuggestion()
    await expect(svc.getCampaignImageData(SUG, OTHER_ORG)).rejects.toThrow()
  })
})

describe("createBatch", () => {
  it("valida org e grava o lote (vazio de resultados)", async () => {
    seedSuggestion()
    const out = await svc.createBatch(
      SUG,
      ORG,
      { name: "Quadrado", format: "square", instruction: "  promo  " },
      "user-1",
    )
    expect(out.format).toBe("square")
    expect(out.instruction).toBe("promo") // trim
    expect(out.results).toEqual([])
    expect(fx.insertedBatches).toHaveLength(1)
    expect(fx.insertedBatches[0].org_id).toBe(ORG)
    expect(fx.insertedBatches[0].suggestion_id).toBe(SUG)
  })

  it("org errada -> NotFoundError (não grava)", async () => {
    seedSuggestion()
    await expect(
      svc.createBatch(SUG, OTHER_ORG, { name: "x", format: "hero", instruction: "" }, null),
    ).rejects.toThrow()
    expect(fx.insertedBatches).toHaveLength(0)
  })

  it("sem text_context -> persiste {} (default) e devolve {}", async () => {
    seedSuggestion()
    const out = await svc.createBatch(
      SUG,
      ORG,
      { name: "X", format: "hero", instruction: "" },
      "user-1",
    )
    expect(fx.insertedBatches[0].text_context).toEqual({})
    expect(out.text_context).toEqual({})
  })

  it("com text_context -> persiste e devolve o mesmo (round-trip)", async () => {
    seedSuggestion()
    const tc = {
      nicho: { include: true },
      headline: { include: true, value: "Promo" },
    }
    const out = await svc.createBatch(
      SUG,
      ORG,
      { name: "X", format: "hero", instruction: "", text_context: tc },
      "user-1",
    )
    expect(fx.insertedBatches[0].text_context).toEqual(tc)
    expect(out.text_context).toEqual(tc)
  })
})

describe("updateBatch", () => {
  it("persiste text_context no PATCH e devolve o lote atualizado (round-trip)", async () => {
    seedSuggestion()
    seedBatch({ text_context: {} })
    const tc = { tom: { include: true, value: "sóbrio" }, moeda: { include: false } }
    const out = await svc.updateBatch(BATCH, ORG, { text_context: tc })
    expect(out.text_context).toEqual(tc)
    // persistiu de fato na linha (fake DB).
    expect(fx.batches.get(BATCH)?.text_context).toEqual(tc)
  })

  it("PATCH sem text_context -> NÃO sobrescreve o existente", async () => {
    seedSuggestion()
    const tc = { nicho: { include: true } }
    seedBatch({ text_context: tc })
    // só muda o nome; text_context não é tocado.
    const out = await svc.updateBatch(BATCH, ORG, { name: "Novo nome" })
    expect(out.name).toBe("Novo nome")
    expect(out.text_context).toEqual(tc)
    expect(fx.batches.get(BATCH)?.text_context).toEqual(tc)
  })

  it("lote de outra org -> NotFoundError", async () => {
    seedSuggestion()
    seedBatch()
    await expect(
      svc.updateBatch(BATCH, OTHER_ORG, { text_context: { nicho: { include: true } } }),
    ).rejects.toThrow()
  })
})

describe("generateBatch", () => {
  it("gera 1 imagem por loja, marca ready e grava image_url", async () => {
    seedSuggestion()
    seedConfig()
    seedBatch()
    generateEmailImageMock.mockImplementation(async (_p, storeId: string) => `img-${storeId}.png`)

    const out = await svc.generateBatch(BATCH, ORG)
    expect(out.results).toHaveLength(2)
    for (const r of out.results) {
      expect(r.status).toBe("ready")
      expect(r.image_url).toBe(`img-${r.store_id}.png`)
    }
    // 1 chamada por loja-alvo
    expect(generateEmailImageMock).toHaveBeenCalledTimes(2)
  })

  it("passa o model do config pro agente de imagem (config-driven)", async () => {
    seedSuggestion({ targets: [{ store_id: STORE_A }] })
    seedConfig()
    seedBatch()
    generateEmailImageMock.mockResolvedValue("img.png")

    await svc.generateBatch(BATCH, ORG)
    const opts = generateEmailImageMock.mock.calls[0][2]
    expect(opts.model).toBe("openai/gpt-5.4-image-2")
    expect(opts.systemPrompt).toBe("SYS")
    expect(opts.aspect).toBe("4:3") // hero
  })

  it("headline opt-in: usa heading da copy; fallback p/ subject; ausente sem copy", async () => {
    seedSuggestion({
      targets: [{ store_id: STORE_A }, { store_id: STORE_B }, { store_id: STORE_C }],
    })
    seedConfig()
    // headline LIGADO (sem value custom) -> usa headlineFromCopy(production).
    seedBatch({ text_context: { headline: { include: true } } })
    // Captura o prompt renderizado por loja (pool não garante ordem).
    const prompts: Record<string, string> = {}
    generateEmailImageMock.mockImplementation(async (prompt: string, storeId: string) => {
      prompts[storeId] = prompt
      return `img-${storeId}.png`
    })

    await svc.generateBatch(BATCH, ORG)

    // STORE_A: heading da copy de produção.
    expect(prompts[STORE_A]).toContain(
      'Campaign headline to EVOKE (do NOT render literal text in the image): "Headline da Loja A"',
    )
    // STORE_B: fallback pro subject (sem heading nos blocks).
    expect(prompts[STORE_B]).toContain(
      'Campaign headline to EVOKE (do NOT render literal text in the image): "Sub B fallback"',
    )
    // STORE_C: sem copy de produção -> headline vazia -> gate cai (sem linha).
    expect(prompts[STORE_C]).not.toContain("Campaign headline to EVOKE")
  })

  it("loja que falha vira 'failed' com error_message; pool não perde lojas", async () => {
    seedSuggestion({
      targets: [{ store_id: STORE_A }, { store_id: STORE_B }, { store_id: STORE_C }],
    })
    seedConfig()
    seedBatch()
    generateEmailImageMock.mockImplementation(async (_p, storeId: string) => {
      if (storeId === STORE_B) throw new Error("OpenRouter 500: boom")
      return `img-${storeId}.png`
    })

    const out = await svc.generateBatch(BATCH, ORG)
    expect(out.results).toHaveLength(3) // nenhuma loja perdida
    const b = out.results.find((r) => r.store_id === STORE_B)
    expect(b?.status).toBe("failed")
    expect(b?.error_message).toContain("boom")
    const a = out.results.find((r) => r.store_id === STORE_A)
    expect(a?.status).toBe("ready")
    const c = out.results.find((r) => r.store_id === STORE_C)
    expect(c?.status).toBe("ready")
  })

  it("campanha sem lojas-alvo -> ValidationError", async () => {
    seedSuggestion({ targets: [] })
    seedConfig()
    seedBatch()
    await expect(svc.generateBatch(BATCH, ORG)).rejects.toThrow(/lojas-alvo/)
  })

  it("agente campaign_image não configurado -> ValidationError", async () => {
    seedSuggestion()
    fx.config = null
    seedBatch()
    await expect(svc.generateBatch(BATCH, ORG)).rejects.toThrow(/campaign_image/)
  })

  it("lote de outra org -> NotFoundError", async () => {
    seedSuggestion()
    seedConfig()
    seedBatch()
    await expect(svc.generateBatch(BATCH, OTHER_ORG)).rejects.toThrow()
  })

  it("pool com mais lojas que o tamanho do pool gera todas (concorrência)", async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      store_id: `${i}0000000-0000-4000-8000-000000000000`,
    }))
    seedSuggestion({ targets: many })
    seedConfig()
    seedBatch()
    generateEmailImageMock.mockImplementation(async (_p, storeId: string) => `img-${storeId}.png`)

    const out = await svc.generateBatch(BATCH, ORG)
    expect(out.results).toHaveLength(7)
    expect(out.results.every((r) => r.status === "ready")).toBe(true)
    expect(generateEmailImageMock).toHaveBeenCalledTimes(7)
  })
})

describe("text_context opt-in (prompt)", () => {
  // Captura o prompt renderizado da única loja-alvo (STORE_A).
  async function promptFor(textContext: Row): Promise<string> {
    seedSuggestion({ targets: [{ store_id: STORE_A }] })
    seedConfig()
    seedBatch({ text_context: textContext })
    let captured = ""
    generateEmailImageMock.mockImplementation(async (prompt: string) => {
      captured = prompt
      return "img.png"
    })
    await svc.generateBatch(BATCH, ORG)
    return captured
  }

  // Como promptFor, mas com as vars-base ZERADAS para os campos textuais —
  // simula loja sem nicho/persona/tom/moeda no briefing. Usado pra provar que
  // "ligado SEM override + dado de loja vazio" => linha AUSENTE (o service
  // computa INCLUDE="" via `v ? "true" : ""`, e o gate {{#if}} cai).
  async function promptForEmptyStore(textContext: Row): Promise<string> {
    // Sem copy_results.production[A] => headlineFromCopy devolve "" também.
    seedSuggestion({ targets: [{ store_id: STORE_A }], copy_results: { production: {} } })
    seedConfig()
    seedBatch({ text_context: textContext })
    buildImagePromptVarsMock.mockImplementation(
      (input: { instrucaoAdicional?: string }) => ({
        ...baseVars(input.instrucaoAdicional ?? ""),
        nicho: "",
        PUBLICO: "",
        tom_voz: "",
        MOEDA: "",
        IDIOMA: "",
      }),
    )
    let captured = ""
    generateEmailImageMock.mockImplementation(async (prompt: string) => {
      captured = prompt
      return "img.png"
    })
    await svc.generateBatch(BATCH, ORG)
    return captured
  }

  it("contexto vazio -> prompt sem nenhuma das 5 linhas textuais", async () => {
    const prompt = await promptFor({})
    expect(prompt).not.toContain("Niche / context:")
    expect(prompt).not.toContain("Target audience:")
    expect(prompt).not.toContain("Tone of voice:")
    expect(prompt).not.toContain("Locale / currency:")
    expect(prompt).not.toContain("Campaign headline to EVOKE")
    // ...mas o núcleo visual continua sempre.
    expect(prompt).toContain("Visual identity (anchor the image to these):")
    expect(prompt).toContain("Product hero: Tênis X")
  })

  it("nicho ligado sem value -> usa o nicho da loja (vars-base)", async () => {
    const prompt = await promptFor({ nicho: { include: true } })
    expect(prompt).toContain("Niche / context: moda fitness")
    // só nicho ligado: os outros campos não aparecem.
    expect(prompt).not.toContain("Target audience:")
    expect(prompt).not.toContain("Campaign headline to EVOKE")
  })

  it("nicho ligado com value custom -> usa o value (sobrescreve a loja)", async () => {
    const prompt = await promptFor({ nicho: { include: true, value: "alta costura" } })
    expect(prompt).toContain("Niche / context: alta costura")
    expect(prompt).not.toContain("moda fitness")
  })

  it("headline ligada com value -> usa exatamente esse value", async () => {
    const prompt = await promptFor({ headline: { include: true, value: "50% OFF HOJE" } })
    expect(prompt).toContain(
      'Campaign headline to EVOKE (do NOT render literal text in the image): "50% OFF HOJE"',
    )
  })

  it("headline DESLIGADA -> ausente mesmo com copy de produção tendo heading", async () => {
    // production[STORE_A] tem heading "Headline da Loja A" (seedSuggestion default),
    // mas headline off -> não entra no prompt.
    seedSuggestion()
    seedConfig()
    seedBatch({ text_context: {} })
    let captured = ""
    generateEmailImageMock.mockImplementation(async (prompt: string, storeId: string) => {
      if (storeId === STORE_A) captured = prompt
      return "img.png"
    })
    await svc.generateBatch(BATCH, ORG)
    expect(captured).not.toContain("Campaign headline to EVOKE")
    expect(captured).not.toContain("Headline da Loja A")
  })

  it("moeda ligada -> injeta IDIOMA / MOEDA da loja; desligada -> ausente", async () => {
    const on = await promptFor({ moeda: { include: true } })
    expect(on).toContain("Locale / currency: pt-BR / BRL")
    const off = await promptFor({})
    expect(off).not.toContain("Locale / currency:")
  })

  it("todos ligados -> todas as 5 linhas presentes", async () => {
    const prompt = await promptFor({
      nicho: { include: true },
      publico: { include: true },
      tom: { include: true },
      moeda: { include: true },
      headline: { include: true, value: "Promo" },
    })
    expect(prompt).toContain("Niche / context: moda fitness")
    expect(prompt).toContain("Target audience: corredoras urbanas")
    expect(prompt).toContain("Tone of voice: energético")
    expect(prompt).toContain("Locale / currency: pt-BR / BRL")
    expect(prompt).toContain('Campaign headline to EVOKE (do NOT render literal text in the image): "Promo"')
  })

  // ── publico: cobre os 4 estados (mesma matriz que nicho) ────────────
  it("publico ligado sem value -> usa a persona da loja (vars-base)", async () => {
    const prompt = await promptFor({ publico: { include: true } })
    expect(prompt).toContain("Target audience: corredoras urbanas")
  })

  it("publico ligado com value custom -> override vence a persona da loja", async () => {
    const prompt = await promptFor({
      publico: { include: true, value: "mães millennials" },
    })
    expect(prompt).toContain("Target audience: mães millennials")
    expect(prompt).not.toContain("corredoras urbanas")
  })

  it("publico ligado mas persona da loja vazia (sem override) -> linha ausente", async () => {
    const prompt = await promptForEmptyStore({ publico: { include: true } })
    expect(prompt).not.toContain("Target audience:")
  })

  // ── tom: lê tom_voz (não tom da flag de adaptação) ──────────────────
  it("tom ligado sem value -> usa tom_voz da loja (vars-base)", async () => {
    const prompt = await promptFor({ tom: { include: true } })
    expect(prompt).toContain("Tone of voice: energético")
  })

  it("tom ligado com value custom -> override vence tom_voz da loja", async () => {
    const prompt = await promptFor({
      tom: { include: true, value: "sóbrio e elegante" },
    })
    expect(prompt).toContain("Tone of voice: sóbrio e elegante")
    expect(prompt).not.toContain("energético")
  })

  it("tom ligado mas tom_voz da loja vazio (sem override) -> linha ausente", async () => {
    const prompt = await promptForEmptyStore({ tom: { include: true } })
    expect(prompt).not.toContain("Tone of voice:")
  })

  // ── moeda: override e o acoplamento IDIOMA<-INCLUDE_MOEDA ────────────
  it("moeda ligada com value custom -> override vira a MOEDA; IDIOMA da loja entra junto", async () => {
    const prompt = await promptFor({ moeda: { include: true, value: "USD" } })
    // value sobrescreve a moeda; IDIOMA continua vindo da loja (pt-BR).
    expect(prompt).toContain("Locale / currency: pt-BR / USD")
    expect(prompt).not.toContain("/ BRL")
  })

  it("moeda DESLIGADA -> IDIOMA é zerado junto (gate cai, sem linha de locale)", async () => {
    // Garante o acoplamento: IDIOMA só entra quando INCLUDE_MOEDA é truthy.
    const prompt = await promptFor({
      nicho: { include: true }, // outra linha ligada pra provar que NÃO vaza IDIOMA
    })
    expect(prompt).not.toContain("Locale / currency:")
    expect(prompt).not.toContain("pt-BR")
  })

  // ── nicho: completa a matriz (ON+empty-store) ───────────────────────
  it("nicho ligado mas niche da loja vazio (sem override) -> linha ausente", async () => {
    const prompt = await promptForEmptyStore({ nicho: { include: true } })
    expect(prompt).not.toContain("Niche / context:")
  })

  // ── headline: ON+empty (sem copy e sem override) -> linha ausente ───
  it("headline ligada sem override e sem copy de produção -> linha ausente", async () => {
    seedSuggestion({ targets: [{ store_id: STORE_A }], copy_results: { production: {} } })
    seedConfig()
    seedBatch({ text_context: { headline: { include: true } } })
    let captured = ""
    generateEmailImageMock.mockImplementation(async (prompt: string) => {
      captured = prompt
      return "img.png"
    })
    await svc.generateBatch(BATCH, ORG)
    expect(captured).not.toContain("Campaign headline to EVOKE")
  })

  // ── coupling renderer×service: ligado + dado vazio NÃO deixa label órfão.
  // Prova o guard `v ? "true" : ""`: se o service emitisse INCLUDE="true" com
  // valor vazio, o template renderizaria "Niche / context: " (label órfão).
  it("todos ligados sem override + loja vazia -> nenhum label textual órfão", async () => {
    const prompt = await promptForEmptyStore({
      nicho: { include: true },
      publico: { include: true },
      tom: { include: true },
      moeda: { include: true },
      // headline sem copy de produção (STORE_A sem production) -> vazia.
      headline: { include: true },
    })
    expect(prompt).not.toContain("Niche / context:")
    expect(prompt).not.toContain("Target audience:")
    expect(prompt).not.toContain("Tone of voice:")
    expect(prompt).not.toContain("Locale / currency:")
    expect(prompt).not.toContain("Campaign headline to EVOKE")
    // sem template tags vazando.
    expect(prompt).not.toContain("{{")
    // núcleo visual permanece.
    expect(prompt).toContain("Visual identity (anchor the image to these):")
  })
})

describe("regenerateResult", () => {
  it("com nota de ajuste -> status 'adjustment' e persiste a nota no prompt", async () => {
    seedSuggestion()
    seedConfig()
    seedBatch()
    fx.results.set(resultKey(BATCH, STORE_A), {
      id: "r1",
      batch_id: BATCH,
      store_id: STORE_A,
      status: "ready",
      image_url: "old.png",
      adjustment_notes: null,
      error_message: null,
      generated_via: null,
      generated_at: null,
    })
    generateEmailImageMock.mockResolvedValue("new.png")

    const res = await svc.regenerateResult(BATCH, ORG, STORE_A, "deixe mais escuro")
    expect(res.status).toBe("adjustment")
    expect(res.image_url).toBe("new.png")
    expect(res.adjustment_notes).toBe("deixe mais escuro")
    // a nota entrou na INSTRUCAO_ADICIONAL passada ao builder
    const instr = (buildImagePromptVarsMock.mock.calls.at(-1)?.[0] as {
      instrucaoAdicional?: string
    }).instrucaoAdicional
    expect(instr).toContain("AJUSTE SOLICITADO: deixe mais escuro")
  })

  it("sem nota (retry) -> status 'ready'", async () => {
    seedSuggestion()
    seedConfig()
    seedBatch()
    fx.results.set(resultKey(BATCH, STORE_A), {
      id: "r1",
      batch_id: BATCH,
      store_id: STORE_A,
      status: "failed",
      image_url: null,
      adjustment_notes: null,
      error_message: "prev",
      generated_via: null,
      generated_at: null,
    })
    generateEmailImageMock.mockResolvedValue("retry.png")

    const res = await svc.regenerateResult(BATCH, ORG, STORE_A, null)
    expect(res.status).toBe("ready")
    expect(res.image_url).toBe("retry.png")
  })

  it("honra o text_context do lote ao regerar (gate via batch.text_context)", async () => {
    seedSuggestion()
    seedConfig()
    // Lote com nicho ligado + override custom -> deve aparecer no prompt da
    // regeração também (regenerateResult lê batch.text_context, igual ao lote).
    seedBatch({ text_context: { nicho: { include: true, value: "alta costura" } } })
    fx.results.set(resultKey(BATCH, STORE_A), {
      id: "r1",
      batch_id: BATCH,
      store_id: STORE_A,
      status: "ready",
      image_url: "old.png",
      adjustment_notes: null,
      error_message: null,
      generated_via: null,
      generated_at: null,
    })
    let captured = ""
    generateEmailImageMock.mockImplementation(async (prompt: string) => {
      captured = prompt
      return "new.png"
    })

    await svc.regenerateResult(BATCH, ORG, STORE_A, "mais escuro")
    expect(captured).toContain("Niche / context: alta costura")
  })

  it("falha na regeração -> status 'failed' mesmo com nota", async () => {
    seedSuggestion()
    seedConfig()
    seedBatch()
    fx.results.set(resultKey(BATCH, STORE_A), {
      id: "r1",
      batch_id: BATCH,
      store_id: STORE_A,
      status: "ready",
      image_url: "old.png",
      adjustment_notes: null,
      error_message: null,
      generated_via: null,
      generated_at: null,
    })
    generateEmailImageMock.mockRejectedValue(new Error("timeout"))

    const res = await svc.regenerateResult(BATCH, ORG, STORE_A, "mais claro")
    expect(res.status).toBe("failed")
    expect(res.error_message).toContain("timeout")
  })

  it("loja fora da campanha -> ValidationError", async () => {
    seedSuggestion()
    seedConfig()
    seedBatch()
    await expect(svc.regenerateResult(BATCH, ORG, STORE_C, null)).rejects.toThrow(
      /não pertence/,
    )
  })

  it("lote de outra org -> NotFoundError", async () => {
    seedSuggestion()
    seedConfig()
    seedBatch()
    await expect(svc.regenerateResult(BATCH, OTHER_ORG, STORE_A, null)).rejects.toThrow()
  })
})

describe("telemetria (email_generation_runs)", () => {
  it("generateBatch loga 1 run 'running' por loja e atualiza p/ 'success'", async () => {
    seedSuggestion({
      targets: [{ store_id: STORE_A }, { store_id: STORE_B }],
    })
    seedConfig()
    seedBatch()
    generateEmailImageMock.mockImplementation(async (_p, storeId: string) => `img-${storeId}.png`)

    await svc.generateBatch(BATCH, ORG)

    // 1 log 'running' por loja-alvo, com agent/batch/model corretos.
    expect(logGenerationRunMock).toHaveBeenCalledTimes(2)
    for (const call of logGenerationRunMock.mock.calls) {
      const arg = call[0] as Record<string, unknown>
      expect(arg.agent).toBe("campaign_image")
      expect(arg.batchId).toBe(BATCH)
      expect(arg.status).toBe("running")
      expect(arg.model).toBe("openai/gpt-5.4-image-2")
      expect(arg.agentConfigId).toBe(CONFIG_ID)
      expect(typeof arg.renderedPrompt).toBe("string")
    }

    // 1 update 'success' por loja, com durationMs numérico >= 0.
    expect(updateGenerationRunMock).toHaveBeenCalledTimes(2)
    for (const call of updateGenerationRunMock.mock.calls) {
      expect(call[0]).toBe(RUN_ID)
      const upd = call[1] as Record<string, unknown>
      expect(upd.status).toBe("success")
      expect(typeof upd.durationMs).toBe("number")
      expect(upd.durationMs as number).toBeGreaterThanOrEqual(0)
    }
  })

  it("loja que falha -> update 'error' com errorMessage; result ainda persiste 'failed'", async () => {
    seedSuggestion({
      targets: [{ store_id: STORE_A }, { store_id: STORE_B }],
    })
    seedConfig()
    seedBatch()
    generateEmailImageMock.mockImplementation(async (_p, storeId: string) => {
      if (storeId === STORE_B) throw new Error("OpenRouter 500: boom")
      return `img-${storeId}.png`
    })

    const out = await svc.generateBatch(BATCH, ORG)

    // Comportamento existente preservado: STORE_B persiste 'failed'.
    const b = out.results.find((r) => r.store_id === STORE_B)
    expect(b?.status).toBe("failed")
    expect(b?.error_message).toContain("boom")

    // Telemetria: houve um update 'error' com a mensagem.
    const errorUpdates = updateGenerationRunMock.mock.calls.filter(
      (c) => (c[1] as Record<string, unknown>).status === "error",
    )
    expect(errorUpdates).toHaveLength(1)
    const upd = errorUpdates[0][1] as Record<string, unknown>
    expect(upd.errorMessage as string).toContain("boom")
    expect(typeof upd.durationMs).toBe("number")

    // E um update 'success' (STORE_A).
    const successUpdates = updateGenerationRunMock.mock.calls.filter(
      (c) => (c[1] as Record<string, unknown>).status === "success",
    )
    expect(successUpdates).toHaveLength(1)
  })

  it("nenhum run fica preso em 'running': todo log vira success/error 1x (mix)", async () => {
    // Mix de lojas OK e falha num único lote. Invariante load-bearing: cada
    // run logado ('running') recebe EXATAMENTE um update terminal — senão o
    // run ficaria 'running' pra sempre e inflaria a contagem "Running" da UI.
    seedSuggestion({
      targets: [{ store_id: STORE_A }, { store_id: STORE_B }, { store_id: STORE_C }],
    })
    seedConfig()
    seedBatch()
    generateEmailImageMock.mockImplementation(async (_p, storeId: string) => {
      if (storeId === STORE_B) throw new Error("boom")
      return `img-${storeId}.png`
    })

    await svc.generateBatch(BATCH, ORG)

    // 1 log 'running' por loja; nenhum log já nasce terminal.
    expect(logGenerationRunMock).toHaveBeenCalledTimes(3)
    for (const c of logGenerationRunMock.mock.calls) {
      expect((c[0] as Record<string, unknown>).status).toBe("running")
    }
    // 1 update terminal por loja (3 logs -> 3 updates), nenhum órfão.
    expect(updateGenerationRunMock).toHaveBeenCalledTimes(3)
    const terminal = updateGenerationRunMock.mock.calls.map(
      (c) => (c[1] as Record<string, unknown>).status,
    )
    expect(terminal.filter((s) => s === "success")).toHaveLength(2)
    expect(terminal.filter((s) => s === "error")).toHaveLength(1)
  })

  it("o caminho de falha mapeia 'failed' (service) -> 'error' (runs CHECK), nunca 'failed'", async () => {
    // O CHECK de email_generation_runs.status aceita
    // running|success|error|skipped — NÃO 'failed'. Se o service vazasse o
    // próprio 'failed' pro updateGenerationRun, o UPDATE quebraria (23514) e o
    // run ficaria preso em 'running'. Guarda contra esse regress.
    seedSuggestion({ targets: [{ store_id: STORE_A }] })
    seedConfig()
    seedBatch()
    generateEmailImageMock.mockRejectedValue(new Error("kaboom"))

    const out = await svc.generateBatch(BATCH, ORG)
    // result row continua 'failed' (semântica do domínio, coluna própria).
    expect(out.results[0].status).toBe("failed")

    // mas TODO status mandado pra telemetria é CHECK-valid (jamais 'failed').
    const VALID = new Set(["running", "success", "error", "skipped"])
    for (const c of updateGenerationRunMock.mock.calls) {
      expect(VALID.has((c[1] as Record<string, unknown>).status as string)).toBe(true)
    }
    expect(
      updateGenerationRunMock.mock.calls.some(
        (c) => (c[1] as Record<string, unknown>).status === "error",
      ),
    ).toBe(true)
  })

  it("regenerateResult loga e atualiza exatamente 1x (sem double-log)", async () => {
    seedSuggestion()
    seedConfig()
    seedBatch()
    fx.results.set(resultKey(BATCH, STORE_A), {
      id: "r1",
      batch_id: BATCH,
      store_id: STORE_A,
      status: "ready",
      image_url: "old.png",
      adjustment_notes: null,
      error_message: null,
      generated_via: null,
      generated_at: null,
    })
    generateEmailImageMock.mockResolvedValue("new.png")

    await svc.regenerateResult(BATCH, ORG, STORE_A, "mais escuro")

    expect(logGenerationRunMock).toHaveBeenCalledTimes(1)
    const logArg = logGenerationRunMock.mock.calls[0][0] as Record<string, unknown>
    expect(logArg.agent).toBe("campaign_image")
    expect(logArg.batchId).toBe(BATCH)
    expect(logArg.status).toBe("running")

    expect(updateGenerationRunMock).toHaveBeenCalledTimes(1)
    const upd = updateGenerationRunMock.mock.calls[0][1] as Record<string, unknown>
    expect(upd.status).toBe("success")
  })

  it("falha de telemetria não quebra a geração (logGenerationRun rejeita)", async () => {
    seedSuggestion({ targets: [{ store_id: STORE_A }] })
    seedConfig()
    seedBatch()
    logGenerationRunMock.mockRejectedValue(new Error("telemetry down"))
    generateEmailImageMock.mockResolvedValue("img.png")

    const out = await svc.generateBatch(BATCH, ORG)
    // A imagem foi gerada e persistida apesar da telemetria falhar.
    expect(out.results).toHaveLength(1)
    expect(out.results[0].status).toBe("ready")
    expect(out.results[0].image_url).toBe("img.png")
  })

  it("falha de telemetria não quebra a geração (logGenerationRun devolve \"\")", async () => {
    seedSuggestion({ targets: [{ store_id: STORE_A }] })
    seedConfig()
    seedBatch()
    // Simula o insert falhando: logGenerationRun devolve "" (run não gravado).
    logGenerationRunMock.mockResolvedValue("")
    generateEmailImageMock.mockResolvedValue("img.png")

    const out = await svc.generateBatch(BATCH, ORG)
    expect(out.results[0].status).toBe("ready")
    expect(out.results[0].image_url).toBe("img.png")
    // updateGenerationRun foi chamado com runId "" (no-op no helper real).
    expect(updateGenerationRunMock).toHaveBeenCalledWith("", expect.objectContaining({ status: "success" }))
  })
})

// ── Referências visuais (logo + produto via adapt_flags) + onMeta ─────
describe("refs visuais por adapt_flags + instrumentação onMeta", () => {
  // Captura as options passadas ao agente de imagem e dispara onMeta com tokens
  // fixos, simulando o provedor reportando usage de imagem.
  function captureOptionsAndEmitMeta(
    meta = { tokensInput: 999, tokensOutput: 5, refsSent: [] as unknown[] },
  ): void {
    generateEmailImageMock.mockImplementation(
      async (
        _p: string,
        _s: string,
        opts: { onMeta?: (m: unknown) => void },
      ) => {
        opts.onMeta?.(meta)
        return "img.png"
      },
    )
  }

  function setup(batchOver: Row): void {
    seedSuggestion({ targets: [{ store_id: STORE_A }] })
    seedConfig()
    seedBatch(batchOver)
  }

  function lastOptions(): {
    mode: string
    referenceImages?: Array<{ label?: string; url: string }>
  } {
    return generateEmailImageMock.mock.calls.at(-1)![2]
  }

  it("logo ON + logo_main_png: anexa o logo (label) e mode=product_ref", async () => {
    fx.brandOverride = { logo_main_png: "https://cdn/logo.png", logo_main_svg: null }
    setup({ adapt_flags: { logo: true }, reference_image_url: null })
    captureOptionsAndEmitMeta()

    await svc.generateBatch(BATCH, ORG)

    const opts = lastOptions()
    expect(opts.mode).toBe("product_ref")
    expect(opts.referenceImages).toContainEqual({
      label: "Brand logo — match this exactly:",
      url: "https://cdn/logo.png",
    })
  })

  it("catalogo ON + produto com image_url: anexa o produto-herói (label)", async () => {
    loadTopProductsMock.mockResolvedValue([
      { name: "Tênis", price: 1, image_url: "https://cdn/prod.jpg" },
    ])
    setup({ adapt_flags: { catalogo: true }, reference_image_url: null })
    captureOptionsAndEmitMeta()

    await svc.generateBatch(BATCH, ORG)

    const opts = lastOptions()
    expect(opts.mode).toBe("product_ref")
    expect(opts.referenceImages).toContainEqual({
      label: "Hero product — reproduce faithfully:",
      url: "https://cdn/prod.jpg",
    })
  })

  it("logo OFF + catalogo OFF, sem base: nenhuma ref e mode=text2img", async () => {
    fx.brandOverride = { logo_main_png: "https://cdn/logo.png" }
    loadTopProductsMock.mockResolvedValue([
      { name: "X", price: 1, image_url: "https://cdn/prod.jpg" },
    ])
    setup({ adapt_flags: { cores: true }, reference_image_url: null })
    captureOptionsAndEmitMeta()

    await svc.generateBatch(BATCH, ORG)

    const opts = lastOptions()
    expect(opts.mode).toBe("text2img")
    expect(opts.referenceImages).toBeUndefined()
  })

  it("reference_image_url presente: vira a 1ª ref rotulada 'Base reference:'", async () => {
    setup({ adapt_flags: {}, reference_image_url: "https://cdn/base.jpg" })
    captureOptionsAndEmitMeta()

    await svc.generateBatch(BATCH, ORG)

    const opts = lastOptions()
    expect(opts.mode).toBe("product_ref")
    expect(opts.referenceImages![0]).toEqual({
      label: "Base reference:",
      url: "https://cdn/base.jpg",
    })
  })

  it("base + logo + produto: 3 refs na ordem base, logo, produto", async () => {
    fx.brandOverride = { logo_main_png: "https://cdn/logo.png" }
    loadTopProductsMock.mockResolvedValue([
      { name: "X", price: 1, image_url: "https://cdn/prod.jpg" },
    ])
    setup({
      adapt_flags: { logo: true, catalogo: true },
      reference_image_url: "https://cdn/base.jpg",
    })
    captureOptionsAndEmitMeta()

    await svc.generateBatch(BATCH, ORG)

    const opts = lastOptions()
    expect(opts.referenceImages).toEqual([
      { label: "Base reference:", url: "https://cdn/base.jpg" },
      { label: "Brand logo — match this exactly:", url: "https://cdn/logo.png" },
      { label: "Hero product — reproduce faithfully:", url: "https://cdn/prod.jpg" },
    ])
  })

  it("SVG-only (png null, svg set): anexa a URL do SVG", async () => {
    fx.brandOverride = {
      logo_main_png: null,
      logo_main_svg: "https://cdn/logo.svg",
    }
    setup({ adapt_flags: { logo: true }, reference_image_url: null })
    captureOptionsAndEmitMeta()

    await svc.generateBatch(BATCH, ORG)

    expect(lastOptions().referenceImages).toContainEqual({
      label: "Brand logo — match this exactly:",
      url: "https://cdn/logo.svg",
    })
  })

  it("fallback: logo SÓ em logo_alt_png (sem main): anexa a variante alt", async () => {
    // Antes do pickBrandLogo, logo fora do slot `main` era IGNORADA — este
    // caso saía sem ref de logo. Agora o fallback multi-variante anexa a alt.
    fx.brandOverride = {
      logo_main_png: null,
      logo_main_svg: null,
      logo_alt_png: "https://cdn/logo-alt.png",
    }
    setup({ adapt_flags: { logo: true }, reference_image_url: null })
    captureOptionsAndEmitMeta()

    await svc.generateBatch(BATCH, ORG)

    const opts = lastOptions()
    expect(opts.mode).toBe("product_ref")
    expect(opts.referenceImages).toContainEqual({
      label: "Brand logo — match this exactly:",
      url: "https://cdn/logo-alt.png",
    })
  })

  it("não-regressão: logo_main_png presente vence variantes (mesma url de sempre)", async () => {
    // Marca com main E alt: o main continua sendo escolhido (1º da cadeia),
    // garantindo comportamento idêntico ao anterior pro caso comum.
    fx.brandOverride = {
      logo_main_png: "https://cdn/logo-main.png",
      logo_main_svg: null,
      logo_alt_png: "https://cdn/logo-alt.png",
    }
    setup({ adapt_flags: { logo: true }, reference_image_url: null })
    captureOptionsAndEmitMeta()

    await svc.generateBatch(BATCH, ORG)

    expect(lastOptions().referenceImages).toContainEqual({
      label: "Brand logo — match this exactly:",
      url: "https://cdn/logo-main.png",
    })
  })

  it("logo ON mas brand sem logo: nenhuma ref de logo (mode text2img)", async () => {
    // brandOverride null => default png/svg null.
    setup({ adapt_flags: { logo: true }, reference_image_url: null })
    captureOptionsAndEmitMeta()

    await svc.generateBatch(BATCH, ORG)

    const opts = lastOptions()
    expect(opts.mode).toBe("text2img")
    expect(opts.referenceImages).toBeUndefined()
  })

  it("catalogo ON mas produto sem image_url: não anexa produto", async () => {
    loadTopProductsMock.mockResolvedValue([
      { name: "X", price: 1, image_url: "" },
    ])
    setup({ adapt_flags: { catalogo: true }, reference_image_url: null })
    captureOptionsAndEmitMeta()

    await svc.generateBatch(BATCH, ORG)

    expect(lastOptions().mode).toBe("text2img")
    expect(lastOptions().referenceImages).toBeUndefined()
  })

  it("inputVars.refs_sent espelha as refs; mode incluso no running-phase log", async () => {
    fx.brandOverride = { logo_main_png: "https://cdn/logo.png" }
    setup({
      adapt_flags: { logo: true },
      reference_image_url: "https://cdn/base.jpg",
    })
    captureOptionsAndEmitMeta()

    await svc.generateBatch(BATCH, ORG)

    const logArg = logGenerationRunMock.mock.calls.at(-1)![0] as {
      inputVars: { mode: string; refs_sent: Array<{ label?: string; url: string }> }
    }
    expect(logArg.inputVars.mode).toBe("product_ref")
    expect(logArg.inputVars.refs_sent).toEqual([
      { label: "Base reference:", url: "https://cdn/base.jpg" },
      { label: "Brand logo — match this exactly:", url: "https://cdn/logo.png" },
    ])
  })

  it("onMeta → tokensInput/tokensOutput no update de sucesso", async () => {
    setup({ adapt_flags: {}, reference_image_url: "https://cdn/base.jpg" })
    captureOptionsAndEmitMeta({ tokensInput: 999, tokensOutput: 5, refsSent: [] })

    await svc.generateBatch(BATCH, ORG)

    const successUpd = updateGenerationRunMock.mock.calls
      .map((c) => c[1] as Record<string, unknown>)
      .find((u) => u.status === "success")!
    expect(successUpd.tokensInput).toBe(999)
    expect(successUpd.tokensOutput).toBe(5)
  })

  it("regenerateResult também anexa as refs e propaga tokens", async () => {
    fx.brandOverride = { logo_main_png: "https://cdn/logo.png" }
    seedSuggestion()
    seedConfig()
    seedBatch({ adapt_flags: { logo: true }, reference_image_url: null })
    fx.results.set(resultKey(BATCH, STORE_A), {
      id: "r1",
      batch_id: BATCH,
      store_id: STORE_A,
      status: "ready",
      image_url: "old.png",
      adjustment_notes: null,
      error_message: null,
      generated_via: null,
      generated_at: null,
    })
    captureOptionsAndEmitMeta({ tokensInput: 42, tokensOutput: 1, refsSent: [] })

    await svc.regenerateResult(BATCH, ORG, STORE_A, null)

    expect(lastOptions().referenceImages).toContainEqual({
      label: "Brand logo — match this exactly:",
      url: "https://cdn/logo.png",
    })
    const upd = updateGenerationRunMock.mock.calls.at(-1)![1] as Record<string, unknown>
    expect(upd.tokensInput).toBe(42)
  })
})

describe("getBatchDownloadItems", () => {
  function seedResult(
    storeId: string,
    status: string,
    imageUrl: string | null,
  ): void {
    fx.results.set(resultKey(BATCH, storeId), {
      id: `res-${storeId}`,
      batch_id: BATCH,
      store_id: storeId,
      status,
      image_url: imageUrl,
      adjustment_notes: null,
      error_message: null,
      generated_via: "campaign_image:m",
      generated_at: status === "ready" ? "2026-06-30T01:00:00Z" : null,
    })
  }

  it("só retorna imagens prontas (ready/adjustment) com image_url + nome do lote", async () => {
    seedBatch() // name "Hero", format "hero"
    seedResult(STORE_A, "ready", "https://cdn/a.png")
    seedResult(STORE_B, "adjustment", "https://cdn/b.png")
    seedResult(STORE_C, "failed", null)

    const out = await svc.getBatchDownloadItems(BATCH, ORG)
    expect(out.batchName).toBe("Hero")
    expect(out.format).toBe("hero")
    expect(out.items).toHaveLength(2)
    expect(out.items).toEqual(
      expect.arrayContaining([
        { storeName: "Loja 1111", imageUrl: "https://cdn/a.png" },
        { storeName: "Loja 2222", imageUrl: "https://cdn/b.png" },
      ]),
    )
  })

  it("ignora ready sem image_url e pendentes (generating/queued)", async () => {
    seedBatch()
    seedResult(STORE_A, "ready", null) // pronto mas sem imagem
    seedResult(STORE_B, "generating", null)
    const out = await svc.getBatchDownloadItems(BATCH, ORG)
    expect(out.items).toEqual([])
  })

  it("lote de outra org -> NotFoundError", async () => {
    seedBatch()
    await expect(svc.getBatchDownloadItems(BATCH, OTHER_ORG)).rejects.toThrow()
  })
})
