import { describe, it, expect } from "vitest"
import { aplicarGuards, ajustarPesoNoEscuro, parSobreviveAoFallback } from "./rules"
import type { TypographyDecision, SegundaFonte } from "./rules"
import type { TypographyOccurrence } from "./inventory"

const occ = (o: Partial<TypographyOccurrence> & { index: number }): TypographyOccurrence => ({
  blockIndex: 0,
  section: "hero",
  tag: "div",
  family: "Montserrat,Arial,Helvetica,sans-serif",
  sizePx: 20,
  weight: 400,
  uppercase: false,
  tracking: null,
  bg: "#FFFFFF",
  bgDark: false,
  isCta: false,
  soPontuacao: false,
  text: "texto",
  ...o,
})

const SERIF: SegundaFonte = {
  familia: "Playfair Display",
  onde: "destaque",
  classe: "serif",
  fallback: "Georgia, 'Times New Roman', serif",
}

const decisao = (ops: TypographyDecision["ops"], segunda: SegundaFonte | null = SERIF): TypographyDecision => ({
  segunda_fonte: segunda,
  justificativa: "teste",
  ops,
})

const OPTS = { classePrincipal: "sans", pesoMarca: 900 }

describe("par que sobrevive ao substituto", () => {
  it("sans + sans some para quem vê o fallback", () => {
    expect(parSobreviveAoFallback("sans", "sans")).toBe(false)
    expect(parSobreviveAoFallback("sans", "serif")).toBe(true)
  })

  it("recusa a segunda fonte inteira e esvazia as trocas de família", () => {
    const r = aplicarGuards(
      decisao([{ item: 0, fonte: "secundaria", motivo: "x" }], {
        ...SERIF,
        familia: "Sora",
        classe: "sans",
      }),
      [occ({ index: 0, sizePx: 40 })],
      OPTS,
    )
    expect(r.segundaFonte).toBeNull()
    expect(r.ops).toHaveLength(0)
    expect(r.segundaFonteRecusada).toContain("substituto")
  })
})

describe("onde a família pode entrar", () => {
  it("CTA nunca troca de família, mas mantém caixa e peso", () => {
    const r = aplicarGuards(
      decisao([{ item: 0, fonte: "secundaria", caixa: "alta", peso: 700, motivo: "x" }]),
      [occ({ index: 0, tag: "a", isCta: true, sizePx: 30 })],
      OPTS,
    )
    expect(r.ops[0].fonte).toBeUndefined()
    expect(r.ops[0]).toMatchObject({ caixa: "alta", peso: 700 })
    expect(r.descartadas[0].motivo).toContain("rótulo de link/botão")
  })

  it("abaixo de 16px a família não entra", () => {
    const r = aplicarGuards(
      decisao([{ item: 0, fonte: "secundaria", motivo: "x" }]),
      [occ({ index: 0, sizePx: 14 })],
      OPTS,
    )
    expect(r.ops).toHaveLength(0)
    expect(r.descartadas[0].motivo).toContain("piso de 16px")
  })

  it("ornamento (aspa decorativa) fica com a família do desenho", () => {
    const r = aplicarGuards(
      decisao([{ item: 0, fonte: "secundaria", motivo: "x" }]),
      [occ({ index: 0, sizePx: 52, soPontuacao: true, family: "Georgia" })],
      OPTS,
    )
    expect(r.ops).toHaveLength(0)
    expect(r.descartadas[0].motivo).toContain("ornamento")
  })

  it("teto de três ocorrências: a quarta perde a família", () => {
    const itens = [0, 1, 2, 3].map((i) => occ({ index: i, sizePx: 30 }))
    const r = aplicarGuards(
      decisao([0, 1, 2, 3].map((i) => ({ item: i, fonte: "secundaria" as const, motivo: "x" }))),
      itens,
      OPTS,
    )
    expect(r.ops.filter((o) => o.fonte === "secundaria")).toHaveLength(3)
    expect(r.descartadas.some((d) => d.motivo.includes("teto de 3"))).toBe(true)
  })

  it("segunda fonte que nenhuma op usou não entra no documento", () => {
    const r = aplicarGuards(
      decisao([{ item: 0, peso: 700, motivo: "x" }]),
      [occ({ index: 0, sizePx: 30 })],
      OPTS,
    )
    expect(r.segundaFonte).toBeNull()
    expect(r.segundaFonteRecusada).toContain("nenhuma ocorrência elegível")
  })
})

describe("peso", () => {
  it("o peso de marca só vale no maior título (o caso da Innova)", () => {
    const itens = [occ({ index: 0, sizePx: 56 }), occ({ index: 1, sizePx: 30 })]
    const r = aplicarGuards(
      decisao(
        [
          { item: 0, peso: 900, motivo: "maior título" },
          { item: 1, peso: 900, motivo: "CTA" },
        ],
        null,
      ),
      itens,
      OPTS,
    )
    expect(r.ops.find((o) => o.item === 0)?.peso).toBe(900)
    expect(r.ops.find((o) => o.item === 1)).toBeUndefined()
    expect(r.descartadas[0].motivo).toContain("só vale no maior título")
  })

  it("degrau a menos de 200 do já usado é colapsado no existente", () => {
    const r = aplicarGuards(
      decisao([{ item: 0, peso: 500, motivo: "x" }], null),
      [occ({ index: 0, sizePx: 30, weight: 400 })],
      OPTS,
    )
    expect(r.ops).toHaveLength(0)
    expect(r.descartadas[0].motivo).toContain("degrau desperdiçado")
  })

  it("peso fora da escala é descartado", () => {
    const r = aplicarGuards(
      decisao([{ item: 0, peso: 650, motivo: "x" }], null),
      [occ({ index: 0, sizePx: 30 })],
      OPTS,
    )
    expect(r.descartadas[0].motivo).toContain("fora da escala")
  })
})

describe("fundo escuro", () => {
  it("fino sobe, pesado em corpo grande desce, meio fica", () => {
    expect(ajustarPesoNoEscuro(300, 20, true)).toBe(400)
    expect(ajustarPesoNoEscuro(900, 30, true)).toBe(800)
    expect(ajustarPesoNoEscuro(900, 16, true)).toBe(900)
    expect(ajustarPesoNoEscuro(500, 30, true)).toBe(500)
    expect(ajustarPesoNoEscuro(900, 30, false)).toBe(900)
  })

  it("ajusta a op e registra o motivo", () => {
    const r = aplicarGuards(
      decisao([{ item: 0, peso: 900, motivo: "título" }], null),
      [occ({ index: 0, sizePx: 56, bg: "#1F1F1F", bgDark: true, weight: 400 })],
      { classePrincipal: "sans", pesoMarca: null },
    )
    expect(r.ops[0].peso).toBe(800)
    expect(r.descartadas[0].motivo).toContain("fundo escuro")
  })
})

describe("op inválida", () => {
  it("item fora do inventário é descartado", () => {
    const r = aplicarGuards(decisao([{ item: 99, peso: 700, motivo: "x" }], null), [occ({ index: 0 })], OPTS)
    expect(r.ops).toHaveLength(0)
    expect(r.descartadas[0].motivo).toContain("não existe")
  })

  it("tracking em formato inválido não entra", () => {
    const r = aplicarGuards(
      decisao([{ item: 0, tracking: "muito", caixa: "alta", motivo: "x" }], null),
      [occ({ index: 0 })],
      OPTS,
    )
    expect(r.ops[0].tracking).toBeUndefined()
    expect(r.ops[0].caixa).toBe("alta")
    expect(r.descartadas[0].motivo).toContain("tracking inválido")
  })

  it("op que não muda nada não vira escrita", () => {
    const r = aplicarGuards(
      decisao([{ item: 0, peso: 400, motivo: "x" }], null),
      [occ({ index: 0, weight: 400 })],
      OPTS,
    )
    expect(r.ops).toHaveLength(0)
    expect(r.descartadas.some((d) => d.motivo.includes("sem efeito"))).toBe(true)
  })
})

// ── Ops do humano: avisa e aplica ───────────────────────────────────────

import { avaliarOpsHumanas, ocorrenciasForaDaDominante } from "./rules"

const OCC_HUMANO: TypographyOccurrence[] = [
  {
    index: 0, blockIndex: 0, section: "hero", tag: "div", family: "Montserrat,Arial",
    sizePx: 56, weight: 900, uppercase: false, tracking: null, bg: "#FFFFFF",
    bgDark: false, isCta: false, soPontuacao: false, text: "TÍTULO",
  },
  {
    index: 1, blockIndex: 0, section: "hero", tag: "a", family: "Montserrat,Arial",
    sizePx: 15, weight: 700, uppercase: false, tracking: null, bg: "#07A55D",
    bgDark: false, isCta: true, soPontuacao: false, text: "SHOP NOW",
  },
]

describe("avaliarOpsHumanas", () => {
  it("aplica a troca de família no CTA, mas avisa que a casa rompe por caixa e peso", () => {
    const r = avaliarOpsHumanas([{ item: 1, familia: "Sora", motivo: "quero" }], OCC_HUMANO)
    expect(r.ops).toHaveLength(1)
    expect(r.ops[0].familia).toBe("Sora")
    expect(r.avisos.map((a) => a.motivo).join(" ")).toContain("rótulo de botão")
  })

  it("avisa sobre o piso de 16px sem descartar", () => {
    const r = avaliarOpsHumanas([{ item: 1, familia: "Lora", motivo: "x" }], OCC_HUMANO)
    expect(r.ops).toHaveLength(1)
    expect(r.avisos.some((a) => a.motivo.includes("16px"))).toBe(true)
  })

  it("avisa quando o par não sobrevive ao substituto", () => {
    const r = avaliarOpsHumanas([{ item: 0, familia: "Sora", motivo: "x" }], OCC_HUMANO, {
      classePrincipal: "sans",
    })
    expect(r.ops).toHaveLength(1)
    expect(r.avisos.some((a) => a.motivo.includes("substituto"))).toBe(true)
  })

  it("descarta o que o documento não consegue receber", () => {
    const r = avaliarOpsHumanas(
      [
        { item: 0, familia: 'Sora";x="', motivo: "x" },
        { item: 0, peso: 450, motivo: "x" },
        { item: 0, tamanho_px: 400, motivo: "x" },
        { item: 0, tracking: "muito", motivo: "x" },
        { item: 99, peso: 700, motivo: "x" },
      ],
      OCC_HUMANO,
    )
    expect(r.ops).toHaveLength(0)
    // Cada valor impossível é descartado pelo CAMPO; a op que fica sem nada
    // para mudar é descartada de novo como "op", com o motivo certo.
    expect(new Set(r.descartadas.map((d) => d.campo))).toEqual(
      new Set(["familia", "peso", "tamanho", "tracking", "op"]),
    )
    expect(r.descartadas.find((d) => d.campo === "familia")?.motivo).toContain("inválido")
  })

  it("aceita tamanho e caixa — o que o agente não pode pedir", () => {
    const r = avaliarOpsHumanas(
      [{ item: 0, tamanho_px: 40, caixa: "alta", motivo: "x" }],
      OCC_HUMANO,
    )
    expect(r.ops[0]).toMatchObject({ tamanho_px: 40, caixa: "alta" })
    expect(r.descartadas).toHaveLength(0)
  })
})

describe("ocorrenciasForaDaDominante", () => {
  it("conta as rupturas que o documento já carrega", () => {
    const comRuptura = [
      ...OCC_HUMANO,
      { ...OCC_HUMANO[0], index: 2, family: "'Playfair Display',Georgia" },
    ]
    expect(ocorrenciasForaDaDominante(comRuptura)).toBe(1)
    expect(ocorrenciasForaDaDominante(OCC_HUMANO)).toBe(0)
  })
})
