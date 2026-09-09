import { describe, it, expect } from "vitest"
import { ALVO_AUSENTE_CURADOR, ALVO_AUSENTE_ESTRUTURADOR, alvoParaMedicao, renderAlvo, renderObjecoesJaAtacadas } from "./alvo-render"
import type { AlvoDoEmail } from "./vocabulario"

const alvo: AlvoDoEmail = {
  modo: "quebra_de_objecao",
  trabalhos_fixos: ["entrega_de_incentivo"],
  alvos: [{ ordem: 1, primaria: true, id: "obj_1", objecao: "É golpe?", tipo_de_risco: "seguranca", tratamento: "reviews com foto", aliviador_pedido: "reputacao_da_loja", profundidade_de_prova: "afirmacao" }],
  medos_alvo: [],
  promessa_a_pagar: null,
  criterio_de_selecao: "x",
  dimensao_confianca: "integridade",
  angulo_do_tratamento: [{ ordem: 1, veiculo: "economia_do_preco", papel: "por que o preço", insumo_disponivel: "parcial" }],
  suspeita_a_antecipar: null,
  ja_atacadas: [{ id: "obj_2", email_number: 1, profundidade: "afirmacao", via: "primaria" }],
  proibido_neste_toque: ["urgência artificial"],
  alerta_de_lastro: null,
  razao: "porque sim",
  lacuna: null,
}

describe("renderAlvo", () => {
  it("sem alvo devolve o texto de ausência do caller (os dois são diferentes de propósito)", () => {
    expect(renderAlvo(null, ALVO_AUSENTE_ESTRUTURADOR)).toContain("diagnostique você")
    expect(renderAlvo(undefined, ALVO_AUSENTE_CURADOR)).toContain("<objecoes>")
    expect(ALVO_AUSENTE_ESTRUTURADOR).not.toBe(ALVO_AUSENTE_CURADOR)
  })
  it("traz modo, alvo primário com eixo equivalente do vault, veículo, proibições e razão", () => {
    const t = renderAlvo(alvo, "x")
    expect(t).toContain("modo: quebra_de_objecao · trabalhos fixos: entrega_de_incentivo")
    expect(t).toContain('ALVO PRIMÁRIO obj_1 — "É golpe?"')
    expect(t).toContain("aliviador pedido: reputacao_da_loja")
    expect(t).toContain("eixo objecao (vault) equivalente: confianca-no-canal")
    expect(t).toContain("1. economia_do_preco — por que o preço · insumo disponível: parcial")
    // A proibição é de REDAÇÃO. Servida como veto de bloco, ela eliminava
    // quase toda a biblioteca e o e-mail saía só com o rodapé (07/09).
    expect(t).toContain("proibido neste toque (restrição de REDAÇÃO — não elimina bloco):\n  - urgência artificial")
    expect(t).not.toContain("força de veto")
    expect(t).toContain("razão: porque sim")
  })
  it("lacuna aparece em destaque", () => {
    expect(renderAlvo({ ...alvo, alvos: [], lacuna: { motivo: "sem candidata", detalhe: "nada elegível" } }, "x")).toContain("LACUNA: sem candidata — nada elegível")
  })
})

describe("renderObjecoesJaAtacadas / alvoParaMedicao", () => {
  it("lista as já atacadas com profundidade e via", () => {
    expect(renderObjecoesJaAtacadas(alvo)).toBe("- obj_2 · email #1 · profundidade afirmacao · argumento principal")
    expect(renderObjecoesJaAtacadas(null)).toContain("nenhuma")
  })
  it("medição usa o aliviador da primária e as proibições", () => {
    expect(alvoParaMedicao(alvo)).toEqual({ incentivo_existe: null, aliviador_pedido: "reputacao_da_loja", proibicoes: ["urgência artificial"] })
    expect(alvoParaMedicao(null)).toBeNull()
  })
})

describe("incentivo, insumos e contradições no render (09/09)", () => {
  it("INCENTIVO e insumos permitidos viram instrução positiva; contradição fica em destaque; medição carrega incentivo_existe", () => {
    const a: AlvoDoEmail = {
      ...alvo,
      incentivo: { existe: false, codigo: null, valor: null },
      insumos_permitidos: ["checkout Shopify (pesquisa)"],
      contradicoes: [{ motivo: "tratamento_sem_insumo", detalhe: "o tratamento pede política de troca e este toque proíbe afirmá-la" }],
    }
    const t = renderAlvo(a, "x")
    expect(t).toContain("INCENTIVO: sem incentivo ativo — nenhum bloco, campo ou copy de oferta")
    expect(t).toContain("insumos permitidos (fatos que a copy PODE usar, com origem):\n  - checkout Shopify (pesquisa)")
    expect(t).toContain("CONTRADIÇÃO (dado que falta na loja")
    expect(alvoParaMedicao(a)?.incentivo_existe).toBe(false)
    expect(renderAlvo({ ...alvo, incentivo: { existe: true, codigo: "HERO10", valor: "10%" } }, "x")).toContain("INCENTIVO: ativo · 10% · código HERO10")
  })
  it("alvo gravado antes de 09/09 (sem os campos) renderiza como antes", () => {
    const t = renderAlvo(alvo, "x")
    expect(t).not.toContain("INCENTIVO")
    expect(alvoParaMedicao(alvo)?.incentivo_existe).toBeNull()
  })
})
