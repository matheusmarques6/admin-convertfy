import { describe, expect, it } from "vitest"
import { normalizarCatalogo } from "@/lib/agents/objecoes/catalogo-regras"
import { aplicarFichaAoCatalogo, fichaParaPrompt, fichaSugeridaDaLoja, fichaVazia, normalizarFicha } from "./ficha-operacional"

const catalogo = normalizarCatalogo({
  objecoes: [
    { objecao: "E se não servir?", tipo_de_risco: "adequacao", dimensao_confianca: "integridade", aliviador: "garantia_de_devolucao", tratamento: "troca simples", flows_elegiveis: ["welcome"], lastro_operacional: { afirmacao: "política de troca publicada e cumprida" }, severidade: 3, evidencia: null, confianca: "baixa" },
    { objecao: "Não confio meu cartão", tipo_de_risco: "seguranca", dimensao_confianca: "integridade", aliviador: "seguranca_de_pagamento", tratamento: "checkout seguro", flows_elegiveis: ["welcome"], lastro_operacional: { afirmacao: "checkout com pagamento seguro" }, severidade: 5, evidencia: null, confianca: "media" },
    { objecao: "Vale o preço?", tipo_de_risco: "financeiro", dimensao_confianca: "competencia", aliviador: "comparacao_de_categoria", tratamento: "tabela", flows_elegiveis: ["welcome"], lastro_operacional: { afirmacao: "critérios objetivos" }, severidade: 4, evidencia: null, confianca: "alta" },
  ],
  incentivo: { existe: null, alerta: "não identificado" },
})

describe("normalizarFicha / fichaVazia", () => {
  it("normaliza tipos, descarta lixo e devolve null quando nada foi preenchido", () => {
    expect(normalizarFicha(null)).toBeNull()
    expect(normalizarFicha({ troca: { texto: "  " }, envio: {} })).toBeNull()
    const f = normalizarFicha({ incentivo: { existe: false }, troca: { prazo_dias: 30, texto: "troca grátis" }, prova: { n_reviews: 370, nota: "4.8" }, pagamento: { metodos: ["pix", 3, ""] } })!
    expect(f.incentivo).toEqual({ existe: false, codigo: null, valor: null, condicoes: null, validade: null })
    expect(f.troca).toEqual({ prazo_dias: 30, texto: "troca grátis" })
    expect(f.prova).toEqual({ n_reviews: 370, nota: null, fonte: null })
    expect(f.pagamento?.metodos).toEqual(["pix"])
    expect(fichaVazia(f)).toBe(false)
  })
  it("incentivo sem `existe` booleano não conta", () => {
    expect(normalizarFicha({ incentivo: { codigo: "X" } })).toBeNull()
  })
})

describe("fichaSugeridaDaLoja / fichaParaPrompt", () => {
  it("sugere a partir do que a loja já tem; sem nada → null", () => {
    const f = fichaSugeridaDaLoja({ frete_prazo: "3-5 dias", frete_gratis_acima_cents: 19900, devolucao_politica: "30 dias" })!
    expect(f.envio).toEqual({ prazo: "3-5 dias", frete_gratis_acima: "199.00", texto: null })
    expect(f.troca?.texto).toBe("30 dias")
    expect(fichaSugeridaDaLoja({})).toBeNull()
  })
  it("o bloco do prompt declara ausência e marca cada linha como verificada", () => {
    expect(fichaParaPrompt(null)).toContain("sem ficha operacional")
    const t = fichaParaPrompt({ incentivo: { existe: false }, troca: { prazo_dias: 60, texto: null }, prova: { n_reviews: 370, nota: 4.8, fonte: "Judge.me" } })
    expect(t).toContain("NÃO há incentivo ativo (verificado pelo time)")
    expect(t).toContain("troca/devolução (verificado): 60 dias")
    expect(t).toContain("prova (verificado): 370 avaliações · nota 4.8 · Judge.me")
  })
})

describe("aplicarFichaAoCatalogo", () => {
  it("carimba verificado nas afirmações cobertas e sobrescreve o incentivo; o resto fica", () => {
    const r = aplicarFichaAoCatalogo(catalogo, { incentivo: { existe: false }, troca: { prazo_dias: 60, texto: null }, pagamento: { checkout: "Shopify", metodos: null } })
    expect(r.verificadas).toEqual(["obj_1", "obj_2"])
    expect(r.catalogo.objecoes[0].lastro_operacional).toMatchObject({ verificado: true, campo_de_origem: "ficha_operacional.troca" })
    expect(r.catalogo.objecoes[1].lastro_operacional).toMatchObject({ verificado: true, campo_de_origem: "ficha_operacional.pagamento" })
    expect(r.catalogo.objecoes[2].lastro_operacional.verificado).toBe(false)
    expect(r.catalogo.incentivo).toMatchObject({ existe: false, campo_de_origem: "ficha_operacional.incentivo", alerta: null })
    expect(r.incentivo_sobrescrito).toBe(true)
    // não muta
    expect(catalogo.objecoes[0].lastro_operacional.verificado).toBe(false)
  })
  it("ficha sem o campo da família não carimba; ficha vazia devolve o mesmo catálogo", () => {
    const r = aplicarFichaAoCatalogo(catalogo, { garantia: { texto: "1 ano" } })
    expect(r.verificadas).toEqual([])
    expect(r.incentivo_sobrescrito).toBe(false)
    expect(aplicarFichaAoCatalogo(catalogo, null).catalogo).toBe(catalogo)
  })
})
