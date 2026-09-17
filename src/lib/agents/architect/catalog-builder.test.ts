import { describe, it, expect } from "vitest"

import type { EmailComponentVariant } from "@/types/email-generation"
import {
  buildAliasIndex,
  buildCatalog,
  buildCatalogoEnxuto,
  buildTypeIndex,
  duplicatasPorDispositivo,
  fatiarCatalogo,
  levantarHigieneDoVault,
  LIMIAR_DE_DUPLICATA,
  LIMITE_CHARS_POR_VARIANTE,
  similaridadeDeDescricao,
} from "./catalog-builder"
import type { CatalogVaultExtra } from "./catalog-builder"

function v(
  id: string,
  blockType: string,
  name: string,
  extra: Partial<EmailComponentVariant> = {},
): EmailComponentVariant {
  return {
    id,
    block_type: blockType,
    name,
    html: "<tr><td>{{X}}</td></tr>",
    description: null,
    when_use: null,
    when_not_use: null,
    objectives: [],
    tones: [],
    density: null,
    product_slots: 0,
    copy_guidance: null,
    long_description: null,
    output_schema: [],
    ...extra,
  } as unknown as EmailComponentVariant
}

describe("buildCatalog", () => {
  it("agrupa por tipo e ordena por nome dentro de cada tipo", () => {
    const r = buildCatalog([
      v("3", "hero", "Zebra"),
      v("1", "body", "Alpha"),
      v("2", "hero", "Abacate"),
    ])
    expect(r.types).toEqual(["body", "hero"])
    expect(r.sections[0].section).toBe("body")
    expect(r.sections[1].variantes.map((x) => x.name)).toEqual([
      "Abacate",
      "Zebra",
    ])
    expect(r.total).toBe(3)
  })

  // O catálogo vai no system para ser cacheado, e cache é endereçado por
  // conteúdo: ordem instável entre lojas mataria o cache.
  it("é estável: mesma entrada em outra ordem gera o MESMO json", () => {
    const a = buildCatalog([v("1", "hero", "A"), v("2", "hero", "B"), v("3", "body", "C")])
    const b = buildCatalog([v("3", "body", "C"), v("2", "hero", "B"), v("1", "hero", "A")])
    expect(a.json).toBe(b.json)
  })

  it("carrega os metadados que o Curador usa para rankear", () => {
    const r = buildCatalog([
      v("1", "hero", "H", {
        description: "hero com faixa",
        when_use: "quando a marca é premium",
        when_not_use: "quando não há imagem",
        objectives: ["Promoção"],
        tones: ["Premium"],
        density: "rich",
        product_slots: 3,
        copy_guidance: "headline curta",
        long_description: "usa VML no Outlook",
      }),
    ])
    const e = r.sections[0].variantes[0]
    expect(e).toEqual({
      variant_id: "1",
      name: "H",
      description: "hero com faixa",
      quando_usar: "quando a marca é premium",
      quando_nao_usar: "quando não há imagem",
      objectives: ["Promoção"],
      tones: ["Premium"],
      density: "rich",
      product_slots: 3,
      orientacao_copy: "headline curta",
      notas_implementacao: "usa VML no Outlook",
      // 09/09: resumo do que a anatomia obriga (schema vazio → contrato vazio).
      contrato: {
        campos_obrigatorios: [],
        tem_cupom: false,
        tem_cta: false,
        tem_preco: false,
        tem_avaliacao: false,
        tem_credencial: false,
        tem_prazo: false,
        tem_preco_antigo: false,
        tem_nome_depoente: false,
        tem_logo: false,
        n_ctas: 0,
        itens: {},
        n_itens: null,
        copy: 0,
        imagens: 0,
        // 15/09: sem direção fotográfica cadastrada, nada foi lido.
        direcao: null,
      },
    })
  })

  // O schema INTEIRO dobraria o prefixo; o que entra é o `contrato`
  // (resumo). Examples, guidance e tags continuam fora.
  it("NÃO inclui output_schema nem html", () => {
    const r = buildCatalog([
      v("1", "hero", "H", {
        output_schema: [{ key: "headline", label: "H", type: "text_short" }],
        html: "<tr><td>{{HERO_HEADLINE}}</td></tr>",
      } as Partial<EmailComponentVariant>),
    ])
    expect(r.json).not.toContain("output_schema")
    expect(r.json).not.toContain("campos_copy")
    expect(r.json).not.toContain("HERO_HEADLINE")
  })

  it("catálogo vazio → json de array vazio", () => {
    const r = buildCatalog([])
    expect(r.total).toBe(0)
    expect(r.types).toEqual([])
    expect(JSON.parse(r.json)).toEqual([])
  })

  it("texto ausente vira string vazia; só density admite null", () => {
    const r = buildCatalog([v("1", "hero", "H")])
    expect(r.json).not.toContain("undefined")
    const e = r.sections[0].variantes[0]
    expect(e.description).toBe("")
    expect(e.quando_usar).toBe("")
    expect(e.quando_nao_usar).toBe("")
    expect(e.orientacao_copy).toBe("")
    expect(e.notas_implementacao).toBe("")
    expect(e.objectives).toEqual([])
    expect(e.product_slots).toBe(0)
    // `density` é tri-estado no cadastro (minimal/balanced/rich ou não
    // definida) — null aqui é informação, não campo faltando.
    expect(e.density).toBeNull()
  })
})

describe("buildTypeIndex", () => {
  it("mapeia id → block_type", () => {
    const idx = buildTypeIndex([v("1", "hero", "A"), v("2", "footer", "B")])
    expect(idx.get("1")).toBe("hero")
    expect(idx.get("2")).toBe("footer")
    expect(idx.get("x")).toBeUndefined()
  })
})

// ── Vault × banco (01/09) ───────────────────────────────────────────────
//
// O caso real: o doc `body-4-tutorial-de-uso` do vault descreve um tutorial
// em passos numerados, e o `variant_id` que ele carrega aponta, no banco,
// para um comparativo contra a concorrência. Como `toEntry` sobrepõe a
// prosa do vault e o prompt diz que o vault vence, o Curador decidia sobre
// uma peça e o pipeline montava outra — sem registro em lugar nenhum.
const VAULT_BODY4 =
  "Tutorial de uso em 2 colunas paralelas: foto circular do produto, título do modo e passos numerados em badges, com Pro Tip compartilhado e CTA de aprofundamento."
const BANCO_BODY4 =
  'Bloco de comparação direta contra a concorrência. Duas colunas lado a lado — a marca de um lado, "os outros" do outro — cada uma com foto circular, título e uma lista de atributos marcados item a item.'
// A MESMA peça, dita com outro vocabulário ("gift card" × "vale-presente").
const VAULT_BODY3 =
  "Pitch de gift card digital com headline anti-objeção, dois parágrafos curtos e CTA, assinado por faixa de 3 selos circulares com valores da marca."
const BANCO_BODY3 =
  "Bloco de venda de vale-presente. Título, dois parágrafos curtos e o botão resolvem a oferta; abaixo, três selos circulares com os valores da marca fecham a peça."

function extra(id: string, slug: string, descricao: string) {
  return new Map<string, CatalogVaultExtra>([
    [id, { slug, descricao_curta: descricao }],
  ])
}

describe("similaridadeDeDescricao", () => {
  it("texto idêntico é 1; sem palavra de conteúdo é 1 (nada a comparar)", () => {
    expect(similaridadeDeDescricao(VAULT_BODY3, VAULT_BODY3)).toBe(1)
    expect(similaridadeDeDescricao("de a o", "para com que")).toBe(1)
  })

  // O número que a doutrina do módulo cita. Ele ORDENA, não julga: oito
  // centésimos separam "outro vocabulário" de "outra peça".
  it("os dois casos reais ficam perto demais para um corte julgar", () => {
    const mesmaPeca = similaridadeDeDescricao(VAULT_BODY3, BANCO_BODY3)
    const outraPeca = similaridadeDeDescricao(VAULT_BODY4, BANCO_BODY4)
    expect(outraPeca).toBeLessThan(mesmaPeca)
    expect(mesmaPeca - outraPeca).toBeLessThan(0.15)
  })
})

describe("buildCatalog — o sistema prevalece", () => {
  it("serve a descrição do BANCO e registra o par divergente só para conserto", () => {
    const r = buildCatalog(
      [v("id-4", "body", "body 4 - bridge fundo cards", { description: BANCO_BODY4 })],
      extra("id-4", "body-4-tutorial-de-uso", VAULT_BODY4),
    )
    const entrada = r.sections[0].variantes[0]
    // O cadastro descreve a peça que será montada — é o HTML DESTA linha
    // que vai para o email. A prosa do vault não entra no catálogo, e o
    // modelo não arbitra entre as duas.
    expect(entrada.description).toBe(BANCO_BODY4)
    expect(r.json).not.toContain("description_no_banco")
    expect(r.json).not.toContain(VAULT_BODY4)
    // A divergência continua medida: é a nota do Obsidian que está errada.
    expect(r.divergentes).toHaveLength(1)
    expect(r.divergentes[0]).toMatchObject({
      variant_id: "id-4",
      slug: "body-4-tutorial-de-uso",
      name: "body 4 - bridge fundo cards",
      vault: VAULT_BODY4,
      banco: BANCO_BODY4,
    })
  })

  it("o vault preenche o que o sistema não tem, e só isso", () => {
    const r = buildCatalog(
      [v("id-6", "body", "body 6", { description: null, when_use: null })],
      extra("id-6", "body-6-prova-social", VAULT_BODY4),
    )
    const entrada = r.sections[0].variantes[0]
    expect(entrada.description).toBe(VAULT_BODY4)
    // Sem os dois lados não há contradição a registrar.
    expect(r.divergentes).toEqual([])
  })

  it("descrições que combinam não viram divergência", () => {
    const iguais = "Bloco de diferenciação para quando o cliente já entendeu a categoria e está decidindo entre marcas."
    const r = buildCatalog(
      [v("id-5", "body", "body 5", { description: iguais })],
      extra("id-5", "body-5-comparacao-nos-vs-eles", iguais),
    )
    expect(r.divergentes).toEqual([])
  })

  it("um dos lados vazio não é contradição", () => {
    const semBanco = buildCatalog(
      [v("id-x", "body", "x", { description: null })],
      extra("id-x", "body-x", VAULT_BODY4),
    )
    expect(semBanco.divergentes).toEqual([])
    const semVault = buildCatalog([
      v("id-y", "body", "y", { description: BANCO_BODY4 }),
    ])
    expect(semVault.divergentes).toEqual([])
  })

  it("ordena da mais divergente para a menos", () => {
    const extras = new Map<string, CatalogVaultExtra>([
      ["id-3", { slug: "body-3-pitch-de-gift-card", descricao_curta: VAULT_BODY3 }],
      ["id-4", { slug: "body-4-tutorial-de-uso", descricao_curta: VAULT_BODY4 }],
    ])
    const r = buildCatalog(
      [
        v("id-3", "body", "body 3", { description: BANCO_BODY3 }),
        v("id-4", "body", "body 4", { description: BANCO_BODY4 }),
      ],
      extras,
    )
    expect(r.divergentes.map((d) => d.variant_id)).toEqual(["id-4", "id-3"])
  })
})

// ── `exige` fora (01/09) ────────────────────────────────────────────────
//
// O campo elimina candidata antes do ranking, e os 52 requisitos do vault
// têm `verificavel_hoje: false` — ninguém consegue conferir nenhum deles,
// então toda eliminação era dedução do modelo sobre um ativo invisível. No
// Welcome 1 da Innova Bay matou 2 das 3 variantes de body e deixou UMA
// candidata de nove. A correção não foi pedir para o modelo ignorar o
// campo: o campo saiu do catálogo.
describe("buildCatalog — nenhum requisito de ativo viaja", () => {
  const extras = new Map<string, CatalogVaultExtra>([
    [
      "id-1",
      {
        slug: "body-3-pitch-de-gift-card",
        registro: ["premium-editorial"],
        // Vem do frontmatter do vault e tem de morrer aqui.
        exige: ["gift-card-digital", "foto-com-pessoas"],
        peso: "medio · 900px",
      } as CatalogVaultExtra,
    ],
  ])

  it("a entrada do catálogo não tem `exige`", () => {
    const r = buildCatalog([v("id-1", "body", "body 3")], extras)
    const entrada = r.sections[0].variantes[0]
    expect(entrada.vault).toBeDefined()
    expect(entrada.vault).not.toHaveProperty("exige")
    // Os eixos que DECIDEM continuam inteiros.
    expect(entrada.vault?.registro).toEqual(["premium-editorial"])
    expect(entrada.vault?.peso).toBe("medio · 900px")
  })

  it("o JSON servido ao Curador não contém o requisito nem a palavra", () => {
    const r = buildCatalog([v("id-1", "body", "body 3")], extras)
    expect(r.json).not.toContain("exige")
    expect(r.json).not.toContain("gift-card-digital")
  })
})

// A lista que substitui o aviso no prompt: o dado errado continua existindo,
// e é na nota do Obsidian que se corrige.
describe("levantarHigieneDoVault", () => {
  const ativas = [
    { id: "id-1", name: "review 2", block_type: "reviews" },
    { id: "id-2", name: "hero 3", block_type: "hero" },
  ]

  it("nota apontando para variante que não está ativa é órfã", () => {
    const r = levantarHigieneDoVault(
      [
        { slug: "reviews-3a", variant_id: "id-1", nome_no_banco: "review 3" },
        { slug: "body-9-antiga", variant_id: "id-morta", nome_no_banco: "body 9" },
      ],
      ativas,
      [],
    )
    expect(r.notas_orfas).toEqual([
      { slug: "body-9-antiga", variant_id: "id-morta", nome_no_banco: "body 9" },
    ])
  })

  it("variante ativa sem nota aparece — o Curador decide sem os eixos dela", () => {
    const r = levantarHigieneDoVault(
      [{ slug: "reviews-3a", variant_id: "id-1", nome_no_banco: "review 3" }],
      ativas,
      [],
    )
    expect(r.variantes_sem_nota).toEqual([
      { variant_id: "id-2", name: "hero 3", block_type: "hero" },
    ])
  })

  it("nota sem variant_id conta como órfã e não cobre ninguém", () => {
    const r = levantarHigieneDoVault(
      [{ slug: "solta", variant_id: null, nome_no_banco: null }],
      ativas,
      [],
    )
    expect(r.notas_orfas).toHaveLength(1)
    expect(r.variantes_sem_nota).toHaveLength(2)
  })

  it("repassa as divergências medidas sem recalcular", () => {
    const d = [
      { variant_id: "id-1", slug: "reviews-3a", name: "review 2", vault: "a", banco: "b", similaridade: 0.2 },
    ]
    expect(levantarHigieneDoVault([], ativas, d).divergentes).toBe(d)
  })
})

// PR 10: o índice que devolve o UUID quando o Curador aponta pelo nome ou
// pelo slug da nota — os dois apelidos que ele LÊ no catálogo servido.
describe("buildAliasIndex", () => {
  const extras = (pares: Array<[string, string]>) =>
    new Map<string, CatalogVaultExtra>(
      pares.map(([id, slug]) => [id, { slug } as CatalogVaultExtra]),
    )

  it("indexa nome e slug, normalizando caixa e pontuação", () => {
    const idx = buildAliasIndex(
      [v("id-1", "offer", "Offer 4 — Manifesto")],
      extras([["id-1", "offer-4-manifesto-antes-do-cupom"]]),
    )
    // Pelo slug da nota E pelo nome da variante — o Curador vê os dois.
    expect(idx.get("offer-4-manifesto-antes-do-cupom")).toBe("id-1")
    expect(idx.get("offer-4-manifesto")).toBe("id-1")
  })

  it("apelido ambíguo é descartado — resolver para a variante errada é pior", () => {
    const idx = buildAliasIndex([
      v("id-1", "hero", "Hero padrão"),
      v("id-2", "body", "Hero padrão"),
    ])
    expect(idx.has("hero-padrao")).toBe(false)
  })

  it("o mesmo apelido apontando para a MESMA variante não vira ambiguidade", () => {
    const idx = buildAliasIndex(
      [v("id-1", "hero", "hero faixa escura")],
      extras([["id-1", "Hero Faixa Escura"]]),
    )
    expect(idx.get("hero-faixa-escura")).toBe("id-1")
  })

  it("sem extras funciona só com o nome", () => {
    const idx = buildAliasIndex([v("id-1", "hero", "Hero A")])
    expect(idx.get("hero-a")).toBe("id-1")
  })
})

// 07/09: o eixo `momento` foi aposentado. Fora da hero, NENHUMA variante
// declarava `welcome-1` — a regra não separava boa de ruim, eliminava quatro
// seções inteiras. Saiu do catálogo, como o `exige` antes dele.
describe("buildCatalog — momento não viaja", () => {
  const extras = new Map<string, CatalogVaultExtra>([
    [
      "id-1",
      {
        slug: "products-9-grade-de-tamanho",
        momento: ["queima-de-estoque"],
        momento_vetado: ["welcome-1"],
        registro: ["bold-alto-contraste"],
      } as unknown as CatalogVaultExtra,
    ],
  ])

  it("a entrada do catálogo não tem `momento` nem `momento_vetado`", () => {
    const r = buildCatalog([v("id-1", "products", "produtos 9")], extras)
    const entrada = r.sections[0].variantes[0]
    expect(entrada.vault).toBeDefined()
    expect(entrada.vault).not.toHaveProperty("momento")
    expect(entrada.vault).not.toHaveProperty("momento_vetado")
    expect(entrada.vault?.registro).toEqual(["bold-alto-contraste"])
  })

  it("o JSON servido ao Curador não contém o campo nem os valores", () => {
    const r = buildCatalog([v("id-1", "products", "produtos 9")], extras)
    expect(r.json).not.toContain("momento")
    expect(r.json).not.toContain("queima-de-estoque")
    expect(r.json).not.toContain("welcome-1")
  })
})

describe("contrato da anatomia no catálogo (09/09)", () => {
  it("cada entrada leva o resumo do output_schema — cupom, CTA, grade — sem o schema inteiro", () => {
    const v = {
      id: "h3",
      block_type: "hero",
      name: "welcome - hero section 3",
      html: "<table></table>",
      is_active: true,
      output_schema: [
        { key: "headline_l1", type: "text_short", max_len: 40, required: false, example: "x", guidance: "", label: "" },
        { key: "coupon_line", type: "text_short", max_len: 40, required: false, example: "Use code: X", guidance: "", label: "" },
        { key: "cta_label", type: "text_short", max_len: 20, required: false, example: "SHOP", guidance: "", label: "" },
        { key: "hero_flatlay_kit", type: "image", max_len: 0, required: false, example: "", guidance: "", label: "" },
      ],
    } as never
    const r = buildCatalog([v])
    expect(r.sections[0].variantes[0].contrato).toMatchObject({ tem_cupom: true, tem_cta: true, copy: 3, imagens: 1 })
    expect(r.json).toContain('"tem_cupom": true')
    expect(r.json).not.toContain("output_schema")
    expect(r.json).not.toContain("Use code: X")
  })
})

// ── Catálogo enxuto (09/09) ─────────────────────────────────────────────
//
// O `json` completo custava 128k dos 190k chars da chamada do Curador. O
// enxuto é o índice de títulos: uma linha por variante, com os mesmos ids
// e eixos, para rankear e abrir a finalista por `ler_nota`.
describe("buildCatalogoEnxuto", () => {
  const desc =
    "Hero de captação com cupom em destaque e CTA único, para loja que abre com incentivo. Segunda frase que não entra na linha."
  const extras = new Map<string, CatalogVaultExtra>([
    ["h1", { slug: "hero-1-cupom", objecao: ["preco"], registro: ["direto"], paleta: ["clara"], papel_na_peca: ["abre"], peso: "medio · 900px", convivencia: ["offer-2"], aliviador: ["incentivo"], profundidade: "afirmacao" }],
  ])

  it("uma linha por variante, agrupada por seção, com id, slug e eixos", () => {
    const r = buildCatalog([v("h1", "hero", "Hero cupom", { description: desc }), v("b1", "body", "Corpo", { description: "Bloco de texto." })], extras)
    expect(r.enxuto).toBe(buildCatalogoEnxuto(r.sections))
    expect(r.enxuto).toContain("## hero (1)")
    expect(r.enxuto).toContain("## body (1)")
    const linha = r.enxuto.split("\n").find((l) => l.startsWith("- h1"))!
    expect(linha).toContain("Hero cupom [hero-1-cupom]")
    expect(linha).toContain("Hero de captação com cupom em destaque e CTA único, para loja que abre com incentivo.")
    expect(linha).not.toContain("Segunda frase")
    expect(linha).toContain("objeção: preco")
    expect(linha).toContain("aliviador: incentivo")
    expect(linha).toContain("peso: medio · 900px")
    expect(linha).toContain("convivência: offer-2")
    // Sem nota no vault, os TRÊS eixos de topo dizem que não declaram
    // (15/09). Antes a linha saía curta e limpa, e o modelo não tinha como
    // distinguir "não se compromete com nada" de "não se aplica aqui" — era
    // metade do ofuscamento. Os demais eixos seguem omitidos.
    const corpo = r.enxuto.split("\n").find((l) => l.startsWith("- b1"))!
    expect(corpo).toContain("objeção: (não declara)")
    expect(corpo).toContain("aliviador: (não declara)")
    expect(corpo).toContain("profundidade: (não declara)")
    expect(corpo).not.toContain("registro vetado")
    expect(corpo).not.toContain("paleta")
    expect(corpo).toContain("Bloco de texto.")
  })

  it("todo variant_id do catálogo aparece; contagem por seção bate com sections", () => {
    // A biblioteca real tem ~50 variantes e nem todas têm nota no vault;
    // 50 com TODOS os eixos preenchidos é o pior caso plausível.
    const variants = Array.from({ length: 50 }, (_, i) =>
      v(`id-${i}`, ["hero", "body", "offer", "products", "reviews", "footer"][i % 6], `Variante ${i}`, { description: desc, product_slots: i % 4 }),
    )
    const todasComExtra = new Map<string, CatalogVaultExtra>(
      variants.map((x) => [x.id, { ...extras.get("h1")!, slug: `nota-${x.id}` }]),
    )
    const r = buildCatalog(variants, todasComExtra)
    for (const x of variants) expect(r.enxuto).toContain(`- ${x.id} ·`)
    const linhas = r.enxuto.split("\n").filter((l) => l.startsWith("- ")).length
    expect(linhas).toBe(r.total)
    for (const sec of r.sections) expect(r.enxuto).toContain(`## ${sec.section} (${sec.variantes.length})`)
    // O que se mede é o custo POR VARIANTE, não o total (15/09). O teto de
    // 15.000 no total ficava verde aqui (302 chars/linha neste fixture)
    // enquanto a produção o ultrapassava — 16.255 chars para 37 variantes,
    // 439 por linha — e proibiria a biblioteca de crescer, que é o
    // contrário do que se quer.
    expect(r.compact.charsPorVariante).toBeLessThanOrEqual(LIMITE_CHARS_POR_VARIANTE)
    expect(r.compact.linhasLongas).toEqual([])
    expect(r.compact.chars).toBe(r.enxuto.length)
  })

  it("é estável: mesma entrada em outra ordem gera o MESMO enxuto", () => {
    const a = buildCatalog([v("1", "hero", "A"), v("2", "hero", "B"), v("3", "body", "C")])
    const b = buildCatalog([v("3", "body", "C"), v("2", "hero", "B"), v("1", "hero", "A")])
    expect(a.enxuto).toBe(b.enxuto)
  })

  it("expõe a fonte tipada do índice sem os campos integrais do catálogo", () => {
    const r = buildCatalog([v("h1", "hero", "Hero cupom", {
      description: desc,
      when_use: "texto longo que não pode vazar",
      copy_guidance: "orientação longa que não pode vazar",
    })], extras)
    expect(r.compact.text).toBe(r.enxuto)
    expect(r.compact.entries).toHaveLength(1)
    expect(r.compact.entries[0]).toMatchObject({
      variant_id: "h1",
      section: "hero",
      title: "Hero cupom",
      note_slug: "hero-1-cupom",
    })
    expect(r.compact.entries[0].requirements).toBeDefined()
    expect(JSON.stringify(r.compact.entries[0])).not.toContain("when_use")
    expect(JSON.stringify(r.compact.entries[0])).not.toContain("copy_guidance")
    expect(r.compact.text).not.toContain("texto longo que não pode vazar")
  })
})

// ── 15/09: o slot de imagem gerada e o estado da direção aparecem na linha ─
//
// O Curador leu "body 8 - cards vidro" como cards de TEXTO: a composição
// fotográfica de 600×850 não aparecia em lugar nenhum do índice, e a
// direção era rascunho ("Pendente da referência… aguardando o PNG").
describe("buildCatalogoEnxuto — imagem gerada e direção fotográfica (15/09)", () => {
  const schemaImg = [
    { key: "glass_title", type: "text_short" },
    { key: "glass_subtitle", type: "text_short" },
    { key: "glass_composition_image", type: "image" },
  ] as never
  it("declara o slot, o rascunho e o veto a pessoa; sem imagem a linha não fala disso", () => {
    const txt = buildCatalogoEnxuto(
      buildCatalog([
        v("b8", "body", "body 8 - cards vidro", { output_schema: schemaImg, photo_direction: "Pendente da referência. Aguardando o PNG." } as never),
        v("h3", "hero", "hero 3", { output_schema: schemaImg, photo_direction: "Flat-lay. Nenhuma mão, nenhuma pessoa." } as never),
        v("b2", "body", "body 2 - textos", { output_schema: [{ key: "t", type: "text_short" }] as never }),
        v("b9", "body", "body 9 - sem direção", { output_schema: schemaImg, photo_direction: null } as never),
      ]).sections,
    )
    expect(txt).toContain("body 8 - cards vidro")
    expect(txt).toMatch(/body 8[^\n]*imagem: 1 slot de imagem gerada · direção fotográfica EM RASCUNHO/)
    expect(txt).toMatch(/hero 3[^\n]*imagem: 1 slot de imagem gerada · direção veta pessoa\/mão/)
    expect(txt).toMatch(/body 9[^\n]*imagem: 1 slot de imagem gerada · sem direção fotográfica/)
    expect(txt.split("\n").find((l) => l.includes("body 2 - textos"))).not.toContain("imagem:")
  })
  it("o contrato tipado carrega a leitura da direção; ausente fica null", () => {
    const cat = buildCatalog([
      v("h3", "hero", "hero 3", { output_schema: schemaImg, photo_direction: "Nenhuma mão, nenhuma pessoa." } as never),
      v("h9", "hero", "hero 9", { output_schema: schemaImg }),
    ])
    const h3 = cat.sections[0].variantes.find((e) => e.variant_id === "h3")!
    const h9 = cat.sections[0].variantes.find((e) => e.variant_id === "h9")!
    expect(h3.contrato.direcao).toEqual({ rascunho: false, proibe_pessoa: true })
    expect(h9.contrato.direcao).toBeNull()
  })
})


// ── A forma derivada do schema (15/09) ──────────────────────────────────
//
// Medido em 45 dias de escolhas: 8 de 37 variantes ativas NUNCA foram
// escolhidas, e três dispositivos concentravam 100% num único bloco. Em
// `hero_lineup` os quatro eixos escritos à mão davam a MESMA tupla para as
// duas variantes — o catálogo não tinha como diferenciá-las. Os derivados
// do `output_schema` separam dez dos onze dispositivos com mais de uma
// variante ativa, e não custam curadoria nenhuma: saem de um campo que já
// é obrigatório.
describe("forma derivada do schema", () => {
  const campo = (key: string, type = "text_short") =>
    ({ key, type, label: key, max_len: 0, required: false, example: "", guidance: "" }) as never

  it("separa as duas de offer_sem_cupom, que os eixos do vault não separavam", () => {
    // Caso real: `offer 1` tem 3 campos e nenhuma imagem; `offer 2` tem 11
    // campos, uma imagem e prazo. O catálogo dizia quase a mesma coisa das
    // duas, e o placar de 45 dias foi 19 × 0.
    const offer1 = v("o1", "offer", "offer 1", {
      description: "Bloco de oferta sem imagem.",
      output_schema: [campo("offer_headline"), campo("offer_body"), campo("offer_cta_label")],
    })
    const offer2 = v("o2", "offer", "offer 2", {
      description: "Bloco de oferta para data comemorativa.",
      output_schema: [
        campo("offer_headline"),
        campo("offer_eyebrow"),
        campo("offer_deadline"),
        campo("offer_discount_value"),
        campo("offer_cta_label"),
        campo("offer_background_image", "image"),
      ],
    })
    const r = buildCatalog([offer1, offer2])
    const l1 = r.enxuto.split("\n").find((l) => l.startsWith("- o1"))!
    const l2 = r.enxuto.split("\n").find((l) => l.startsWith("- o2"))!
    expect(l1).toContain("forma: 3 campos")
    expect(l1).not.toContain("prazo")
    expect(l2).toContain("1 imagem")
    expect(l2).toContain("prazo")
    expect(l1).not.toBe(l2)
  })

  it("conta o botão uma vez por botão, não por campo do botão", () => {
    // `cta_1_label` + `cta_1_url` é UM botão. Contar o par dobraria a
    // contagem de toda variante que declara o destino no schema.
    const r = buildCatalog([
      v("h", "hero", "H", {
        output_schema: [campo("cta_1_label"), campo("cta_1_url", "url"), campo("cta_2_label"), campo("cta_2_url", "url")],
      }),
    ])
    expect(r.sections[0].variantes[0].contrato.n_ctas).toBe(2)
    expect(r.enxuto).toContain("2 botões")
  })

  it("um botão só não vira ruído na linha", () => {
    const r = buildCatalog([v("h", "hero", "H", { output_schema: [campo("cta_label")] })])
    expect(r.sections[0].variantes[0].contrato.n_ctas).toBe(1)
    expect(r.enxuto).not.toContain("botões")
  })

  it("publica TODAS as famílias numeradas, não só product", () => {
    // A linha dizia `slots: 4` e calava `review: 3` — e é a grade que
    // decide se a variante realiza o papel ("grade de 4 quando pede 2").
    const r = buildCatalog([
      v("r", "reviews", "R", {
        output_schema: [campo("review_1_text"), campo("review_2_text"), campo("review_3_text"), campo("product_1_name")],
      }),
    ])
    const linha = r.enxuto.split("\n").find((l) => l.startsWith("- r"))!
    expect(linha).toContain("grades: product 1, review 3")
  })

  it("nome do depoente, preço riscado e logo entram porque distinguem peças reais", () => {
    const r = buildCatalog([
      v("p", "products", "P", {
        output_schema: [
          campo("brand_logo", "image"),
          campo("product_price"),
          campo("product_price_old"),
          campo("review_1_name"),
        ],
      }),
    ])
    const c = r.sections[0].variantes[0].contrato
    expect(c.tem_logo).toBe(true)
    expect(c.tem_preco_antigo).toBe(true)
    expect(c.tem_nome_depoente).toBe(true)
  })
})

// ── Duplicata no mesmo dispositivo (15/09) ──────────────────────────────
describe("duplicatasPorDispositivo", () => {
  // As duas de `hero_lineup` descrevem literalmente a mesma peça, e o
  // placar de 45 dias é 5 × 0. Escolher sempre a mesma entre duas
  // idênticas é o comportamento CERTO — o defeito é de curadoria.
  const d10 =
    "Anuncia uma rotina, kit ou linha completa e manda para a coleção. Vive no meio do email, no momento de descoberta e educação, quando o cliente ainda está conhecendo a amplitude do catálogo."
  const d8 =
    "Anuncia uma rotina, kit ou linha completa e leva à coleção correspondente. Momento de descoberta e educação: o cliente está conhecendo a amplitude do catálogo."

  it("aponta o par do mesmo dispositivo que conta a mesma peça", () => {
    const r = buildCatalog([
      v("a", "hero", "hero section 10", { description: d10, dispositivo: "hero_lineup" }),
      v("b", "hero", "hero sectiion 8", { description: d8, dispositivo: "hero_lineup" }),
    ])
    expect(r.duplicatas).toHaveLength(1)
    expect(r.duplicatas[0].dispositivo).toBe("hero_lineup")
    expect(r.duplicatas[0].similaridade).toBeGreaterThanOrEqual(LIMIAR_DE_DUPLICATA)
  })

  it("peças diferentes do mesmo dispositivo não são duplicata", () => {
    const r = buildCatalog([
      v("a", "offer", "offer 1", { description: "Bloco de oferta sem nenhuma imagem, para declarar a condição comercial.", dispositivo: "offer_sem_cupom" }),
      v("b", "offer", "offer 2", { description: "Oferta de data comemorativa com duas condições sobre foto de cena.", dispositivo: "offer_sem_cupom" }),
    ])
    expect(r.duplicatas).toEqual([])
  })

  it("dispositivos diferentes nunca formam par, por mais parecidas que sejam", () => {
    const r = buildCatalog([
      v("a", "hero", "A", { description: d10, dispositivo: "hero_lineup" }),
      v("b", "body", "B", { description: d10, dispositivo: "body_tese" }),
    ])
    expect(r.duplicatas).toEqual([])
  })

  // Este teste afirmava o contrário ("variante sem dispositivo fica fora")
  // e era ele que mantinha o defeito vivo: quem não tem etiqueta concorre em
  // TODA posição da seção, então é ali que a duplicata dela pesa. Medido em
  // 15/09, com as 8 heroes novas ainda sem classificação: duas delas
  // descrevem a mesma decisão de uso e o detector não as via.
  it("duas sem dispositivo na mesma seção formam par, agrupadas pela seção", () => {
    const r = buildCatalog([
      v("a", "hero", "A", { description: d10 }),
      v("b", "hero", "B", { description: d8 }),
    ])
    expect(r.duplicatas).toHaveLength(1)
    expect(r.duplicatas[0].dispositivo).toBe("sem dispositivo · hero")
  })

  it("sem dispositivo em seções diferentes não forma par", () => {
    const r = buildCatalog([
      v("a", "hero", "A", { description: d10 }),
      v("b", "body", "B", { description: d10 }),
    ])
    expect(r.duplicatas).toEqual([])
  })

  it("classificada e não classificada não formam par: os grupos são outros", () => {
    const r = buildCatalog([
      v("a", "hero", "A", { description: d10, dispositivo: "hero_lineup" }),
      v("b", "hero", "B", { description: d8 }),
    ])
    expect(r.duplicatas).toEqual([])
  })

  it("lista a variante ativa sem dispositivo, com a seção", () => {
    const r = buildCatalog([
      v("a", "hero", "hero section 13", { description: d10 }),
      v("b", "hero", "hero section 3", { description: d8, dispositivo: "hero_oferta_cupom" }),
    ])
    expect(r.compact.naoClassificadas).toEqual([
      { variant_id: "a", name: "hero section 13", section: "hero" },
    ])
  })

  it("biblioteca inteira classificada devolve lista vazia", () => {
    const r = buildCatalog([
      v("a", "hero", "A", { description: d10, dispositivo: "hero_lineup" }),
    ])
    expect(r.compact.naoClassificadas).toEqual([])
  })

  it("descrição vazia não é duplicata — é cadastro incompleto", () => {
    // Dois vazios dariam Dice 1 e a lista encheria de par inútil.
    const r = buildCatalog([
      v("a", "hero", "A", { description: "", dispositivo: "hero_lineup" }),
      v("b", "hero", "B", { description: "", dispositivo: "hero_lineup" }),
    ])
    expect(duplicatasPorDispositivo(r.sections)).toEqual([])
  })
})

// O leque (uma chamada por posição) serve a cada posição só a seção dela.
// A fatia tem de sair pelo MESMO renderizador do catálogo inteiro: com
// render próprio, a linha da variante mudaria de forma entre os dois e as
// medições (chars por variante, duplicatas) passariam a falar de textos
// diferentes.
describe("fatiarCatalogo", () => {
  const cat = () =>
    buildCatalog(
      [
        v("h1", "hero", "Hero cupom", { description: "Abre com incentivo." }),
        v("h2", "hero", "Hero pergunta", { description: "Abre perguntando." }),
        v("b1", "body", "Corpo", { description: "Bloco de texto." }),
      ],
      new Map(),
    )

  it("devolve só a seção pedida, e a linha é idêntica à do catálogo inteiro", () => {
    const r = cat()
    const fatia = fatiarCatalogo(r.sections, "hero")
    expect(fatia).toHaveLength(1)
    expect(fatia[0].variantes.map((x) => x.variant_id)).toEqual(["h1", "h2"])
    const texto = buildCatalogoEnxuto(fatia)
    expect(texto).toContain("## hero (2)")
    expect(texto).not.toContain("## body")
    // byte a byte a mesma linha — é isso que mantém as medições comparáveis
    const doInteiro = r.enxuto.split("\n").find((l) => l.startsWith("- h1"))
    expect(texto.split("\n").find((l) => l.startsWith("- h1"))).toBe(doInteiro)
  })

  it("`idsPermitidos` corta as candidatas; id de fora da seção é ignorado", () => {
    const fatia = fatiarCatalogo(cat().sections, "hero", ["h2", "b1", "nao-existe"])
    expect(fatia[0].variantes.map((x) => x.variant_id)).toEqual(["h2"])
  })

  it("sem `idsPermitidos` vai a seção inteira; seção inexistente devolve []", () => {
    expect(fatiarCatalogo(cat().sections, "hero")[0].variantes).toHaveLength(2)
    expect(fatiarCatalogo(cat().sections, "reviews")).toEqual([])
  })

  it("a seção é normalizada como no resto do pipeline", () => {
    expect(fatiarCatalogo(cat().sections, "  HERO ")[0].variantes).toHaveLength(2)
  })

  // Lista vazia é diferente de ausente: o chamador precisa distinguir "esta
  // posição não tem candidata" de "esta seção não existe no catálogo".
  it("nenhuma candidata elegível devolve a seção com zero variantes, não []", () => {
    const fatia = fatiarCatalogo(cat().sections, "hero", [])
    expect(fatia).toHaveLength(1)
    expect(fatia[0].variantes).toEqual([])
  })
})
