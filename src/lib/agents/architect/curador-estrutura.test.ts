import { describe, it, expect } from "vitest"
import { conformarEstrutura, resumoDaDivergencia } from "./curador-estrutura"

// A arquitetura do Welcome 1 da Innova Bay, como está na aba.
const ARQ = [
  { section: "hero", label: "Hero" },
  { section: "offer", label: "Oferta" },
  { section: "body", label: "Body" },
  { section: "products", label: "Produtos" },
  { section: "reviews", label: "Prova Social" },
  { section: "footer", label: "Footer" },
]

describe("conformarEstrutura — a sequência da pessoa vence", () => {
  it("sequência obedecida: papéis por índice, sem divergência", () => {
    const r = conformarEstrutura(
      ARQ,
      ARQ.map((a, i) => ({ section: a.section, papel: `papel ${i}` })),
    )
    expect(r.conforme).toBe(true)
    expect(r.divergencias).toEqual([])
    expect(r.posicoes.map((p) => p.section)).toEqual([
      "hero",
      "offer",
      "body",
      "products",
      "reviews",
      "footer",
    ])
    expect(r.papeis).toEqual([
      "papel 0",
      "papel 1",
      "papel 2",
      "papel 3",
      "papel 4",
      "papel 5",
    ])
  })

  // O caso real de 01/09: devolveu 4 onde havia 6, cortou offer e body e
  // subiu reviews. A estrutura da tela tem de sair intacta.
  it("cortou e reordenou: vence a arquitetura, e os papéis que dá salva", () => {
    const r = conformarEstrutura(ARQ, [
      { section: "hero", papel: "entrega o cupom" },
      { section: "reviews", papel: "voz externa antes do CTA" },
      { section: "products", papel: "catálogo com preço" },
      { section: "footer", papel: "navegação e compliance" },
    ])

    // A sequência é a da arquitetura, inteira e na ordem.
    expect(r.posicoes.map((p) => p.section)).toEqual([
      "hero",
      "offer",
      "body",
      "products",
      "reviews",
      "footer",
    ])
    // Cada papel foi para a SUA seção, não para o índice em que veio.
    expect(r.posicoes[0].papel).toBe("entrega o cupom")
    expect(r.posicoes[3].papel).toBe("catálogo com preço")
    expect(r.posicoes[4].papel).toBe("voz externa antes do CTA")
    expect(r.posicoes[5].papel).toBe("navegação e compliance")
    // As que ele cortou ficam sem papel — nunca com o papel de outra.
    expect(r.posicoes[1].papel).toBe("")
    expect(r.posicoes[2].papel).toBe("")

    expect(r.conforme).toBe(false)
    const motivos = r.divergencias.map((d) => d.motivo)
    expect(motivos).toContain("contagem")
    expect(motivos).toContain("sem_papel")
  })

  it("mesma contagem, ordem trocada: registra a troca posição a posição", () => {
    const r = conformarEstrutura(
      [{ section: "hero" }, { section: "offer" }],
      [
        { section: "offer", papel: "papel da oferta" },
        { section: "hero", papel: "papel da hero" },
      ],
    )
    expect(r.conforme).toBe(false)
    expect(r.posicoes).toEqual([
      { section: "hero", papel: "papel da hero" },
      { section: "offer", papel: "papel da oferta" },
    ])
    const trocas = r.divergencias.filter((d) => d.motivo === "secao_trocada")
    expect(trocas).toHaveLength(2)
    expect(trocas[0]).toMatchObject({ posicao: 0, esperado: "hero", recebido: "offer" })
  })

  it("seção inventada é descartada — papel escrito para bloco que ninguém pediu", () => {
    const r = conformarEstrutura(
      [{ section: "hero" }, { section: "footer" }],
      [
        { section: "hero", papel: "ok" },
        { section: "cta", papel: "botão gigante" },
      ],
    )
    expect(r.posicoes.map((p) => p.papel)).toEqual(["ok", ""])
    expect(r.divergencias.some((d) => d.recebido === "cta")).toBe(true)
  })

  it("seção repetida consome uma ocorrência por vez", () => {
    const r = conformarEstrutura(
      [{ section: "products" }, { section: "cta" }, { section: "products" }],
      [
        { section: "products", papel: "primeira grade" },
        { section: "cta", papel: "botão" },
        { section: "products", papel: "segunda grade" },
      ],
    )
    expect(r.papeis).toEqual(["primeira grade", "botão", "segunda grade"])
    expect(r.conforme).toBe(true)
  })

  it("block_index explícito manda quando aponta para a mesma seção", () => {
    const r = conformarEstrutura(
      [{ section: "hero" }, { section: "products" }, { section: "products" }],
      [
        { section: "products", papel: "vai na terceira", block_index: 2 },
        { section: "hero", papel: "vai na primeira", block_index: 0 },
      ],
    )
    expect(r.papeis[0]).toBe("vai na primeira")
    expect(r.papeis[2]).toBe("vai na terceira")
    expect(r.papeis[1]).toBe("")
  })

  it("block_index apontando para outra seção é ignorado (a seção manda)", () => {
    const r = conformarEstrutura(
      [{ section: "hero" }, { section: "footer" }],
      [{ section: "footer", papel: "rodapé", block_index: 0 }],
    )
    expect(r.papeis).toEqual(["", "rodapé"])
  })

  it("rótulo humano e chave técnica são a mesma seção", () => {
    const r = conformarEstrutura(
      [{ section: "prova_social" }],
      [{ section: "Prova Social", papel: "depoimentos" }],
    )
    expect(r.papeis).toEqual(["depoimentos"])
    expect(r.conforme).toBe(true)
  })

  it("sem estrutura devolvida: sequência intacta, papéis vazios", () => {
    const r = conformarEstrutura(ARQ, [])
    expect(r.posicoes).toHaveLength(6)
    expect(r.papeis.every((p) => p === "")).toBe(true)
    expect(r.divergencias[0].motivo).toBe("sem_estrutura")
    expect(r.conforme).toBe(false)
  })

  it("papel faltando NÃO reprova a conformidade da sequência", () => {
    const r = conformarEstrutura(
      [{ section: "hero" }, { section: "footer" }],
      [
        { section: "hero", papel: "ok" },
        { section: "footer", papel: "   " },
      ],
    )
    // A sequência foi obedecida; falta só a direção editorial de uma posição.
    expect(r.conforme).toBe(true)
    expect(r.divergencias.map((d) => d.motivo)).toEqual(["sem_papel"])
  })
})

describe("resumoDaDivergencia", () => {
  it("obedeceu → null (nada a reportar)", () => {
    const r = conformarEstrutura(
      [{ section: "hero" }],
      [{ section: "hero", papel: "p" }],
    )
    expect(resumoDaDivergencia(r)).toBeNull()
  })

  it("conta por motivo e descreve onde", () => {
    const r = conformarEstrutura(ARQ, [
      { section: "hero", papel: "a" },
      { section: "reviews", papel: "b" },
    ])
    const resumo = resumoDaDivergencia(r)!
    expect(resumo.motivos.contagem).toBe(1)
    expect(resumo.motivos.sem_papel).toBeGreaterThan(0)
    expect(resumo.detalhe).toContain("esperava 6, veio 2")
  })
})
