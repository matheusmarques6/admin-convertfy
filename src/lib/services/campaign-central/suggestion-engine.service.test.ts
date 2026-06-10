import { describe, it, expect } from "vitest"
import { nextSundayRun } from "./suggestion-engine.service"
import { tryParseJson } from "./anthropic-client"
import { aiSuggestionsOutputSchema } from "@/lib/validations/campaign-central"

describe("nextSundayRun", () => {
  it("de uma quarta, retorna a próxima segunda 01h UTC (dom 22h BRT)", () => {
    const from = new Date("2026-06-10T15:00:00Z") // quarta
    const next = nextSundayRun(from)
    expect(next.toISOString()).toBe("2026-06-15T01:00:00.000Z")
    expect(next.getUTCDay()).toBe(1)
  })

  it("de uma segunda 00h UTC, retorna a mesma segunda 01h", () => {
    const from = new Date("2026-06-15T00:30:00Z")
    const next = nextSundayRun(from)
    expect(next.toISOString()).toBe("2026-06-15T01:00:00.000Z")
  })

  it("de uma segunda 02h UTC (já passou da 01h), pula pra próxima semana", () => {
    const from = new Date("2026-06-15T02:00:00Z")
    const next = nextSundayRun(from)
    expect(next.toISOString()).toBe("2026-06-22T01:00:00.000Z")
  })
})

describe("tryParseJson", () => {
  it("parseia JSON puro", () => {
    const { parsed, error } = tryParseJson('{"a": 1}')
    expect(error).toBeNull()
    expect(parsed).toEqual({ a: 1 })
  })

  it("parseia JSON dentro de fence ```json", () => {
    const { parsed } = tryParseJson('Aqui está:\n```json\n{"a": 1}\n```\nFim.')
    expect(parsed).toEqual({ a: 1 })
  })

  it("extrai JSON cercado de texto sem fence", () => {
    const { parsed } = tryParseJson('Resultado: {"suggestions": []} — pronto.')
    expect(parsed).toEqual({ suggestions: [] })
  })

  it("retorna erro pra texto sem JSON", () => {
    const { parsed, error } = tryParseJson("não tem json aqui")
    expect(parsed).toBeNull()
    expect(error).toBeTruthy()
  })
})

describe("aiSuggestionsOutputSchema", () => {
  const valid = {
    suggestions: [
      {
        type: "data",
        title: "Last call · Dia dos Namorados",
        confidence: 92,
        trigger: { label: "Dia dos Namorados", detail: "em 2 dias", source: "Calendário BR" },
        angle: "Urgência de entrega + curadoria de presentes até R$ 200.",
        subject: "⏳ Ainda dá tempo",
        channel: "Email",
        targets: [{ store_id: "550e8400-e29b-41d4-a716-446655440000" }],
        est_revenue: "R$ 42k",
        send_date: "2026-06-11",
      },
    ],
  }

  it("aceita output válido e aplica defaults", () => {
    const r = aiSuggestionsOutputSchema.safeParse(valid)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.suggestions[0].low_perf).toBe(false)
      expect(r.data.suggestions[0].targets[0].store_name).toBe("")
    }
  })

  it("rejeita type fora do enum", () => {
    const bad = structuredClone(valid)
    bad.suggestions[0].type = "promo" as never
    expect(aiSuggestionsOutputSchema.safeParse(bad).success).toBe(false)
  })

  it("rejeita store_id que não é uuid", () => {
    const bad = structuredClone(valid)
    bad.suggestions[0].targets[0].store_id = "loja-123"
    expect(aiSuggestionsOutputSchema.safeParse(bad).success).toBe(false)
  })

  it("rejeita confidence fora de 0-100", () => {
    const bad = structuredClone(valid)
    bad.suggestions[0].confidence = 120
    expect(aiSuggestionsOutputSchema.safeParse(bad).success).toBe(false)
  })

  it("rejeita send_date fora do formato YYYY-MM-DD", () => {
    const bad = structuredClone(valid)
    bad.suggestions[0].send_date = "11/06/2026"
    expect(aiSuggestionsOutputSchema.safeParse(bad).success).toBe(false)
  })

  it("rejeita targets vazio", () => {
    const bad = structuredClone(valid)
    bad.suggestions[0].targets = []
    expect(aiSuggestionsOutputSchema.safeParse(bad).success).toBe(false)
  })
})
