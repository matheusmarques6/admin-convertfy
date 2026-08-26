import { describe, it, expect } from "vitest"
import { buildAprendizadoDraft, type DraftInput } from "./aprendizado-draft"
import { parseFrontmatter } from "@/lib/vault/vault-parser"

function input(): DraftInput {
  return {
    flowType: "welcome",
    emailNumber: 2,
    storeName: "Innova Bay",
    runId: "run-123",
    dataIso: "2026-08-26T12:00:00Z",
    feedbacks: [
      { rating: "down", comentario: "O pivô veio cedo demais", autor: "COO" },
      { rating: "up", comentario: null },
    ],
    output: {
      diagnostico: {
        objecao_dominante: "Eficácia — funciona mesmo?",
        referencia_base: "avelmore-inspecao-antecipada",
        traducao_do_mecanismo: "Inspeção vira demonstração",
      },
      estrutura: [
        { section: "hero", papel: "Cupom em 3s", referencia: "avelmore-inspecao-antecipada" },
        { section: "body", papel: "O pivô" },
      ],
      fio_narrativo: "cupom → razão",
    },
  }
}

describe("buildAprendizadoDraft", () => {
  it("gera frontmatter que o vault-parser lê como aprendizado", () => {
    const d = buildAprendizadoDraft(input())
    const fm = parseFrontmatter(d.markdown)
    expect(fm.hasFrontmatter).toBe(true)
    expect(fm.data.tipo).toBe("aprendizado")
    expect(fm.data.status).toBe("proposta")
    expect(fm.data.flow).toBe("welcome")
    expect(fm.data.run_id).toBe("run-123")
    expect(fm.data.data).toBe("2026-08-26")
  })

  it("slug sem acento/espaço e caminho no flow", () => {
    const d = buildAprendizadoDraft(input())
    expect(d.slug).toMatch(/^proposta-welcome-2-eficacia/)
    expect(d.slug).not.toMatch(/[^a-z0-9-]/)
    expect(d.path).toBe(`aprendizados/welcome/${d.slug}.md`)
  })

  it("corpo carrega decisão, sequência e feedback com contagem", () => {
    const d = buildAprendizadoDraft(input())
    expect(d.markdown).toContain("hero → body")
    expect(d.markdown).toContain("👎 (COO): O pivô veio cedo demais")
    expect(d.markdown).toContain("1 👎 · 1 👍")
    expect(d.markdown).toContain("Regra proposta")
  })

  it("determinístico e tolerante a output parcial", () => {
    const parcial: DraftInput = {
      ...input(),
      output: {},
      feedbacks: [],
    }
    const a = buildAprendizadoDraft(parcial)
    const b = buildAprendizadoDraft(parcial)
    expect(a.markdown).toBe(b.markdown)
    expect(a.markdown).toContain("objeção não registrada")
    expect(a.markdown).toContain("(nenhum comentário)")
  })
})
