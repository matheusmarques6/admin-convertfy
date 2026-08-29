import { describe, expect, it } from "vitest"
import {
  categoryOfBlockType,
  delayLabel,
  guidesToText,
  mergeBlocks,
  mergeRows,
  splitRow,
  textToGuides,
} from "./merge"
import type {
  EmailArchitectureRow,
  FlowTemplateRow,
  RawBlueprint,
  RawOutline,
} from "./types"

const ft = (
  flow_type: string,
  email_number: number,
  over: Partial<FlowTemplateRow> = {},
): FlowTemplateRow => ({
  id: `ft-${flow_type}-${email_number}`,
  flow_type,
  email_number,
  name: `${flow_type} ${email_number}`,
  delay_hours: 24,
  is_active: true,
  updated_at: null,
  ...over,
})

const bp = (
  flow_type: string,
  email_number: number,
  over: Partial<RawBlueprint> = {},
): RawBlueprint => ({
  id: `bp-${flow_type}-${email_number}`,
  flow_type,
  email_number,
  objective: "Intenção do blueprint",
  messaging: "Mensagem do blueprint",
  subject_hint: null,
  blocks: [],
  tone_override: null,
  text_only: false,
  updated_at: null,
  ...over,
})

const ol = (
  flow_type: string,
  email_number: number,
  over: Partial<RawOutline> = {},
): RawOutline => ({
  id: `ol-${flow_type}-${email_number}`,
  flow_type,
  email_number,
  objective: "Intenção do outline",
  guidance: null,
  restrictions: null,
  suggested_blocks: [],
  tone_hint: null,
  coupon_code: null,
  is_active: true,
  ...over,
})

describe("textToGuides / guidesToText", () => {
  it("quebra por linha, sem vazias nem espaço sobrando", () => {
    expect(textToGuides("  Mostrar o produto \n\n  Reforçar o frete  \n")).toEqual([
      "Mostrar o produto",
      "Reforçar o frete",
    ])
  })

  it("null e string vazia viram lista vazia", () => {
    expect(textToGuides(null)).toEqual([])
    expect(textToGuides("   \n  ")).toEqual([])
  })

  it("lista vazia volta como null — a coluna é nullable", () => {
    expect(guidesToText([])).toBeNull()
    expect(guidesToText(["  ", ""])).toBeNull()
  })

  it("ida e volta preserva as diretrizes", () => {
    const lines = ["Mostrar o produto abandonado", "Terminar com convite leve"]
    expect(textToGuides(guidesToText(lines))).toEqual(lines)
  })
})

describe("categoryOfBlockType", () => {
  it("categoria passa direto", () => {
    expect(categoryOfBlockType("offer")).toBe("offer")
    expect(categoryOfBlockType("reviews")).toBe("reviews")
  })

  it("tipo técnico traduz para a categoria da biblioteca", () => {
    expect(categoryOfBlockType("coupon")).toBe("offer")
    expect(categoryOfBlockType("testimonials")).toBe("reviews")
    expect(categoryOfBlockType("text")).toBe("body")
    expect(categoryOfBlockType("letter")).toBe("body")
  })

  it("tipo desconhecido cai em body em vez de sumir", () => {
    // divider/spacer são estruturais e não têm categoria — o bloco precisa
    // continuar existindo na tela, senão some da sequência sem aviso.
    expect(categoryOfBlockType("divider")).toBe("body")
    expect(categoryOfBlockType("coisa-que-nao-existe")).toBe("body")
  })
})

describe("mergeBlocks", () => {
  it("blueprint manda na sequência e o extra do outline é reportado", () => {
    // Caso real: abandoned_cart #1 — o outline tem um `cta` a mais.
    const { blocks, outlineExtras } = mergeBlocks(
      "abandoned_cart",
      1,
      [
        { type: "hero", label: "Hero", purpose: "p" },
        { type: "products", label: "Produtos", purpose: "p" },
        { type: "coupon", label: "Cupom", purpose: "p" },
        { type: "testimonials", label: "Depoimentos", purpose: "p" },
        { type: "text", label: "Texto", purpose: "p" },
        { type: "footer", label: "Rodapé", purpose: "p" },
      ],
      ["hero", "products", "offer", "reviews", "body", "cta", "footer"],
    )
    expect(blocks.map((b) => b.category)).toEqual([
      "hero",
      "products",
      "offer",
      "reviews",
      "body",
      "footer",
    ])
    expect(outlineExtras).toEqual(["cta"])
  })

  it("conta por multiconjunto, não por posição", () => {
    // As MESMAS categorias em ordem diferente não geram extra nenhum.
    const { outlineExtras } = mergeBlocks(
      "welcome",
      2,
      [
        { type: "hero", label: "", purpose: "" },
        { type: "coupon", label: "", purpose: "" },
      ],
      ["offer", "hero"],
    )
    expect(outlineExtras).toEqual([])
  })

  it("blueprint vazio: o outline vira a sequência", () => {
    const { blocks, outlineExtras } = mergeBlocks("welcome", 8, [], [
      "hero",
      "body",
      "footer",
    ])
    expect(blocks.map((b) => b.category)).toEqual(["hero", "body", "footer"])
    expect(blocks.every((b) => b.purpose === "")).toBe(true)
    expect(outlineExtras).toEqual([])
  })

  it("guarda o tipo técnico só quando ele não é a própria categoria", () => {
    const { blocks } = mergeBlocks(
      "welcome",
      1,
      [
        { type: "coupon", label: "", purpose: "" },
        { type: "hero", label: "", purpose: "" },
      ],
      [],
    )
    expect(blocks[0].legacy_type).toBe("coupon")
    expect(blocks[1].legacy_type).toBeNull()
  })

  it("id é único dentro da linha mesmo com a categoria repetida", () => {
    const { blocks } = mergeBlocks(
      "welcome",
      1,
      [
        { type: "products", label: "", purpose: "" },
        { type: "cta", label: "", purpose: "" },
        { type: "products", label: "", purpose: "" },
      ],
      [],
    )
    expect(new Set(blocks.map((b) => b.id)).size).toBe(3)
  })

  it("blocks/suggested inválidos não derrubam o merge", () => {
    const { blocks, outlineExtras } = mergeBlocks(
      "welcome",
      1,
      null as never,
      [null, 42, "  ", "hero"] as never,
    )
    expect(blocks.map((b) => b.category)).toEqual(["hero"])
    expect(outlineExtras).toEqual([])
  })
})

describe("mergeRows", () => {
  it("junta as três fontes numa linha só", () => {
    const [row] = mergeRows(
      [ft("welcome", 1, { name: "Boas-vindas", delay_hours: 0 })],
      [
        bp("welcome", 1, {
          objective: "Apresentar a marca",
          subject_hint: "Bem-vindo!",
          text_only: false,
          blocks: [{ type: "hero", label: "Hero", purpose: "Banner" }],
        }),
      ],
      [
        ol("welcome", 1, {
          guidance: "Mostrar o produto\nReforçar o frete",
          restrictions: "Não oferecer desconto",
          coupon_code: "BEMVINDO10",
          suggested_blocks: ["hero"],
        }),
      ],
    )
    expect(row.name).toBe("Boas-vindas")
    expect(row.delay_hours).toBe(0)
    expect(row.intent).toBe("Apresentar a marca")
    expect(row.should).toEqual(["Mostrar o produto", "Reforçar o frete"])
    expect(row.should_not).toEqual(["Não oferecer desconto"])
    expect(row.coupon_code).toBe("BEMVINDO10")
    expect(row.subject_hint).toBe("Bem-vindo!")
    expect(row.blocks).toHaveLength(1)
    expect(row.outline_extras).toEqual([])
  })

  it("intenção: o blueprint vence, como no payload de copy", () => {
    const [row] = mergeRows(
      [ft("welcome", 1)],
      [bp("welcome", 1, { objective: "Do blueprint" })],
      [ol("welcome", 1, { objective: "Do outline" })],
    )
    expect(row.intent).toBe("Do blueprint")
  })

  it("intenção cai no outline quando o blueprint está em branco", () => {
    const [row] = mergeRows(
      [ft("welcome", 1)],
      [bp("welcome", 1, { objective: "   " })],
      [ol("welcome", 1, { objective: "Do outline" })],
    )
    expect(row.intent).toBe("Do outline")
  })

  it('"deve": guidance vence, messaging é o fallback', () => {
    const [comGuidance] = mergeRows(
      [ft("welcome", 1)],
      [bp("welcome", 1, { messaging: "Da messaging" })],
      [ol("welcome", 1, { guidance: "Da guidance" })],
    )
    expect(comGuidance.should).toEqual(["Da guidance"])

    const [semGuidance] = mergeRows(
      [ft("welcome", 1)],
      [bp("welcome", 1, { messaging: "Da messaging" })],
      [ol("welcome", 1, { guidance: null })],
    )
    expect(semGuidance.should).toEqual(["Da messaging"])
  })

  it("e-mail fora da régua ainda aparece, para poder ser removido", () => {
    const rows = mergeRows([ft("welcome", 1)], [bp("welcome", 9)], [])
    expect(rows.map((r) => r.email_number)).toEqual([1, 9])
  })

  it("ordena por fluxo e número", () => {
    const rows = mergeRows(
      [ft("welcome", 2), ft("abandoned_cart", 1), ft("welcome", 1)],
      [],
      [],
    )
    expect(rows.map((r) => `${r.flow_type}#${r.email_number}`)).toEqual([
      "abandoned_cart#1",
      "welcome#1",
      "welcome#2",
    ])
  })

  it("linha só na régua nasce vazia e editável", () => {
    const [row] = mergeRows([ft("welcome", 3, { name: "Novo" })], [], [])
    expect(row.intent).toBe("")
    expect(row.blocks).toEqual([])
    expect(row.text_only).toBe(false)
    expect(row.blueprint_id).toBeNull()
    expect(row.outline_id).toBeNull()
  })
})

describe("splitRow", () => {
  const row = (over: Partial<EmailArchitectureRow> = {}): EmailArchitectureRow => ({
    flow_type: "welcome",
    email_number: 1,
    name: "Boas-vindas",
    delay_hours: 0,
    is_active: true,
    intent: "Apresentar a marca",
    should: ["Mostrar o produto"],
    should_not: ["Não falar de preço"],
    blocks: [
      {
        id: "b1",
        category: "hero",
        label: "Hero",
        purpose: "Banner",
        needs_image: true,
        image_brief: "Fachada da loja",
        legacy_type: null,
      },
    ],
    outline_extras: [],
    subject_hint: "Bem-vindo!",
    tone: "aspiracional",
    coupon_code: "bemvindo10",
    text_only: false,
    blueprint_id: null,
    outline_id: null,
    flow_template_id: null,
    updated_at: null,
    ...over,
  })

  it("escreve a mesma intenção e diretriz nas duas tabelas", () => {
    const s = splitRow(row())
    expect(s.blueprint.objective).toBe("Apresentar a marca")
    expect(s.outline.objective).toBe("Apresentar a marca")
    expect(s.blueprint.messaging).toBe("Mostrar o produto")
    expect(s.outline.guidance).toBe("Mostrar o produto")
    expect(s.outline.restrictions).toBe("Não falar de preço")
  })

  it("messaging nunca fica null — a coluna é NOT NULL", () => {
    expect(splitRow(row({ should: [] })).blueprint.messaging).toBe(
      "Apresentar a marca",
    )
    expect(splitRow(row({ should: [], intent: "" })).blueprint.messaging).toBe("")
  })

  it("suggested_blocks sai das categorias da sequência", () => {
    const s = splitRow(
      row({
        blocks: [
          { id: "1", category: "hero", label: "", purpose: "", needs_image: false, image_brief: null },
          { id: "2", category: "offer", label: "", purpose: "", needs_image: false, image_brief: null },
        ],
      }),
    )
    expect(s.outline.suggested_blocks).toEqual(["hero", "offer"])
    // A categoria é block_type válido desde a 20261090 — vai direto.
    expect(s.blueprint.blocks.map((b) => b.type)).toEqual(["hero", "offer"])
  })

  it("preserva o tipo técnico enquanto a categoria não muda", () => {
    const base = {
      id: "1",
      label: "",
      purpose: "",
      needs_image: false,
      image_brief: null,
      legacy_type: "coupon",
    }
    // Categoria intacta → mantém `coupon`, sem reescrever histórico.
    expect(
      splitRow(row({ blocks: [{ ...base, category: "offer" }] })).blueprint
        .blocks[0].type,
    ).toBe("coupon")
    // Curador trocou a categoria → o legado deixa de valer.
    expect(
      splitRow(row({ blocks: [{ ...base, category: "products" }] })).blueprint
        .blocks[0].type,
    ).toBe("products")
  })

  it("label vazio cai na categoria, e o cupom sobe pra maiúscula", () => {
    const s = splitRow(
      row({
        blocks: [
          { id: "1", category: "hero", label: "  ", purpose: "", needs_image: false, image_brief: null },
        ],
      }),
    )
    expect(s.blueprint.blocks[0].label).toBe("hero")
    expect(s.outline.coupon_code).toBe("BEMVINDO10")
  })

  it("image_brief em branco vira null", () => {
    const s = splitRow(
      row({
        blocks: [
          { id: "1", category: "hero", label: "H", purpose: "", needs_image: true, image_brief: "   " },
        ],
      }),
    )
    expect(s.blueprint.blocks[0].image_brief).toBeNull()
  })

  it("delay negativo ou quebrado é saneado", () => {
    expect(splitRow(row({ delay_hours: -5 })).flowTemplate.delay_hours).toBe(0)
    expect(splitRow(row({ delay_hours: 2.7 })).flowTemplate.delay_hours).toBe(2)
    expect(
      splitRow(row({ delay_hours: NaN as never })).flowTemplate.delay_hours,
    ).toBe(0)
  })

  it("nome vazio cai num rótulo derivado, nunca em string vazia", () => {
    expect(splitRow(row({ name: "   " })).flowTemplate.name).toBe("welcome 1")
  })
})

describe("ida e volta", () => {
  it("linha alinhada sobrevive ao ciclo merge → split → merge", () => {
    const flowTemplates = [ft("welcome", 1, { name: "Boas-vindas", delay_hours: 0 })]
    const blueprints = [
      bp("welcome", 1, {
        objective: "Apresentar a marca",
        messaging: "Mostrar o produto",
        subject_hint: "Bem-vindo!",
        tone_override: "aspiracional",
        text_only: true,
        blocks: [
          { type: "hero", label: "Hero", purpose: "Banner", needs_image: true, image_brief: "Fachada" },
          { type: "coupon", label: "Cupom", purpose: "Código", needs_image: false, image_brief: null },
        ],
      }),
    ]
    const outlines = [
      ol("welcome", 1, {
        objective: "Apresentar a marca",
        guidance: "Mostrar o produto",
        restrictions: "Não falar de preço",
        suggested_blocks: ["hero", "offer"],
        coupon_code: "BEMVINDO10",
      }),
    ]

    const [antes] = mergeRows(flowTemplates, blueprints, outlines)
    const s = splitRow(antes)
    const [depois] = mergeRows(
      [{ ...flowTemplates[0], ...s.flowTemplate }],
      [{ ...blueprints[0], ...s.blueprint }],
      [{ ...outlines[0], ...s.outline }],
    )

    expect(depois).toEqual(antes)
  })

  it("linha divergente converge para a sequência do blueprint", () => {
    // O `cta` sobrando no outline é reportado na 1ª passada e some na 2ª,
    // porque a gravação normaliza suggested_blocks pela sequência.
    const flowTemplates = [ft("abandoned_cart", 1)]
    const blueprints = [
      bp("abandoned_cart", 1, {
        blocks: [
          { type: "hero", label: "H", purpose: "" },
          { type: "footer", label: "F", purpose: "" },
        ],
      }),
    ]
    const outlines = [
      ol("abandoned_cart", 1, { suggested_blocks: ["hero", "cta", "footer"] }),
    ]

    const [antes] = mergeRows(flowTemplates, blueprints, outlines)
    expect(antes.outline_extras).toEqual(["cta"])

    const s = splitRow(antes)
    const [depois] = mergeRows(
      [{ ...flowTemplates[0], ...s.flowTemplate }],
      [{ ...blueprints[0], ...s.blueprint }],
      [{ ...outlines[0], ...s.outline }],
    )
    expect(depois.outline_extras).toEqual([])
    expect(depois.blocks.map((b) => b.category)).toEqual(["hero", "footer"])
  })
})

describe("invariantes contra as linhas reais", () => {
  // Recortes verdadeiros de `email_blueprints` × `email_outline_templates`
  // (29/08/2026), escolhidos por cobrirem os formatos que existem: os que
  // batem, os que divergem em quantidade, os de bloco único e o item de
  // outline mal cadastrado. A validação completa rodou nas 34 linhas.
  const REAIS: Array<{ f: string; n: number; bp: string[]; ol: string[] }> = [
    {
      f: "abandoned_cart",
      n: 1,
      bp: ["hero", "products", "coupon", "testimonials", "text", "footer"],
      ol: ["hero", "products", "offer", "reviews", "body", "cta", "footer"],
    },
    {
      // Item do outline cadastrado como frase inteira — não pode derrubar.
      f: "abandoned_cart",
      n: 2,
      bp: ["text"],
      ol: ['text BODY →  CTA → Assinatura → "The [Brand] Team"'],
    },
    {
      f: "shipping_stages",
      n: 5,
      bp: ["hero", "cta", "text", "products", "text", "features", "text", "products", "footer"],
      ol: ["hero", "cta", "text", "products", "text", "features", "text", "products", "footer"],
    },
    {
      // Maior divergência de granularidade da base: 16 contra 8.
      f: "upsell",
      n: 1,
      bp: ["header", "hero", "social_proof", "urgency", "headline", "cta", "coupon", "headline", "testimonials", "social_proof", "products", "urgency", "coupon", "cta", "urgency", "footer"],
      ol: ["hero", "reviews", "offer", "reviews", "products", "body", "offer", "footer"],
    },
    { f: "welcome", n: 8, bp: ["letter", "footer"], ol: [] },
    { f: "win_back", n: 3, bp: ["letter"], ol: [] },
  ]

  it.each(REAIS)("$f #$n: nenhum bloco do blueprint some", ({ f, n, bp: types, ol: cats }) => {
    const { blocks } = mergeBlocks(
      f,
      n,
      types.map((t) => ({ type: t, label: t, purpose: "" })),
      cats,
    )
    expect(blocks).toHaveLength(types.length)
  })

  it.each(REAIS)("$f #$n: o tipo técnico atravessa o ciclo intacto", ({ f, n, bp: types, ol: cats }) => {
    const { blocks, outlineExtras } = mergeBlocks(
      f,
      n,
      types.map((t) => ({ type: t, label: t, purpose: "" })),
      cats,
    )
    const s = splitRow({
      flow_type: f,
      email_number: n,
      name: "x",
      delay_hours: 0,
      is_active: true,
      intent: "i",
      should: [],
      should_not: [],
      blocks,
      outline_extras: outlineExtras,
      subject_hint: null,
      tone: null,
      coupon_code: null,
      text_only: false,
      blueprint_id: null,
      outline_id: null,
      flow_template_id: null,
      updated_at: null,
    })
    // Sem o usuário trocar a categoria, o seed continua recebendo os MESMOS
    // tipos — a tela nova não reescreve o histórico só por ter sido aberta.
    expect(s.blueprint.blocks.map((b) => b.type)).toEqual(types)
    // E o outline sai sempre no vocabulário canônico.
    for (const c of s.outline.suggested_blocks) {
      expect(categoryOfBlockType(c)).toBe(c)
    }
  })
})

describe("delayLabel", () => {
  it("cobre imediato, horas e dias", () => {
    expect(delayLabel(0)).toBe("Imediato")
    expect(delayLabel(1)).toBe("1h")
    expect(delayLabel(23)).toBe("23h")
    expect(delayLabel(24)).toBe("1d")
    expect(delayLabel(192)).toBe("8d")
    expect(delayLabel(36)).toBe("1d 12h")
    expect(delayLabel(-3)).toBe("Imediato")
  })
})
