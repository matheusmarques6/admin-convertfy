import { describe, it, expect } from "vitest"

import {
  DEFAULT_CHOOSER_VAULT_SYSTEM,
  DEFAULT_CHOOSER_VAULT_USER,
  measureProtocolViolations,
  parseCuradorVaultOutput,
  rank1ByBlock,
  repeticoesPermitidas,
  resolverModeloDoCurador,
  resolverTetoDoCurador,
  motivoDeRetomada,
  renderPreferenciasDoVault,
  CURADOR_SHADOW_MODEL_FALLBACK,
  CURADOR_SHADOW_MAX_TOKENS_MIN,
  contratosDoCatalogo,
  parseValidatedShortlist,
  renderFinalistNotes,
  restrictRankingToShortlist,
} from "./curador-shadow"
import { resumirContrato } from "../shared/field-roles"
import { buildAprendizadosBlock, renderUsageCounts } from "./curador-vault"
import { DEFAULT_CHOOSER_SYSTEM, DEFAULT_CHOOSER_USER } from "./component-assembler.service"
import { buildCatalog } from "./catalog-builder"
import { interpolateSystem } from "./llm-invoke"
import type { CatalogVaultExtra } from "./catalog-builder"
import type { RankedChoice } from "./curator-ranking.parser"

const OUTPUT = `Aqui está:
{"estrutura":[{"section":"hero","papel":"entrega o cupom"},{"section":"reviews","papel":"prova de terceiro"}],
 "fio_narrativo":"cupom abre, prova fecha",
 "escolhas":[{"block_index":0,"justificativa":"hero-5 caiu no exige (foto-com-pessoas ausente); objecao decidiu.","escolhas":[{"variant_id":"a","motivo":"bate momento e objeção"},{"variant_id":"c","motivo":"empata em objecao, perde em papel"}]},{"block_index":1,"escolhas":[{"variant_id":"b"}]}]}`

describe("parseCuradorVaultOutput", () => {
  it("extrai estrutura, fio, justificativas e re-serializa as escolhas", () => {
    const p = parseCuradorVaultOutput(OUTPUT)
    expect(p?.estrutura.map((e) => e.section)).toEqual(["hero", "reviews"])
    expect(p?.estrutura[0].papel).toContain("cupom")
    expect(p?.fioNarrativo).toBe("cupom abre, prova fecha")
    expect(JSON.parse(p!.escolhasRaw)).toHaveLength(2)
    expect(p?.justificativas[0]).toContain("exige")
    expect(p?.justificativas[1]).toBeUndefined()
    expect(p?.escolhasDetalhadas[0].escolhas.map((o) => o.motivo)).toEqual([
      "bate momento e objeção",
      "empata em objecao, perde em papel",
    ])
  })
  it("JSON ilegível → null; campos ausentes degradam para vazios", () => {
    expect(parseCuradorVaultOutput("prosa sem json")).toBeNull()
    const p = parseCuradorVaultOutput('{"escolhas":[]}')
    expect(p?.estrutura).toEqual([])
    expect(p?.fioNarrativo).toBe("")
    expect(p?.escolhasDetalhadas).toEqual([])
  })
  it("o system exige justificativa por posição e motivo em todo rank", () => {
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("OUTPUT SAI JUSTIFICADO")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("`justificativa` é OBRIGATÓRIA")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("A escolha leva `motivo`")
    // 03/09: uma variante por posição — o Montador saiu do caminho.
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("uma só, a que encaixa melhor")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).not.toContain("em ordem de preferência")
  })
  it("o prompt inicial usa o índice compacto, sem o corpo integral das variantes", () => {
    const catalogo = buildCatalog([
      { id: "v1", block_type: "hero", name: "Hero", description: "Primeira frase. SEGREDO_CORPO_COMPLETO", long_description: "NOTA_IMPLEMENTACAO_INTEGRAL", is_active: true } as never,
      { id: "v2", block_type: "body", name: "Body", description: "Outra primeira frase. OUTRO_CORPO_COMPLETO", when_use: "QUANDO_USAR_INTEGRAL", is_active: true } as never,
    ])
    const prompt = interpolateSystem(DEFAULT_CHOOSER_VAULT_SYSTEM, { protocolo: "p", convivencias: "c", catalogo: catalogo.enxuto })
    expect(prompt).toContain("v1 · Hero")
    expect(prompt).toContain("v2 · Body")
    expect(prompt).not.toContain("SEGREDO_CORPO_COMPLETO")
    expect(prompt).not.toContain("NOTA_IMPLEMENTACAO_INTEGRAL")
    expect(prompt).not.toContain("QUANDO_USAR_INTEGRAL")
  })
})

describe("progressive disclosure do Curador", () => {
  const typeIndex = new Map([["hero-a", "hero"], ["hero-b", "hero"], ["body-a", "body"]])

  it("valida até três finalistas e nunca aceita id de outra seção", () => {
    const parsed = parseValidatedShortlist({
      raw: JSON.stringify([
        { block_index: 0, escolhas: [{ variant_id: "hero-a" }, { variant_id: "body-a" }, { variant_id: "hero-b" }] },
        { block_index: 1, escolhas: [{ variant_id: "body-a" }] },
      ]),
      sections: ["hero", "body"],
      typeIndex,
    })
    expect(parsed.byBlock.get(0)?.map((x) => x.variant_id)).toEqual(["hero-a", "hero-b"])
    expect(parsed.byBlock.get(1)?.map((x) => x.variant_id)).toEqual(["body-a"])
  })

  it("renderiza nota aberta e ausência sem eliminar a finalista", () => {
    const rendered = renderFinalistNotes([
      { variant_id: "hero-a", status: "opened", file_path: "componentes/hero-a.md", body: "corpo" },
      { variant_id: "hero-b", status: "missing", file_path: null, body: null },
    ])
    expect(rendered).toContain('variant_id="hero-a"')
    expect(rendered).toContain("corpo")
    expect(rendered).toContain('variant_id="hero-b" status="sem_nota_sincronizada"')
  })

  it("a decisão final não pode mover uma finalista para outra posição da mesma seção", () => {
    const shortlist = parseValidatedShortlist({
      raw: JSON.stringify([
        { block_index: 0, escolhas: [{ variant_id: "hero-a" }] },
        { block_index: 1, escolhas: [{ variant_id: "hero-b" }] },
      ]),
      sections: ["hero", "hero"],
      typeIndex,
    })
    const final = parseValidatedShortlist({
      raw: JSON.stringify([
        { block_index: 0, escolhas: [{ variant_id: "hero-b" }] },
        { block_index: 1, escolhas: [{ variant_id: "hero-b" }] },
      ]),
      sections: ["hero", "hero"],
      typeIndex,
    })
    const restricted = restrictRankingToShortlist(final, shortlist, 2)
    expect(restricted.byBlock.has(0)).toBe(false)
    expect(restricted.byBlock.get(1)?.[0].variant_id).toBe("hero-b")
    expect(restricted.invalidIds).toContain("hero-b")
  })
})

describe("progressive disclosure do Curador", () => {
  const typeIndex = new Map([["hero-a", "hero"], ["hero-b", "hero"], ["body-a", "body"]])

  it("valida até três finalistas e nunca aceita id de outra seção", () => {
    const parsed = parseValidatedShortlist({
      raw: JSON.stringify([
        { block_index: 0, escolhas: [{ variant_id: "hero-a" }, { variant_id: "body-a" }, { variant_id: "hero-b" }] },
        { block_index: 1, escolhas: [{ variant_id: "body-a" }] },
      ]),
      sections: ["hero", "body"],
      typeIndex,
    })
    expect(parsed.byBlock.get(0)?.map((x) => x.variant_id)).toEqual(["hero-a", "hero-b"])
    expect(parsed.byBlock.get(1)?.map((x) => x.variant_id)).toEqual(["body-a"])
  })

  it("renderiza nota aberta e ausência sem eliminar a finalista", () => {
    const rendered = renderFinalistNotes([
      { variant_id: "hero-a", status: "opened", file_path: "componentes/hero-a.md", body: "corpo" },
      { variant_id: "hero-b", status: "missing", file_path: null, body: null },
    ])
    expect(rendered).toContain('variant_id="hero-a"')
    expect(rendered).toContain("corpo")
    expect(rendered).toContain('variant_id="hero-b" status="sem_nota_sincronizada"')
  })

  it("a decisão final não pode mover uma finalista para outra posição da mesma seção", () => {
    const shortlist = parseValidatedShortlist({
      raw: JSON.stringify([
        { block_index: 0, escolhas: [{ variant_id: "hero-a" }] },
        { block_index: 1, escolhas: [{ variant_id: "hero-b" }] },
      ]),
      sections: ["hero", "hero"],
      typeIndex,
    })
    const final = parseValidatedShortlist({
      raw: JSON.stringify([
        { block_index: 0, escolhas: [{ variant_id: "hero-b" }] },
        { block_index: 1, escolhas: [{ variant_id: "hero-b" }] },
      ]),
      sections: ["hero", "hero"],
      typeIndex,
    })
    const restricted = restrictRankingToShortlist(final, shortlist, 2)
    expect(restricted.byBlock.has(0)).toBe(false)
    expect(restricted.byBlock.get(1)?.[0].variant_id).toBe("hero-b")
    expect(restricted.invalidIds).toContain("hero-b")
  })
})

describe("measureProtocolViolations", () => {
  const extras = new Map<string, CatalogVaultExtra>([
    ["v-veta", { slug: "hero-x", convivencia: [] }],
    ["v-fora", { slug: "hero-y", convivencia: [] }],
    ["v-ok", { slug: "hero-3", convivencia: [] }],
    ["v-prova1", { slug: "reviews-1", convivencia: ["prova-social-nao-duplica-na-peca"] }],
    ["v-prova2", { slug: "reviews-5", convivencia: ["prova-social-nao-duplica-na-peca"] }],
  ])
  const sec = (pairs: Array<[number, string]>) => new Map(pairs)

  // 07/09: o eixo foi aposentado. Nada é medido por momento — sem dado
  // servido e sem regra, "violação" de momento seria erro inventado no log.
  it("momento não é medido", () => {
    const v = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "v-veta"], [1, "v-fora"], [2, "v-ok"]]),
      extras,
      sectionByBlock: sec([[0, "hero"], [1, "body"], [2, "offer"]]),
    })
    expect(v).toEqual([])
  })

  it("hero dupla e variante repetida", () => {
    const v = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "v-ok"], [1, "v-ok"]]),
      extras,
      sectionByBlock: sec([[0, "hero"], [1, "hero"]]),
    })
    expect(v.some((x) => x.tipo === "hero_dupla")).toBe(true)
    expect(v.some((x) => x.tipo === "variante_repetida")).toBe(true)
  })

  it("convivência: mesmo slug em duas posições", () => {
    const v = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "v-prova1"], [1, "v-prova2"]]),
      extras,
      sectionByBlock: sec([[0, "reviews"], [1, "reviews"]]),
    })
    expect(v.some((x) => x.tipo === "convivencia" && x.detalhe.includes("prova-social"))).toBe(true)
  })

  it("sem extras → nada além do mecânico", () => {
    const v = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "desconhecida"]]),
      extras,
      sectionByBlock: sec([[0, "body"]]),
    })
    expect(v).toEqual([])
  })

  // 07/09: repetir a mesma variante é composição legítima fora de hero e
  // do feed de produtos. Acusar violação ali contaminava a contagem que a
  // gente lê para julgar o Curador.
  it("mesma variante em duas posições de body NÃO é violação", () => {
    const v = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "v-ok"], [1, "v-ok"]]),
      extras,
      sectionByBlock: sec([[0, "body"], [1, "body"]]),
    })
    expect(v).toEqual([])
  })

  it("mesma variante em duas posições de products É violação", () => {
    const v = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "v-ok"], [1, "v-ok"]]),
      extras,
      sectionByBlock: sec([[0, "products"], [1, "products"]]),
    })
    expect(v.some((x) => x.tipo === "variante_repetida" && x.block_index === 1)).toBe(true)
  })

  it("a seção é normalizada — ' Products ' conta como products", () => {
    const v = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "v-ok"], [1, "v-ok"]]),
      extras,
      sectionByBlock: sec([[0, " Products "], [1, "PRODUCTS"]]),
    })
    expect(v.some((x) => x.tipo === "variante_repetida")).toBe(true)
  })
})

describe("repeticoesPermitidas", () => {
  const sec = (pairs: Array<[number, string]>) => new Map(pairs)

  it("agrupa a repetição legítima por variante e seção", () => {
    const r = repeticoesPermitidas({
      rank1ByBlock: new Map([[0, "v-ok"], [1, "v-ok"], [2, "v-outra"], [3, "v-ok"]]),
      sectionByBlock: sec([[0, "body"], [1, "body"], [2, "offer"], [3, "Body"]]),
    })
    expect(r).toEqual([{ variant_id: "v-ok", section: "body", blocks: [0, 1, 3] }])
  })

  it("hero e products ficam fora — lá a repetição é violação, não registro", () => {
    const r = repeticoesPermitidas({
      rank1ByBlock: new Map([[0, "v-ok"], [1, "v-ok"]]),
      sectionByBlock: sec([[0, "hero"], [1, "hero"]]),
    })
    expect(r).toEqual([])
  })

  it("variante que aparece uma vez só não vira registro", () => {
    const r = repeticoesPermitidas({
      rank1ByBlock: new Map([[0, "a"], [1, "b"]]),
      sectionByBlock: sec([[0, "body"], [1, "body"]]),
    })
    expect(r).toEqual([])
  })
})

describe("measureProtocolViolations — alvo do Seletor (set/2026)", () => {
  const extras = new Map<string, CatalogVaultExtra>([
    ["hero-cupom", { slug: "hero-3-cupom", convivencia: [], exige_medicao: ["cupom-ativo"], aliviador: [] }],
    ["reviews-prova", { slug: "reviews-1", convivencia: [], aliviador: ["prova_de_terceiro"], profundidade: "prova_de_terceiro" }],
    ["body-mec", { slug: "body-5", convivencia: [], aliviador: ["comparacao_de_categoria"] }],
  ])
  const sec = new Map([[0, "hero"], [1, "body"]])

  it("aliviador_ausente quando nenhuma posição realiza o aliviador pedido; some quando alguma realiza", () => {
    const sem = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "hero-cupom"], [1, "body-mec"]]), extras, sectionByBlock: sec,
      alvo: { aliviador_pedido: "prova_de_terceiro", proibicoes: [] },
    })
    expect(sem.some((v) => v.tipo === "aliviador_ausente")).toBe(true)
    const com = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "hero-cupom"], [1, "reviews-prova"]]), extras, sectionByBlock: sec,
      alvo: { aliviador_pedido: "prova_de_terceiro", proibicoes: [] },
    })
    expect(com.some((v) => v.tipo === "aliviador_ausente")).toBe(false)
  })

  it("proibicao_violada cruza a proibição em prosa com exige/aliviador da variante", () => {
    const v = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "hero-cupom"], [1, "reviews-prova"]]), extras, sectionByBlock: sec,
      alvo: { aliviador_pedido: null, proibicoes: ["Não mexer no incentivo", "não depender de prova social"] },
    })
    const tipos = v.filter((x) => x.tipo === "proibicao_violada")
    expect(tipos).toHaveLength(2)
    expect(tipos[0].detalhe).toContain("cupom-ativo")
    expect(tipos[1].detalhe).toContain("prova_de_terceiro")
  })

  it("sem alvo nada muda (compatibilidade com o medidor de antes)", () => {
    const v = measureProtocolViolations({ rank1ByBlock: new Map([[0, "hero-cupom"]]), extras, sectionByBlock: sec })
    expect(v).toEqual([])
  })
})

describe("rank1ByBlock + blocos da fase 1", () => {
  it("pega o primeiro de cada posição", () => {
    const byBlock = new Map<number, RankedChoice[]>([
      [0, [{ variant_id: "a", motivo: "x" }, { variant_id: "b" }] as RankedChoice[]],
      [1, [] as RankedChoice[]],
    ])
    const r = rank1ByBlock(byBlock)
    expect(r.get(0)).toBe("a")
    expect(r.has(1)).toBe(false)
  })

  it("aprendizados e uso declaram ausência e presença", () => {
    expect(buildAprendizadosBlock([])).toContain("nenhum aprendizado")
    expect(buildAprendizadosBlock([{ slug: "um-cta-dominante", body: "Um CTA só." }])).toContain("um-cta-dominante")
    expect(renderUsageCounts(new Map())).toContain("sem histórico")
    const counts = new Map([["v1", 3]])
    const extras = new Map([["v1", { slug: "hero-3-cupom-de-captacao" }]])
    const bloco = renderUsageCounts(counts, extras)
    expect(bloco).toContain("hero-3-cupom-de-captacao: 3×")
    expect(bloco).toContain("MENOS usada")
  })

  it("o system carrega protocolo, papéis e zero-elegíveis", () => {
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("{{protocolo}}")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("{{catalogo}}")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("fio_narrativo")
    // O contrato virou `papeis`: ele nomeia o papel de cada posição, não
    // decide a sequência. O nome antigo saiu junto com a permissão.
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain('"papeis"')
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("escolhas: []")
    // 03/09: o sistema prevalece. O vault acrescenta o que o cadastro não
    // tem; nunca o contradiz — e o modelo não arbitra entre os dois.
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).not.toContain("O VAULT VENCE")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("cadastro do sistema descreve a peça")
  })

  // Em 01/09 o prompt dizia "Você PODE adaptar a sequência" e o agente cortou
  // Oferta e Body de um Welcome 1 de 6 blocos. O texto é a primeira barreira
  // (a segunda é o `conformarEstrutura`); estas asserções existem para que
  // ninguém devolva a permissão sem perceber.
  it("o system PROÍBE mexer na sequência", () => {
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("é FIXA")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain(
      "Não remova, não acrescente, não reordene",
    )
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).not.toContain("PODE adaptar")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).not.toContain("Decida a estrutura")
    // Seção sem candidata continua na peça — a lacuna vira sinal, não corte.
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("NÃO AUTORIZA remover")
  })

  // 07/09: o eixo `momento` foi APOSENTADO. Fora da hero, nenhuma variante
  // do catálogo declarava `welcome-1` — a regra não separava boa de ruim,
  // eliminava quatro seções inteiras. Sai do catálogo, do ranking e do texto.
  it("momento não aparece no ranking nem no bloco de USER", () => {
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain(
      "objecao → aliviador → profundidade → registro → paleta → papel_na_peca",
    )
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).not.toContain("momento → objecao")
    for (const prompt of [DEFAULT_CHOOSER_VAULT_USER, DEFAULT_CHOOSER_USER]) {
      expect(prompt).not.toContain("<momento>")
      expect(prompt).not.toContain("{{momento}}")
    }
  })

  // A nota `_protocolo-de-selecao` continua mandando eliminar por momento no
  // passo 5, e é servida em {{protocolo}}. Sem a precedência escrita, o
  // modelo obedece o vault — foi o que aconteceu em 07/09.
  it("os dois prompts declaram a precedência sobre o passo 5", () => {
    for (const prompt of [DEFAULT_CHOOSER_VAULT_SYSTEM, DEFAULT_CHOOSER_SYSTEM]) {
      expect(prompt).toContain("APOSENTADO")
      expect(prompt).toContain("passo 5")
    }
  })

  // 02/09: o owner fixou o texto do system. A emenda ao protocolo e a
  // menção a `momento_vetado` saíram do prompt — o protocolo do vault entra
  // sem prefácio, e o passo 2 diz só que declarar outro momento não elimina.
  // Incidente 07/09: com o Seletor ligado, o alvo trouxe 8 proibições — quase
  // todas sobre COPY ("não prometer nota média", "não criar urgência") — e o
  // prompt as servia com força de veto. O Curador eliminou reviews, cupom,
  // urgência e origem da marca; sobrou o rodapé, e a hero morreu por não
  // existir região. Proibição de redação não pode desqualificar bloco.
  it("proibição do alvo desempata, não elimina", () => {
    for (const prompt of [DEFAULT_CHOOSER_VAULT_SYSTEM, DEFAULT_CHOOSER_SYSTEM]) {
      expect(prompt).not.toContain("força de VETO")
      expect(prompt).toContain("restrição de REDAÇÃO")
      expect(prompt).toContain("NÃO elimina ninguém")
    }
  })

  it("o system não carrega mais a emenda de momento", () => {
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).not.toContain("EMENDA-MOMENTO-01")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).not.toContain("COM UMA ÚNICA EXCEÇÃO")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("<protocolo_de_selecao>\n\n{{protocolo}}\n</protocolo_de_selecao>")
  })

  // No `body` ele tinha 4 sobreviventes e devolveu `escolhas: []` porque
  // nenhum eixo as separava — abstenção onde o passo 9 manda desempatar.
  it("proíbe devolver lista vazia com sobreviventes", () => {
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("SOBREVIVEU, TEM DE SAIR ESCOLHIDA")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain(
      '"Nenhum eixo as separa" NUNCA justifica devolver lista vazia',
    )
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("Empate total não é lacuna")
  })

  it("o user manda os três guias da aba Arquitetura, inclusive o NÃO DEVE", () => {
    expect(DEFAULT_CHOOSER_VAULT_USER).toContain("{{intencao_email}}")
    // A var que faltava: as restrições existiam no dado e na tela, e nunca
    // chegavam ao agente que escreve a direção editorial de cada bloco.
    expect(DEFAULT_CHOOSER_VAULT_USER).toContain("{{outline_restricoes}}")
    expect(DEFAULT_CHOOSER_VAULT_USER).toContain("<estrutura_do_email>")
    expect(DEFAULT_CHOOSER_VAULT_USER).not.toContain("sequencia_sugerida")
  })
})

// ── O prompt não pede eliminação por ativo (01/09) ─────────────────────
describe("prompt do Curador — nada elimina por requisito de ativo", () => {
  it("o system não tem bloco de requisitos não verificáveis", () => {
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).not.toContain("<requisitos>")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).not.toContain("{{requisitos}}")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("Elimine também por CONTRATO")
  })

  it("material não elimina e só ativa/schema + capacidade eliminam", () => {
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("elimine por ativa/schema")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("e por capacidade (product_slots × produtos com link")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("não elimina ninguém")
  })

  // Até 03/09 o prompt mandava o modelo escolher entre a descrição do vault
  // e a do banco, rebaixar a variante por isso e explicar a escolha na
  // justificativa. Divergência de cadastro não é decisão de agente: o
  // catálogo passou a servir só o sistema, e a lista de notas erradas vai
  // para a telemetria e para a aba Conhecimento.
  it("o prompt não arbitra mais entre vault e banco", () => {
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).not.toContain("description_no_banco")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).not.toContain("NÃO é eliminada por isso")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).not.toContain("fica ATRÁS")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("prevalece sobre prosa divergente do vault")
  })
})


// ── Dieta com o Estruturador ligado (02/09) ─────────────────────────────
describe("template do Curador do vault — decisão do Estruturador, lacunas e índice", () => {
  it("o user leva a decisão COMPLETA do Estruturador, as lacunas e o índice do Obsidian", () => {
    expect(DEFAULT_CHOOSER_VAULT_USER).toContain("<decisao_do_estruturador>\n{{estruturador_decisao}}")
    expect(DEFAULT_CHOOSER_VAULT_USER).toContain("<lacunas_da_biblioteca>\n{{lacunas_biblioteca}}")
    expect(DEFAULT_CHOOSER_VAULT_USER).toContain("<indice_do_vault>")
    expect(DEFAULT_CHOOSER_VAULT_USER).toContain("{{indice_vault}}")
    // A decisão vem ANTES da sequência, que é o que ela explica.
    expect(DEFAULT_CHOOSER_VAULT_USER.indexOf("<decisao_do_estruturador>")).toBeLessThan(
      DEFAULT_CHOOSER_VAULT_USER.indexOf("<estrutura_do_email>"),
    )
    expect(DEFAULT_CHOOSER_VAULT_USER).toContain("decidida pelo Estruturador")
  })

  it("o system faz da decisão o critério dominante e usa apenas notas das finalistas", () => {
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("critério DOMINANTE por posição")
    // A função é ENCAIXAR blocos na proposta do Estruturador — não decidir
    // estrutura nem reescrever papel (owner, 02/09).
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("ENCONTRAR NA BIBLIOTECA os blocos")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("ENCAIXE PRIMEIRO")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("Você não decide estrutura, não reescreve papel")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).not.toContain("Sua tarefa é dizer por que cada posição existe")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("`descartes`")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("Lacuna NÃO elimina")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("notas completas das finalistas")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).not.toContain("no máximo 4 consultas")
    // A justificativa por posição continua obrigatória.
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("`justificativa` é OBRIGATÓRIA")
  })
})


/**
 * 08/09: trocado o flow inteiro para Fable, o Curador do vault continuou em
 * Sonnet — era o único dos dois lados do mesmo `agent_type` que não lia
 * `email_agent_configs`. O modelo vinha de uma constante e a telemetria
 * mostrava uma escolha que ninguém tinha feito.
 */
describe("resolverModeloDoCurador", () => {
  it("a config do agente vence o fallback in-code", () => {
    expect(resolverModeloDoCurador("anthropic/claude-fable-5.1")).toBe(
      "anthropic/claude-fable-5.1",
    )
  })

  it("sem config, o fallback in-code segura", () => {
    for (const v of [null, undefined, "", "   "]) {
      expect(resolverModeloDoCurador(v)).toBe(CURADOR_SHADOW_MODEL_FALLBACK)
    }
  })
})

describe("teto, retomada e preferências do vault (09/09)", () => {
  it("resolverTetoDoCurador: config vence o piso; abaixo do piso, o piso; env vence tudo", () => {
    expect(resolverTetoDoCurador(16000)).toBe(16000)
    expect(resolverTetoDoCurador(2048)).toBe(CURADOR_SHADOW_MAX_TOKENS_MIN)
    expect(resolverTetoDoCurador(null)).toBe(CURADOR_SHADOW_MAX_TOKENS_MIN)
    expect(resolverTetoDoCurador(Number.NaN)).toBe(CURADOR_SHADOW_MAX_TOKENS_MIN)
  })

  it("motivoDeRetomada: prosa e corte pedem retomada; JSON legível não", () => {
    expect(motivoDeRetomada("Vou trabalhar posição por posição…", "length")).toBe("cortado_antes_do_json")
    expect(motivoDeRetomada("Vou trabalhar posição por posição…", "stop")).toBe("sem_json")
    expect(motivoDeRetomada("", "length")).toBe("vazio_por_teto")
    expect(motivoDeRetomada("   ")).toBe("vazio")
    // JSON completo com finish_reason length: o corte veio DEPOIS do objeto.
    expect(motivoDeRetomada('{"papeis":[],"escolhas":[]}', "length")).toBeNull()
    expect(motivoDeRetomada(OUTPUT)).toBeNull()
  })

  it("renderPreferenciasDoVault: ausência declarada e posições com justificativa", () => {
    expect(renderPreferenciasDoVault(null)).toContain("nenhuma")
    expect(renderPreferenciasDoVault({ posicoes: [] })).toContain("nenhuma")
    const txt = renderPreferenciasDoVault({
      posicoes: [
        { block_index: 0, section: "hero", justificativa: "hero-3 exige cupom → eliminada", escolhas: [{ variant_id: "hero-7", motivo: "sem cupom" }] },
        { block_index: 1, section: "reviews", justificativa: "", escolhas: [] },
      ],
    })
    expect(txt).toContain("[0] hero: hero-3 exige cupom → eliminada")
    expect(txt).toContain("  - hero-7 — sem cupom")
    expect(txt).toContain("[1] reviews\n  - (nenhuma candidata)")
  })

  it("o template do legado tem o bloco de preferências do vault", () => {
    expect(DEFAULT_CHOOSER_USER).toContain("<preferencias_do_vault>")
    expect(DEFAULT_CHOOSER_USER).toContain("{{preferencias_vault}}")
  })
})

describe("measureProtocolViolations — contrato_violado (09/09)", () => {
  const contratos = new Map([
    ["v-cupom", resumirContrato([{ key: "coupon_line" }, { key: "cta_label" }])],
    ["v-sem", resumirContrato([{ key: "headline" }, { key: "cta_label" }])],
  ])
  const sectionByBlock = new Map([[0, "hero"]])
  it("loja SEM incentivo + rank-1 com slot de cupom → contrato_violado", () => {
    const v = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "v-cupom"]]),
      extras: new Map(),
      sectionByBlock,
      alvo: { aliviador_pedido: null, proibicoes: [], incentivo_existe: false },
      contratos,
    })
    expect(v.map((x) => x.tipo)).toEqual(["contrato_violado"])
    expect(v[0].detalhe).toContain("cupom")
  })
  it("sem cupom na anatomia, ou incentivo desconhecido/presente, nada é medido", () => {
    const base = { rank1ByBlock: new Map([[0, "v-cupom"]]), extras: new Map(), sectionByBlock, contratos }
    expect(measureProtocolViolations({ ...base, rank1ByBlock: new Map([[0, "v-sem"]]), alvo: { aliviador_pedido: null, proibicoes: [], incentivo_existe: false } })).toEqual([])
    expect(measureProtocolViolations({ ...base, alvo: { aliviador_pedido: null, proibicoes: [], incentivo_existe: null } })).toEqual([])
    expect(measureProtocolViolations({ ...base, alvo: { aliviador_pedido: null, proibicoes: [], incentivo_existe: true } })).toEqual([])
    expect(measureProtocolViolations({ ...base, alvo: { aliviador_pedido: null, proibicoes: [], incentivo_existe: false }, contratos: undefined })).toEqual([])
  })
  it("os dois prompts ensinam a eliminar por contrato, separado da proibição de redação", () => {
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("por CONTRATO")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("`tem_cupom`")
    expect(DEFAULT_CHOOSER_SYSTEM).toContain("`contrato`")
    expect(DEFAULT_CHOOSER_SYSTEM).toContain("está FORA, não em último lugar")
  })
  it("contratosDoCatalogo indexa por variant_id", () => {
    const m = contratosDoCatalogo([{ variantes: [{ variant_id: "a", contrato: resumirContrato([{ key: "coupon_code" }]) }, { variant_id: "b" }] }])
    expect(m.get("a")?.tem_cupom).toBe(true)
    expect(m.has("b")).toBe(false)
  })
})

describe("eliminadas por requisito (09/09)", () => {
  it("requisito_violado quando o rank-1 estava na lista de eliminadas da posição", () => {
    const v = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "h3"], [1, "p9"]]),
      extras: new Map(),
      sectionByBlock: new Map([[0, "hero"], [1, "products"]]),
      eliminadasPorRequisito: new Map([[0, new Map([["h3", "tem slot de cupom e a decisão nega cupom"]])]]),
    })
    expect(v).toEqual([{ block_index: 0, variant_id: "h3", tipo: "requisito_violado", detalhe: "tem slot de cupom e a decisão nega cupom" }])
  })
  it("os dois templates carregam o bloco de eliminadas", () => {
    expect(DEFAULT_CHOOSER_VAULT_USER).toContain("<eliminadas_por_requisito>")
    expect(DEFAULT_CHOOSER_VAULT_USER).toContain("{{eliminadas_requisito}}")
    expect(DEFAULT_CHOOSER_USER).toContain("{{eliminadas_requisito}}")
  })
})
