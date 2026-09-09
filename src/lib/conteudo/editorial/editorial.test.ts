import { describe, expect, it } from "vitest"
import { ANTI_PADROES_HEADLINE, GATILHOS, PADROES_HEADLINE, avaliarHeadline, validarContratoCapa } from "./padroes"
import { REGRAS_ANTI_SLOP, filtrarAntiSlop, revisarDocumento } from "./anti-slop"
import { NOTA_MINIMA, PARAMETROS, consolidarRevisao } from "./revisao"
import { etapaAtual, headlineEscolhida, podeGerarCopy } from "./pipeline"
import { papeisDoMeio, papeisDosFrames } from "./papeis"
import type { Documento, Editorial } from "../types"

describe("padrões e gatilhos", () => {
  it("ids únicos e exemplo da casa passa no próprio checklist", () => {
    expect(new Set(PADROES_HEADLINE.map((p) => p.id)).size).toBe(PADROES_HEADLINE.length)
    expect(new Set(GATILHOS.map((g) => g.id)).size).toBe(GATILHOS.length)
    for (const p of PADROES_HEADLINE) {
      const a = avaliarHeadline({ texto: p.exemplo, padrao: p.id, gatilhos: ["curiosidade", "identidade"] })
      expect(a.antiPadroes, `${p.id}: ${p.exemplo}`).toEqual([])
      expect(a.veredito).toBe("aprovada")
    }
  })

  it("checklist de rejeição reprova o que a régua manda reescrever", () => {
    const casos: Array<[string, string]> = [
      ["Descubra como dobrar suas vendas", "revelacao_generica"],
      ["5 dicas para vender mais no e-mail", "lista_saturada"],
      ["Quando o cupom vira vício", "quando_x_vira_y"],
      ["A ascensão do e-mail marketing", "ascensao_de"],
      ["O impacto da IA no e-commerce", "impacto_de"],
      ["Por que a IA está mudando o varejo", "esta_mudando"],
      ["Não é sobre cupom, é sobre retenção", "nao_e_x_e_y"],
      ["O e-mail virou o canal mais lucrativo", "virou"],
      ["Tudo que você precisa saber sobre LTV", "tudo_que_precisa"],
    ]
    for (const [texto, id] of casos) {
      const a = avaliarHeadline({ texto, padrao: "contraste", gatilhos: ["medo_alerta", "identidade"] })
      expect(a.antiPadroes, texto).toContain(id)
      expect(a.veredito).toBe("reprovada")
    }
    expect(new Set(ANTI_PADROES_HEADLINE.map((a) => a.id)).size).toBe(ANTI_PADROES_HEADLINE.length)
  })

  it("sem padrão válido ou com 1 gatilho vira ressalva, não reprovação", () => {
    expect(avaliarHeadline({ texto: "8% dos clientes fazem 41% do faturamento", padrao: "inventado", gatilhos: ["curiosidade", "identidade"] }).veredito).toBe("ressalva")
    expect(avaliarHeadline({ texto: "8% dos clientes fazem 41% do faturamento", padrao: "dado_contraintuitivo", gatilhos: ["curiosidade"] }).veredito).toBe("ressalva")
    expect(avaliarHeadline({ texto: "8% dos clientes fazem 41% do faturamento", padrao: "dado_contraintuitivo", gatilhos: ["curiosidade", "curiosidade"] }).veredito).toBe("ressalva")
  })

  it("contrato da capa: subtítulo independente, dentro do canvas, não repete", () => {
    const lim = { titulo: 56, subtitulo: 90 }
    expect(validarContratoCapa("8% dos clientes fazem 41% do faturamento", "você conhece os seus 8%?", lim)).toEqual([])
    expect(validarContratoCapa("8% dos clientes fazem 41% do faturamento", "e a maioria trata todo mundo igual", lim)[0]).toMatch(/começa com "e"/)
    expect(validarContratoCapa("A".repeat(60), undefined, lim)[0]).toMatch(/60 caracteres/)
    expect(validarContratoCapa("Mesma coisa", "mesma coisa", lim)[0]).toMatch(/repete/)
    expect(validarContratoCapa("", "x", lim)[0]).toMatch(/vazio/i)
  })
})

describe("filtro anti-slop", () => {
  it("ids únicos", () => {
    expect(new Set(REGRAS_ANTI_SLOP.map((r) => r.id)).size).toBe(REGRAS_ANTI_SLOP.length)
  })

  it("pega binário, cacoete, travessão e dado sem fonte com o trecho", () => {
    const v = filtrarAntiSlop("Não é sobre cupom, é sobre retenção. E isso muda tudo — estudos mostram que funciona.", "slide")
    const ids = v.map((x) => x.regra)
    expect(ids).toEqual(expect.arrayContaining(["nao_e_x_e_y", "muda_tudo", "travessao", "dado_sem_fonte"]))
    expect(v.find((x) => x.regra === "dado_sem_fonte")?.trecho).toBe("estudos mostram")
    expect(v.every((x) => x.severidade === "erro")).toBe(true)
  })

  it("copy da casa passa limpa (o filtro não pode reprovar o carrossel bom)", () => {
    const bons = [
      "Você sabe de cabeça quanto faturou ontem.",
      "Sabe seu ROAS, seu CPA, quanto gastou em criativo essa semana.",
      "O Smile.io, app de fidelidade do Shopify, cruzou os dados de 1,1 bilhão de compradores em 250 mil lojas de e-commerce.",
      "Loja de R$300 mil por mês, ticket médio de R$150. São 2.000 pedidos no mês.",
      "Cliente novo custa mais. Vender de novo pros seus 160 custa o mesmo de sempre.",
    ]
    for (const t of bons) expect(filtrarAntiSlop(t, "slide"), t).toEqual([])
  })

  it("segunda pessoa só reprova quando o perfil NÃO libera", () => {
    const t = "Você conhece os seus 8%?"
    expect(filtrarAntiSlop(t, "slide")).toEqual([])
    expect(filtrarAntiSlop(t, "slide", { segundaPessoa: true })).toEqual([])
    const v = filtrarAntiSlop(t, "slide", { segundaPessoa: false })
    expect(v.map((x) => x.regra)).toEqual(["segunda_pessoa"])
    expect(v[0].severidade).toBe("aviso")
  })

  it("anglicismo numérico é regra de LEGENDA; título de dado com \"3x\" não reprova", () => {
    expect(filtrarAntiSlop("3x", "slide")).toEqual([])
    expect(filtrarAntiSlop("cresceu 3x em 10+ anos", "legenda").map((x) => x.regra)).toContain("anglicismo_numerico")
  })

  it("revisarDocumento endereça frame e campo, e a legenda", () => {
    const doc = {
      frames: [
        { frameId: "f1", tipo: "capa", campos: ["titulo", "subtitulo"], textos: { titulo: "Descubra o segredo", subtitulo: "ok" } },
        { frameId: "f2", tipo: "texto", campos: ["titulo", "corpo"], textos: { titulo: "Título", corpo: "No fim das contas, funciona." } },
      ],
      legenda: "Continue no próximo slide — tem mais.",
    } as unknown as Pick<Documento, "frames" | "legenda">
    const v = revisarDocumento(doc)
    expect(v.find((x) => x.frameId === "f2")?.campo).toBe("corpo")
    expect(v.find((x) => x.frameId === "f2")?.regra).toBe("fim_das_contas")
    const leg = v.filter((x) => x.onde === "legenda").map((x) => x.regra)
    // "continue no próximo" é regra de SLIDE (na legenda o texto corrido pode citar); travessão vale em tudo
    expect(leg).toContain("travessao")
    expect(leg).not.toContain("fechamento_swipe")
  })
})

describe("revisão consolidada", () => {
  const ok = PARAMETROS.map((p) => ({ id: p.id, nota: 9, problemas: [] }))
  it("aprova só com os 7 ≥ 8 e zero violação erro", () => {
    const r = consolidarRevisao({ parametros: ok, slides: [] }, [], new Date("2026-09-09T00:00:00Z"))
    expect(r.aprovado).toBe(true)
    expect(r.parametros).toHaveLength(7)
    expect(r.em).toBe("2026-09-09T00:00:00.000Z")
  })
  it("parâmetro que a IA não devolveu entra com 0 e reprova (ausência não é aprovação)", () => {
    const r = consolidarRevisao({ parametros: ok.slice(1), slides: [] }, [])
    expect(r.aprovado).toBe(false)
    expect(r.parametros.find((p) => p.id === "gramatica")?.nota).toBe(0)
  })
  it("violação de slop pelo código rebaixa a nota da IA para 5, como o manual", () => {
    const r = consolidarRevisao({ parametros: ok, slides: [] }, [{ regra: "muda_tudo", nome: "x", trecho: "isso muda tudo", sugestao: "", severidade: "erro", onde: "slide" }])
    expect(r.parametros.find((p) => p.id === "ai_slop")?.nota).toBe(5)
    expect(r.aprovado).toBe(false)
    expect(r.resumo).toMatch(/AI slop/)
  })
  it("nota fora de 0–10 é normalizada", () => {
    const r = consolidarRevisao({ parametros: [{ id: "gramatica", nota: 14 }, ...ok.slice(1)], slides: [{ frameId: "f1", nota: -3 }] }, [])
    expect(r.parametros[0].nota).toBe(10)
    expect(r.slides[0].nota).toBe(0)
    expect(NOTA_MINIMA).toBe(8)
  })
})

describe("pipeline", () => {
  const base: Editorial = { insumo: "pauta", voz: "marca", segundaPessoa: true }
  it("etapa atual é a primeira pré-condição que falta", () => {
    expect(etapaAtual(undefined)).toBe("insumo")
    expect(etapaAtual({ ...base, insumo: "  " })).toBe("insumo")
    expect(etapaAtual(base)).toBe("triagem")
    const t = { transformacao: "", friccaoCentral: "", anguloDominante: "", evidencias: [], eixo: "mercado" as const, funil: "topo" as const, promessa: "" }
    expect(etapaAtual({ ...base, triagem: t })).toBe("headline")
    const h = [{ texto: "h", padrao: "contraste", gatilhos: ["medo_alerta", "identidade"], veredito: "aprovada" as const }]
    expect(etapaAtual({ ...base, triagem: t, headlines: h })).toBe("headline")
    expect(etapaAtual({ ...base, triagem: t, headlines: h, headlineEscolhida: 5 })).toBe("headline")
    expect(etapaAtual({ ...base, triagem: t, headlines: h, headlineEscolhida: 0 })).toBe("espinha")
    const e = { headline: "h", hook: "", mecanismo: "", prova: [], aplicacao: "", direcao: "", fechamento: "" }
    expect(etapaAtual({ ...base, triagem: t, headlines: h, headlineEscolhida: 0, espinha: e })).toBe("copy")
    expect(podeGerarCopy({ ...base, triagem: t, headlines: h, headlineEscolhida: 0, espinha: e })).toBe(true)
    expect(headlineEscolhida({ ...base, headlines: h, headlineEscolhida: 0 })?.texto).toBe("h")
  })
})

describe("papéis dos frames", () => {
  it("6 frames no meio = a sequência completa; menos corta aplicação e mecanismo antes dos 3 finais", () => {
    expect(papeisDoMeio(6)).toEqual(["hook", "mecanismo", "prova", "aplicacao", "direcao", "fechamento"])
    expect(papeisDoMeio(5)).toEqual(["hook", "mecanismo", "prova", "direcao", "fechamento"])
    expect(papeisDoMeio(4)).toEqual(["hook", "prova", "direcao", "fechamento"])
    expect(papeisDoMeio(3)).toEqual(["hook", "prova", "direcao"])
    expect(papeisDoMeio(1)).toEqual(["hook"])
    expect(papeisDoMeio(0)).toEqual([])
  })
  it("mais de 6 repete mecanismo e prova mantendo a ordem narrativa", () => {
    expect(papeisDoMeio(8)).toEqual(["hook", "mecanismo", "mecanismo", "prova", "prova", "aplicacao", "direcao", "fechamento"])
    expect(papeisDoMeio(8).slice(-2)).toEqual(["direcao", "fechamento"])
  })
  it("capa e CTA recebem headline e cta; sem CTA no fim o último frame é do meio", () => {
    const p = papeisDosFrames([
      { frameId: "f1", tipo: "capa" },
      { frameId: "f2", tipo: "dado" },
      { frameId: "f3", tipo: "texto" },
      { frameId: "f4", tipo: "cta" },
    ])
    expect(p).toEqual([
      { frameId: "f1", papel: "headline" },
      { frameId: "f2", papel: "hook" },
      { frameId: "f3", papel: "prova" },
      { frameId: "f4", papel: "cta" },
    ])
    expect(papeisDosFrames([{ frameId: "a", tipo: "texto" }, { frameId: "b", tipo: "texto" }]).map((x) => x.papel)).toEqual(["hook", "prova"])
  })
})
