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
    expect(t).toContain("proibido neste toque (força de veto):\n  - urgência artificial")
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
    expect(alvoParaMedicao(alvo)).toEqual({ aliviador_pedido: "reputacao_da_loja", proibicoes: ["urgência artificial"] })
    expect(alvoParaMedicao(null)).toBeNull()
  })
})
