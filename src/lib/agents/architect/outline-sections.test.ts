import { describe, it, expect } from "vitest"
import { anexarIntencoes, resolveStructure } from "./outline-sections"
import type { EmailOutlineTemplate } from "@/types/email-generation"

const outline = (suggested: string[]) =>
  ({ suggested_blocks: suggested }) as unknown as EmailOutlineTemplate

describe("resolveStructure + intenções da Arquitetura", () => {
  const suggested = ["hero", "offer", "body", "products", "reviews", "footer"]

  it("sem blocos globais: comportamento de antes (rótulo do outline, sem intencao)", () => {
    const r = resolveStructure(outline(suggested))
    expect(r.map((s) => s.section)).toEqual(suggested)
    expect(r.every((s) => s.intencao == null)).toBe(true)
    expect(r[2].label).toBe("body")
  })

  it("mesmo tamanho: casa por índice; intenção vira label truncado e campo intencao", () => {
    const longa =
      "Atacar a objeção 'isso realmente funciona?' com a tese técnica da marca, nomeando a dúvida de frente e mostrando o mecanismo antes de qualquer desconto."
    const blocos = suggested.map((type, i) => ({
      type,
      purpose: i === 2 ? longa : "",
    }))
    const r = resolveStructure(outline(suggested), blocos)
    expect(r[2].intencao).toBe(longa)
    expect(r[2].label.length).toBeLessThanOrEqual(90)
    expect(r[2].label.endsWith("…")).toBe(true)
    // as outras posições seguem sem intenção e com o rótulo do outline
    expect(r[0]).toEqual({ section: "hero", label: "hero" })
    expect(r[5].intencao).toBeUndefined()
  })

  it("tamanhos diferentes: casa pela 1ª ocorrência livre da mesma categoria, sem chutar", () => {
    const r = anexarIntencoes(
      [
        { section: "hero", label: "hero" },
        { section: "body", label: "body" },
        { section: "body", label: "body 2" },
      ],
      [
        { type: "body", purpose: "primeiro corpo" },
        { type: "body", purpose: "segundo corpo" },
        { type: "footer", purpose: "não existe na sequência" },
        { type: "cta", purpose: "também não" },
      ],
    )
    expect(r[0].intencao).toBeUndefined()
    expect(r[1].intencao).toBe("primeiro corpo")
    expect(r[2].intencao).toBe("segundo corpo")
  })

  it("tipo legado no blueprint global casa pela categoria (reviews ← testimonials)", () => {
    const r = anexarIntencoes(
      [{ section: "reviews", label: "Prova Social" }],
      [{ type: "testimonials", purpose: "voz externa que confirma a tese" }],
    )
    expect(r[0].intencao).toBe("voz externa que confirma a tese")
    expect(r[0].label).toBe("voz externa que confirma a tese")
  })

  it("purpose vazio ou só espaço não vira intenção", () => {
    const r = anexarIntencoes(
      [{ section: "hero", label: "hero" }],
      [{ type: "hero", purpose: "   " }],
    )
    expect(r[0]).toEqual({ section: "hero", label: "hero" })
  })
})
