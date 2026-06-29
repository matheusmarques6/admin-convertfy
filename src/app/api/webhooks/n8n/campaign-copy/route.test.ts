/**
 * Tests for POST /api/webhooks/n8n/campaign-copy
 *
 * Foco: o callback do n8n manda os blocks SEM `id` (a doc instrui omitir —
 * docs/n8n/campaign-copy-flow.md — e o handler regenera o id no persist).
 * Regressão coberta: o schema de validação exigia `id` obrigatório, então
 * o payload do n8n era rejeitado com HTTP 400 e a copy nunca era gravada.
 *
 * Cobre:
 *  - success com blocks SEM id  -> 200 + persiste em copy_results, ids regenerados
 *  - success com blocks COM id  -> 200 + persiste
 *  - subject vazio              -> 400 (validação real continua valendo)
 *  - job inexistente            -> 404
 *  - sem webhook secret         -> 401
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const MOCK_JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const MOCK_SUGGESTION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const MOCK_STORE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const MOCK_ORG_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"

interface MockJob {
  id: string
  suggestion_id: string
  org_id: string
  mode: "test" | "production"
  stores_count: number
  completed_count: number
  failed_count: number
  status: string
}

let mockJob: MockJob | null = null
let mockSuggestion: { copy_results: Record<string, unknown> } | null = null

const updateCalls: Array<{ table: string; data: Record<string, unknown> }> = []
const insertCalls: Array<{ table: string; data: Record<string, unknown> }> = []

function resetState() {
  mockJob = {
    id: MOCK_JOB_ID,
    suggestion_id: MOCK_SUGGESTION_ID,
    org_id: MOCK_ORG_ID,
    mode: "production",
    stores_count: 1,
    completed_count: 0,
    failed_count: 0,
    status: "running",
  }
  mockSuggestion = { copy_results: {} }
  updateCalls.length = 0
  insertCalls.length = 0
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildQuery(table: string): any {
  const self: any = {}
  ;["select", "eq", "in", "order", "limit", "not", "neq"].forEach((m) => {
    self[m] = () => self
  })
  self.maybeSingle = () => {
    if (table === "campaign_copy_jobs") return Promise.resolve({ data: mockJob, error: null })
    if (table === "campaign_suggestions")
      return Promise.resolve({ data: mockSuggestion, error: null })
    return Promise.resolve({ data: null, error: null })
  }
  self.single = self.maybeSingle
  self.then = (resolve: (v: { data: unknown; error: null }) => void) => {
    resolve({ data: [], error: null })
  }
  self.update = (data: Record<string, unknown>) => {
    updateCalls.push({ table, data })
    const chain: any = {
      eq: () => chain,
      then: (resolve: (v: { data: null; error: null }) => void) =>
        resolve({ data: null, error: null }),
    }
    return chain
  }
  self.insert = (data: Record<string, unknown>) => {
    insertCalls.push({ table, data })
    return {
      select: () => ({
        single: () => Promise.resolve({ data: { id: "run-id" }, error: null }),
      }),
      then: (resolve: (v: { data: null; error: null }) => void) =>
        resolve({ data: null, error: null }),
    }
  }
  return self
}
/* eslint-enable @typescript-eslint/no-explicit-any */

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => buildQuery(table),
  })),
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))

vi.mock("@/lib/cors", () => ({
  corsHeaders: () => ({}),
  handleCorsPreFlight: vi.fn(),
}))

vi.stubEnv("N8N_WEBHOOK_SECRET", "test-secret")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: any) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  resetState()
  const mod = await import("./route")
  POST = mod.POST
})

function makeRequest(body: Record<string, unknown>, withSecret = true): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (withSecret) headers["x-webhook-secret"] = "test-secret"
  return new Request("http://localhost/api/webhooks/n8n/campaign-copy", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    job_id: MOCK_JOB_ID,
    suggestion_id: MOCK_SUGGESTION_ID,
    store_id: MOCK_STORE_ID,
    mode: "production",
    status: "success",
    copy: {
      subject: "Oferta especial",
      preheader: "Não perca",
      strategy: "urgência",
      // blocks SEM id — exatamente como o n8n manda
      blocks: [
        { type: "heading", headline: "Olá", sub: "tudo bem?" },
        { type: "text", value: "corpo do email" },
      ],
    },
    meta: { model: "n8n", tokens_input: 100, tokens_output: 200 },
    ...overrides,
  }
}

describe("POST /api/webhooks/n8n/campaign-copy — blocks sem id (regressão)", () => {
  it("aceita callback do n8n com blocks SEM id, persiste e regenera o id", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)

    const sugUpdate = updateCalls.find((c) => c.table === "campaign_suggestions")
    expect(sugUpdate).toBeDefined()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const copyResults = sugUpdate!.data.copy_results as any
    const entry = copyResults.production[MOCK_STORE_ID]
    expect(entry.status).toBe("success")
    expect(entry.generated_via).toBe("n8n")
    expect(entry.subject).toBe("Oferta especial")
    // Blocos tipados são PRESERVADOS (heading + text), não colapsados em texto.
    expect(entry.blocks).toHaveLength(2)
    expect(entry.blocks[0].type).toBe("heading")
    expect(entry.blocks[0].headline).toBe("Olá")
    expect(entry.blocks[1].type).toBe("text")
    expect(entry.blocks[1].value).toBe("corpo do email")
    // id regenerado no servidor (route.ts: id: b.id ?? newBlockId())
    for (const b of entry.blocks) {
      expect(typeof b.id).toBe("string")
      expect(b.id.length).toBeGreaterThan(0)
    }
  })

  it("também aceita blocks COM id", async () => {
    const body = validBody({
      copy: {
        subject: "Oferta",
        preheader: "preview",
        blocks: [{ id: "existing-id", type: "text", value: "x" }],
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(body) as any)
    expect(res.status).toBe(200)
    const sugUpdate = updateCalls.find((c) => c.table === "campaign_suggestions")
    expect(sugUpdate).toBeDefined()
  })
})

describe("POST /api/webhooks/n8n/campaign-copy — normalização do output do n8n", () => {
  it("type fora do enum (paragraph/cta) não derruba o payload; conteúdo preservado", async () => {
    const body = validBody({
      copy: {
        subject: "Promo",
        preheader: "preview",
        blocks: [
          { type: "paragraph", value: "corpo" },
          { type: "cta", value: "Comprar agora" },
        ],
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(body) as any)
    expect(res.status).toBe(200)

    const sugUpdate = updateCalls.find((c) => c.table === "campaign_suggestions")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = (sugUpdate!.data.copy_results as any).production[MOCK_STORE_ID]
    // Types fora do enum são normalizados (paragraph→text, cta→button) e PRESERVADOS.
    expect(entry.blocks).toHaveLength(2)
    expect(entry.blocks[0].type).toBe("text")
    expect(entry.blocks[0].value).toBe("corpo")
    expect(entry.blocks[1].type).toBe("button")
    expect(entry.blocks[1].value).toBe("Comprar agora")
    expect(entry.generated_via).toBe("n8n")
  })

  it("fatia a copy por ## SEÇÃO em blocos rotulados (section) com ids regenerados", async () => {
    const body = validBody({
      copy: {
        subject: "Promo",
        preheader: "p",
        blocks: [{ type: "text", value: "## HERO\nBem-vindo\n\n## FOOTER\nAté logo" }],
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(body) as any)
    expect(res.status).toBe(200)
    const sugUpdate = updateCalls.find((c) => c.table === "campaign_suggestions")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = (sugUpdate!.data.copy_results as any).production[MOCK_STORE_ID]
    expect(entry.blocks).toHaveLength(2)
    expect(entry.blocks[0].section).toBe("HERO")
    expect(entry.blocks[0].value).toBe("Bem-vindo")
    expect(entry.blocks[1].section).toBe("FOOTER")
    expect(entry.blocks[1].value).toBe("Até logo")
    for (const b of entry.blocks) expect(typeof b.id).toBe("string")
  })

  it("coage status 'completed' → success e persiste", async () => {
    const body = validBody({ status: "completed" })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(body) as any)
    expect(res.status).toBe(200)
    const sugUpdate = updateCalls.find((c) => c.table === "campaign_suggestions")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = (sugUpdate!.data.copy_results as any).production[MOCK_STORE_ID]
    expect(entry.status).toBe("success")
  })

  it("products com columns string e price number não derruba o payload", async () => {
    const body = validBody({
      copy: {
        subject: "Grade",
        preheader: "p",
        blocks: [
          {
            type: "products",
            columns: "2",
            items: [{ name: "P1", price: 99 }],
          },
        ],
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(body) as any)
    expect(res.status).toBe(200)
    const sugUpdate = updateCalls.find((c) => c.table === "campaign_suggestions")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = (sugUpdate!.data.copy_results as any).production[MOCK_STORE_ID]
    // O bloco de produtos é PRESERVADO: columns coergido (2) e items normalizados.
    expect(entry.blocks).toHaveLength(1)
    expect(entry.blocks[0].type).toBe("products")
    expect(entry.blocks[0].columns).toBe(2)
    expect(entry.blocks[0].items[0].name).toBe("P1")
    expect(String(entry.blocks[0].items[0].price)).toBe("99")
  })
})

describe("POST /api/webhooks/n8n/campaign-copy — override do fallback (Parte D)", () => {
  it("job fallback_inline + success: sobrescreve o fallback e NÃO toca no job", async () => {
    mockJob!.status = "fallback_inline"
    mockSuggestion = {
      copy_results: {
        production: {
          [MOCK_STORE_ID]: {
            subject: "fallback genérico",
            preview: "x",
            preheader: "x",
            blocks: [{ id: "b1", type: "text", value: "fallback" }],
            quality: null,
            generated_at: "2026-01-01T00:00:00Z",
            generated_via: "inline_fallback",
            status: "success",
          },
        },
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)

    const sugUpdate = updateCalls.find((c) => c.table === "campaign_suggestions")
    expect(sugUpdate).toBeDefined()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = (sugUpdate!.data.copy_results as any).production[MOCK_STORE_ID]
    expect(e.generated_via).toBe("n8n")
    expect(e.subject).toBe("Oferta especial")
    // job já estava settled -> não é atualizado (counters/status do watchdog ficam)
    const jobUpdate = updateCalls.find((c) => c.table === "campaign_copy_jobs")
    expect(jobUpdate).toBeUndefined()
  })

  it("job done + error tardio: descarta (não rebaixa o fallback nem grava)", async () => {
    mockJob!.status = "done"
    const body = validBody({ status: "error", error_message: "tarde demais", copy: undefined })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(body) as any)
    expect(res.status).toBe(200)
    expect(updateCalls.find((c) => c.table === "campaign_suggestions")).toBeUndefined()
  })

  it("job fallback_inline + success mas copy aprovada (good): preserva a aprovada", async () => {
    mockJob!.status = "fallback_inline"
    mockSuggestion = {
      copy_results: {
        production: {
          [MOCK_STORE_ID]: {
            subject: "aprovada pelo COO",
            preview: "x",
            preheader: "x",
            blocks: [{ id: "b1", type: "text", value: "boa" }],
            quality: "good",
            generated_at: "2026-01-01T00:00:00Z",
            generated_via: "n8n",
            status: "success",
          },
        },
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)
    expect(updateCalls.find((c) => c.table === "campaign_suggestions")).toBeUndefined()
  })
})

describe("POST /api/webhooks/n8n/campaign-copy — validação e erros", () => {
  it("deriva o subject da copy quando vem vazio (rede de segurança; não rejeita)", async () => {
    const body = validBody({
      copy: { subject: "", preheader: "p", blocks: [{ type: "text", value: "Texto da copy" }] },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(body) as any)
    expect(res.status).toBe(200)
    const sugUpdate = updateCalls.find((c) => c.table === "campaign_suggestions")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = (sugUpdate!.data.copy_results as any).production[MOCK_STORE_ID]
    expect(entry.subject).toBe("Texto da copy")
  })

  it("retorna 400 quando copy não tem blocks", async () => {
    const body = validBody({ copy: { subject: "s", preheader: "p", blocks: [] } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(body) as any)
    expect(res.status).toBe(400)
  })

  it("retorna 404 quando o job não existe", async () => {
    mockJob = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(404)
  })

  it("retorna 401 sem webhook secret", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody(), false) as any)
    expect(res.status).toBe(401)
  })
})
