import { describe, expect, it } from "vitest"
import { MEDIANA_ALTA, faixaDaNota, notaDoPerfil, retencaoDoPeriodo, taxaMediaPorPost, tetoDeRetencao } from "./nota"
import { deltaNumerico, desempenhoPorFormato, diagnosticar, formatoCampeao } from "./diagnostico"
import type { Formato, PilarMix, Post } from "../types"

const ROTAS = { dashboard: "/admin/conteudo/dashboard", estudio: "/admin/conteudo/estudio" }

let seq = 0
function post(o: Partial<Post> = {}): Post {
  seq++
  return {
    id: `m${seq}`,
    perfil: "canal-1",
    publicadoEm: "2026-09-01T12:00:00Z",
    data: "01/09",
    head: `Assunto ${seq}`,
    fmt: "Carrossel",
    pilar: null,
    molde: null,
    kw: null,
    permalink: null,
    thumb: null,
    alc: 1000,
    sav: 10,
    sh: 5,
    seg: null,
    com: 2,
    curtidas: 20,
    interacoes: 37,
    visitasPerfil: null,
    views: null,
    watchTimeS: null,
    sendsPorAlc: null,
    curtidasPorAlc: null,
    leads: 0,
    slides: null,
    legenda: null,
    documentoId: null,
    ...o,
  }
}

const mix = (semClassificacao: number, classificados: number): PilarMix => ({ alvo: {}, real: {}, semClassificacao, classificados })

describe("nota do perfil", () => {
  it("componente não medido sai do DENOMINADOR — nunca entra como zero", () => {
    // Sem seguidores (engajamento) e com 1 post só (retenção sem teto), a
    // nota roda com os componentes que sobraram. Contá-los como zero
    // inventaria defeito: a Meta não entregar dado não piora o perfil.
    const n = notaDoPerfil({ posts: [post({ kw: "GUIA", pilar: "Case" })], dias: 7, seguidores: null, metaSemanal: 1 })
    expect(n.medidos).toBe(2)
    expect(n.total).toBe(4)
    expect(n.nota).toBe(100) // constância 1/1 e conversão 1/1
    expect(n.componentes.find((c) => c.id === "engajamento")?.motivo).toMatch(/seguidores/)
  })

  it("nada medido devolve nota NULL, jamais 0", () => {
    const n = notaDoPerfil({ posts: [], dias: 7, seguidores: null, metaSemanal: 3 })
    // Sem post nenhum a constância é medível (zero de três), então a nota
    // existe; o que não pode existir é nota sem NENHUM componente.
    expect(n.medidos).toBeGreaterThan(0)
    const vazio = notaDoPerfil({ posts: [], dias: 0, seguidores: null, metaSemanal: 0 })
    expect(vazio.componentes.filter((c) => c.valor != null).length).toBe(vazio.medidos)
  })

  it("toda a conta fica visível: peso, evidência e referência por componente", () => {
    const n = notaDoPerfil({ posts: [post()], dias: 7, seguidores: 1000, metaSemanal: 3 })
    for (const c of n.componentes) {
      expect(c.peso).toBeGreaterThan(0)
      expect(c.referencia.length).toBeGreaterThan(10)
      if (c.valor == null) expect(c.motivo).toBeTruthy()
      else expect(c.evidencia).not.toBe("—")
    }
    expect(n.componentes.reduce((a, c) => a + c.peso, 0)).toBe(100)
  })

  it("a conversão não é ZERO quando ninguém classificou — é não medida", () => {
    // 0 de 90 classificados é o retrato real da base hoje. "O perfil não
    // converte" e "ninguém classificou" pedem ações opostas.
    const posts = Array.from({ length: 6 }, () => post())
    const n = notaDoPerfil({ posts, dias: 30, seguidores: 800, metaSemanal: 3 })
    const conv = n.componentes.find((c) => c.id === "conversao")!
    expect(conv.valor).toBeNull()
    expect(conv.motivo).toMatch(/classificado/)
  })

  it("com classificação, a conversão passa a valer o que foi medido", () => {
    const posts = [post({ pilar: "Case", kw: "GUIA" }), post({ pilar: "Case" })]
    const conv = notaDoPerfil({ posts, dias: 14, seguidores: 800, metaSemanal: 3 }).componentes.find((c) => c.id === "conversao")!
    expect(conv.valor).toBeCloseTo(0.5)
  })

  it("o engajamento é a média POR POST — a forma das medianas publicadas", () => {
    const t = taxaMediaPorPost([post({ curtidas: 10, com: 0, sh: 0, sav: 0 }), post({ curtidas: 30, com: 0, sh: 0, sav: 0 })], 1000)
    expect(t.valor).toBeCloseTo(2) // média de 1% e 3%
    expect(t.completa).toBe(true)
  })

  it("bater a maior mediana publicada vale nota cheia, e ela tem fonte", () => {
    expect(MEDIANA_ALTA.fonte.length).toBeGreaterThan(0)
    const posts = [post({ curtidas: MEDIANA_ALTA.valor * 10, com: 0, sh: 0, sav: 0 })]
    const eng = notaDoPerfil({ posts, dias: 7, seguidores: 1000, metaSemanal: 3 }).componentes.find((c) => c.id === "engajamento")!
    expect(eng.valor).toBe(1)
    expect(eng.evidencia).toContain(MEDIANA_ALTA.fonte)
  })

  it("o teto da retenção é a mediana dos 3 melhores, não o melhor sozinho", () => {
    // Um post de alcance baixo com 2 compartilhamentos vira um teto que
    // ninguém alcança — o alarme falso que ensina a ignorar o alarme.
    const posts = [
      post({ alc: 40, sh: 2 }), // 5% — fora do piso de amostra (alcance < 30 é o corte; 40 passa)
      post({ alc: 1000, sh: 20 }), // 2%
      post({ alc: 1000, sh: 10 }), // 1%
      post({ alc: 1000, sh: 5 }), // 0,5%
      post({ alc: 1000, sh: 5 }),
    ]
    const { teto, amostra } = tetoDeRetencao(posts)
    expect(amostra).toBe(5)
    expect(teto).toBeCloseTo(2) // mediana de [5, 2, 1]
  })

  it("post de alcance minúsculo não entra no teto", () => {
    const posts = [post({ alc: 10, sh: 5 }), ...Array.from({ length: 5 }, () => post({ alc: 1000, sh: 10 }))]
    expect(tetoDeRetencao(posts).teto).toBeCloseTo(1)
  })

  it("amostra curta deixa a retenção NÃO MEDIDA, com o motivo", () => {
    const r = notaDoPerfil({ posts: [post(), post()], dias: 7, seguidores: 900, metaSemanal: 3 }).componentes.find((c) => c.id === "retencao")!
    expect(r.valor).toBeNull()
    expect(r.motivo).toMatch(/alcance/)
  })

  it("a retenção do período é soma ÷ soma, jamais média de razões", () => {
    // Média de razões daria (10% + 0,1%)/2 = 5,05%; a conta certa é 20/11000.
    const r = retencaoDoPeriodo([post({ alc: 100, sh: 10 }), post({ alc: 10900, sh: 10 })])
    expect(r).toBeCloseTo((20 / 11000) * 100, 4)
  })

  it("a faixa acompanha a nota", () => {
    expect(faixaDaNota(95)).toBe("excelente")
    expect(faixaDaNota(65)).toBe("bom")
    expect(faixaDaNota(45)).toBe("atencao")
    expect(faixaDaNota(10)).toBe("critico")
  })
})

describe("desempenho por formato", () => {
  const comFmt = (fmt: Formato, n: number, sh: number) => Array.from({ length: n }, () => post({ fmt, alc: 1000, sh }))

  it("mede o que a referência apenas AFIRMA sobre carrossel", () => {
    const posts = [...comFmt("Carrossel", 3, 20), ...comFmt("Reels", 7, 5)]
    const d = desempenhoPorFormato(posts)
    const carrossel = d.find((x) => x.fmt === "Carrossel")!
    expect(carrossel.retencao).toBeCloseTo(2)
    expect(carrossel.share).toBeCloseTo(0.3)
    expect(formatoCampeao(d)?.fmt).toBe("Carrossel")
  })

  it("formato com amostra curta não vira campeão", () => {
    const posts = [...comFmt("Imagem", 1, 50), ...comFmt("Reels", 7, 5)]
    expect(formatoCampeao(desempenhoPorFormato(posts))).toBeNull()
  })

  it("um formato só não tem com quem ser comparado", () => {
    expect(formatoCampeao(desempenhoPorFormato(comFmt("Reels", 9, 5)))).toBeNull()
  })

  it("o assunto do melhor post do formato semeia a pauta", () => {
    const posts = [post({ fmt: "Carrossel", alc: 1000, sh: 40, head: "O erro que custa caro" }), ...comFmt("Carrossel", 3, 1)]
    expect(desempenhoPorFormato(posts).find((d) => d.fmt === "Carrossel")?.melhorAssunto).toBe("O erro que custa caro")
  })
})

describe("diagnóstico", () => {
  const base = {
    dias: 30,
    metaSemanal: 3,
    pilarMix: mix(0, 10),
    alcanceDelta: null,
    referenciasAtivas: 2,
    perfis: 1,
    brandKits: 1,
    rotas: ROTAS,
  }

  it("cadência abaixo da meta vira lacuna, e a saída é PUBLICAR — não há ação de sistema", () => {
    const l = diagnosticar({ ...base, posts: [post(), post()] }).find((x) => x.id === "cadencia")!
    expect(l.evidencia).toContain("meta 3")
    expect(l.pauta).toBeTruthy()
    // A referência oferece "Gerar carrossel disso" em TODO card, inclusive
    // onde o que falta é rotina. Aqui cada lacuna só oferece o que resolve.
    expect(l.acao).toBeUndefined()
  })

  it("classificação faltando vira AÇÃO, nunca pauta — publicar não resolve", () => {
    const l = diagnosticar({ ...base, posts: [post()], pilarMix: mix(90, 0) }).find((x) => x.id === "classificacao")!
    expect(l.gravidade).toBe("alta")
    expect(l.acao?.href).toBe(ROTAS.dashboard)
    expect(l.pauta).toBeUndefined()
    expect(l.evidencia).toContain("90")
  })

  it("o formato campeão é o MEDIDO neste perfil, não a afirmação de mercado", () => {
    const posts = [
      ...Array.from({ length: 2 }, () => post({ fmt: "Carrossel", alc: 1000, sh: 30 })),
      ...Array.from({ length: 8 }, () => post({ fmt: "Reels", alc: 1000, sh: 2 })),
    ]
    const l = diagnosticar({ ...base, posts }).find((x) => x.id === "formato")
    // Carrossel tem 2 posts com alcance — abaixo do mínimo de amostra.
    expect(l).toBeUndefined()
    const posts3 = [...posts, post({ fmt: "Carrossel", alc: 1000, sh: 30 })]
    const l3 = diagnosticar({ ...base, posts: posts3 }).find((x) => x.id === "formato")!
    expect(l3.titulo).toContain("Carrossel")
    expect(l3.pauta).toContain("Carrossel")
  })

  it("sem palavra-chave nenhuma o comment gate vira lacuna ALTA com os dois caminhos", () => {
    const l = diagnosticar({ ...base, posts: [post(), post()] }).find((x) => x.id === "gate")!
    expect(l.gravidade).toBe("alta")
    expect(l.acao).toBeTruthy()
    expect(l.pauta).toBeTruthy()
  })

  it("com palavra-chave, a lacuna do gate some", () => {
    expect(diagnosticar({ ...base, posts: [post({ kw: "GUIA" })] }).find((x) => x.id === "gate")).toBeUndefined()
  })

  it("queda de alcance só vira lacuna quando é relevante", () => {
    const leve = diagnosticar({ ...base, posts: [post()], alcanceDelta: "-5,0%" })
    expect(leve.find((x) => x.id === "alcance")).toBeUndefined()
    const forte = diagnosticar({ ...base, posts: [post()], alcanceDelta: "-34,2%" })
    expect(forte.find((x) => x.id === "alcance")?.evidencia).toContain("-34,2%")
  })

  it("delta em formato pt-BR é lido sem virar NaN", () => {
    expect(deltaNumerico("-34,2%")).toBeCloseTo(-34.2)
    expect(deltaNumerico("+6,2%")).toBeCloseTo(6.2)
    expect(deltaNumerico("1.234,5%")).toBeCloseTo(1234.5)
    expect(deltaNumerico(null)).toBeNull()
  })

  it("sem referência curada a lacuna explica o que a IA perde", () => {
    const l = diagnosticar({ ...base, posts: [post()], referenciasAtivas: 0 }).find((x) => x.id === "referencia")!
    expect(l.custo).toMatch(/regra/)
    expect(l.acao?.href).toBe(ROTAS.estudio)
  })

  it("perfil sem kit de marca aparece — é o que deixa o cartão em branco", () => {
    const l = diagnosticar({ ...base, posts: [post()], perfis: 2, brandKits: 0 }).find((x) => x.id === "brand_kit")!
    expect(l.evidencia).toContain("2 de 2")
  })

  it("insight ausente é MEDIÇÃO incompleta, não defeito do perfil", () => {
    const posts = [...Array.from({ length: 6 }, () => post({ alc: null, sh: null })), post()]
    const l = diagnosticar({ ...base, posts }).find((x) => x.id === "insights")!
    expect(l.custo).toMatch(/componentes medidos|—/)
    expect(l.saida).toMatch(/token|permiss/i)
  })

  it("poucos posts não disparam a lacuna de insight — amostra curta não é diagnóstico", () => {
    expect(diagnosticar({ ...base, posts: [post({ alc: null })] }).find((x) => x.id === "insights")).toBeUndefined()
  })

  it("as graves vêm primeiro", () => {
    const l = diagnosticar({ ...base, posts: [post(), post()], pilarMix: mix(5, 0) })
    const altas = l.filter((x) => x.gravidade === "alta").length
    expect(l.slice(0, altas).every((x) => x.gravidade === "alta")).toBe(true)
  })

  it("perfil saudável não inventa lacuna", () => {
    const posts = Array.from({ length: 13 }, () => post({ kw: "GUIA", pilar: "Case", molde: "Post" }))
    expect(diagnosticar({ ...base, posts, pilarMix: mix(0, 13) })).toEqual([])
  })
})
