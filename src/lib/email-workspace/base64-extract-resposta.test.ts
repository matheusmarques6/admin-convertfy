import { describe, expect, it } from "vitest"

import { lerAplicacao, lerPrevia, type Base64PreviaItem } from "./base64-extract-resposta"

const item = (rotulo: string): Base64PreviaItem => ({
  tabela: "email_component_variants",
  id: "00000000-0000-0000-0000-000000000001",
  rotulo,
  html_chars: 26424,
  total: 4,
  extraiveis: 4,
  bytesExtraiveis: 12150,
  charsEconomizados: 15720,
  ok: false,
})

const summary = (varridos: number, comBase64: number) => ({
  varridos,
  com_base64: comBase64,
  arquivos_a_extrair: comBase64 * 4,
  bytes: 12150,
  chars_economizados: 15720,
})

/** O corpo como `successResponse` o monta: payload ESPALHADO no topo. */
const comoARotaResponde = (payload: Record<string, unknown>) => ({
  success: true,
  ...payload,
})

describe("lerPrevia", () => {
  it("lê o corpo no formato real da rota", () => {
    const r = lerPrevia(
      comoARotaResponde({ items: [item("footer · footer 1")], summary: summary(84, 9) }),
    )
    expect(r.estado).toBe("achou")
    if (r.estado !== "achou") return
    expect(r.items).toHaveLength(1)
    expect(r.summary.varridos).toBe(84)
  })

  it("o formato ANTIGO (`data` aninhado) é recusado, NÃO lido como limpo", () => {
    // É o defeito de 11/09: `json.data?.items ?? []` devolvia lista vazia e a
    // tela dizia "biblioteca e referências limpas" com 39 payloads no banco.
    // Um formato que não sabemos ler tem de aparecer como falha.
    const r = lerPrevia({ success: true, data: { items: [item("x")], summary: summary(84, 9) } })
    expect(r.estado).toBe("nao_entendi")
  })

  it("varreu de verdade e não achou nada: aí sim é limpo", () => {
    const r = lerPrevia(comoARotaResponde({ items: [], summary: summary(84, 0) }))
    expect(r.estado).toBe("limpo")
  })

  it("zero alvos varridos NÃO é limpo — é varredura que não alcançou nada", () => {
    // A biblioteca tem variantes ativas. Varrer zero significa que o filtro
    // ou a leitura falharam, e o verde ali manda parar de procurar.
    const r = lerPrevia(comoARotaResponde({ items: [], summary: summary(0, 0) }))
    expect(r.estado).toBe("nao_entendi")
  })

  it("corpo de erro do Next (HTML, texto, null) não vira limpo", () => {
    for (const corpo of [null, "<!DOCTYPE html>", [], { success: false, error: "x" }]) {
      expect(lerPrevia(corpo).estado).toBe("nao_entendi")
    }
  })
})

describe("lerAplicacao", () => {
  it("lê o resumo no formato real da rota", () => {
    const r = lerAplicacao(
      comoARotaResponde({
        resumo: { itens: 9, arquivos: 24, chars_economizados: 118000 },
        falhas: [],
      }),
    )
    expect(r).toMatchObject({ itens: 9, arquivos: 24, naoEntendi: false })
  })

  it("sem `resumo` marca naoEntendi em vez de dizer '0 itens limpos'", () => {
    // Zero e "não entendi" produzem o mesmo toast e pedem ações opostas.
    expect(lerAplicacao({ success: true }).naoEntendi).toBe(true)
    expect(lerAplicacao({ data: { resumo: { itens: 9 } } }).naoEntendi).toBe(true)
  })

  it("falhas de upload sobrevivem mesmo quando o resumo não é lido", () => {
    const r = lerAplicacao({ falhas: [{ id: "a", rotulo: "footer 1", erro: "403" }] })
    expect(r.falhas).toHaveLength(1)
    expect(r.naoEntendi).toBe(true)
  })
})
