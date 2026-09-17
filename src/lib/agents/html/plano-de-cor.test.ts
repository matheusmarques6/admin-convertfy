import { describe, expect, it } from "vitest"

import type { Cta, Faixa, GradienteDaFaixa } from "./color-faixas"
import {
  parsePlanoDeCor,
  planoParaOps,
  recusaDoLabel,
  TETO_DE_FAIXAS,
  type ContextoDoPlano,
} from "./plano-de-cor"

const faixa = (over: Partial<Faixa> & { ordem: number; bloco: number }): Faixa => ({
  tipo: "body",
  fundo: "#FFFFFF",
  foto: false,
  luminancia: 1,
  cobre_px: 600,
  editavel: true,
  decls: [{ start: 0, end: 7 }],
  gradiente: null,
  ...over,
})

const cta = (over: Partial<Cta> & { id: string }): Cta => ({
  bloco: 2,
  faixa: 3,
  texto: "Comprar",
  href: "https://loja.com/col",
  fundo: "#111111",
  label: "#FFFFFF",
  tipo: "preenchido",
  font_size_px: null,
  peso: null,
  padding_v: null,
  padding_h: null,
  largura_px: 260,
  radius_px: 4,
  vml: false,
  somente_outlook: false,
  contraste: 18,
  range: { start: 100, end: 200 },
  ...over,
})

const CTX: ContextoDoPlano = {
  faixas: [
    faixa({ ordem: 1, bloco: 0, tipo: "hero", fundo: null, foto: true, luminancia: null, editavel: false, decls: [] }),
    faixa({ ordem: 2, bloco: 1 }),
    faixa({ ordem: 3, bloco: 2 }),
    faixa({ ordem: 4, bloco: 3, tipo: "footer" }),
  ],
  ctas: [cta({ id: "cta1" })],
  incentivo: { existe: true, percentual: 10, codigo: "WELCOME10" },
  urlLoja: "https://loja.com",
}

describe("recusaDoLabel — a oferta é fato, não frase", () => {
  it("label sem oferta passa em qualquer loja", () => {
    expect(recusaDoLabel("Ver a coleção", { existe: null })).toBeNull()
    expect(recusaDoLabel("Ver a coleção", { existe: false })).toBeNull()
  })

  it("promete desconto sem incentivo confirmado → recusa", () => {
    expect(recusaDoLabel("Garantir 10% OFF", { existe: false })).toMatch(/NÃO tem incentivo/)
  })

  it("incentivo NULL bloqueia igual a false — ninguém confirmou", () => {
    expect(recusaDoLabel("Usar meu cupom", { existe: null })).toMatch(/ninguém confirmou/)
  })

  it("percentual diferente do da peça → recusa com os dois números", () => {
    expect(recusaDoLabel("Garantir 15% OFF", { existe: true, percentual: 10 })).toBe(
      "promete 15% e a peça carrega 10%",
    )
  })

  it("percentual igual ao da peça passa", () => {
    expect(recusaDoLabel("Garantir 10% OFF", { existe: true, percentual: 10 })).toBeNull()
  })

  it("placeholder entre colchetes é recusado", () => {
    expect(recusaDoLabel("Usar [CÓDIGO]", { existe: true })).toMatch(/colchetes/)
  })

  it("label longo demais para caber num botão é recusado", () => {
    expect(recusaDoLabel("Clique aqui para conhecer toda a nossa coleção nova de inverno", { existe: true })).toMatch(
      /teto/,
    )
  })
})

describe("planoParaOps — faixas", () => {
  it("traduz a decisão de faixa em set_fundo endereçado ao bloco", () => {
    const r = planoParaOps({ faixas: [{ ordem: 3, decisao: "escurecer", fundo: "#111111" }] }, CTX)
    expect(r.ops).toEqual([{ action: "set_fundo", bloco: 2, para: "#111111" }])
    expect(r.descartes).toEqual([])
  })

  it('decisão "manter" não vira op nenhuma', () => {
    const r = planoParaOps({ faixas: [{ ordem: 1, decisao: "manter", porque: "é foto" }] }, CTX)
    expect(r.ops).toEqual([])
  })

  it("a hero com foto é descartada com motivo — não se decide aqui", () => {
    const r = planoParaOps({ faixas: [{ ordem: 1, fundo: "#111111" }] }, CTX)
    expect(r.ops).toEqual([])
    expect(r.descartes[0].motivo).toMatch(/foto/)
  })

  it("faixa inexistente é descartada, não aplicada na mais próxima", () => {
    const r = planoParaOps({ faixas: [{ ordem: 99, fundo: "#111111" }] }, CTX)
    expect(r.ops).toEqual([])
    expect(r.descartes[0].motivo).toBe("não existe no documento")
  })

  it("o teto de faixas é do CÓDIGO — o excedente vira registro", () => {
    const r = planoParaOps(
      {
        faixas: [
          { ordem: 2, fundo: "#111111" },
          { ordem: 3, fundo: "#222222" },
          { ordem: 4, fundo: "#333333" },
        ],
      },
      CTX,
    )
    expect(r.ops).toHaveLength(TETO_DE_FAIXAS)
    expect(r.descartes[0].motivo).toMatch(/teto de 2 faixas/)
  })
})

describe("planoParaOps — botões que faltam", () => {
  const base = { bloco: 1, label: "Ver a coleção", destino: "loja" as const, fundo: "#111111", cor_label: "#FFFFFF" }

  it("resolve o href pelo enum — o modelo nunca digita URL", () => {
    const r = planoParaOps({ adicionar: [base] }, CTX)
    expect(r.ops[0]).toMatchObject({ action: "add_cta", bloco: 1, href: "https://loja.com" })
  })

  it("destino produto_do_bloco usa o link daquele bloco", () => {
    const r = planoParaOps(
      { adicionar: [{ ...base, destino: "produto_do_bloco" }] },
      { ...CTX, urlPorBloco: { 1: "https://loja.com/p/1" } },
    )
    expect(r.ops[0]).toMatchObject({ href: "https://loja.com/p/1" })
  })

  it("destino sem URL conhecida NÃO vira botão — link para lugar nenhum é o erro caro", () => {
    const r = planoParaOps({ adicionar: [base] }, { ...CTX, urlLoja: null, ctas: [] })
    expect(r.ops).toEqual([])
    expect(r.descartes[0].motivo).toMatch(/nenhum destino disponível/)
  })

  // 11/09, Hero Boxers: os botões da hero perderam o href, o extrator (que
  // então exigia href) ficou cego, e o agente escreveu "a hero é o único
  // bloco em <faixas> sem entrada em <ctas>" e inseriu um TERCEIRO botão
  // numa hero que já tinha dois. As duas causas foram corrigidas na origem;
  // esta é a terceira linha de defesa, e vale por si: a hero é enxertada da
  // variante curada, e hero sem botão é decisão do designer.
  it("a HERO nunca ganha botão inserido, mesmo sem nenhum em <ctas>", () => {
    const r = planoParaOps({ adicionar: [{ ...base, bloco: 0 }] }, { ...CTX, ctas: [] })
    expect(r.ops).toEqual([])
    expect(r.descartes[0].motivo).toMatch(/enxertada da variante/)
  })

  it("bloco que já tem botão não ganha outro", () => {
    const r = planoParaOps({ adicionar: [{ ...base, bloco: 2 }] }, CTX)
    expect(r.ops).toEqual([])
    expect(r.descartes[0].motivo).toBe("o bloco já tem botão")
  })

  it("duas entradas para o mesmo bloco: a segunda é descartada", () => {
    const r = planoParaOps({ adicionar: [base, { ...base, label: "Comprar agora" }] }, CTX)
    expect(r.ops).toHaveLength(1)
    expect(r.descartes[0].motivo).toBe("o bloco já tem botão")
  })

  it("label que promete o que a peça não carrega vira lacuna, não botão", () => {
    const r = planoParaOps(
      { adicionar: [{ ...base, label: "Garantir 15% OFF" }] },
      { ...CTX, incentivo: { existe: true, percentual: 10 } },
    )
    expect(r.ops).toEqual([])
    expect(r.descartes[0].motivo).toBe("promete 15% e a peça carrega 10%")
  })

  it("o botão novo herda o raio dominante da peça (R8)", () => {
    const r = planoParaOps({ adicionar: [base] }, { ...CTX, ctas: [cta({ id: "cta1", radius_px: 12 })] })
    expect(r.ops[0]).toMatchObject({ radiusPx: 12 })
  })
})

describe("planoParaOps — botões existentes e valores", () => {
  it("recolore o botão pelo id", () => {
    const r = planoParaOps({ botoes: [{ id: "cta1", fundo: "#FFFFFF", label: "#111111" }] }, CTX)
    expect(r.ops).toEqual([{ action: "set_botao", cta: "cta1", fundo: "#FFFFFF", label: "#111111" }])
  })

  it("botão inexistente é descartado com motivo", () => {
    const r = planoParaOps({ botoes: [{ id: "cta9", fundo: "#FFFFFF" }] }, CTX)
    expect(r.ops).toEqual([])
    expect(r.descartes[0].motivo).toBe("não existe no documento")
  })

  it("valores viram o recolor de sempre, com o escopo de papel", () => {
    const r = planoParaOps({ valores: [{ de: "#6B46C1", para: "#111111", onde: "background" }] }, CTX)
    expect(r.ops).toEqual([{ action: "recolor", from: "#6B46C1", to: "#111111", where: "background" }])
  })

  it("plano vazio gera zero ops — é decisão legítima", () => {
    expect(planoParaOps({}, CTX)).toEqual({ ops: [], descartes: [], ajustes: [] })
  })
})

describe("parsePlanoDeCor", () => {
  it("lê o plano completo, com cercas de markdown em volta", () => {
    const p = parsePlanoDeCor(`\`\`\`json
{"paleta_eixo":"com-acento-definido",
 "tokens":{"base-clara":"#FFFFFF"},
 "faixas":[{"ordem":3,"decisao":"escurecer","fundo":"#111111","porque":"R3"}],
 "botoes":[{"id":"cta1","fundo":"#FFFFFF"}],
 "adicionar":[{"bloco":1,"label":"Ver","destino":"loja","fundo":"#111111","cor_label":"#FFFFFF"}],
 "valores":[{"de":"#6B46C1","para":"#111111"}],
 "rodape":"claro","lacunas":["R6 fica para o rodapé da loja"]}
\`\`\``)
    expect(p.paleta_eixo).toBe("com-acento-definido")
    expect(p.faixas).toHaveLength(1)
    expect(p.adicionar?.[0].destino).toBe("loja")
    expect(p.lacunas).toEqual(["R6 fica para o rodapé da loja"])
  })

  it("entrada malformada é descartada, não vira op inválida lá na frente", () => {
    const p = parsePlanoDeCor(
      '{"faixas":[{"fundo":"#111"},{"ordem":2,"fundo":"#111111"}],"adicionar":[{"bloco":1}]}',
    )
    expect(p.faixas).toHaveLength(1)
    expect(p.adicionar).toEqual([])
  })

  it("campos ausentes viram listas vazias — plano vazio é resposta válida", () => {
    const p = parsePlanoDeCor("{}")
    expect(p.faixas).toEqual([])
    expect(p.botoes).toEqual([])
    expect(p.adicionar).toEqual([])
    expect(p.valores).toEqual([])
  })

  it("output sem JSON lança", () => {
    expect(() => parsePlanoDeCor("não consegui decidir")).toThrow(/sem objeto JSON/)
  })
})

describe("planoParaOps — Passo 14: contrato, decisão e cor por código", () => {
  const PB = { button_bg: "#000000", button_text: "#FFFFFF", bg: "#FFFFFF", text: "#111111", surface: "#F2F2F2" }
  const adicionar = { bloco: 1, label: "Ver coleção", destino: "loja" as const, fundo: "#FFFFFF", cor_label: "#FFFFFF" }

  // O caso do batch 6249aef2: contrato com CTA, heurística cega, agente insere.
  it("contrato que já tem CTA barra a inserção, com o campo no motivo", () => {
    const r = planoParaOps(
      { adicionar: [adicionar] },
      { ...CTX, inventario: [{ bloco: 1, tipo: "body", tem_cta_por_contrato: true, campos_cta: ["cta_label"], tem_cta_por_heuristica: false, divergente: true }] },
    )
    expect(r.ops).toEqual([])
    expect(r.descartes[0].motivo).toContain("cta_label")
  })

  it("contrato sem CTA deixa inserir; sem contrato também (fail-open)", () => {
    const comContrato = planoParaOps({ adicionar: [adicionar] }, { ...CTX, inventario: [{ bloco: 1, tipo: "body", tem_cta_por_contrato: false, campos_cta: [], tem_cta_por_heuristica: false, divergente: false }] })
    expect(comContrato.ops).toHaveLength(1)
    const semContrato = planoParaOps({ adicionar: [adicionar] }, { ...CTX, inventario: [{ bloco: 1, tipo: "body", tem_cta_por_contrato: null, campos_cta: [], tem_cta_por_heuristica: false, divergente: false }] })
    expect(semContrato.ops).toHaveLength(1)
  })

  it("a decisão que nega CTA na posição barra a inserção", () => {
    const r = planoParaOps({ adicionar: [adicionar] }, { ...CTX, requisitosCta: { 1: false } })
    expect(r.ops).toEqual([])
    expect(r.descartes[0].motivo).toContain("requisitos.cta")
    expect(planoParaOps({ adicionar: [adicionar] }, { ...CTX, requisitosCta: { 1: null } }).ops).toHaveLength(1)
  })

  // Branco sobre branco: a cor pedida é trocada pelo código e o ajuste é registrado.
  it("a cor do botão novo é decidida por código contra a faixa (AA)", () => {
    const r = planoParaOps({ adicionar: [adicionar] }, { ...CTX, roles: PB })
    const op = r.ops[0]
    expect(op.action).toBe("add_cta")
    if (op.action === "add_cta") {
      expect(op.fundo).toBe("#000000")
      expect(op.corLabel).toBe("#FFFFFF")
    }
    expect(r.ajustes).toHaveLength(1)
    expect(r.ajustes[0].de).toBe("#FFFFFF/#FFFFFF")
  })

  // A faixa decidida no MESMO plano é o fundo real: faixa vai a preto → botão inverte.
  it("o botão é medido contra a faixa decidida no mesmo plano", () => {
    const r = planoParaOps(
      { faixas: [{ ordem: 2, fundo: "#000000" }], adicionar: [{ ...adicionar, fundo: "#000000", cor_label: "#FFFFFF" }] },
      { ...CTX, roles: PB },
    )
    const op = r.ops.find((o) => o.action === "add_cta")
    expect(op && op.action === "add_cta" ? op.fundo : null).toBe("#FFFFFF")
  })

  it("recolorir botão existente também passa pela régua de cor", () => {
    const r = planoParaOps({ botoes: [{ id: "cta1", fundo: "#FFFFFF", label: "#FFFFFF" }] }, { ...CTX, roles: PB })
    const op = r.ops[0]
    expect(op.action).toBe("set_botao")
    if (op.action === "set_botao") expect(op.fundo).toBe("#000000")
    expect(r.ajustes).toHaveLength(1)
  })

  it("sem roles, a cor pedida entra como veio (legado)", () => {
    const r = planoParaOps({ adicionar: [{ ...adicionar, fundo: "#123456", cor_label: "#FFFFFF" }] }, CTX)
    const op = r.ops[0]
    if (op.action === "add_cta") expect(op.fundo).toBe("#123456")
    expect(r.ajustes).toEqual([])
  })
})

// ── Gradiente da faixa (17/09) ─────────────────────────────────────────
describe("planoParaOps — gradiente", () => {
  const gradiente = (over: Partial<GradienteDaFaixa> = {}): GradienteDaFaixa => ({
    direcao: "180deg",
    paradas: ["#000000", "#E3E3E3"],
    decls: [{ start: 0, end: 7 }],
    editavel: true,
    ...over,
  })

  const ctx = (g: GradienteDaFaixa | null): ContextoDoPlano => ({
    faixas: [faixa({ ordem: 1, bloco: 0, gradiente: g })],
    ctas: [],
    incentivo: { existe: null },
  })

  it("traduz a decisão em set_gradiente endereçado ao bloco", () => {
    const r = planoParaOps(
      { faixas: [{ ordem: 1, decisao: "manter", gradiente: ["#034326", "#E3E3E3"] }] },
      ctx(gradiente()),
    )
    expect(r.ops).toEqual([
      { action: "set_gradiente", bloco: 0, paradas: ["#034326", "#E3E3E3"] },
    ])
  })

  it("convive com a troca do fundo sólido na mesma faixa", () => {
    // O fallback e o gradiente são decisões diferentes — trocar só o
    // primeiro foi o que deixou a tela preto → cinza numa loja verde.
    const r = planoParaOps(
      {
        faixas: [
          { ordem: 1, decisao: "conformar", fundo: "#034326", gradiente: ["#034326", "#E3E3E3"] },
        ],
      },
      ctx(gradiente()),
    )
    expect(r.ops).toEqual([
      { action: "set_fundo", bloco: 0, para: "#034326" },
      { action: "set_gradiente", bloco: 0, paradas: ["#034326", "#E3E3E3"] },
    ])
  })

  it("gradiente igual ao que já está não vira op", () => {
    const r = planoParaOps(
      { faixas: [{ ordem: 1, decisao: "manter", gradiente: ["#000000", "#e3e3e3"] }] },
      ctx(gradiente()),
    )
    expect(r.ops).toEqual([])
  })

  it("contagem de paradas diferente é descarte com motivo", () => {
    const r = planoParaOps(
      { faixas: [{ ordem: 1, decisao: "manter", gradiente: ["#034326"] }] },
      ctx(gradiente()),
    )
    expect(r.ops).toEqual([])
    expect(r.descartes[0]?.motivo).toContain("2 paradas")
  })

  it("gradiente não editável vira descarte que nomeia o motivo", () => {
    const r = planoParaOps(
      { faixas: [{ ordem: 1, decisao: "manter", gradiente: ["#034326", "#E3E3E3"] }] },
      ctx(gradiente({ editavel: false, motivo: "vml_divergente" })),
    )
    expect(r.ops).toEqual([])
    expect(r.descartes[0]?.motivo).toContain("Outlook")
  })

  it("faixa sem gradiente recusa a decisão em vez de inventar um", () => {
    const r = planoParaOps(
      { faixas: [{ ordem: 1, decisao: "manter", gradiente: ["#034326", "#E3E3E3"] }] },
      ctx(null),
    )
    expect(r.ops).toEqual([])
    expect(r.descartes[0]?.motivo).toContain("não tem gradiente")
  })

  it("repintar gradiente NÃO consome o teto de faixas", () => {
    // O teto limita quantas faixas mudam o RITMO; conformar a cor de um
    // gradiente não muda ritmo nenhum.
    const faixas = [0, 1, 2].map((b) =>
      faixa({ ordem: b + 1, bloco: b, gradiente: gradiente() }),
    )
    const r = planoParaOps(
      {
        faixas: [
          { ordem: 1, decisao: "escurecer", fundo: "#111111" },
          { ordem: 2, decisao: "escurecer", fundo: "#111111" },
          { ordem: 3, decisao: "manter", gradiente: ["#034326", "#E3E3E3"] },
        ],
      },
      { faixas, ctas: [], incentivo: { existe: null } },
    )
    expect(r.ops.filter((o) => o.action === "set_fundo")).toHaveLength(TETO_DE_FAIXAS)
    expect(r.ops.filter((o) => o.action === "set_gradiente")).toHaveLength(1)
  })
})

describe("parsePlanoDeCor — gradiente", () => {
  it("lê a lista de paradas da faixa", () => {
    const p = parsePlanoDeCor(
      '{"faixas":[{"ordem":2,"decisao":"manter","gradiente":["#034326"," #E3E3E3 "],"porque":"R4"}]}',
    )
    expect(p.faixas?.[0]?.gradiente).toEqual(["#034326", "#E3E3E3"])
  })

  it("gradiente que não é lista de string é ignorado, não quebra o plano", () => {
    const p = parsePlanoDeCor('{"faixas":[{"ordem":2,"gradiente":"#034326"}]}')
    expect(p.faixas?.[0]?.gradiente).toBeUndefined()
    expect(p.faixas?.[0]?.ordem).toBe(2)
  })
})
