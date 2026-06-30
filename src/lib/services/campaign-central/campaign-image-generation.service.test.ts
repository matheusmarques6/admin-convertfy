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

// Puros mas puxam deps de derivação — mockados pra focar na lógica do service.
vi.mock("@/lib/agents/image/template-renderer", () => ({
  renderImageTemplate: (tpl: string, vars: Record<string, string>) =>
    `${tpl}::${vars.INSTRUCAO_ADICIONAL ?? ""}`,
}))
const buildImagePromptVarsMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/agents/image/prompt-vars-builder", () => ({
  buildImagePromptVars: buildImagePromptVarsMock,
}))
vi.mock("@/lib/agents/top-products", () => ({
  loadTopProducts: vi.fn(async () => []),
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
} = {
  suggestion: null,
  config: null,
  batches: new Map(),
  results: new Map(),
  insertedBatches: [],
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
      return { store_id: eqVal("store_id"), colors_primary: [{ hex: "#ABC123" }], version: 1 }
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

function seedConfig(): void {
  fx.config = {
    model: "openai/gpt-5.4-image-2",
    system_prompt: "SYS",
    user_template: "TPL",
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
  generateEmailImageMock.mockReset()
  buildImagePromptVarsMock.mockReset()
  buildImagePromptVarsMock.mockReturnValue({ INSTRUCAO_ADICIONAL: "" })
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

  it("usa heading da copy de produção; fallback p/ subject; vazio sem copy", async () => {
    seedSuggestion({
      targets: [{ store_id: STORE_A }, { store_id: STORE_B }, { store_id: STORE_C }],
    })
    seedConfig()
    seedBatch()
    generateEmailImageMock.mockResolvedValue("img.png")
    const seen: Record<string, string> = {}
    buildImagePromptVarsMock.mockImplementation((input: { instrucaoAdicional?: string }) => {
      // store-id não chega direto aqui; capturamos via instrucaoAdicional
      return { INSTRUCAO_ADICIONAL: input.instrucaoAdicional ?? "" }
    })
    // Captura por ordem de chamada não é confiável (pool); validamos via os
    // textos gerados conterem cada headline esperada.
    void seen

    await svc.generateBatch(BATCH, ORG)
    const instrs = buildImagePromptVarsMock.mock.calls.map(
      (c) => (c[0] as { instrucaoAdicional?: string }).instrucaoAdicional ?? "",
    )
    const joined = instrs.join("\n---\n")
    expect(joined).toContain('Headline da campanha desta loja: "Headline da Loja A"')
    expect(joined).toContain('Headline da campanha desta loja: "Sub B fallback"')
    // STORE_C não tem copy de produção -> sem linha de headline pra ele.
    // (não dá pra isolar por loja aqui, mas A e B cobrem heading+subject)
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
