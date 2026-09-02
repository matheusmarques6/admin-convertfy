/**
 * Tests for POST /api/webhooks/n8n/email-copy (Story AE-3 + AE-19)
 *
 * AE-19 split: callback NAO dispara mais fase 2. Apenas persiste copy
 * e marca status='copy_ready'. A fase 2 fica em hold ate o trigger
 * fn_on_brand_identity_confirmed enfileirar um sinal `render` que o
 * watchdog consome.
 *
 * Cobre:
 *  - webhook normal -> 200 + status copy_ready (SEM dispatch de fase 2)
 *  - callback duplicado (email ja em copy_ready) -> 200 idempotente
 *  - email_id inexistente -> 404
 *  - email_id que nao pertence a store_id -> 404
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const MOCK_STORE_ID = "11111111-1111-4111-8111-111111111111"
const MOCK_EMAIL_ID = "22222222-2222-4222-8222-222222222222"
const MOCK_BLOCK_ID = "33333333-3333-4333-8333-333333333333"
const MOCK_FLOW_ID = "44444444-4444-4444-8444-444444444444"

interface MockEmail {
  id: string
  flow_id: string
  status: string | null
  number?: number
  generation_batch_id?: string | null
  flow: { store_id: string; flow_type?: string } | null
}

let mockEmail: MockEmail | null = {
  id: MOCK_EMAIL_ID,
  flow_id: MOCK_FLOW_ID,
  status: "copy_generating",
  number: 1,
  generation_batch_id: null,
  flow: { store_id: MOCK_STORE_ID, flow_type: "welcome" },
}

const updateCalls: Array<{ table: string; data: Record<string, unknown> }> = []
/** Eventos de `log.error` — o guard de divergência é assertado por aqui. */
const errorLogs: string[] = []
const insertCalls: Array<{ table: string; data: Record<string, unknown> }> = []
/** Linhas de email_blocks vistas pelo callback (contrato de copy da linha). */
let mockBlocks: Array<Record<string, unknown>> = []
/** Linha de client_stores — o `language` é o que o encurtador cobra. */
let mockStore: Record<string, unknown> | null = null
/** Linha de email_outline_templates — o cupom que resolve o placeholder. */
let mockOutline: Record<string, unknown> | null = null

function resetState() {
  mockEmail = {
    id: MOCK_EMAIL_ID,
    flow_id: MOCK_FLOW_ID,
    status: "copy_generating",
    number: 1,
    generation_batch_id: null,
    flow: { store_id: MOCK_STORE_ID, flow_type: "welcome" },
  }
  updateCalls.length = 0
  errorLogs.length = 0
  insertCalls.length = 0
  mockBlocks = []
  mockStore = null
  mockOutline = null
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildQuery(table: string): any {
  const self: any = {}
  ;["select", "eq", "in", "order", "limit", "not", "neq"].forEach((m) => {
    self[m] = () => self
  })
  self.maybeSingle = () => {
    if (table === "email_flow_emails") {
      return Promise.resolve({ data: mockEmail, error: null })
    }
    if (table === "client_stores") {
      return Promise.resolve({ data: mockStore, error: null })
    }
    if (table === "email_outline_templates") {
      return Promise.resolve({ data: mockOutline, error: null })
    }
    return Promise.resolve({ data: null, error: null })
  }
  self.single = self.maybeSingle
  self.then = (resolve: (v: { data: unknown; error: null }) => void) => {
    // CÓPIA, como um banco de verdade: quem leu antes não enxerga a escrita
    // de depois. Devolver a referência fazia o snapshot em memória "se
    // atualizar" sozinho e escondia exatamente o bug do encurtador.
    const linhas =
      table === "email_blocks"
        ? mockBlocks.map((b) => JSON.parse(JSON.stringify(b)))
        : []
    resolve({ data: linhas, error: null })
  }
  self.update = (data: Record<string, unknown>) => {
    updateCalls.push({ table, data })
    // O UPDATE de email_blocks APLICA em mockBlocks. Sem isto o mock não
    // consegue expressar leitura-após-escrita, e foi essa cegueira que
    // deixou o encurtador passar verde no teste e morto na produção
    // (01/09): ele lia a linha antes de a copy ser gravada, e o mock
    // devolvia a mesma lista dos dois lados.
    let alvo: Record<string, unknown> | undefined
    const updateChain: any = {
      eq: (col: string, val: unknown) => {
        if (table === "email_blocks" && col === "id") {
          alvo = mockBlocks.find((b) => b.id === val)
          if (alvo) Object.assign(alvo, data)
        }
        return updateChain
      },
      in: () => updateChain,
      not: () => updateChain,
      select: () => ({
        then: (resolve: (v: { data: unknown; error: null }) => void) =>
          resolve({ data: alvo ? [{ id: alvo.id }] : [], error: null }),
      }),
      then: (resolve: (v: { data: null; error: null }) => void) =>
        resolve({ data: null, error: null }),
    }
    return updateChain
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
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: (evt: string) => {
        errorLogs.push(evt)
      },
      debug: vi.fn(),
    }),
  },
}))

vi.mock("@/lib/cors", () => ({
  corsHeaders: () => ({}),
  handleCorsPreFlight: vi.fn(),
}))

// AE-19: o callback nao importa mais `runPhase2InBackground` nem `after`
// de next/server. Nao precisa mockar nenhum dos dois — se a route voltar
// a chamar runPhase2InBackground, o teste vai falhar no import resolver
// porque o mock foi removido.

// Email "somente texto": flag consultada via blueprint-loader e, quando o
// email pertence a um batch, o callback fecha a contagem terminal.
const isTextOnlyEmailMock = vi.fn()
vi.mock("@/lib/agents/architect/blueprint-loader", () => ({
  isTextOnlyEmail: (...a: unknown[]) => isTextOnlyEmailMock(...a),
}))
const checkBatchTerminalMock = vi.fn()
vi.mock("@/lib/agents/phase2-runner.service", () => ({
  checkBatchTerminal: (...a: unknown[]) => checkBatchTerminalMock(...a),
}))

// Encurtador de copy (migration 20261089): o chain tem teste próprio; aqui
// interessa só se a rota o chama, regrava o bloco e guarda o antes/depois.
const runCopyFitMock = vi.fn()
const loadCopyFitModeMock = vi.fn()
vi.mock("@/lib/agents/chains/copy-fit.chain", () => ({
  runCopyFit: (...a: unknown[]) => runCopyFitMock(...a),
  loadCopyFitMode: (...a: unknown[]) => loadCopyFitModeMock(...a),
}))

vi.stubEnv("N8N_WEBHOOK_SECRET", "test-secret")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: any) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  resetState()
  isTextOnlyEmailMock.mockReset().mockResolvedValue(false)
  checkBatchTerminalMock.mockReset().mockResolvedValue(undefined)
  loadCopyFitModeMock.mockReset().mockResolvedValue("on")
  runCopyFitMock
    .mockReset()
    .mockResolvedValue({ aceitas: [], de_para: [], rodou: false })
  const mod = await import("./route")
  POST = mod.POST
})

function makeRequest(body: Record<string, unknown> = {}): Request {
  return new Request("http://localhost/api/webhooks/n8n/email-copy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": "test-secret",
    },
    body: JSON.stringify(body),
  })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    store_id: MOCK_STORE_ID,
    email_id: MOCK_EMAIL_ID,
    subject: "Bem-vindo!",
    preheader: "Sua jornada comeca aqui",
    blocks: [
      {
        block_id: MOCK_BLOCK_ID,
        content: { headline: "Olá", body: "Texto" },
      },
    ],
    meta: { model: "gpt-4o", tokens_input: 100, tokens_output: 500 },
    ...overrides,
  }
}

describe("POST /api/webhooks/n8n/email-copy — happy path", () => {
  it("returns 200, marks copy_ready, persists copy_ready_at (AE-19: no phase 2 dispatch)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.email_id).toBe(MOCK_EMAIL_ID)

    const statusUpdate = updateCalls.find(
      (c) => c.table === "email_flow_emails" && c.data.status === "copy_ready",
    )
    expect(statusUpdate).toBeDefined()
    expect(statusUpdate?.data.copy_ready_at).toBeDefined()

    // Telemetria de copy registrada
    const copyRun = insertCalls.find(
      (c) => c.table === "email_generation_runs" && c.data.agent === "copy",
    )
    expect(copyRun).toBeDefined()
  })

  it("zera artefatos de fase 2 anterior no UPDATE de email_flow_emails", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)

    const statusUpdate = updateCalls.find(
      (c) => c.table === "email_flow_emails" && c.data.status === "copy_ready",
    )
    expect(statusUpdate).toBeDefined()
    // Chaves de limpeza adicionadas pra eliminar residuo pre-GATE 2
    expect(statusUpdate?.data.html).toBeNull()
    expect(statusUpdate?.data.qa_issues).toEqual([])
    expect(statusUpdate?.data.failure_reason).toBeNull()
    expect(statusUpdate?.data.rendering_started_at).toBeNull()
    expect(statusUpdate?.data.qa_started_at).toBeNull()
  })
})

describe("POST /api/webhooks/n8n/email-copy — email somente texto (text_only)", () => {
  it("marca status='ready' direto (com ready_at e html null), sem copy_ready", async () => {
    isTextOnlyEmailMock.mockResolvedValue(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)

    const readyUpdate = updateCalls.find(
      (c) => c.table === "email_flow_emails" && c.data.status === "ready",
    )
    expect(readyUpdate).toBeDefined()
    expect(readyUpdate?.data.ready_at).toBeDefined()
    expect(readyUpdate?.data.copy_ready_at).toBeDefined()
    expect(readyUpdate?.data.html).toBeNull()
    expect(readyUpdate?.data.qa_issues).toEqual([])

    const copyReadyUpdate = updateCalls.find(
      (c) => c.table === "email_flow_emails" && c.data.status === "copy_ready",
    )
    expect(copyReadyUpdate).toBeUndefined()
    // Flag consultada com flow_type + number do email
    expect(isTextOnlyEmailMock).toHaveBeenCalledWith(
      expect.anything(),
      "welcome",
      1,
    )
  })

  it("fecha o batch (checkBatchTerminal) quando o email text_only pertence a um batch", async () => {
    isTextOnlyEmailMock.mockResolvedValue(true)
    mockEmail = {
      id: MOCK_EMAIL_ID,
      flow_id: MOCK_FLOW_ID,
      status: "copy_generating",
      number: 1,
      generation_batch_id: "batch-1",
      flow: { store_id: MOCK_STORE_ID, flow_type: "welcome" },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)
    expect(checkBatchTerminalMock).toHaveBeenCalledWith(MOCK_STORE_ID, "batch-1")
  })

  it("sem batch, não chama checkBatchTerminal (fluxo natural da fila)", async () => {
    isTextOnlyEmailMock.mockResolvedValue(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)
    expect(checkBatchTerminalMock).not.toHaveBeenCalled()
  })
})

describe("POST /api/webhooks/n8n/email-copy — idempotency", () => {
  it("returns 200 idempotent when email is already in copy_ready", async () => {
    mockEmail = {
      id: MOCK_EMAIL_ID,
      flow_id: MOCK_FLOW_ID,
      status: "copy_ready",
      flow: { store_id: MOCK_STORE_ID },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.idempotent).toBe(true)
    expect(json.current_status).toBe("copy_ready")

    // Nenhum update de status (idempotente)
    const statusUpdate = updateCalls.find(
      (c) => c.table === "email_flow_emails" && c.data.status === "copy_ready",
    )
    expect(statusUpdate).toBeUndefined()
  })

  it("returns 200 idempotent when email is in rendering / qa_running / ready", async () => {
    for (const status of ["rendering", "qa_running", "ready"]) {
      resetState()
      mockEmail = {
        id: MOCK_EMAIL_ID,
        flow_id: MOCK_FLOW_ID,
        status,
        flow: { store_id: MOCK_STORE_ID },
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await POST(makeRequest(validBody()) as any)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.idempotent).toBe(true)
      expect(json.current_status).toBe(status)
    }
  })

  it("NÃO é idempotente quando email está em failed — aceita a copy nova", async () => {
    resetState()
    mockEmail = {
      id: MOCK_EMAIL_ID,
      flow_id: MOCK_FLOW_ID,
      status: "failed",
      flow: { store_id: MOCK_STORE_ID },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    // processa (não retorna idempotent) e avança o status
    expect(json.idempotent).toBeUndefined()
    const statusUpdate = updateCalls.find(
      (c) => c.table === "email_flow_emails" && c.data.status === "copy_ready",
    )
    expect(statusUpdate).toBeDefined()
  })
})

describe("POST /api/webhooks/n8n/email-copy — copy stale (dispatch_batch_id)", () => {
  const BATCH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  const BATCH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

  it("batch divergente do vigente: 200 no-op {stale:true}, nada é escrito", async () => {
    mockEmail!.generation_batch_id = BATCH_B
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody({ dispatch_batch_id: BATCH_A })) as any)
    expect(res.status).toBe(200)
    const json = await res.json()
    const data = json.data ?? json
    expect(data.stale).toBe(true)
    expect(data.current_batch_id).toBe(BATCH_B)
    expect(updateCalls).toHaveLength(0)
  })

  it("batch igual ao vigente: copy aceita normalmente", async () => {
    mockEmail!.generation_batch_id = BATCH_A
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody({ dispatch_batch_id: BATCH_A })) as any)
    expect(res.status).toBe(200)
    const statusUpdate = updateCalls.find(
      (c) => c.table === "email_flow_emails" && c.data.status === "copy_ready",
    )
    expect(statusUpdate).toBeDefined()
  })

  it("payload sem dispatch_batch_id (n8n legado): comportamento atual mantido", async () => {
    mockEmail!.generation_batch_id = BATCH_B
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(200)
    const statusUpdate = updateCalls.find(
      (c) => c.table === "email_flow_emails" && c.data.status === "copy_ready",
    )
    expect(statusUpdate).toBeDefined()
  })

  it("email sem batch vigente: copy aceita mesmo com dispatch_batch_id no payload", async () => {
    mockEmail!.generation_batch_id = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody({ dispatch_batch_id: BATCH_A })) as any)
    expect(res.status).toBe(200)
    const statusUpdate = updateCalls.find(
      (c) => c.table === "email_flow_emails" && c.data.status === "copy_ready",
    )
    expect(statusUpdate).toBeDefined()
  })
})

describe("POST /api/webhooks/n8n/email-copy — errors", () => {
  it("returns 404 when email_id is unknown", async () => {
    mockEmail = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(404)
  })

  it("returns 404 when store_id does not match email's flow.store_id", async () => {
    mockEmail = {
      id: MOCK_EMAIL_ID,
      flow_id: MOCK_FLOW_ID,
      status: "copy_generating",
      flow: { store_id: "55555555-5555-4555-8555-555555555555" },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(validBody()) as any)
    expect(res.status).toBe(404)
  })

  it("returns 401 when missing webhook secret", async () => {
    const req = new Request("http://localhost/api/webhooks/n8n/email-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody()),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any)
    expect(res.status).toBe(401)
  })
})

/* eslint-disable @typescript-eslint/no-explicit-any */
// ── Adesão ao contrato do schema (o número que diz se o n8n migrou) ──
describe("POST /api/webhooks/n8n/email-copy — contrato de copy", () => {
  const campo = (key: string) => ({
    key,
    label: key,
    type: "text_short",
    max_len: 40,
    min_len: null,
    required: false,
    example: "",
    guidance: "",
    tag: key.toUpperCase(),
    source: "schema",
  })

  function contratoDoRun() {
    const run = insertCalls.find(
      (c) => c.table === "email_generation_runs" && c.data.agent === "copy",
    )
    return (run?.data.parsed_output as Record<string, unknown>)
      ?.contrato as Record<string, unknown>
  }

  it("copy no vocabulário ERRADO: taxa 0 e cada chave vira unknown_key", async () => {
    // Caso real (Luxe Lift, 09/08): o schema pediu hero_headline/hero_subhead/
    // hero_cta_label/hero_cta_2_label e o n8n devolveu headline/body/cta/text.
    // O `text` era o segundo botão; sem par, a linha foi removida do HTML.
    mockBlocks = [
      {
        id: MOCK_BLOCK_ID,
        content: {},
        block_type: "hero",
        fields: [
          campo("hero_headline"),
          campo("hero_subhead"),
          campo("hero_cta_label"),
          campo("hero_cta_2_label"),
        ],
      },
    ]
    const res = await POST(
      makeRequest(
        validBody({
          blocks: [
            {
              block_id: MOCK_BLOCK_ID,
              content: {
                headline: "Still there?",
                body: "You left something behind…",
                cta: "COMPLETE MY ORDER",
                text: "SEE WHAT'S WAITING",
              },
            },
          ],
        }),
      ) as any,
    )
    expect(res.status).toBe(200)

    const c = contratoDoRun()
    expect(c.keys_recebidas).toBe(4)
    expect(c.keys_no_contrato).toBe(0)
    expect(c.taxa_pct).toBe(0)

    const desvios = (
      insertCalls.find(
        (x) => x.table === "email_generation_runs" && x.data.agent === "copy",
      )!.data.parsed_output as Record<string, unknown>
    ).desvios as Array<Record<string, unknown>>
    expect(
      desvios.filter((d) => d.kind === "unknown_key").map((d) => d.key).sort(),
    ).toEqual(["body", "cta", "headline", "text"])
  })

  it("copy embrulhada em `campos`: desembrulha, grava plano e taxa 100", async () => {
    // Caso real (Luxe Lift, 12/08): o flow espelhou a estrutura `schema.campos`
    // do payload de ida. A copy estava PERFEITA, com as chaves exatas do
    // contrato — só um nível fundo demais. O callback via uma chave só
    // (`campos`), registrava taxa 0 e o merge não ancorava nada.
    mockBlocks = [
      {
        id: MOCK_BLOCK_ID,
        content: {},
        block_type: "hero",
        fields: [campo("hero_headline"), campo("hero_cta_label")],
      },
    ]
    const res = await POST(
      makeRequest(
        validBody({
          blocks: [
            {
              block_id: MOCK_BLOCK_ID,
              content: {
                campos: [
                  { key: "hero_headline", valor: "We saved it for you" },
                  { key: "hero_cta_label", valor: "BACK TO MY CART" },
                ],
              },
            },
          ],
        }),
      ) as any,
    )
    expect(res.status).toBe(200)

    // Gravou no formato do contrato, não o embrulho.
    const upd = updateCalls.find((u) => u.table === "email_blocks")
    expect(upd!.data.content).toEqual({
      hero_headline: "We saved it for you",
      hero_cta_label: "BACK TO MY CART",
    })

    const c = contratoDoRun()
    expect(c.keys_recebidas).toBe(2)
    expect(c.keys_no_contrato).toBe(2)
    expect(c.taxa_pct).toBe(100)

    // Contador que diz que o n8n ainda não migrou.
    const run = insertCalls.find(
      (x) => x.table === "email_generation_runs" && x.data.agent === "copy",
    )!.data.parsed_output as Record<string, unknown>
    expect(run.blocos_desembrulhados).toEqual([
      { position: 0, wrapper: "campos", keys: 2 },
    ])
  })

  it("copy no contrato: taxa 100 e nenhum desvio de chave", async () => {
    mockBlocks = [
      {
        id: MOCK_BLOCK_ID,
        content: {},
        block_type: "hero",
        fields: [campo("hero_headline"), campo("hero_cta_2_label")],
      },
    ]
    const res = await POST(
      makeRequest(
        validBody({
          blocks: [
            {
              block_id: MOCK_BLOCK_ID,
              content: {
                hero_headline: "Still there?",
                hero_cta_2_label: "SEE WHAT'S WAITING",
              },
            },
          ],
        }),
      ) as any,
    )
    expect(res.status).toBe(200)

    const c = contratoDoRun()
    expect(c.taxa_pct).toBe(100)
    expect(c.por_bloco).toEqual([
      { position: 0, type: "hero", esperados: 2, recebidos: 2, no_contrato: 2 },
    ])
  })

  it("bloco sem contrato entra no relatório com esperados=0", async () => {
    mockBlocks = [
      { id: MOCK_BLOCK_ID, content: {}, block_type: "coupon", fields: [] },
    ]
    const res = await POST(
      makeRequest(
        validBody({
          blocks: [{ block_id: MOCK_BLOCK_ID, content: { text: "FRETE GRÁTIS" } }],
        }),
      ) as any,
    )
    expect(res.status).toBe(200)

    const c = contratoDoRun()
    expect(c.por_bloco).toEqual([
      { position: 0, type: "coupon", esperados: 0, recebidos: 1, no_contrato: 0 },
    ])
    expect(c.taxa_pct).toBe(0)
  })
})

// ── Encurtador de copy (migration 20261089) ─────────────────────────────
//
// Até 28/08 o estouro do limite era medido e ignorado: `log.warn` +
// `parsed_output.desvios` que ninguém lia, e a frase longa vazava da caixa
// no email. Estes testes cobrem a rota, não o chain (que tem os seus).
describe("POST /api/webhooks/n8n/email-copy — encurtador", () => {
  const LONGO = "x".repeat(190)
  const campoLongo = (key: string, max: number) => ({
    key,
    label: key,
    type: "text_long",
    max_len: max,
    min_len: null,
    required: false,
    example: "",
    guidance: "",
    source: "schema",
  })

  function runCopy() {
    return insertCalls.find(
      (c) => c.table === "email_generation_runs" && c.data.agent === "copy",
    )!.data.parsed_output as Record<string, unknown>
  }

  // O bloco como o banco REALMENTE está quando o callback chega: com o
  // contrato, sem a copy. A copy longa vem no payload do `envio()` e é
  // gravada pelo próprio callback. O fixture antigo já trazia o texto no
  // content — um estado que a produção nunca tem naquele ponto — e por
  // isso o teste ficava verde com o encurtador morto (01/09).
  function blocoQueEstoura() {
    mockBlocks = [
      {
        id: MOCK_BLOCK_ID,
        content: {},
        block_type: "body",
        fields: [campoLongo("section_body_1", 120)],
      },
    ]
  }

  const envio = () =>
    makeRequest(
      validBody({
        blocks: [{ block_id: MOCK_BLOCK_ID, content: { section_body_1: LONGO } }],
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any

  // O guard da divergência é REDE contra a regressão do 01/09 (encurtador
  // lendo a linha antes da escrita). No caminho normal ele tem de ficar
  // quieto: alarme que dispara à toa deixa de ser lido — foi assim que o
  // `retyped_positions` do Curador passou semanas sem ninguém olhar.
  it("no caminho normal o guard de divergência não dispara", async () => {
    blocoQueEstoura()
    runCopyFitMock.mockResolvedValue({ aceitas: [], de_para: [], rodou: true })

    const res = await POST(envio())
    expect(res.status).toBe(200)
    // O encurtador VIU o alvo — é o que o fix garante.
    expect(runCopyFitMock).toHaveBeenCalled()
    expect(errorLogs.some((l) => l.includes("alvos_divergentes"))).toBe(false)
  })

  it("campo acima do limite: chama o encurtador e regrava o bloco", async () => {
    blocoQueEstoura()
    runCopyFitMock.mockResolvedValue({
      aceitas: [
        {
          id: "0.section_body_1",
          position: 0,
          block_id: MOCK_BLOCK_ID,
          key: "section_body_1",
          texto: "y".repeat(100),
        },
      ],
      de_para: [],
      rodou: true,
    })

    const res = await POST(envio())
    expect(res.status).toBe(200)

    const alvos = (runCopyFitMock.mock.calls[0][0] as { alvos: unknown[] }).alvos
    expect(alvos).toHaveLength(1)

    // A regravação é um UPDATE a mais em email_blocks, com a copy que cabe.
    const regravacao = updateCalls
      .filter((c) => c.table === "email_blocks")
      .at(-1)
    expect(
      (regravacao?.data.content as Record<string, unknown>).section_body_1,
    ).toBe("y".repeat(100))
  })

  // O número que diz se o n8n está respeitando o contrato não pode sumir só
  // porque a correção deu certo.
  it("o run `copy` guarda o antes (desvios_pre_fit) e o depois", async () => {
    blocoQueEstoura()
    runCopyFitMock.mockResolvedValue({
      aceitas: [
        {
          id: "0.section_body_1",
          position: 0,
          block_id: MOCK_BLOCK_ID,
          key: "section_body_1",
          texto: "y".repeat(100),
        },
      ],
      de_para: [],
      rodou: true,
    })

    await POST(envio())
    const out = runCopy()
    expect(out.copy_fit).toMatchObject({ alvos: 1, corrigidos: 1, mantidos: 0 })
    expect(
      (out.desvios_pre_fit as Array<Record<string, unknown>>).map((d) => d.kind),
    ).toEqual(["max_len"])
    // Corrigido → sai da lista de desvios vigentes.
    expect(out.desvios).toBeUndefined()
  })

  it("reescrita recusada mantém o desvio à vista", async () => {
    blocoQueEstoura()
    runCopyFitMock.mockResolvedValue({ aceitas: [], de_para: [], rodou: true })

    await POST(envio())
    const out = runCopy()
    expect(out.copy_fit).toMatchObject({ corrigidos: 0, mantidos: 1 })
    expect(
      (out.desvios as Array<Record<string, unknown>>).map((d) => d.kind),
    ).toEqual(["max_len"])
  })

  // Entre 28/08 e 01/09 o resumo dizia `corrigidos: 0` em toda geração e não
  // havia onde ler o motivo: o run próprio do copy_fit não era gravado
  // (agente fora do CHECK). O desfecho passa a caber no run `copy`, que
  // sempre existe.
  it("o run `copy` diz POR QUE nada foi corrigido: erro e recusas", async () => {
    blocoQueEstoura()
    runCopyFitMock.mockResolvedValue({
      aceitas: [],
      de_para: [],
      rodou: false,
      erro: "ANTHROPIC_API_KEY nao configurada",
    })

    await POST(envio())
    const out = runCopy()
    expect(out.copy_fit).toMatchObject({
      corrigidos: 0,
      rodou: false,
      erro: "ANTHROPIC_API_KEY nao configurada",
    })
  })

  it("o run `copy` agrega a recusa campo a campo", async () => {
    blocoQueEstoura()
    runCopyFitMock.mockResolvedValue({
      aceitas: [],
      de_para: [
        {
          id: "0.section_body_1",
          position: 0,
          key: "section_body_1",
          antes: "x".repeat(200),
          antes_len: 200,
          depois: null,
          depois_len: null,
          max: 120,
          aceito: false,
          motivos: ["max_len"],
          tracos_antes: 0,
          tracos_depois: 0,
          motivo: "ainda_acima_do_limite",
        },
      ],
      rodou: true,
    })

    await POST(envio())
    const out = runCopy()
    expect(out.copy_fit).toMatchObject({
      rodou: true,
      recusas: { ainda_acima_do_limite: 1 },
    })
    // Sem erro, a chave nem aparece — resumo limpo quando não há o que dizer.
    expect((out.copy_fit as Record<string, unknown>).erro).toBeUndefined()
  })

  it("kill-switch em `off`: não chama o encurtador e o desvio segue visível", async () => {
    blocoQueEstoura()
    loadCopyFitModeMock.mockResolvedValue("off")

    await POST(envio())
    expect(runCopyFitMock).not.toHaveBeenCalled()
    const out = runCopy()
    expect(out.copy_fit).toBeUndefined()
    expect(
      (out.desvios as Array<Record<string, unknown>>).map((d) => d.kind),
    ).toEqual(["max_len"])
  })

  it("copy dentro do limite não aciona nada", async () => {
    mockBlocks = [
      {
        id: MOCK_BLOCK_ID,
        content: { section_body_1: "curto" },
        block_type: "body",
        fields: [campoLongo("section_body_1", 120)],
      },
    ]
    await POST(
      makeRequest(
        validBody({
          blocks: [{ block_id: MOCK_BLOCK_ID, content: { section_body_1: "curto" } }],
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any,
    )
    expect(loadCopyFitModeMock).not.toHaveBeenCalled()
    expect(runCopyFitMock).not.toHaveBeenCalled()
  })
})
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Idioma (01/09) ──────────────────────────────────────────────────────
//
// A ordem de idioma sai no payload do n8n em três lugares e a copy volta em
// português numa loja `en`. O flow ignora — a correção é nossa, no
// encurtador, e o desvio tem de virar número mesmo quando ele está off.
describe("POST /api/webhooks/n8n/email-copy — idioma", () => {
  const EM_PT = "Use code WELCOME10 na compra. Sem mínimo, sem expiração."
  const campo = {
    key: "offer_body",
    label: "Corpo da oferta",
    type: "text_long",
    max_len: 200,
    min_len: null,
    required: false,
    example: "",
    guidance: "",
    source: "schema",
  }

  function runCopy() {
    return insertCalls.find(
      (c) => c.table === "email_generation_runs" && c.data.agent === "copy",
    )!.data.parsed_output as Record<string, unknown>
  }

  const envio = () =>
    makeRequest(
      validBody({
        blocks: [{ block_id: MOCK_BLOCK_ID, content: { offer_body: EM_PT } }],
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any

  beforeEach(() => {
    mockBlocks = [
      { id: MOCK_BLOCK_ID, content: {}, block_type: "offer", fields: [campo] },
    ]
    runCopyFitMock.mockResolvedValue({ aceitas: [], de_para: [], rodou: true })
  })

  it("loja en com copy em português: o campo vira alvo de idioma", async () => {
    mockStore = { store_name: "Innova Bay", language: "en" }
    const res = await POST(envio())
    expect(res.status).toBe(200)

    const alvos = (
      runCopyFitMock.mock.calls[0][0] as {
        alvos: Array<{ key: string; motivos: string[]; idioma_esperado?: string }>
      }
    ).alvos
    expect(alvos).toHaveLength(1)
    expect(alvos[0].motivos).toEqual(["idioma"])
    expect(alvos[0].idioma_esperado).toBe("en")

    // O run `copy` guarda a evidência: a ordem foi mandada e não foi usada.
    expect(runCopy().idioma).toMatchObject({ da_loja: "en", campos_errados: 1 })
  })

  it("loja pt-BR com a mesma copy: nenhum alvo, nenhum bloco de idioma", async () => {
    mockStore = { store_name: "Innova Bay", language: "pt-BR" }
    const res = await POST(envio())
    expect(res.status).toBe(200)
    expect(runCopyFitMock).not.toHaveBeenCalled()
    expect(runCopy().idioma).toBeUndefined()
  })

  // O encurtador desligado não pode apagar a medida — é justamente o
  // cenário em que se quer saber quanto o flow está ignorando.
  it("com o kill-switch off o desvio continua no run", async () => {
    mockStore = { store_name: "Innova Bay", language: "en" }
    loadCopyFitModeMock.mockResolvedValue("off")
    await POST(envio())
    expect(runCopyFitMock).not.toHaveBeenCalled()
    expect(runCopy().idioma).toMatchObject({ campos_errados: 1 })
  })
})

// ── Cupom (02/09) ───────────────────────────────────────────────────────
//
// O payload levou `coupon_code: "BEMVINDO10"` e a copy voltou com
// "[DISCOUNT_CODE]" na hero e na oferta. O callback resolvia {{BRAND_NAME}}
// e não conhecia token de cupom; o colchete foi para o cliente.
describe("POST /api/webhooks/n8n/email-copy — cupom", () => {
  const campo = {
    key: "coupon_line",
    label: "Linha do cupom",
    type: "text_short",
    max_len: 60,
    min_len: null,
    required: false,
    example: "",
    guidance: "",
    source: "schema",
  }
  function runCopy() {
    return insertCalls.find(
      (c) => c.table === "email_generation_runs" && c.data.agent === "copy",
    )!.data.parsed_output as Record<string, unknown>
  }
  const envio = () =>
    makeRequest(
      validBody({
        blocks: [
          {
            block_id: MOCK_BLOCK_ID,
            content: { coupon_line: "Use code [DISCOUNT_CODE] at checkout." },
          },
        ],
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any

  beforeEach(() => {
    mockBlocks = [{ id: MOCK_BLOCK_ID, content: {}, block_type: "hero", fields: [campo] }]
    runCopyFitMock.mockResolvedValue({ aceitas: [], de_para: [], rodou: true })
  })

  it("o placeholder vira o código do outline antes de gravar", async () => {
    mockOutline = { coupon_code: "BEMVINDO10" }
    const res = await POST(envio())
    expect(res.status).toBe(200)
    const gravado = updateCalls.find((c) => c.table === "email_blocks")!
    expect((gravado.data.content as Record<string, unknown>).coupon_line).toBe(
      "Use code BEMVINDO10 at checkout.",
    )
    expect(runCopy().cupom).toMatchObject({ codigo: "BEMVINDO10", tokens_resolvidos: 1 })
  })

  it("sem código no outline o token fica e é denunciado", async () => {
    mockOutline = null
    const res = await POST(envio())
    expect(res.status).toBe(200)
    const gravado = updateCalls.find((c) => c.table === "email_blocks")!
    expect((gravado.data.content as Record<string, unknown>).coupon_line).toBe(
      "Use code [DISCOUNT_CODE] at checkout.",
    )
    expect(errorLogs).toContain("email_copy.coupon_placeholder_sem_codigo")
    expect(runCopy().cupom).toMatchObject({ placeholder_sem_codigo: ["0.coupon_line"] })
  })
})
