import { describe, it, expect, vi, beforeEach } from "vitest"
import type { EmailAgentConfig } from "@/types/email-generation"

// ── Mock supabase admin client + telemetry ─────────────────────────────
type Row = Record<string, unknown>
const tables: Record<string, Row[]> = {
  email_agent_configs: [],
}

function resetTables() {
  for (const k of Object.keys(tables)) tables[k] = []
}

function buildSelectChain(tableName: string) {
  const filters: Array<[string, unknown]> = []
  const chain: Record<string, unknown> = {}

  chain.eq = (col: string, val: unknown) => {
    filters.push([col, val])
    return chain
  }
  chain.order = () => chain
  chain.limit = () => chain
  chain.maybeSingle = async () => {
    const rows = tables[tableName] ?? []
    const filtered = rows.filter((r) => filters.every(([c, v]) => r[c] === v))
    return { data: filtered[0] ?? null, error: null }
  }
  chain.single = async () => {
    const rows = tables[tableName] ?? []
    const filtered = rows.filter((r) => filters.every(([c, v]) => r[c] === v))
    return { data: filtered[0] ?? null, error: null }
  }
  return chain
}

function mockSupabaseClient() {
  return {
    from(tableName: string) {
      return {
        select() {
          return buildSelectChain(tableName)
        },
        insert(rows: Row | Row[]) {
          const arr = Array.isArray(rows) ? rows : [rows]
          if (!tables[tableName]) tables[tableName] = []
          tables[tableName].push(...arr)
          return {
            select: () => ({
              single: async () => ({ data: { id: "run_id" }, error: null }),
            }),
          }
        },
      }
    },
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => mockSupabaseClient(),
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}))

// ── Mock LangChain ChatAnthropic ───────────────────────────────────────
// vi.hoisted garante que chainInvokeMock existe antes dos vi.mock factories
// (que sao hoisted automaticamente pelo Vitest).
const { chainInvokeMock, visionCheckMock, fromMessagesMock } = vi.hoisted(
  () => ({
    chainInvokeMock: vi.fn(),
    visionCheckMock: vi.fn(),
    fromMessagesMock: vi.fn(),
  }),
)

// Story AE-15: mock do qa-vision chain. Default: nao chamado (env OFF).
vi.mock("./qa-vision.chain", () => ({
  runQaVisionCheck: visionCheckMock,
}))
vi.mock("@langchain/anthropic", () => {
  class ChatAnthropic {}
  return { ChatAnthropic }
})
vi.mock("@langchain/core/prompts", () => ({
  ChatPromptTemplate: {
    fromMessages: (...args: unknown[]) => {
      fromMessagesMock(...args)
      return {
        pipe: () => ({
          pipe: () => ({
            invoke: chainInvokeMock,
          }),
        }),
      }
    },
  },
}))
vi.mock("@langchain/core/output_parsers", () => {
  class StringOutputParser {}
  return { StringOutputParser }
})

// ── Imports ────────────────────────────────────────────────────────────
// Importa DEPOIS dos mocks
import {
  runDeterministicChecks,
  runQaAgent,
  getBlockingSeverity,
} from "./qa.chain"

const VALID_HTML = `<!DOCTYPE html><html><body><a href="https://example.com">x</a></body></html>`

function makeConfig(): EmailAgentConfig {
  return {
    id: "cfg_qa_1",
    agent_type: "qa",
    model: "claude-sonnet-4-6",
    system_prompt: "You are QA.",
    user_template: "HTML: {{html}}",
    temperature: 0.2,
    max_tokens: 1500,
    output_schema: {},
    version: 1,
    is_active: true,
    created_at: "2026-05-30T00:00:00Z",
    created_by: null,
  }
}

function makeInput(overrides: Partial<Parameters<typeof runQaAgent>[0]> = {}) {
  return {
    storeId: "store_1",
    emailId: "email_1",
    html: VALID_HTML,
    blocks: [{ block_type: "hero", content: { headline: "Olá" } }],
    briefing: null,
    brand: null,
    blueprintObjective: "Boas-vindas",
    ...overrides,
  }
}

beforeEach(() => {
  resetTables()
  chainInvokeMock.mockReset()
  visionCheckMock.mockReset()
  fromMessagesMock.mockReset()
  process.env.EMAIL_QA_BLOCK_SEVERITY = "high"
  delete process.env.EMAIL_QA_VISION_ENABLED
})

// ─────────────────────────────────────────────────────────────────────────
// Deterministic pre-checks
// ─────────────────────────────────────────────────────────────────────────

describe("runDeterministicChecks", () => {
  it("flags html sem <html>/</html> como html_invalido high", () => {
    const issues = runDeterministicChecks("<body>oi</body>", [])
    const inv = issues.find((i) => i.type === "html_invalido")
    expect(inv).toBeDefined()
    expect(inv?.severity).toBe("high")
  })

  it("nao flagga html valido", () => {
    const issues = runDeterministicChecks(VALID_HTML, [])
    expect(issues.find((i) => i.type === "html_invalido")).toBeUndefined()
  })

  it("flagga bloco com content vazio como blocos_vazios medium", () => {
    const issues = runDeterministicChecks(VALID_HTML, [
      { block_type: "hero", content: { headline: "", body: "" } },
    ])
    const v = issues.find((i) => i.type === "blocos_vazios")
    expect(v).toBeDefined()
    expect(v?.severity).toBe("medium")
  })

  it("nao flagga bloco com pelo menos um campo preenchido", () => {
    const issues = runDeterministicChecks(VALID_HTML, [
      { block_type: "hero", content: { headline: "Promo", body: "" } },
    ])
    expect(issues.find((i) => i.type === "blocos_vazios")).toBeUndefined()
  })

  it("flagga href javascript: como links_quebrados high", () => {
    const html = `<html><a href="javascript:alert(1)">x</a></html>`
    const issues = runDeterministicChecks(html, [])
    const l = issues.find((i) => i.type === "links_quebrados")
    expect(l).toBeDefined()
    expect(l?.severity).toBe("high")
  })

  it("aceita anchors, mailto e tel", () => {
    const html = `<html><a href="#top">t</a><a href="mailto:x@y.com">m</a><a href="tel:+55">t</a></html>`
    const issues = runDeterministicChecks(html, [])
    expect(issues.find((i) => i.type === "links_quebrados")).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────
// getBlockingSeverity
// ─────────────────────────────────────────────────────────────────────────

describe("getBlockingSeverity", () => {
  it("retorna 'high' por default", () => {
    delete process.env.EMAIL_QA_BLOCK_SEVERITY
    expect(getBlockingSeverity()).toBe("high")
  })

  it("lê env var quando valida", () => {
    process.env.EMAIL_QA_BLOCK_SEVERITY = "medium"
    expect(getBlockingSeverity()).toBe("medium")
  })

  it("ignora valor invalido e cai pra 'high'", () => {
    process.env.EMAIL_QA_BLOCK_SEVERITY = "lixo"
    expect(getBlockingSeverity()).toBe("high")
  })
})

// ─────────────────────────────────────────────────────────────────────────
// runQaAgent — degrade seguro
// ─────────────────────────────────────────────────────────────────────────

describe("runQaAgent — sem config ativo", () => {
  it("retorna passed=true sem chamar Claude quando nao ha config", async () => {
    const result = await runQaAgent(makeInput())
    expect(result.meta.model).toBe("noop")
    expect(result.passed).toBe(true)
    expect(result.issues).toEqual([])
    expect(chainInvokeMock).not.toHaveBeenCalled()
  })

  it("propaga issues deterministicas mesmo sem config", async () => {
    const result = await runQaAgent(
      makeInput({ html: "<body>sem html tag</body>" }),
    )
    expect(result.meta.model).toBe("noop")
    expect(result.issues.find((i) => i.type === "html_invalido")).toBeDefined()
    expect(result.passed).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// runQaAgent — com config + Claude mockado
// ─────────────────────────────────────────────────────────────────────────

describe("runQaAgent — com config ativo", () => {
  beforeEach(() => {
    tables.email_agent_configs.push(makeConfig() as unknown as Row)
  })

  it("retorna passed=true quando Claude devolve issues vazias", async () => {
    chainInvokeMock.mockResolvedValueOnce(
      JSON.stringify({ passed: true, issues: [] }),
    )
    const result = await runQaAgent(makeInput())
    expect(result.passed).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.meta.model).toBe("claude-sonnet-4-6")
    expect(chainInvokeMock).toHaveBeenCalledTimes(1)
  })

  it("retorna passed=false quando Claude reporta issue severity=high", async () => {
    chainInvokeMock.mockResolvedValueOnce(
      JSON.stringify({
        passed: false,
        issues: [
          {
            type: "spam_score_alto",
            severity: "high",
            message: "Subject em CAPS",
            location: "subject",
          },
        ],
      }),
    )
    const result = await runQaAgent(makeInput())
    expect(result.passed).toBe(false)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].type).toBe("spam_score_alto")
  })

  it("retorna passed=true quando issue e severity=low (abaixo do threshold)", async () => {
    chainInvokeMock.mockResolvedValueOnce(
      JSON.stringify({
        passed: false,
        issues: [
          {
            type: "tom_inconsistente",
            severity: "low",
            message: "tom",
          },
        ],
      }),
    )
    const result = await runQaAgent(makeInput())
    // computePassed local recalcula sem confiar no `passed` do LLM
    expect(result.passed).toBe(true)
  })

  it("faz retry e cai em fallback quando JSON do LLM e invalido", async () => {
    chainInvokeMock
      .mockResolvedValueOnce("nao sou json")
      .mockResolvedValueOnce("ainda nao sou json")
    const result = await runQaAgent(makeInput())
    expect(chainInvokeMock).toHaveBeenCalledTimes(2)
    expect(result.passed).toBe(false)
    expect(
      result.issues.find((i) => i.message === "qa_output_invalid"),
    ).toBeDefined()
  })

  it("aceita JSON envolto em markdown ```json fences", async () => {
    chainInvokeMock.mockResolvedValueOnce(
      "```json\n" + JSON.stringify({ passed: true, issues: [] }) + "\n```",
    )
    const result = await runQaAgent(makeInput())
    expect(result.passed).toBe(true)
    expect(chainInvokeMock).toHaveBeenCalledTimes(1)
  })

  it("threshold=medium bloqueia medium E high (cap >=)", async () => {
    // Override do env: medium passa a bloquear, low ainda nao bloqueia.
    process.env.EMAIL_QA_BLOCK_SEVERITY = "medium"
    try {
      chainInvokeMock.mockResolvedValueOnce(
        JSON.stringify({
          passed: false,
          issues: [
            { type: "tom_inconsistente", severity: "medium", message: "tom" },
          ],
        }),
      )
      const result = await runQaAgent(makeInput())
      expect(result.passed).toBe(false) // medium >= medium -> bloqueia
      expect(
        result.issues.some(
          (i) => i.severity === "medium" && i.type === "tom_inconsistente",
        ),
      ).toBe(true)
    } finally {
      delete process.env.EMAIL_QA_BLOCK_SEVERITY
    }
  })

  it("timeout 15s -> retorna qa_timeout high + model qa-timeout", async () => {
    vi.useFakeTimers()
    try {
      // chain.invoke nunca resolve, mas rejeita com AbortError quando o
      // signal e abortado pelo setTimeout interno de 15s.
      chainInvokeMock.mockImplementationOnce(
        (_input: unknown, opts: { signal?: AbortSignal } | undefined) =>
          new Promise((_resolve, reject) => {
            opts?.signal?.addEventListener("abort", () => {
              const err = new Error("Aborted") as Error & { name: string }
              err.name = "AbortError"
              reject(err)
            })
          }),
      )

      const promise = runQaAgent(makeInput())
      // Avanca o setTimeout interno (15_000ms) para disparar o abort.
      await vi.advanceTimersByTimeAsync(15_500)
      const result = await promise

      expect(result.passed).toBe(false)
      expect(
        result.issues.some(
          (i) =>
            i.message === "qa_timeout" &&
            i.severity === "high" &&
            i.type === "html_invalido",
        ),
      ).toBe(true)
      expect(result.meta.model).toBe("qa-timeout")
    } finally {
      vi.useRealTimers()
    }
  })

  it("mescla deterministicas + LLM issues", async () => {
    chainInvokeMock.mockResolvedValueOnce(
      JSON.stringify({
        passed: false,
        issues: [
          { type: "claim_nao_coberto", severity: "medium", message: "claim" },
        ],
      }),
    )
    const result = await runQaAgent(
      makeInput({
        html: `<html><a href="javascript:alert(1)">x</a></html>`,
      }),
    )
    expect(result.issues.find((i) => i.type === "links_quebrados")).toBeDefined()
    expect(result.issues.find((i) => i.type === "claim_nao_coberto")).toBeDefined()
    // links_quebrados javascript: e high -> bloqueia
    expect(result.passed).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Regressão: system prompt com chaves literais (Single '}' in template)
// ─────────────────────────────────────────────────────────────────────────

describe("runQaAgent — system prompt com chaves literais", () => {
  it("passa system/user como valores; fromMessages só recebe placeholders", async () => {
    const cfg = makeConfig()
    // System prompt com exemplo de JSON ({ }) — exatamente o que fazia o
    // parser f-string do LangChain estourar "Single '}' in template".
    cfg.system_prompt = 'Formato: {"passed": boolean, "issues": [{ "type": "x" }]}'
    tables.email_agent_configs.push(cfg as unknown as Row)

    chainInvokeMock.mockResolvedValueOnce(
      JSON.stringify({ passed: true, issues: [] }),
    )
    const result = await runQaAgent(makeInput())

    expect(result.passed).toBe(true)
    // O system prompt NUNCA entra como template no fromMessages (senão as
    // chaves seriam parseadas como f-string). Só os placeholders estáticos.
    expect(fromMessagesMock).toHaveBeenCalledWith([
      ["system", "{system}"],
      ["human", "{user}"],
    ])
    // O conteúdo (com chaves) vai como VALOR no invoke.
    const invokeArg = chainInvokeMock.mock.calls[0][0] as {
      system: string
      user: string
    }
    expect(invokeArg.system).toBe(cfg.system_prompt)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Story AE-15 — QA cascade (vision Etapa 2)
// ─────────────────────────────────────────────────────────────────────────

describe("runQaAgent — Story AE-15 cascade vision", () => {
  beforeEach(() => {
    tables.email_agent_configs.push(makeConfig() as unknown as Row)
  })

  const heroBlock = {
    block_type: "hero",
    content: {
      headline: "Promo",
      image_url: "https://cdn.example.com/hero.jpg",
    },
  }

  it("nao chama vision quando EMAIL_QA_VISION_ENABLED esta off (default)", async () => {
    chainInvokeMock.mockResolvedValueOnce(
      JSON.stringify({ passed: true, issues: [] }),
    )
    const result = await runQaAgent(makeInput({ blocks: [heroBlock] }))
    expect(visionCheckMock).not.toHaveBeenCalled()
    expect(result.passed).toBe(true)
  })

  it("chama vision quando flag ON e nao ha image_nicho_mismatch high", async () => {
    process.env.EMAIL_QA_VISION_ENABLED = "true"
    try {
      chainInvokeMock.mockResolvedValueOnce(
        JSON.stringify({ passed: true, issues: [] }),
      )
      visionCheckMock.mockResolvedValueOnce({
        issues: [
          {
            type: "image_paleta_off",
            severity: "medium",
            message: "cores fora",
            location: "block:0:hero",
          },
        ],
        costCents: 1.5,
        durationMs: 200,
      })
      const result = await runQaAgent(makeInput({ blocks: [heroBlock] }))
      expect(visionCheckMock).toHaveBeenCalledTimes(1)
      expect(result.issues.find((i) => i.type === "image_paleta_off")).toBeDefined()
      // medium nao bloqueia (default threshold = high)
      expect(result.passed).toBe(true)
    } finally {
      delete process.env.EMAIL_QA_VISION_ENABLED
    }
  })

  it("nao chama vision quando Etapa 1 ja reportou image_nicho_mismatch high", async () => {
    process.env.EMAIL_QA_VISION_ENABLED = "true"
    try {
      chainInvokeMock.mockResolvedValueOnce(
        JSON.stringify({
          passed: false,
          issues: [
            {
              type: "image_nicho_mismatch",
              severity: "high",
              message: "produto errado",
            },
          ],
        }),
      )
      const result = await runQaAgent(makeInput({ blocks: [heroBlock] }))
      // Filtro: ja bloqueou na Etapa 1, skip Etapa 2.
      expect(visionCheckMock).not.toHaveBeenCalled()
      expect(result.passed).toBe(false)
      expect(
        result.issues.find((i) => i.type === "image_nicho_mismatch"),
      ).toBeDefined()
    } finally {
      delete process.env.EMAIL_QA_VISION_ENABLED
    }
  })

  it("nao chama vision quando nao ha blocos hero/image com image_url", async () => {
    process.env.EMAIL_QA_VISION_ENABLED = "true"
    try {
      chainInvokeMock.mockResolvedValueOnce(
        JSON.stringify({ passed: true, issues: [] }),
      )
      // Bloco hero SEM image_url
      const noImageBlock = {
        block_type: "hero",
        content: { headline: "x" },
      }
      const result = await runQaAgent(makeInput({ blocks: [noImageBlock] }))
      expect(visionCheckMock).not.toHaveBeenCalled()
      expect(result.passed).toBe(true)
    } finally {
      delete process.env.EMAIL_QA_VISION_ENABLED
    }
  })

  it("vision throw (Promise.allSettled rejected) preserva passed do textual", async () => {
    process.env.EMAIL_QA_VISION_ENABLED = "true"
    try {
      chainInvokeMock.mockResolvedValueOnce(
        JSON.stringify({ passed: true, issues: [] }),
      )
      visionCheckMock.mockRejectedValueOnce(new Error("vision boom"))
      const result = await runQaAgent(makeInput({ blocks: [heroBlock] }))
      expect(visionCheckMock).toHaveBeenCalledTimes(1)
      // Rejected promise = sem issues adicionais. Textual disse passed -> mantem.
      expect(result.passed).toBe(true)
      expect(result.issues).toEqual([])
    } finally {
      delete process.env.EMAIL_QA_VISION_ENABLED
    }
  })

  it("cap em 3 chamadas paralelas mesmo com mais blocos image", async () => {
    process.env.EMAIL_QA_VISION_ENABLED = "true"
    try {
      chainInvokeMock.mockResolvedValueOnce(
        JSON.stringify({ passed: true, issues: [] }),
      )
      visionCheckMock.mockResolvedValue({
        issues: [],
        costCents: 1.5,
        durationMs: 100,
      })
      // 5 blocos image — deveria capar em 3.
      const blocks = Array.from({ length: 5 }, (_, i) => ({
        block_type: "image",
        content: { image_url: `https://cdn.example.com/img${i}.jpg` },
      }))
      await runQaAgent(makeInput({ blocks }))
      expect(visionCheckMock).toHaveBeenCalledTimes(3)
    } finally {
      delete process.env.EMAIL_QA_VISION_ENABLED
    }
  })
})
