import { describe, expect, it } from "vitest"

import type { Cta, Faixa } from "./color-faixas"
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
    expect(planoParaOps({}, CTX)).toEqual({ ops: [], descartes: [] })
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
