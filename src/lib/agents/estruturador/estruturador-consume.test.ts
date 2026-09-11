import { describe, it, expect } from "vitest"
import {
  aplicarEstruturadorNoBlueprint,
  DECISAO_MAX_CHARS,
  decisaoCompletaParaCurador,
  estruturaParaPosicoes,
  projetarNosSlots,
} from "./estruturador-consume"
import { clampStructure } from "../architect/outline-sections"
import type { EstruturadorOutput } from "./estruturador-prompt"

function output(): EstruturadorOutput {
  return {
    diagnostico: {
      objecao_dominante: "Eficácia",
      traducao_do_mecanismo: "Inspeção → demonstração",
    },
    estrutura: [
      { section: "hero", papel: "Entregar o cupom em 3s", referencia: "r", porque: "x" },
      {
        section: "body",
        papel: "O pivô que troca desconto por razão",
        referencia: "r",
        adaptacao: "troca a categoria pela rotina noturna",
        porque: "x",
      },
      { section: "footer", papel: "Rota de saída", referencia: "r", porque: "x" },
    ],
    fio_narrativo: "cupom → razão → saída",
    fontes: [],
    aprendizados_aplicados: [],
    text_only: false,
    descartes: [],
  }
}

describe("estruturaParaPosicoes", () => {
  it("mapeia section + label (papel) + papel completo com adaptação", () => {
    const pos = estruturaParaPosicoes(output())
    expect(pos.map((p) => p.section)).toEqual(["hero", "body", "footer"])
    expect(pos[0].label).toBe("Entregar o cupom em 3s")
    expect(pos[0].papel).toBe("Entregar o cupom em 3s")
    // Adaptação entra no papel completo, não no rótulo.
    expect(pos[1].papel).toContain("Adaptação: troca a categoria")
    expect(pos[1].label).not.toContain("Adaptação")
  })

  it("trunca o rótulo longo mas preserva o papel completo", () => {
    const o = output()
    o.estrutura[0].papel = "a".repeat(200)
    const pos = estruturaParaPosicoes(o)
    expect(pos[0].label.length).toBeLessThanOrEqual(90)
    expect(pos[0].label.endsWith("…")).toBe(true)
    expect(pos[0].papel).toHaveLength(200)
  })

  it("papel vazio cai no nome da seção como rótulo", () => {
    const o = output()
    o.estrutura[0].papel = "  "
    const pos = estruturaParaPosicoes(o)
    expect(pos[0].label).toBe("hero")
  })

  it("posições ricas sobrevivem ao clampStructure (genérico) com footer preservado", () => {
    const o = output()
    o.estrutura.splice(2, 0,
      { section: "products", papel: "Grade", referencia: "r", porque: "x" },
      { section: "reviews", papel: "Prova", referencia: "r", porque: "x" },
    )
    const pos = estruturaParaPosicoes(o) // hero, body, products, reviews, footer
    const clamped = clampStructure(pos, 3)
    expect(clamped.map((p) => p.section)).toEqual(["hero", "body", "footer"])
    // O papel viaja junto — structure e papéis saem da MESMA lista clampada.
    expect(clamped[1].papel).toContain("pivô")
  })
})

describe("decisaoCompletaParaCurador", () => {
  it("é o output INTEIRO em JSON: diagnóstico, posições com adaptação/porquê, fio, fontes, aprendizados, descartes", () => {
    const o = output()
    o.fontes = [{ ref: "avelmore-inspecao-antecipada", o_que_pegou: "arco", porque: "mecanismo transfere" }]
    o.aprendizados_aplicados = [{ slug: "prova-antes-do-cta", como: "reviews antes da grade" }]
    o.descartes = [{ section: "cta", papel_na_referencia: "CTA isolado", porque: "competiria com a grade", origem: "modelo" }]
    const r = decisaoCompletaParaCurador(o)
    const volta = JSON.parse(r) as typeof o
    expect(volta).toEqual(o)
    // Legível para o modelo: JSON indentado, não uma linha só.
    expect(r).toContain("\n  \"estrutura\": [")
    expect(r).toContain("troca a categoria pela rotina noturna")
    expect(r).toContain("competiria com a grade")
  })

  it("clamp de segurança com marcador quando o output é patológico", () => {
    const o = output()
    o.estrutura[0].papel = "x".repeat(DECISAO_MAX_CHARS)
    const r = decisaoCompletaParaCurador(o)
    expect(r.length).toBeLessThan(DECISAO_MAX_CHARS + 200)
    expect(r).toContain("decisão truncada")
  })
})

type BlocoDeTeste = {
  type: string
  purpose: string
  papel?: string | null
  requisitos?: unknown
  fields?: Array<{ key: string; type: string; required: boolean; omitir?: boolean; omitir_motivo?: string }>
}

describe("aplicarEstruturadorNoBlueprint", () => {
  const bp = (): {
    objective: string
    messaging: string
    fio_narrativo?: string | null
    blocks: BlocoDeTeste[]
  } => ({
    objective: "obj",
    messaging: "msg",
    blocks: [
      { type: "hero", purpose: "Diretiva da variante hero" },
      { type: "text", purpose: "" },
      { type: "footer", purpose: "Rodapé legal" },
    ],
  })

  it("papel vira 1ª linha do purpose e a diretiva original vira Forma", () => {
    const r = aplicarEstruturadorNoBlueprint(bp(), ["Abrir o arco", "O pivô", "Saída"], "fio")
    expect(r.blocks[0].purpose).toBe(
      "Abrir o arco\n\nForma (variante, subordinada ao papel): Diretiva da variante hero",
    )
    expect(r.blocks[0].papel).toBe("Abrir o arco")
    // Bloco sem purpose original: papel puro, sem sufixo vazio.
    expect(r.blocks[1].purpose).toBe("O pivô")
    expect(r.fio_narrativo).toBe("fio")
  })

  it("não muta o input", () => {
    const original = bp()
    aplicarEstruturadorNoBlueprint(original, ["a", "b", "c"], "fio")
    expect(original.blocks[0].purpose).toBe("Diretiva da variante hero")
  })

  // 07/09: o Curador rankeou 1 de 6 posições, sobrou o rodapé, e o papel da
  // posição 0 (a hero) foi colado nele por índice. Comprimento diferente
  // significa que alguma posição caiu — o alinhamento não existe mais.
  it("comprimento divergente NÃO cola papel, e o fio sobrevive", () => {
    const r = aplicarEstruturadorNoBlueprint(bp(), ["Papel da hero"], "fio")
    expect(r.blocks[0].purpose).toBe("Diretiva da variante hero")
    expect(r.blocks[2].purpose).toBe("Rodapé legal")
    expect(r.blocks.some((b) => b.purpose.includes("Papel da hero"))).toBe(false)
    expect(r.fio_narrativo).toBe("fio")
  })

  it("fio vazio persiste como null", () => {
    const r = aplicarEstruturadorNoBlueprint(bp(), [], "   ")
    expect(r.fio_narrativo).toBeNull()
  })
})

// ── Intenção humana (Arquitetura) × papel do agente (02/09) ─────────────
import { arbitrarCampos, combinarIntencaoComPapel, requisitosDaDecisao } from "./estruturador-consume"

describe("combinarIntencaoComPapel", () => {
  it("intenção vem PRIMEIRO; o papel do agente entra embaixo como detalhe", () => {
    expect(
      combinarIntencaoComPapel("Atacar a objeção 'funciona?'", "Provar o mecanismo com a tese técnica."),
    ).toBe("Atacar a objeção 'funciona?'\n\nPapel (Curador): Provar o mecanismo com a tese técnica.")
  })
  it("sem agente fica só a intenção; sem intenção fica só o papel; nada → null", () => {
    expect(combinarIntencaoComPapel("  só a intenção ", null)).toBe("só a intenção")
    expect(combinarIntencaoComPapel("", "papel do agente")).toBe("papel do agente")
    expect(combinarIntencaoComPapel(null, "   ")).toBeNull()
  })
})

describe("requisitosDaDecisao (09/09)", () => {
  it("extrai por posição do JSON serializado; posição sem requisito → null; JSON ruim → vazio", () => {
    const json = JSON.stringify({ estrutura: [{ section: "hero", papel: "x", requisitos: { cupom: false } }, { section: "body", papel: "y" }] })
    const r = requisitosDaDecisao(json)
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ cupom: false })
    expect(r[1]).toBeNull()
    expect(requisitosDaDecisao(null)).toEqual([])
    expect(requisitosDaDecisao("prosa")).toEqual([])
    expect(requisitosDaDecisao('{"x":1}')).toEqual([])
    // decisão truncada pelo teto de chars ainda tenta o JSON legível
    expect(requisitosDaDecisao(json + "\n(… decisão truncada)")).toHaveLength(2)
  })
})

describe("arbitrarCampos + requisitos no blueprint (09/09)", () => {
  const f = (key: string, extra: Record<string, unknown> = {}) => ({ key, type: "text_short", required: false, ...extra })
  const heroFields = [f("headline_l1"), f("coupon_line"), f("cta_label"), f("hero_flatlay_kit", { type: "image" })]

  it("o caso da Hero Boxers: cupom e CTA negados saem do contrato; imagem e headline ficam", () => {
    const r = arbitrarCampos(heroFields, { cupom: false, cta: false, n_itens: null, preco: null, avaliacao: null, campos: [], imagem: null, exige: [] })
    expect(r.map((x) => [x.key, x.omitir ?? false])).toEqual([
      ["headline_l1", false],
      ["coupon_line", true],
      ["cta_label", true],
      ["hero_flatlay_kit", false],
    ])
    expect(r[1].omitir_motivo).toContain("cupom negado")
  })

  // O schema REAL da products-4 (a única variante de products com preço da
  // biblioteca, 11/09): `price_old` riscado e `badge_deadline` só existem
  // para sustentar uma promoção. A posição pedia `preco: true` E
  // `cupom: false` — mostrar o preço, sem oferta. Sem esta arbitragem,
  // aceitar a variante entregaria um "de/por" e um prazo INVENTADOS, que é
  // pior que a seção faltando.
  it("sem oferta: preço riscado e prazo saem; o preço vigente fica", () => {
    const fields = [
      f("product_name"),
      f("price_old"),
      f("price_new"),
      f("badge_deadline"),
      f("cta_label"),
    ]
    const r = arbitrarCampos(fields, { cupom: false, cta: true, n_itens: null, preco: true, avaliacao: null, campos: [], imagem: null, exige: [] })
    expect(r.filter((x) => x.omitir).map((x) => x.key)).toEqual(["price_old", "badge_deadline"])
    expect(r.find((x) => x.key === "price_new")?.omitir ?? false).toBe(false)
    expect(r.find((x) => x.key === "price_old")?.omitir_motivo).toContain("preço anterior riscado")
  })

  // `cupom` é o sinal de "sem oferta" por posição. Com oferta declarada, o
  // "de/por" e o prazo são legítimos e não podem ser apagados.
  it("com oferta, preço riscado e prazo ficam", () => {
    const fields = [f("price_old"), f("badge_deadline")]
    const r = arbitrarCampos(fields, { cupom: true, cta: null, n_itens: null, preco: true, avaliacao: null, campos: [], imagem: null, exige: [] })
    expect(r.filter((x) => x.omitir)).toEqual([])
  })

  it("item além do máximo é omitido; required omitido declara incompatibilidade dura; sem requisito nada muda", () => {
    const fields = [f("product_1_name"), f("product_2_name"), f("product_3_name", { required: true }), f("product_cta_label_3")]
    const r = arbitrarCampos(fields, { cupom: null, cta: null, n_itens: { min: 2, max: 2 }, preco: null, avaliacao: null, campos: [], imagem: null, exige: [] })
    expect(r.filter((x) => x.omitir).map((x) => x.key)).toEqual(["product_3_name", "product_cta_label_3"])
    expect(r[2].omitir_motivo).toContain("incompatibilidade dura")
    expect(arbitrarCampos(fields, null)).toBe(fields)
  })

  it("aplicarEstruturadorNoBlueprint grava papel, requisitos e os campos omitidos por posição", () => {
    const bp: { objective: string; messaging: string; blocks: BlocoDeTeste[] } = {
      objective: "o",
      messaging: "m",
      blocks: [
        { type: "hero", purpose: "Forma hero", fields: heroFields },
        { type: "footer", purpose: "Rodapé" },
      ],
    }
    const req = { cupom: false, cta: false, n_itens: null, preco: null, avaliacao: null, campos: [], imagem: null, exige: [] }
    const r = aplicarEstruturadorNoBlueprint(bp, ["Apresenta a marca", "Fecha"], "fio", [req, null])
    expect(r.blocks[0].requisitos).toEqual(req)
    expect(r.blocks[0].fields?.filter((x) => x.omitir).map((x) => x.key)).toEqual(["coupon_line", "cta_label"])
    expect(r.blocks[1].requisitos).toBeUndefined()
    expect(r.blocks[1].papel).toBe("Fecha")
    // Desalinhado: nada é aplicado, nem requisitos.
    const r2 = aplicarEstruturadorNoBlueprint(bp, ["só um"], "fio", [req])
    expect(r2.blocks[0].fields?.some((x) => x.omitir)).toBe(false)
  })
})

// O caso Hero Boxers (09/09, welcome 1): a biblioteca não tinha `products`
// com 2 slots e preço, a posição caiu, e 6 papéis chegaram para 5 blocos —
// `aplicarEstruturadorNoBlueprint` recusou o lote INTEIRO e a copy saiu do
// `copy_guidance` da variante (pitch de gift card com "SHOP 10% OFF" numa
// loja sem incentivo).
describe("projetarNosSlots (09/09)", () => {
  const slots = [
    { kind: "variant" },
    { kind: "variant" },
    { kind: "variant" },
    { kind: "variant" },
    { kind: "missing" }, // products: zero candidatas
    { kind: "variant" },
  ]

  it("descarta a posição sem variante e mantém as outras NA ORDEM", () => {
    const papeis = ["hero", "origem", "competencia", "confianca", "produtos", "footer"]
    const r = projetarNosSlots(papeis, slots)
    expect(r.itens).toEqual(["hero", "origem", "competencia", "confianca", "footer"])
    expect(r.descartados).toEqual([4])
  })

  it("o resultado passa no guard de comprimento e o papel cola na posição certa", () => {
    const papeis = ["hero", "origem", "competencia", "confianca", "produtos", "footer"]
    const blueprint = {
      blocks: [
        { purpose: "forma hero" },
        { purpose: "forma body" },
        { purpose: "forma body" },
        { purpose: "forma body" },
        { purpose: "forma footer" },
      ],
    }
    // Sem a projeção: 6 papéis × 5 blocos → nenhum papel entra.
    const semProjecao = aplicarEstruturadorNoBlueprint(blueprint, papeis, "fio")
    expect(semProjecao.blocks.every((b) => b.purpose.startsWith("forma"))).toBe(true)

    const comProjecao = aplicarEstruturadorNoBlueprint(
      blueprint,
      projetarNosSlots(papeis, slots).itens,
      "fio",
    )
    expect(comProjecao.blocks.map((b) => b.purpose.split("\n")[0])).toEqual([
      "hero",
      "origem",
      "competencia",
      "confianca",
      "footer",
    ])
  })

  it("requisitos seguem os papéis pelo mesmo índice", () => {
    const requisitos = [{ cta: true }, null, null, null, { preco: true }, null]
    expect(projetarNosSlots(requisitos, slots).itens).toEqual([
      { cta: true },
      null,
      null,
      null,
      null,
    ])
  })

  it("sem slots, ou contagem divergente, devolve a lista intacta — o guard decide", () => {
    const papeis = ["a", "b", "c"]
    expect(projetarNosSlots(papeis, null).itens).toEqual(papeis)
    expect(projetarNosSlots(papeis, [{ kind: "variant" }]).itens).toEqual(papeis)
    expect(projetarNosSlots(papeis, null).descartados).toEqual([])
  })

  it("todas as posições com variante: nada muda e nada é descartado", () => {
    const papeis = ["a", "b"]
    const r = projetarNosSlots(papeis, [{ kind: "variant" }, { kind: "variant" }])
    expect(r.itens).toEqual(papeis)
    expect(r.descartados).toEqual([])
  })
})
