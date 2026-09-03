import { describe, it, expect } from "vitest"

import {
  DEFAULT_CHOOSER_VAULT_SYSTEM,
  DEFAULT_CHOOSER_VAULT_USER,
  measureProtocolViolations,
  parseCuradorVaultOutput,
  rank1ByBlock,
} from "./curador-shadow"
import { buildAprendizadosBlock, renderUsageCounts } from "./curador-vault"
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
})

describe("measureProtocolViolations", () => {
  const extras = new Map<string, CatalogVaultExtra>([
    ["v-veta", { slug: "hero-x", momento: [], momento_vetado: ["welcome-1"], convivencia: [] }],
    ["v-fora", { slug: "hero-y", momento: ["carrinho-abandonado"], momento_vetado: [], convivencia: [] }],
    ["v-ok", { slug: "hero-3", momento: ["welcome-1"], momento_vetado: [], convivencia: [] }],
    ["v-prova1", { slug: "reviews-1", momento: [], momento_vetado: [], convivencia: ["prova-social-nao-duplica-na-peca"] }],
    ["v-prova2", { slug: "reviews-5", momento: [], momento_vetado: [], convivencia: ["prova-social-nao-duplica-na-peca"] }],
  ])
  const sec = (pairs: Array<[number, string]>) => new Map(pairs)

  it("momento_vetado e momento positivo não declarado", () => {
    const v = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "v-veta"], [1, "v-fora"], [2, "v-ok"]]),
      extras,
      momento: "welcome-1",
      sectionByBlock: sec([[0, "hero"], [1, "body"], [2, "offer"]]),
    })
    expect(v.map((x) => x.tipo).sort()).toEqual(["momento_nao_declarado", "momento_vetado"])
  })

  it("hero dupla e variante repetida", () => {
    const v = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "v-ok"], [1, "v-ok"]]),
      extras,
      momento: "welcome-1",
      sectionByBlock: sec([[0, "hero"], [1, "hero"]]),
    })
    expect(v.some((x) => x.tipo === "hero_dupla")).toBe(true)
    expect(v.some((x) => x.tipo === "variante_repetida")).toBe(true)
  })

  it("convivência: mesmo slug em duas posições", () => {
    const v = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "v-prova1"], [1, "v-prova2"]]),
      extras,
      momento: null,
      sectionByBlock: sec([[0, "reviews"], [1, "reviews"]]),
    })
    expect(v.some((x) => x.tipo === "convivencia" && x.detalhe.includes("prova-social"))).toBe(true)
  })

  it("sem momento e sem extras → nada além do mecânico", () => {
    const v = measureProtocolViolations({
      rank1ByBlock: new Map([[0, "desconhecida"]]),
      extras,
      momento: "welcome-1",
      sectionByBlock: sec([[0, "body"]]),
    })
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
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("é o cadastro do sistema, e é ele que vale")
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

  // 01/09: o primeiro e-mail com o protocolo de fato ligado saiu com 2 de 6
  // posições. Em `reviews`, ZERO das 7 variantes vetavam welcome-1 — as 7
  // caíram só por declararem outro momento. `momento` diz onde a variante
  // brilha, não onde ela é permitida.
  it("momento NÃO elimina — só o veto elimina", () => {
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("declarar outro momento NÃO elimina")
    // E entra no ranking, como primeiro eixo.
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain(
      "momento → objecao → registro → paleta → papel_na_peca",
    )
  })

  // 02/09: o owner fixou o texto do system. A emenda ao protocolo e a
  // menção a `momento_vetado` saíram do prompt — o protocolo do vault entra
  // sem prefácio, e o passo 2 diz só que declarar outro momento não elimina.
  it("o system não carrega mais a emenda nem o veto por momento", () => {
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).not.toContain("EMENDA-MOMENTO-01")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).not.toContain("momento_vetado")
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
  it("o system não tem bloco de requisitos nem a palavra `exige`", () => {
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).not.toContain("<requisitos>")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).not.toContain("{{requisitos}}")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).not.toContain("exige")
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
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("nunca o contradiz")
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

  it("o system faz da decisão o critério dominante, não elimina por lacuna e limita as consultas", () => {
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("critério DOMINANTE por posição")
    // A função é ENCAIXAR blocos na proposta do Estruturador — não decidir
    // estrutura nem reescrever papel (owner, 02/09).
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("ENCONTRAR NA BIBLIOTECA os blocos")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("ENCAIXE PRIMEIRO")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("Você não decide estrutura, não reescreve papel")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).not.toContain("Sua tarefa é dizer por que cada posição existe")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("`descartes`")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("Lacuna NÃO elimina")
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("no máximo 4 consultas")
    // A justificativa por posição continua obrigatória.
    expect(DEFAULT_CHOOSER_VAULT_SYSTEM).toContain("`justificativa` é OBRIGATÓRIA")
  })
})
