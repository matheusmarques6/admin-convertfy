import { describe, expect, it } from "vitest"

import { buildAprendizadoSeletorDraft } from "./aprendizado-seletor"

const base = {
  flowType: "welcome",
  emailNumber: 1,
  storeName: "Hero Boxers",
  runId: "run-1",
  dataIso: "2026-09-19T10:00:00.000Z",
  feedbacks: [{ rating: "down" as const, comentario: "escolheu preço num welcome", autor: "COO" }],
}

describe("buildAprendizadoSeletorDraft", () => {
  it("lista o alvo, as proibições e os alertas, e aponta a ficha para dado faltante", () => {
    const d = buildAprendizadoSeletorDraft({
      ...base,
      output: {
        modo: "quebra_de_objecao",
        alvos: [{ id: "obj_2", objecao: "é caro", aliviador_pedido: "prova_por_volume", profundidade_de_prova: "afirmacao", primaria: true }],
        proibido_neste_toque: ["urgência artificial"],
        alertas_de_dado: ["No support channel documented"],
      },
    })
    expect(d.path).toBe("aprendizados/welcome/selecao-welcome-1-hero-boxers.md")
    expect(d.markdown).toContain("origem: feedback-seletor")
    expect(d.markdown).toContain("**obj_2** (primária) — é caro")
    expect(d.markdown).toContain("- urgência artificial")
    expect(d.markdown).toContain("- No support channel documented")
    expect(d.markdown).toContain("ficha operacional")
    expect(d.markdown).toContain("1 👎 · 0 👍")
  })

  it("output parcial não derruba: alvo vazio é dito", () => {
    const d = buildAprendizadoSeletorDraft({ ...base, feedbacks: [], output: {} })
    expect(d.markdown).toContain("(nenhum alvo")
    expect(d.markdown).toContain("(nenhum comentário)")
  })

  it("é determinístico", () => {
    const a = buildAprendizadoSeletorDraft({ ...base, output: { modo: "x" } })
    const b = buildAprendizadoSeletorDraft({ ...base, output: { modo: "x" } })
    expect(a).toEqual(b)
  })
})
