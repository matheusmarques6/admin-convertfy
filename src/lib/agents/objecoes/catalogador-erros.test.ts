import { describe, it, expect } from "vitest"

import { motivoDaFalha } from "./catalogador-erros"

const OPTS = { relogioMs: 151_534, maxTokens: 12_288 }

describe("motivoDaFalha", () => {
  // O caso real: três tentativas na Innova Bay (11/09), todas cortadas pelo
  // relógio, e a tela dizendo "timeout".
  it("explica o corte pelo relógio com o número que o causou", () => {
    const r = motivoDaFalha(["timeout"], OPTS)
    expect(r.codigo).toBe("tempo_esgotado")
    expect(r.mensagem).toContain("152s")
    expect(r.mensagem).toContain("12.288")
  })

  // Vence a causa do DESFECHO, não a primeira da lista: se a segunda
  // tentativa estourou o relógio, é por isso que não há catálogo — dizer
  // "reprovado pelo validador" mandaria consertar o prompt à toa.
  it("o corte vence a reprovação anterior", () => {
    const r = motivoDaFalha(["objeções: esperado 4-8, veio 3", "timeout"], OPTS)
    expect(r.codigo).toBe("tempo_esgotado")
  })

  // Sem janela para a segunda tentativa é outro conserto: não adianta baixar
  // o teto de tokens, o tempo da requisição é que acabou.
  it("separa falta de janela de corte por relógio", () => {
    const r = motivoDaFalha(["sem orçamento: o que resta da janela não cobre"], OPTS)
    expect(r.codigo).toBe("sem_orcamento")
    expect(r.mensagem).not.toContain("teto de 12.288")
  })

  it("reconhece JSON truncado no teto", () => {
    expect(motivoDaFalha(["resposta truncada no teto de 12288 tokens"], OPTS).codigo).toBe("resposta_invalida")
    expect(motivoDaFalha(["resposta não é JSON válido"], OPTS).codigo).toBe("resposta_invalida")
  })

  it("repassa a recusa do provedor com o detalhe", () => {
    const r = motivoDaFalha(["HTTP 402: in-flight budget exhausted"], OPTS)
    expect(r.codigo).toBe("erro_do_provedor")
    expect(r.mensagem).toContain("402")
  })

  // O caso legítimo: o modelo respondeu, o validador reprovou duas vezes.
  // Aqui os erros do validador SÃO a informação útil e têm de aparecer.
  it("mantém os erros do validador quando é disso que se trata", () => {
    const r = motivoDaFalha(["risco×aliviador repetido", "nenhuma dominante"], OPTS)
    expect(r.codigo).toBe("reprovado_pelo_validador")
    expect(r.mensagem).toContain("dominante")
  })

  it("lista vazia não vira mensagem quebrada", () => {
    expect(motivoDaFalha([], OPTS).mensagem).toContain("sem detalhe")
  })
})
