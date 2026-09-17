import { describe, it, expect } from "vitest"
import { mecanicaDoIncentivo } from "../objecoes/incentivo"
import { auditarRequisitos, renderAuditoria, resumoDasDuras } from "./auditoria-requisitos"
import { normalizarOutputDetalhado } from "./estruturador-prompt"
import type { CapacidadeDaSecao } from "../shared/field-roles"
import type { DecisaoDeIncentivo } from "../objecoes/incentivo"
import { ALVO_HERO_BOXERS_W1, ESTRUTURADOR_HERO_BOXERS_W1 } from "../shared/fixtures/hero-boxers-welcome-1"

/** Capacidade da biblioteca como estava em 14/09 (o que o Estruturador recebeu). */
const CAP: Record<string, CapacidadeDaSecao> = {
  hero: { variantes: 9, itens: null, com_preco: 0, com_avaliacao: 0, com_cupom: 3, com_cta: 9, com_credencial: 0 },
  body: { variantes: 10, itens: { min: 2, max: 4 }, com_preco: 0, com_avaliacao: 0, com_cupom: 0, com_cta: 6, com_credencial: 0 },
  reviews: { variantes: 5, itens: { min: 1, max: 3 }, com_preco: 0, com_avaliacao: 4, com_cupom: 0, com_cta: 2, com_credencial: 2 },
  products: { variantes: 9, itens: { min: 1, max: 9 }, com_preco: 1, com_avaliacao: 0, com_cupom: 0, com_cta: 9, com_credencial: 0 },
  footer: { variantes: 3, itens: null, com_preco: 0, com_avaliacao: 0, com_cupom: 0, com_cta: 0, com_credencial: 0 },
}
const SECOES = Object.keys(CAP)

const COM_CUPOM: DecisaoDeIncentivo = {
  existe: true, codigo: "WELCOME10", valor: "10%", mecanica: mecanicaDoIncentivo(true), origem: "outline_traduzido", traducao_faltante: false,
}
const SEM_CUPOM: DecisaoDeIncentivo = {
  existe: false, codigo: null, valor: null, mecanica: null, origem: "sem_incentivo", traducao_faltante: false,
}

const base = (over: Partial<Parameters<typeof auditarRequisitos>[0]> = {}) =>
  auditarRequisitos({
    saida: ESTRUTURADOR_HERO_BOXERS_W1,
    alvo: ALVO_HERO_BOXERS_W1,
    incentivo: SEM_CUPOM,
    capacidade: CAP,
    secoesDisponiveis: SECOES,
    descartados: [],
    ...over,
  })

describe("auditarRequisitos — a fixture real do batch 6249aef2", () => {
  it("com o incentivo que o Catalogador zerou (existe:false), a decisão de 11/09 passa", () => {
    const a = base()
    expect(a.duras).toEqual([])
    expect(a.ok).toBe(true)
    expect(a.posicoes).toBe(6)
    expect(a.com_requisito).toBe(6)
  })

  it("com o incentivo do outline (existe:true) e o alvo pedindo ENTREGA, seis posições cupom:false é dura", () => {
    const a = base({ incentivo: COM_CUPOM })
    expect(a.ok).toBe(false)
    expect(a.duras.map((d) => d.regra)).toEqual(["incentivo_sem_lugar"])
    expect(a.duras[0].detalhe).toContain("WELCOME10")
    expect(a.duras[0].detalhe).toContain("ENTREGA")
  })

  it("sem alvo, o toque com incentivo e nenhum cupom é só aviso (o e-mail pode não entregá-lo)", () => {
    const a = base({ incentivo: COM_CUPOM, alvo: null })
    expect(a.duras).toEqual([])
    expect(a.avisos.map((v) => v.regra)).toContain("incentivo_sem_lugar")
  })

  it("o incentivo ausente (null) não gera achado nenhum sobre cupom", () => {
    const a = base({ incentivo: null })
    expect([...a.duras, ...a.avisos].filter((x) => x.regra.includes("incentivo") || x.regra.includes("cupom"))).toEqual([])
  })
})

describe("auditarRequisitos — regras sintéticas", () => {
  const saidaCom = (patch: (s: typeof ESTRUTURADOR_HERO_BOXERS_W1) => typeof ESTRUTURADOR_HERO_BOXERS_W1) =>
    patch(JSON.parse(JSON.stringify(ESTRUTURADOR_HERO_BOXERS_W1)))

  it("cupom:true num toque SEM incentivo é dura, posição a posição", () => {
    const saida = saidaCom((s) => {
      s.estrutura[0].requisitos!.cupom = true
      return s
    })
    const a = base({ saida, incentivo: SEM_CUPOM })
    expect(a.duras).toHaveLength(1)
    expect(a.duras[0]).toMatchObject({ regra: "cupom_contradiz_incentivo", block_index: 0, section: "hero" })
  })

  it("cupom:true com incentivo, na hero, satisfaz a entrega — zero duras", () => {
    const saida = saidaCom((s) => {
      s.estrutura[0].requisitos!.cupom = true
      return s
    })
    expect(base({ saida, incentivo: COM_CUPOM }).duras).toEqual([])
  })

  it("nenhuma posição com requisitos é dura; algumas sem é aviso", () => {
    const todas = saidaCom((s) => {
      for (const p of s.estrutura) delete p.requisitos
      return s
    })
    expect(base({ saida: todas }).duras.map((d) => d.regra)).toEqual(["sem_requisitos"])
    const uma = saidaCom((s) => {
      delete s.estrutura[5].requisitos
      return s
    })
    const a = base({ saida: uma })
    expect(a.duras).toEqual([])
    expect(a.avisos.filter((v) => v.regra === "sem_requisitos")).toHaveLength(1)
    expect(a.com_requisito).toBe(5)
  })

  it("valor descartado em campo de FILTRO é dura; em campo de copy é aviso", () => {
    const a = base({
      descartados: [
        { block_index: 0, section: "hero", campo: "cupom", valor_cru: "false" },
        { block_index: 1, section: "body", campo: "campos", valor_cru: "price" },
      ],
    })
    expect(a.duras.map((d) => d.regra)).toEqual(["valor_descartado"])
    expect(a.duras[0].detalhe).toContain('"cupom" = "false"')
    expect(a.avisos.filter((v) => v.regra === "valor_descartado")).toHaveLength(1)
  })

  it("exigir o que a seção não tem é dura: preço em body, avaliação em products, itens fora da faixa", () => {
    const saida = saidaCom((s) => {
      s.estrutura[1].requisitos!.preco = true // body: com_preco 0
      s.estrutura[4].requisitos!.avaliacao = true // products: com_avaliacao 0
      s.estrutura[3].requisitos!.n_itens = { min: 5, max: 6 } // reviews: 1–3
      return s
    })
    const a = base({ saida })
    const fora = a.duras.filter((d) => d.regra === "exige_fora_da_capacidade")
    expect(fora.map((d) => d.section)).toEqual(["body", "reviews", "products"])
    expect(fora[1].detalhe).toContain("5–6 itens")
  })

  it("seção fora da lista e header/cta são duras", () => {
    const saida = saidaCom((s) => {
      s.estrutura[0].section = "header"
      s.estrutura[2].section = "comparison"
      return s
    })
    const a = base({ saida })
    const fora = a.duras.filter((d) => d.regra === "secao_fora_da_lista")
    expect(fora.map((d) => d.section)).toEqual(["header", "comparison"])
  })

  it("lista de seções vazia (capacidade não carregou) não acusa seção nenhuma — fail-open", () => {
    expect(base({ secoesDisponiveis: [], capacidade: {} }).duras).toEqual([])
  })

  it("papel que nega em prosa o que o requisito deixou indiferente é aviso (pt e en)", () => {
    const saida = saidaCom((s) => {
      s.estrutura[0].requisitos!.cupom = null
      s.estrutura[0].papel = "Entrega da promessa SEM incentivo, sem código"
      s.estrutura[1].requisitos!.cta = null
      s.estrutura[1].requisitos!.exige = ["no button here"]
      return s
    })
    const a = base({ saida, incentivo: null })
    const av = a.avisos.filter((v) => v.regra === "papel_diz_requisito_nao" && v.block_index! < 2)
    expect(av.map((v) => [v.section, v.detalhe.includes("cupom"), v.detalhe.includes("cta")])).toEqual([
      ["hero", true, false],
      ["body", false, true],
    ])
  })

  it("a fixture real já carrega esse aviso: products diz 'sem avaliação' e deixou avaliacao null", () => {
    const av = base().avisos.filter((v) => v.regra === "papel_diz_requisito_nao")
    expect(av.map((v) => v.section)).toEqual(["products"])
    expect(av[0].detalhe).toContain("avaliacao")
  })

  it("descarte sem porquê, ou sem seção e sem papel, é aviso", () => {
    const saida = saidaCom((s) => {
      s.descartes[0].porque = ""
      s.descartes[1].section = null
      s.descartes[1].papel_na_referencia = null
      return s
    })
    const a = base({ saida })
    expect(a.avisos.filter((v) => v.regra === "descarte_sem_dispositivo")).toHaveLength(2)
  })
})

describe("normalizarOutputDetalhado alimenta a auditoria", () => {
  it('"cupom": "false" (string) é descartado COM registro e a auditoria o acusa como dura', () => {
    const { saida, descartados } = normalizarOutputDetalhado({
      estrutura: [
        { section: "hero", papel: "abre", referencia: "r", porque: "p", requisitos: { cupom: "false", cta: true, campos: ["price", "preco"], n_itens: "2-3" } },
        { section: "body", papel: "corpo", referencia: "r", porque: "p" },
      ],
    })
    expect(saida.estrutura[0].requisitos).toMatchObject({ cupom: null, cta: true, campos: ["preco"], n_itens: null })
    expect(descartados.map((d) => `${d.block_index}:${d.campo}`)).toEqual(["0:cupom", "0:n_itens", "0:campos"])
    const a = auditarRequisitos({
      saida, alvo: null, incentivo: null, capacidade: CAP, secoesDisponiveis: SECOES, descartados,
    })
    expect(a.duras.map((d) => d.regra)).toEqual(["valor_descartado", "valor_descartado"])
  })

  it("posição descartada por falta de papel não desloca o índice dos descartes", () => {
    const { descartados } = normalizarOutputDetalhado({
      estrutura: [
        { section: "hero" }, // cai fora
        { section: "body", papel: "corpo", referencia: "r", porque: "p", requisitos: { preco: "sim" } },
      ],
    })
    expect(descartados).toEqual([{ block_index: 0, section: "body", campo: "preco", valor_cru: "sim" }])
  })
})

describe("renderAuditoria / resumoDasDuras", () => {
  it("sem duras devolve o texto da primeira tentativa; com duras, lista numerada", () => {
    expect(renderAuditoria(base())).toContain("primeira tentativa")
    const a = base({ incentivo: COM_CUPOM })
    const txt = renderAuditoria(a)
    expect(txt).toContain("1. [incentivo_sem_lugar]")
    expect(txt).toContain("mantendo o que não foi apontado")
    expect(resumoDasDuras(a)).toBe("incentivo_sem_lugar")
  })

  it("o resumo agrupa por regra", () => {
    const a = base({
      descartados: [
        { block_index: 0, section: "hero", campo: "cupom", valor_cru: "x" },
        { block_index: 1, section: "body", campo: "cta", valor_cru: "y" },
      ],
    })
    expect(resumoDasDuras(a)).toBe("valor_descartado×2")
  })
})

describe("custódia: os requisitos auditados são os que chegam ao Curador", () => {
  it("parsed_output → decisaoCompletaParaCurador → requisitosDaDecisao preserva posição a posição", async () => {
    const { decisaoCompletaParaCurador, requisitosDaDecisao } = await import("./estruturador-consume")
    const auditada = base({ incentivo: COM_CUPOM })
    const json = decisaoCompletaParaCurador(ESTRUTURADOR_HERO_BOXERS_W1)
    const noCurador = requisitosDaDecisao(json)
    expect(noCurador).toHaveLength(auditada.posicoes)
    expect(noCurador.filter((r) => r != null)).toHaveLength(auditada.com_requisito)
    // O campo que a auditoria confere é o MESMO que o filtro lê.
    expect(noCurador.map((r) => r?.cupom)).toEqual(ESTRUTURADOR_HERO_BOXERS_W1.estrutura.map((p) => p.requisitos?.cupom))
    expect(noCurador[4]).toMatchObject({ preco: true, n_itens: { min: 2, max: 2 } })
  })
})

describe("dispositivo (B3)", () => {
  const CAP_DISP: Record<string, CapacidadeDaSecao> = {
    hero: { ...CAP.hero, por_dispositivo: { pergunta_ao_leitor: 2, oferta_em_manchete: 5 }, classificadas: 7 },
    body: { ...CAP.body, por_dispositivo: { tese_declarada: 2 }, classificadas: 2 },
    // reviews sem NENHUMA classificada: dispositivo ausente ali só avisa.
    reviews: { ...CAP.reviews },
    products: { ...CAP.products, por_dispositivo: { vitrine_narrada: 5 }, classificadas: 5 },
    footer: { ...CAP.footer, por_dispositivo: { menu_de_saida: 3 }, classificadas: 3 },
  }
  const base = (estrutura: Array<Record<string, unknown>>) =>
    auditarRequisitos({
      saida: normalizarOutputDetalhado({ estrutura, descartes: [] }).saida,
      alvo: null,
      incentivo: null,
      capacidade: CAP_DISP,
      secoesDisponiveis: Object.keys(CAP_DISP),
      descartados: [],
    })

  it("posição sem dispositivo numa seção classificada é DURA; em seção não classificada é aviso", () => {
    const a = base([
      { section: "hero", papel: "abre", referencia: "r", porque: "p", requisitos: { cta: true } },
      { section: "reviews", papel: "prova", referencia: "r", porque: "p", requisitos: { n_itens: { min: 2, max: 2 } } },
    ])
    expect(a.duras.map((d) => [d.regra, d.block_index])).toEqual([["dispositivo_ausente", 0]])
    expect(a.avisos.filter((v) => v.regra === "dispositivo_ausente").map((v) => v.block_index)).toEqual([1])
  })

  it("dispositivo sem variante ativa na seção é DURA quando a seção está classificada", () => {
    const a = base([
      { section: "body", papel: "compara", referencia: "r", porque: "p", requisitos: { dispositivo: "comparacao_pareada" } },
    ])
    expect(a.duras.map((d) => d.regra)).toEqual(["dispositivo_sem_variante"])
    expect(a.duras[0].detalhe).toContain("tem: tese_declarada")
  })

  it("dispositivo fora do vocabulário chega como valor descartado e é DURA (campo de filtro)", () => {
    const n = normalizarOutputDetalhado({
      estrutura: [{ section: "body", papel: "x", referencia: "r", porque: "p", requisitos: { dispositivo: "body_varredura", cupom: false } }],
      descartes: [],
    })
    const a = auditarRequisitos({ saida: n.saida, alvo: null, incentivo: null, capacidade: CAP_DISP, secoesDisponiveis: Object.keys(CAP_DISP), descartados: n.descartados })
    expect(a.duras.map((d) => d.regra).sort()).toEqual(["dispositivo_ausente", "valor_descartado"])
  })
})

// ── imagem_sem_cena (15/09, Innova Bay · Welcome 1, batch b6c478d3) ──────
//
// A posição da lista (lista_enumerada) saiu com `imagem: null`; a variante
// escolhida tinha slot de imagem e a foto repetiu a do hero. A auditoria
// passa a cobrar a cena onde a biblioteca tem foto gerada.
describe("auditarRequisitos — imagem_sem_cena (15/09)", () => {
  const capComImagem: Record<string, CapacidadeDaSecao> = {
    ...CAP,
    hero: { ...CAP.hero, com_imagem: 9, por_dispositivo: { abertura_editorial: 2 }, classificadas: 2, com_imagem_por_dispositivo: { abertura_editorial: 2 } },
    // lista_enumerada: 2 variantes, 1 com imagem → aviso; remocao_de_risco: 1 de 1 → dura.
    body: {
      ...CAP.body,
      com_imagem: 2,
      por_dispositivo: { lista_enumerada: 2, remocao_de_risco: 1 },
      classificadas: 3,
      com_imagem_por_dispositivo: { lista_enumerada: 1, remocao_de_risco: 1 },
    },
  }
  it("posição sem cena onde TODA variante da forma tem foto é dura; onde só parte tem, é aviso", () => {
    const a = base({ capacidade: capComImagem })
    const duras = a.duras.filter((d) => d.regra === "imagem_sem_cena")
    const avisos = a.avisos.filter((d) => d.regra === "imagem_sem_cena")
    // fixture: hero e products têm imagem; lista_enumerada, remocao_de_risco, reviews e footer não.
    expect(duras.map((d) => d.section)).toEqual(["body"])
    expect(duras[0].detalhe).toContain("remocao_de_risco")
    expect(duras[0].detalhe).toContain("toda variante")
    expect(avisos).toHaveLength(1)
    expect(avisos[0].detalhe).toContain("1 de 2 variantes")
  })
  it("seção sem foto gerada não cobra cena; posição COM cena passa", () => {
    const a = base({ capacidade: CAP })
    expect([...a.duras, ...a.avisos].filter((d) => d.regra === "imagem_sem_cena")).toEqual([])
    const b = base({ capacidade: capComImagem })
    expect(b.duras.some((d) => d.regra === "imagem_sem_cena" && d.section === "hero")).toBe(false)
  })
})

// ── n_itens_fora_do_dispositivo: o caso REAL da Innova (15/09) ──────────
//
// Batch das 15:49: posição `reviews` com `dispositivo: prova_por_volume` E
// `n_itens: {min:2, max:2}`. A biblioteca tinha três `prova_por_volume` (3, 3
// e 4 itens) e outras de `prova_por_autoridade` com grade menor — então
// `cap.itens` da SEÇÃO ia de 2 a 4 e a régua de capacidade não acusou nada
// (`ok: true`, `duras: []`). O filtro então eliminou as SETE variantes de
// reviews, a posição ficou vazia e a peça reprovou em `posicao_sem_variante`
// com o dedo apontado para a biblioteca, que estava certa.
describe("auditarRequisitos — n_itens × dispositivo", () => {
  const CAP_REVIEWS: Record<string, CapacidadeDaSecao> = {
    reviews: {
      ...CAP.reviews,
      // A seção inteira vai de 2 a 4 — é isso que escondia o erro.
      itens: { min: 2, max: 4 },
      por_dispositivo: { prova_por_volume: 3, prova_por_autoridade: 4 },
      classificadas: 7,
      itens_por_dispositivo: {
        prova_por_volume: { min: 3, max: 4 },
        prova_por_autoridade: { min: 2, max: 2 },
      },
    },
  }
  const auditar = (requisitos: Record<string, unknown>) =>
    auditarRequisitos({
      saida: normalizarOutputDetalhado({
        estrutura: [{ section: "reviews", papel: "prova", referencia: "r", porque: "p", requisitos }],
        descartes: [],
      }).saida,
      alvo: null,
      incentivo: null,
      capacidade: CAP_REVIEWS,
      secoesDisponiveis: ["reviews"],
      descartados: [],
    })

  it("pedir 2 itens de um dispositivo que entrega 3–4 é DURA", () => {
    const a = auditar({ dispositivo: "prova_por_volume", n_itens: { min: 2, max: 2 } })
    const d = a.duras.filter((x) => x.regra === "n_itens_fora_do_dispositivo")
    expect(d).toHaveLength(1)
    expect(d[0].detalhe).toContain("prova_por_volume")
    expect(d[0].detalhe).toContain("3–4")
    expect(a.ok).toBe(false)
  })

  // A régua da SEÇÃO continua cega para este caso — é por isso que a nova
  // existe, e este teste é o que impede alguém de "simplificar" removendo-a.
  it("a régua da seção sozinha NÃO pegaria: 2 cabe na faixa 2–4 da seção", () => {
    const a = auditar({ dispositivo: "prova_por_volume", n_itens: { min: 2, max: 2 } })
    expect(a.duras.some((x) => x.regra === "exige_fora_da_capacidade")).toBe(false)
  })

  it("faixa compatível passa", () => {
    const a = auditar({ dispositivo: "prova_por_volume", n_itens: { min: 3, max: 3 } })
    expect(a.duras.filter((x) => x.regra === "n_itens_fora_do_dispositivo")).toEqual([])
  })

  it("faixa que ENCOSTA na do dispositivo passa — a interseção basta", () => {
    const a = auditar({ dispositivo: "prova_por_volume", n_itens: { min: 2, max: 3 } })
    expect(a.duras.filter((x) => x.regra === "n_itens_fora_do_dispositivo")).toEqual([])
  })

  it("pedir MAIS do que a forma entrega também é dura", () => {
    const a = auditar({ dispositivo: "prova_por_autoridade", n_itens: { min: 5, max: 6 } })
    const d = a.duras.filter((x) => x.regra === "n_itens_fora_do_dispositivo")
    expect(d).toHaveLength(1)
    expect(d[0].detalhe).toContain("entrega 2")
  })

  // Dispositivo sem grade nenhuma não tem faixa, e inventar `{0,0}`
  // reprovaria quem só quer o bloco.
  it("dispositivo sem grade cadastrada não é julgado", () => {
    const semGrade: Record<string, CapacidadeDaSecao> = {
      reviews: { ...CAP_REVIEWS.reviews, itens_por_dispositivo: {} },
    }
    const a = auditarRequisitos({
      saida: normalizarOutputDetalhado({
        estrutura: [{ section: "reviews", papel: "p", referencia: "r", porque: "p", requisitos: { dispositivo: "prova_por_volume", n_itens: { min: 2, max: 2 } } }],
        descartes: [],
      }).saida,
      alvo: null, incentivo: null, capacidade: semGrade,
      secoesDisponiveis: ["reviews"], descartados: [],
    })
    expect(a.duras.filter((x) => x.regra === "n_itens_fora_do_dispositivo")).toEqual([])
  })

  it("sem n_itens não há o que contradizer", () => {
    const a = auditar({ dispositivo: "prova_por_volume" })
    expect(a.duras.filter((x) => x.regra === "n_itens_fora_do_dispositivo")).toEqual([])
  })
})
