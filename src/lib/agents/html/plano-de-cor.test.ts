import { describe, expect, it } from "vitest"

import { OUTPUT_CONTRATO } from "../chains/color-guia"
import type { Cta, Faixa, GradienteDaFaixa } from "./color-faixas"
import { COLOR_CONTEXTS } from "./color-inventory"
import {
  DECISOES_DE_FAIXA,
  parsePlanoDeCor,
  planoParaOps,
  recusaDoLabel,
  TETO_DE_SEPARACOES,
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

  it("não há cota de trocas: a peça pode ter TODAS as faixas decididas", () => {
    // Era o teste do `TETO_DE_FAIXAS = 2`, e é ele que muda de lado. Medido
    // na run 794b8ae1: seis seções, cinco brancas, e a única troca era
    // conformidade — com duas vagas, uma ia para conformidade e sobrava uma
    // para compor o ritmo inteiro.
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
    expect(r.ops).toHaveLength(3)
    expect(r.descartes).toEqual([])
  })
})

describe("planoParaOps — o teto é o RESULTADO, não o esforço", () => {
  const quatroClaras: ContextoDoPlano = {
    faixas: [0, 1, 2, 3].map((b) => faixa({ ordem: b + 1, bloco: b })),
    ctas: [],
    incentivo: { existe: null },
  }

  it("a troca que levaria a peça acima de 3 tons cai, com o número no motivo", () => {
    const r = planoParaOps(
      {
        faixas: [
          { ordem: 1, fundo: "#111111" },
          { ordem: 2, fundo: "#222222" },
          { ordem: 3, fundo: "#333333" },
          { ordem: 4, fundo: "#444444" },
        ],
      },
      quatroClaras,
    )
    expect(r.ops).toHaveLength(2)
    expect(r.descartes).toHaveLength(2)
    expect(r.descartes[0].motivo).toMatch(/acima de 3 tons/)
    expect(r.descartes[0].motivo).toMatch(/ficariam 4/)
  })

  it("a conta é sobre o resultado ACUMULADO, não sobre o documento original", () => {
    // Peça com dois tons (três claras + uma escura). Cada troca sozinha
    // deixaria a peça em 3 tons e passaria; as duas juntas dão 4. Medir
    // cada candidata contra o documento original deixaria as duas entrarem.
    const ctx: ContextoDoPlano = {
      faixas: [
        faixa({ ordem: 1, bloco: 0 }),
        faixa({ ordem: 2, bloco: 1 }),
        faixa({ ordem: 3, bloco: 2 }),
        faixa({ ordem: 4, bloco: 3, fundo: "#034326" }),
      ],
      ctas: [],
      incentivo: { existe: null },
    }
    const r = planoParaOps(
      { faixas: [{ ordem: 1, fundo: "#111111" }, { ordem: 2, fundo: "#F2F2F2" }] },
      ctx,
    )
    expect(r.ops).toHaveLength(1)
    expect(r.descartes[0].motivo).toMatch(/acima de 3 tons/)
  })

  it("peça que JÁ excede pode ser consertada: a troca que reduz tons passa", () => {
    const ctx: ContextoDoPlano = {
      faixas: [
        faixa({ ordem: 1, bloco: 0, fundo: "#111111" }),
        faixa({ ordem: 2, bloco: 1, fundo: "#222222" }),
        faixa({ ordem: 3, bloco: 2, fundo: "#333333" }),
        faixa({ ordem: 4, bloco: 3, fundo: "#444444" }),
      ],
      ctas: [],
      incentivo: { existe: null },
    }
    const r = planoParaOps({ faixas: [{ ordem: 4, fundo: "#111111" }] }, ctx)
    expect(r.ops).toEqual([{ action: "set_fundo", bloco: 3, para: "#111111" }])
    expect(r.descartes).toEqual([])
  })

  it("troca que INTRODUZ cor fora da paleta é descartada (K1)", () => {
    const r = planoParaOps(
      { faixas: [{ ordem: 2, fundo: "#FF0000" }] },
      { ...quatroClaras, fundosAceitos: ["#FFFFFF", "#034326", "#F2F2F2"] },
    )
    expect(r.ops).toEqual([])
    expect(r.descartes[0].motivo).toMatch(/#FF0000 não é da paleta/)
  })

  it("papel derivado da identidade é fundo legítimo", () => {
    const r = planoParaOps(
      { faixas: [{ ordem: 2, fundo: "#F2F2F2" }] },
      { ...quatroClaras, fundosAceitos: ["#FFFFFF", "#034326", "#F2F2F2"] },
    )
    expect(r.ops).toHaveLength(1)
  })

  it("loja sem paleta cadastrada não tem procedência cobrada", () => {
    // Sem identidade não há de onde um fundo divergir. Cobrar aqui
    // descartaria toda troca de uma loja que ainda não cadastrou cor.
    const r = planoParaOps({ faixas: [{ ordem: 2, fundo: "#FF0000" }] }, quatroClaras)
    expect(r.ops).toHaveLength(1)
    expect(r.descartes).toEqual([])
  })

  it("mais trocas do que faixas é plano malformado, não composição", () => {
    const umaSo: ContextoDoPlano = {
      faixas: [faixa({ ordem: 1, bloco: 0 })],
      ctas: [],
      incentivo: { existe: null },
    }
    const r = planoParaOps(
      { faixas: [{ ordem: 1, fundo: "#111111" }, { ordem: 1, fundo: "#222222" }] },
      umaSo,
    )
    expect(r.ops).toHaveLength(1)
    expect(r.descartes[0].motivo).toMatch(/mais trocas do que faixas/)
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
    expect(planoParaOps({}, CTX)).toMatchObject({ ops: [], descartes: [], ajustes: [] })
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

  it("repintar gradiente NÃO conta na conta de tons", () => {
    // A conta mede quantas cores de fundo a peça acaba tendo; conformar a
    // cor de um gradiente não acrescenta tom nenhum ao ritmo.
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
    expect(r.ops.filter((o) => o.action === "set_fundo")).toHaveLength(2)
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

describe("planoParaOps — o vocabulário de decisão e o no-op", () => {
  it("pedir a cor que a faixa já tem não vira op", () => {
    const r = planoParaOps({ faixas: [{ ordem: 2, decisao: "clarear", fundo: "#ffffff" }] }, CTX)
    expect(r.ops).toEqual([])
    expect(r.descartes[0].motivo).toMatch(/já está em/)
  })

  it("o no-op não entra na conta de tons: as que mudam de verdade seguem", () => {
    const r = planoParaOps(
      {
        faixas: [
          { ordem: 2, decisao: "clarear", fundo: "#FFFFFF" }, // no-op
          { ordem: 3, decisao: "escurecer", fundo: "#111111" },
          { ordem: 4, decisao: "escurecer", fundo: "#222222" },
        ],
      },
      CTX,
    )
    expect(r.ops).toHaveLength(2)
    expect(r.descartes.some((d) => /tons/.test(d.motivo))).toBe(false)
  })

  it('"Manter." é manter — caixa e ponto não podem decidir a cor de uma faixa', () => {
    const r = planoParaOps({ faixas: [{ ordem: 2, decisao: "Manter.", fundo: "#111111" }] }, CTX)
    expect(r.ops).toEqual([])
  })

  it("verbo fora do vocabulário não perde a troca — vira registro em ajustes", () => {
    const r = planoParaOps(
      { faixas: [{ ordem: 2, decisao: "manter cor mas remapear", fundo: "#111111" }] },
      CTX,
    )
    expect(r.ops).toEqual([{ action: "set_fundo", bloco: 1, para: "#111111" }])
    expect(r.ajustes[0].motivo).toMatch(/fora do vocabulário/)
  })

  it("o vocabulário do código é o mesmo que o prompt declara", () => {
    for (const verbo of DECISOES_DE_FAIXA) expect(OUTPUT_CONTRATO).toContain(verbo)
  })
})

describe("planoParaOps — o escopo do recolor", () => {
  it('onde: "gradiente" chega ao aplicador — sem ele a troca seria global', () => {
    const r = planoParaOps(
      { valores: [{ de: "#000000", para: "#034326", onde: "gradiente" }] },
      CTX,
    )
    expect(r.ops).toEqual([
      { action: "recolor", from: "#000000", to: "#034326", where: "gradiente" },
    ])
  })

  it("todo contexto do inventário é aceito — a régua é uma só", () => {
    for (const onde of COLOR_CONTEXTS) {
      const r = planoParaOps({ valores: [{ de: "#000000", para: "#111111", onde }] }, CTX)
      expect(r.ops[0]).toMatchObject({ where: onde })
    }
  })

  it("contexto inventado descarta a op em vez de virar recolor global", () => {
    const r = planoParaOps({ valores: [{ de: "#000000", para: "#111111", onde: "fundo" }] }, CTX)
    expect(r.ops).toEqual([])
    expect(r.descartes[0].motivo).toMatch(/não é um contexto de cor/)
  })

  it("sem onde o recolor segue global, como sempre foi", () => {
    const r = planoParaOps({ valores: [{ de: "#000000", para: "#111111" }] }, CTX)
    expect(r.ops).toEqual([{ action: "recolor", from: "#000000", to: "#111111" }])
  })
})

describe("planoParaOps — o raio é unificado por código (R8)", () => {
  const ctxComRaios = (raios: Array<number | null>): ContextoDoPlano => ({
    ...CTX,
    ctas: raios.map((r, i) =>
      cta({ id: `cta${i + 1}`, radius_px: r, range: { start: 100 + i * 50, end: 140 + i * 50 } }),
    ),
  })

  it("o agente não precisa pedir: a divergência vira op sozinha", () => {
    const r = planoParaOps({}, ctxComRaios([10, 8]))
    expect(r.ops).toEqual([{ action: "set_raio", cta: "cta1", de: 10, para: 8 }])
  })

  it("peça coerente não gera op nenhuma", () => {
    expect(planoParaOps({}, ctxComRaios([8, 8])).ops).toEqual([])
  })

  it("canto vivo com pílula é lacuna registrada, não sorteio", () => {
    const r = planoParaOps({}, ctxComRaios([8, 100]))
    expect(r.ops).toEqual([])
    expect(r.descartes[0].motivo).toMatch(/FORMA/)
  })

  it("não entra na conta de tons — raio é conformidade, não ritmo", () => {
    const r = planoParaOps(
      {
        faixas: [
          { ordem: 2, decisao: "escurecer", fundo: "#111111" },
          { ordem: 3, decisao: "escurecer", fundo: "#222222" },
        ],
      },
      ctxComRaios([10, 8]),
    )
    expect(r.ops.filter((o) => o.action === "set_fundo")).toHaveLength(2)
    expect(r.ops.filter((o) => o.action === "set_raio")).toHaveLength(1)
  })
})

describe("planoParaOps — a separação entre seções", () => {
  // Quatro faixas: 1 hero com foto, 2 e 3 claras, 4 rodapé.
  const PAPEIS = {
    button_bg: "#034326",
    button_text: "#FFFFFF",
    bg: "#FFFFFF",
    text: "#1F1F1F",
    surface: "#F2F2F2",
    accent: "#07A55D",
  }
  const ctx = (over: Partial<ContextoDoPlano> = {}): ContextoDoPlano => ({
    faixas: [
      faixa({ ordem: 1, bloco: 0, tipo: "hero" }),
      faixa({ ordem: 2, bloco: 1 }),
      faixa({ ordem: 3, bloco: 2 }),
      faixa({ ordem: 4, bloco: 3, tipo: "footer" }),
    ],
    ctas: [],
    incentivo: { existe: null },
    roles: PAPEIS,
    ...over,
  })

  it("fundo igual dos dois lados: a forma de MARCAR seção entra", () => {
    const r = planoParaOps({ separacoes: [{ depois_da_faixa: 2, forma: "filete" }] }, ctx())
    expect(r.ops).toEqual([
      { action: "add_separador", bloco: 1, formaId: "filete", fundo: "#FFFFFF", tinta: "#07A55D" },
    ])
  })

  it("fundo que TROCA: a forma de esconder emenda leva a cor de baixo", () => {
    const r = planoParaOps(
      {
        faixas: [{ ordem: 3, decisao: "escurecer", fundo: "#034326" }],
        separacoes: [{ depois_da_faixa: 2, forma: "onda" }],
      },
      ctx(),
    )
    // A cor vem da DECISÃO deste plano — a faixa 3 ainda é branca no
    // documento, e ler dali desenharia a onda branco→branco.
    expect(r.ops).toContainEqual({
      action: "add_separador",
      bloco: 1,
      formaId: "onda",
      fundo: "#FFFFFF",
      tinta: "#034326",
    })
  })

  it("o par errado é recusado nos DOIS sentidos", () => {
    const marcaOndeTroca = planoParaOps(
      {
        faixas: [{ ordem: 3, decisao: "escurecer", fundo: "#034326" }],
        separacoes: [{ depois_da_faixa: 2, forma: "filete" }],
      },
      ctx(),
    )
    expect(marcaOndeTroca.ops.filter((o) => o.action === "add_separador")).toEqual([])
    expect(marcaOndeTroca.descartes[0].motivo).toMatch(/o fundo TROCA aqui/)

    const emendaSemTroca = planoParaOps({ separacoes: [{ depois_da_faixa: 2, forma: "onda" }] }, ctx())
    expect(emendaSemTroca.ops).toEqual([])
    expect(emendaSemTroca.descartes[0].motivo).toMatch(/degrau que não existe/)
  })

  it("#FFFFFF e #FDFDFD são o MESMO tom — não há emenda a esconder", () => {
    const c = ctx({
      faixas: [
        faixa({ ordem: 1, bloco: 0, tipo: "hero" }),
        faixa({ ordem: 2, bloco: 1 }),
        faixa({ ordem: 3, bloco: 2, fundo: "#FDFDFD" }),
        faixa({ ordem: 4, bloco: 3, tipo: "footer" }),
      ],
    })
    const r = planoParaOps({ separacoes: [{ depois_da_faixa: 2, forma: "onda" }] }, c)
    expect(r.descartes[0].motivo).toMatch(/degrau que não existe/)
  })

  it("nunca imediatamente antes do rodapé", () => {
    const r = planoParaOps({ separacoes: [{ depois_da_faixa: 3, forma: "filete" }] }, ctx())
    expect(r.ops).toEqual([])
    expect(r.descartes[0].motivo).toMatch(/fim do e-mail/)
  })

  it("a última faixa não tem o que separar", () => {
    const r = planoParaOps({ separacoes: [{ depois_da_faixa: 4, forma: "filete" }] }, ctx())
    expect(r.descartes[0].motivo).toMatch(/última faixa/)
  })

  it("forma inventada é descartada — o código não improvisa desenho", () => {
    const r = planoParaOps({ separacoes: [{ depois_da_faixa: 2, forma: "espiral" }] }, ctx())
    expect(r.ops).toEqual([])
    expect(r.descartes[0].motivo).toMatch(/não existe no catálogo/)
  })

  it("teto de 3 por peça", () => {
    const c = ctx({
      faixas: [0, 1, 2, 3, 4, 5].map((b) => faixa({ ordem: b + 1, bloco: b })),
    })
    const r = planoParaOps(
      {
        separacoes: [1, 2, 3, 4].map((n) => ({ depois_da_faixa: n, forma: "filete" })),
      },
      c,
    )
    expect(r.ops).toHaveLength(TETO_DE_SEPARACOES)
    expect(r.descartes[0].motivo).toMatch(/teto de 3 separações/)
  })

  it("tinta sem contraste é CORRIGIDA por código, e o ajuste é registrado", () => {
    const r = planoParaOps(
      { separacoes: [{ depois_da_faixa: 2, forma: "filete", tinta: "#E3E3E3" }] },
      ctx(),
    )
    expect(r.ops[0]).toMatchObject({ action: "add_separador", tinta: "#07A55D" })
    expect(r.ajustes[0].motivo).toMatch(/abaixo do piso/)
  })

  it("a tinta é ignorada na forma que esconde emenda", () => {
    // Ali as duas cores são os fundos das faixas; deixá-la decidir uma
    // delas desenharia um degrau falso.
    const r = planoParaOps(
      {
        faixas: [{ ordem: 3, decisao: "escurecer", fundo: "#034326" }],
        separacoes: [{ depois_da_faixa: 2, forma: "onda", tinta: "#FF0000" }],
      },
      ctx(),
    )
    expect(r.ops).toContainEqual({
      action: "add_separador",
      bloco: 1,
      formaId: "onda",
      fundo: "#FFFFFF",
      tinta: "#034326",
    })
  })

  it("faixa com foto não recebe separação — não há fundo sólido", () => {
    const c = ctx({
      faixas: [
        faixa({ ordem: 1, bloco: 0, tipo: "hero", foto: true, fundo: null }),
        faixa({ ordem: 2, bloco: 1 }),
      ],
    })
    const r = planoParaOps({ separacoes: [{ depois_da_faixa: 1, forma: "filete" }] }, c)
    expect(r.ops).toEqual([])
    expect(r.descartes[0].motivo).toMatch(/fundo sólido/)
  })
})

describe("planoParaOps — o botão deixado para trás", () => {
  const PAPEIS = {
    button_bg: "#034326",
    button_text: "#FFFFFF",
    bg: "#FFFFFF",
    text: "#1F1F1F",
    surface: "#F2F2F2",
    accent: "#07A55D",
  }
  const ctx: ContextoDoPlano = {
    faixas: [faixa({ ordem: 1, bloco: 0 }), faixa({ ordem: 2, bloco: 1 })],
    ctas: [cta({ id: "cta1", bloco: 1, fundo: "#034326", label: "#FFFFFF" })],
    incentivo: { existe: null },
    roles: PAPEIS,
  }

  it("faixa escurecida sem decisão de botão: o código refaz o par", () => {
    // Achado renderizando a peça: o plano escureceu a faixa da oferta, não
    // disse nada do botão, e o botão verde sumiu no verde novo. Com o teto
    // de 2 trocas isso atingia no máximo dois botões; com o ritmo inteiro
    // na mão dele, todos.
    const r = planoParaOps({ faixas: [{ ordem: 2, decisao: "escurecer", fundo: "#034326" }] }, ctx)
    expect(r.ops).toContainEqual({ action: "set_botao", cta: "cta1", fundo: "#FFFFFF", label: "#034326" })
    expect(r.ajustes.some((a) => /o plano não decidiu o botão/.test(a.motivo))).toBe(true)
  })

  it("não atropela o botão que o plano DECIDIU", () => {
    const r = planoParaOps(
      {
        faixas: [{ ordem: 2, decisao: "escurecer", fundo: "#034326" }],
        botoes: [{ id: "cta1", fundo: "#07A55D", label: "#FFFFFF" }],
      },
      ctx,
    )
    expect(r.ops.filter((o) => o.action === "set_botao")).toHaveLength(1)
  })

  it("faixa que NÃO mudou não mexe no botão dela", () => {
    const r = planoParaOps({ faixas: [{ ordem: 2, decisao: "manter" }] }, ctx)
    expect(r.ops.filter((o) => o.action === "set_botao")).toEqual([])
  })

  it("sem papéis não há como refazer o par — fica como estava", () => {
    const { roles: _roles, ...semPapeis } = ctx
    const r = planoParaOps({ faixas: [{ ordem: 2, decisao: "escurecer", fundo: "#034326" }] }, semPapeis)
    expect(r.ops.filter((o) => o.action === "set_botao")).toEqual([])
  })
})

describe("botão vazado — o par é indivisível", () => {
  const IB = {
    button_bg: "#034326",
    button_text: "#FFFFFF",
    bg: "#FFFFFF",
    text: "#1F1F1F",
    surface: "#F2F2F2",
    accent: "#07A55D",
  }
  // O rodapé real da Innova Bay: menu de links vazados, 18px, sobre #FDFDFD.
  const ctxRodape: ContextoDoPlano = {
    faixas: [faixa({ ordem: 1, bloco: 0 }), faixa({ ordem: 6, bloco: 5, tipo: "footer", fundo: "#FDFDFD" })],
    ctas: [
      cta({ id: "cta7", bloco: 5, faixa: 6, texto: "Energy", fundo: null, label: "#000000", tipo: "vazado", contraste: null, largura_px: 236, font_size_px: 18 }),
    ],
    incentivo: { existe: true, percentual: 10, codigo: "WELCOME10" },
    urlLoja: "https://loja.com",
    roles: IB,
  }

  // 17/09: o agente pediu fundo verde + label branco para os seis links do
  // menu; o aplicador só troca fundo onde já existe um, então entrou só o
  // label — branco sobre #FDFDFD, 1,01:1, invisível.
  it("o fundo pedido é descartado com motivo, e a op sai só com label", () => {
    const r = planoParaOps(
      { botoes: [{ id: "cta7", fundo: "#034326", label: "#FFFFFF" }] },
      ctxRodape,
    )
    expect(r.ops).toHaveLength(1)
    expect(r.ops[0]).toEqual({ action: "set_botao", cta: "cta7", label: "#1F1F1F" })
    expect(r.descartes.map((d) => d.o_que)).toContain("fundo do botão cta7")
    expect(r.descartes[0].motivo).toContain("hierarquia")
  })

  it("o label branco que o agente pediu não sobrevive à régua", () => {
    const r = planoParaOps({ botoes: [{ id: "cta7", label: "#FFFFFF" }] }, ctxRodape)
    expect(r.ops[0]).toMatchObject({ label: "#1F1F1F" })
    expect(r.ajustes[0].o_que).toBe("botão cta7 (vazado)")
  })

  it("label que já lê sobre a faixa passa intacto", () => {
    const r = planoParaOps({ botoes: [{ id: "cta7", label: "#000000" }] }, ctxRodape)
    expect(r.ops[0]).toEqual({ action: "set_botao", cta: "cta7", label: "#000000" })
    expect(r.ajustes).toHaveLength(0)
  })

  // O guard do "botão deixado para trás", pelo caminho do vazado: ele
  // chamava `corDoBotao` e recebia um par com fundo que o aplicador não
  // aplica — o mesmo meio-par, por outra porta.
  it("faixa que escureceu leva o label do vazado junto", () => {
    const r = planoParaOps(
      { faixas: [{ ordem: 6, fundo: "#034326", decisao: "escurecer", porque: "R6" }] },
      ctxRodape,
    )
    const doBotao = r.ops.filter((o) => o.action === "set_botao")
    expect(doBotao).toEqual([{ action: "set_botao", cta: "cta7", label: "#FFFFFF" }])
  })

  it("preenchido segue recebendo o par inteiro", () => {
    const r = planoParaOps(
      { botoes: [{ id: "cta1", fundo: "#FFFFFF", label: "#FFFFFF" }] },
      { ...CTX, roles: IB },
    )
    expect(r.ops[0]).toMatchObject({ action: "set_botao", fundo: expect.any(String), label: expect.any(String) })
  })
})
