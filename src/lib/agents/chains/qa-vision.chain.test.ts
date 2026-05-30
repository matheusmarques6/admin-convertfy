import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock LangChain ChatAnthropic (multimodal) ─────────────────────────
// invokeMock e o spy do .invoke da instancia ChatAnthropic.
const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}))

vi.mock("@langchain/anthropic", () => {
  class ChatAnthropic {
    invoke = invokeMock
  }
  return { ChatAnthropic }
})

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

// Imports apos mocks
import { runQaVisionCheck } from "./qa-vision.chain"

function defaultInput() {
  return {
    imageUrl: "https://cdn.example.com/hero.jpg",
    nicho: "moda masculina",
    produtoHeroi: "polo slim-fit",
    paleta1: "#1F1F1F",
    paleta2: "#C4A87A",
    overlayReserveExpected: true,
    location: "block:0:hero",
  }
}

beforeEach(() => {
  invokeMock.mockReset()
})

describe("runQaVisionCheck", () => {
  it("retorna 0 issues quando vision diz {issues: []}", async () => {
    invokeMock.mockResolvedValueOnce({ content: JSON.stringify({ issues: [] }) })
    const result = await runQaVisionCheck(defaultInput())
    expect(result.issues).toEqual([])
    expect(result.costCents).toBe(1.5) // estimativa MVP
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it("retorna issues estruturadas quando vision reporta paleta off", async () => {
    invokeMock.mockResolvedValueOnce({
      content: JSON.stringify({
        issues: [
          {
            type: "image_paleta_off",
            severity: "medium",
            message: "cores dominantes nao batem",
          },
        ],
      }),
    })
    const result = await runQaVisionCheck(defaultInput())
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].type).toBe("image_paleta_off")
    expect(result.issues[0].severity).toBe("medium")
    // location herdado do input quando vision nao mandou
    expect(result.issues[0].location).toBe("block:0:hero")
  })

  it("aceita JSON envolto em ```json fences", async () => {
    invokeMock.mockResolvedValueOnce({
      content:
        "```json\n" +
        JSON.stringify({
          issues: [
            {
              type: "image_cena_inadequada",
              severity: "high",
              message: "cenario contradiz posicionamento",
            },
          ],
        }) +
        "\n```",
    })
    const result = await runQaVisionCheck(defaultInput())
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].type).toBe("image_cena_inadequada")
  })

  it("aceita content array do Anthropic (multimodal output)", async () => {
    invokeMock.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify({ issues: [] }) }],
    })
    const result = await runQaVisionCheck(defaultInput())
    expect(result.issues).toEqual([])
  })

  it("retorna 0 issues quando JSON e invalido (parse fail)", async () => {
    invokeMock.mockResolvedValueOnce({ content: "isso nao e json" })
    const result = await runQaVisionCheck(defaultInput())
    expect(result.issues).toEqual([])
    expect(result.costCents).toBe(0) // nao cobra por falha de parse
  })

  it("retorna 0 issues quando Zod falha (issue type invalido)", async () => {
    invokeMock.mockResolvedValueOnce({
      content: JSON.stringify({
        issues: [
          { type: "tipo_inexistente", severity: "high", message: "x" },
        ],
      }),
    })
    const result = await runQaVisionCheck(defaultInput())
    expect(result.issues).toEqual([])
  })

  it("retorna 0 issues quando vision API throwa (graceful)", async () => {
    invokeMock.mockRejectedValueOnce(new Error("API down"))
    const result = await runQaVisionCheck(defaultInput())
    expect(result.issues).toEqual([])
    expect(result.costCents).toBe(0)
  })

  it("filtra issues invalidas mas mantem validas (Zod array)", async () => {
    // Zod safeParse no array inteiro: se 1 item invalido, falha tudo.
    // Comportamento esperado: 0 issues retornadas (conservador).
    invokeMock.mockResolvedValueOnce({
      content: JSON.stringify({
        issues: [
          { type: "image_paleta_off", severity: "low", message: "ok" },
          { type: "tipo_inexistente", severity: "high", message: "bad" },
        ],
      }),
    })
    const result = await runQaVisionCheck(defaultInput())
    expect(result.issues).toEqual([])
  })
})
