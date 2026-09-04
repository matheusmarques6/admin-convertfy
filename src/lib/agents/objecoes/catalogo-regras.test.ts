import { describe, it, expect } from "vitest"
import {
  importarLegado,
  marcarVerificadoPorEdicao,
  normalizarCatalogo,
  objecoesElegiveisNoFlow,
  projetarObjecoes,
  validarCatalogo,
} from "./catalogo-regras"

function objecao(over: Record<string, unknown> = {}) {
  return {
    objecao: "Marca nova, não conheço. Como sei que a qualidade é boa?",
    tipo_de_risco: "desempenho",
    dimensao_confianca: "competencia",
    aliviador: "prova_de_terceiro",
    tratamento: "Três reviews com foto do produto recebido",
    dominante_da_categoria: true,
    flows_elegiveis: ["welcome", "abandoned_cart"],
    lastro_operacional: { afirmacao: "ter 3 reviews reais com foto", campo_de_origem: "reviews", verificado: true },
    severidade: 4,
    evidencia: "trecho literal",
    confianca: "alta",
    ...over,
  }
}

function catalogoValido() {
  return normalizarCatalogo({
    objecoes: [
      objecao(),
      objecao({ objecao: "Vale o que custa?", tipo_de_risco: "financeiro", aliviador: "comparacao_de_categoria", dominante_da_categoria: false }),
      objecao({ objecao: "E se não servir?", tipo_de_risco: "adequacao", aliviador: "garantia_de_devolucao", dominante_da_categoria: false }),
      objecao({ objecao: "Esse site é seguro?", tipo_de_risco: "seguranca", aliviador: "reputacao_da_loja", dominante_da_categoria: false }),
    ],
    veiculos_de_argumento: {
      origem_da_marca: { texto: null, aplicavel: false, verificado: true },
      economia_do_preco: { texto: "sem loja física", campo_de_origem: "brand_thesis" },
    },
    medos_de_categoria: [{ medo: "falsificação", marca_esta_fora_porque: "fotos reais" }],
    incentivo: { existe: null },
    cobertura: { tipos_cobertos: ["desempenho", "financeiro"], lacunas: ["nenhuma objeção de tempo"] },
    descartadas: [{ texto: "já tenho sandálias suficientes", motivo: "dor" }],
  })
}

describe("normalizarCatalogo", () => {
  it("ids são atribuídos por código, verificado nasce false, veículos ausentes viram vazios", () => {
    const c = catalogoValido()
    expect(c.objecoes.map((o) => o.id)).toEqual(["obj_1", "obj_2", "obj_3", "obj_4"])
    // O modelo mandou verificado:true — o código força false (regra 7).
    expect(c.objecoes.every((o) => o.lastro_operacional.verificado === false)).toBe(true)
    expect(c.veiculos_de_argumento.origem_da_marca.aplicavel).toBe(false)
    expect(c.veiculos_de_argumento.origem_da_marca.verificado).toBe(false)
    expect(c.veiculos_de_argumento.operacao_por_pedido).toEqual({
      texto: null, aplicavel: true, campo_de_origem: null, verificado: false, alerta: null,
    })
    expect(c.incentivo.existe).toBeNull()
  })

  it("sem evidência a confiança cai para baixa; severidade é clampada 1–5", () => {
    const c = normalizarCatalogo({ objecoes: [objecao({ evidencia: null, confianca: "alta", severidade: 9 })] })
    expect(c.objecoes[0].confianca).toBe("baixa")
    expect(c.objecoes[0].severidade).toBe(5)
  })

  it("valor fora do vocabulário vira null (e reprova na validação), nunca string solta", () => {
    const c = normalizarCatalogo({ objecoes: [objecao({ tipo_de_risco: "medo", aliviador: "prova social" })] })
    expect(c.objecoes[0].tipo_de_risco).toBeNull()
    expect(c.objecoes[0].aliviador).toBeNull()
    expect(validarCatalogo(c).join("\n")).toMatch(/tipo_de_risco ausente/)
  })

  it("nunca lança com entrada lixo", () => {
    expect(normalizarCatalogo(null).objecoes).toEqual([])
    expect(normalizarCatalogo("x").objecoes).toEqual([])
  })
})

describe("validarCatalogo", () => {
  it("catálogo completo passa", () => {
    expect(validarCatalogo(catalogoValido())).toEqual([])
  })

  it("menos de 4 objeções reprova com a regra na mensagem", () => {
    const c = normalizarCatalogo({ objecoes: [objecao(), objecao()] })
    expect(validarCatalogo(c).some((e) => e.includes("entre 4 e 8"))).toBe(true)
  })

  it("mesmo risco + mesmo aliviador em duas objeções → funda", () => {
    const c = catalogoValido()
    c.objecoes[1] = { ...c.objecoes[1], tipo_de_risco: "desempenho", aliviador: "prova_de_terceiro" }
    expect(validarCatalogo(c).join("\n")).toMatch(/obj_1 e obj_2: mesmo tipo_de_risco E mesmo aliviador/)
  })

  it("aliviador incompatível com o risco reprova (prova social não resolve pagamento)", () => {
    const c = catalogoValido()
    c.objecoes[3] = { ...c.objecoes[3], tipo_de_risco: "seguranca", aliviador: "prova_de_terceiro" }
    expect(validarCatalogo(c).join("\n")).toMatch(/não serve ao risco "seguranca"/)
  })

  it("duas dominantes reprova; incentivo existe=true sem código/valor reprova", () => {
    const c = catalogoValido()
    c.objecoes[1] = { ...c.objecoes[1], dominante_da_categoria: true }
    c.incentivo = { ...c.incentivo, existe: true }
    const erros = validarCatalogo(c).join("\n")
    expect(erros).toMatch(/no máximo UMA/)
    expect(erros).toMatch(/incentivo.existe=true sem codigo nem valor/)
  })
})

describe("projeção, legado e edição humana", () => {
  it("projetarObjecoes devolve o formato antigo [{objection, treatment}]", () => {
    expect(projetarObjecoes(catalogoValido())[0]).toEqual({
      objection: "Marca nova, não conheço. Como sei que a qualidade é boa?",
      treatment: "Três reviews com foto do produto recebido",
    })
  })

  it("importarLegado não inventa tipagem", () => {
    const c = importarLegado([{ objection: "É golpe?", treatment: "reviews reais" }, { objection: " ", treatment: "x" }])
    expect(c.objecoes).toHaveLength(1)
    expect(c.objecoes[0]).toMatchObject({ id: "obj_1", tipo_de_risco: null, aliviador: null, confianca: "baixa" })
    expect(c.objecoes[0].lastro_operacional.campo_de_origem).toBe("legado")
  })

  it("edição humana marca verificado na objeção que casa (sem acento/caixa) e leva o tratamento novo", () => {
    const { catalogo, tocadas } = marcarVerificadoPorEdicao(catalogoValido(), [
      { objection: "MARCA NOVA, nao conheco. Como sei que a qualidade e boa?", treatment: "Reviews com foto + close da costura" },
      { objection: "objeção que não existe no catálogo", treatment: "x" },
    ])
    expect(tocadas).toBe(1)
    expect(catalogo.objecoes[0].lastro_operacional.verificado).toBe(true)
    expect(catalogo.objecoes[0].tratamento).toBe("Reviews com foto + close da costura")
    expect(catalogo.objecoes[1].lastro_operacional.verificado).toBe(false)
  })

  it("objecoesElegiveisNoFlow filtra por flows_elegiveis", () => {
    const c = catalogoValido()
    c.objecoes[2] = { ...c.objecoes[2], flows_elegiveis: ["win_back"] }
    expect(objecoesElegiveisNoFlow(c, "welcome").map((o) => o.id)).toEqual(["obj_1", "obj_2", "obj_4"])
  })
})
