import { describe, expect, it } from "vitest"
import {
  explicarVinculo,
  precisaConfirmar,
  resolverLojasDaAssinatura,
  type LojaDoCliente,
} from "./lojas-da-assinatura"

const loja = (id: string, over: Partial<LojaDoCliente> = {}): LojaDoCliente => ({
  id,
  store_name: id,
  is_active: true,
  ...over,
})

// Os três casos reais medidos em produção em 08/09.
const JMJC = [loja("boxer"), loja("boxer-de"), loja("boxer-uk")]
const JOAO_PAULO = [loja("jp"), loja("rivo")]

describe("resolverLojasDaAssinatura", () => {
  it("uma assinatura, três lojas → infere as três", () => {
    const v = resolverLojasDaAssinatura({
      lojasDoCliente: JMJC,
      assinaturasDoCliente: 1,
      status: "active",
    })
    expect(v.origem).toBe("inferido")
    expect(v.storeIds).toEqual(["boxer", "boxer-de", "boxer-uk"])
    expect(v.candidatas).toEqual(v.storeIds)
  })

  it("JMJC (2 assinaturas, 3 lojas): não infere, mas sugere as três", () => {
    // MRR de 7.000 em duas assinaturas de 3.500. Inferir as três lojas para
    // CADA uma contaria a mensalidade duas vezes na carteira. Mas as
    // candidatas seguem lá, para o diálogo abrir marcado.
    const v = resolverLojasDaAssinatura({
      lojasDoCliente: JMJC,
      assinaturasDoCliente: 2,
      status: "active",
    })
    expect(v.origem).toBe("nenhum")
    expect(v.motivo).toBe("cliente_tem_varias_assinaturas")
    expect(v.storeIds).toEqual([])
    expect(v.candidatas).toEqual(["boxer", "boxer-de", "boxer-uk"])
  })

  it("João Paulo: DUAS assinaturas → não infere, para não dobrar a mensalidade", () => {
    // Dar "todas as lojas do cliente" a cada uma das duas assinaturas faria
    // a mensalidade aparecer duas vezes na Gestão de Carteira.
    const v = resolverLojasDaAssinatura({
      lojasDoCliente: JOAO_PAULO,
      assinaturasDoCliente: 2,
      status: "active",
    })
    expect(v.origem).toBe("nenhum")
    expect(v.motivo).toBe("cliente_tem_varias_assinaturas")
    expect(v.storeIds).toEqual([])
    expect(v.candidatas).toEqual(["jp", "rivo"])
  })

  it("assinatura cancelada não sugere NEM candidata", () => {
    // Um clique de "confirmar" numa assinatura que não corre mais é convite
    // ao erro.
    const v = resolverLojasDaAssinatura({
      lojasDoCliente: JMJC,
      assinaturasDoCliente: 1,
      status: "cancelled",
    })
    expect(v.candidatas).toEqual([])
  })

  it("assinatura cancelada não puxa loja nenhuma", () => {
    const v = resolverLojasDaAssinatura({
      lojasDoCliente: JMJC,
      assinaturasDoCliente: 1,
      status: "cancelled",
    })
    expect(v.origem).toBe("nenhum")
    expect(v.motivo).toBe("assinatura_encerrada")
  })

  it("vínculo explícito vence a inferência", () => {
    const v = resolverLojasDaAssinatura({
      explicitos: ["so-esta"],
      lojasDoCliente: JMJC,
      assinaturasDoCliente: 1,
      status: "active",
    })
    expect(v.origem).toBe("explicito")
    expect(v.storeIds).toEqual(["so-esta"])
  })

  it("explícito vence até em assinatura encerrada e com várias assinaturas", () => {
    // Alguém decidiu. Não se desfaz por causa do status nem da contagem.
    const v = resolverLojasDaAssinatura({
      explicitos: ["a"],
      lojasDoCliente: JOAO_PAULO,
      assinaturasDoCliente: 3,
      status: "cancelled",
    })
    expect(v.origem).toBe("explicito")
    expect(v.storeIds).toEqual(["a"])
  })

  it("explícito repetido entra uma vez só", () => {
    const v = resolverLojasDaAssinatura({ explicitos: ["a", "a", "b"] })
    expect(v.storeIds).toEqual(["a", "b"])
  })

  it("loja inativa fica de fora da inferência", () => {
    const v = resolverLojasDaAssinatura({
      lojasDoCliente: [loja("viva"), loja("morta", { is_active: false })],
      assinaturasDoCliente: 1,
    })
    expect(v.storeIds).toEqual(["viva"])
  })

  it("loja sem o campo is_active conta como ativa", () => {
    // Sumir da inferência por um campo ausente é o silêncio que este módulo
    // existe para acabar.
    const v = resolverLojasDaAssinatura({
      lojasDoCliente: [{ id: "x", store_name: "X" }],
      assinaturasDoCliente: 1,
    })
    expect(v.origem).toBe("inferido")
    expect(v.storeIds).toEqual(["x"])
  })

  it("cliente sem loja ativa não infere nada", () => {
    const v = resolverLojasDaAssinatura({
      lojasDoCliente: [loja("morta", { is_active: false })],
      assinaturasDoCliente: 1,
    })
    expect(v.origem).toBe("nenhum")
    expect(v.motivo).toBe("cliente_sem_loja_ativa")
  })

  it("entrada vazia devolve 'nenhum', não erro", () => {
    const v = resolverLojasDaAssinatura({})
    expect(v.origem).toBe("nenhum")
    expect(v.storeIds).toEqual([])
  })

  it("sem informar a contagem, assume UMA assinatura", () => {
    // O default não pode ser bloquear: quem não passa a contagem é chamador
    // antigo, e a inferência é o comportamento útil.
    const v = resolverLojasDaAssinatura({ lojasDoCliente: JMJC })
    expect(v.origem).toBe("inferido")
  })
})

describe("precisaConfirmar", () => {
  it("só o inferido pede confirmação — explícito já é vínculo", () => {
    expect(precisaConfirmar({ origem: "inferido", storeIds: ["a"], candidatas: ["a"] })).toBe(true)
    expect(precisaConfirmar({ origem: "explicito", storeIds: ["a"], candidatas: ["a"] })).toBe(false)
    expect(precisaConfirmar({ origem: "nenhum", storeIds: [], candidatas: [] })).toBe(false)
  })
})

describe("explicarVinculo", () => {
  it("diz o que fazer, não o estado interno", () => {
    expect(explicarVinculo({ origem: "explicito", storeIds: ["a", "b"], candidatas: ["a", "b"] })).toBe(
      "2 lojas vinculadas",
    )
    expect(explicarVinculo({ origem: "explicito", storeIds: ["a"], candidatas: ["a"] })).toBe("1 loja vinculada")
    expect(explicarVinculo({ origem: "inferido", storeIds: ["a", "b", "c"], candidatas: ["a", "b", "c"] })).toBe(
      "3 lojas do cliente — confirme o vínculo",
    )
    expect(explicarVinculo({ origem: "inferido", storeIds: ["a"], candidatas: ["a"] })).toBe(
      "1 loja do cliente — confirme o vínculo",
    )
    expect(
      explicarVinculo({
        origem: "nenhum",
        storeIds: [],
        motivo: "cliente_tem_varias_assinaturas",
        candidatas: [],
      }),
    ).toBe("Cliente tem mais de uma assinatura — escolha as lojas desta")
    expect(
      explicarVinculo({ origem: "nenhum", storeIds: [], motivo: "assinatura_encerrada", candidatas: [] }),
    ).toBe("Assinatura encerrada")
    expect(explicarVinculo({ origem: "nenhum", storeIds: [], candidatas: [] })).toBe("Cliente sem loja ativa")
  })
})
