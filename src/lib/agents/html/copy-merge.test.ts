/**
 * Merge por EXAMPLE: a frase do schema é a âncora e a troca é splice.
 * Os casos espelham a biblioteca real (frases autoradas, sentinelas
 * cfy:hero, espelho MSO, tokens estruturais de atributo).
 */

import { describe, expect, it } from "vitest"
import {
  applyStructuralFills,
  copyMergeByExample,
  heroCopyPreserved,
  mergeBlocksFromContext,
  type MergeBlock,
} from "./copy-merge"
import {
  HERO_SENTINEL_START,
  HERO_SENTINEL_END,
} from "./hero-locator"

const block = (
  fields: Array<{ key: string; example: string; type?: string; nature?: string }>,
  content: Record<string, unknown>,
  overrides: Partial<MergeBlock> = {},
): MergeBlock => ({
  fields: fields.map((f) => ({
    key: f.key,
    example: f.example,
    type: f.type ?? "text_short",
    nature: f.nature ?? "copy",
  })),
  content,
  block_id: "blk-1",
  block_type: "beneficios",
  ...overrides,
})

describe("copyMergeByExample", () => {
  it("troca a frase do example pelo valor do n8n, por splice, no lugar exato", () => {
    const html = [
      "<table><tr>",
      "<td>Don&rsquo;t miss the Summer Sale</td>",
      "<td>Shop the collection</td>",
      "</tr></table>",
    ].join("\n")
    const r = copyMergeByExample(html, [
      block(
        [
          { key: "headline", example: "Don't miss the Summer Sale" },
          { key: "cta_label", example: "Shop the collection" },
        ],
        { headline: "Última chamada do inverno", cta_label: "Ver ofertas" },
      ),
    ])
    expect(r.html).toContain("<td>Última chamada do inverno</td>")
    expect(r.html).toContain("<td>Ver ofertas</td>")
    expect(r.report.slots_total).toBe(2)
    expect(r.report.ops_built).toBe(2)
    expect(r.report.merged).toBe(2)
    const campo = r.report.campos.find((c) => c.key === "headline")!
    expect(campo).toMatchObject({
      block_id: "blk-1",
      desfecho: "ancorado_exemplo",
      de: "Don&rsquo;t miss the Summer Sale",
      para: "Última chamada do inverno",
    })
  })

  it("escreve DENTRO da região cfy:hero e devolve os valores em hero_values", () => {
    const html = [
      "<table>",
      HERO_SENTINEL_START,
      "<tr><td>Hero headline here</td></tr>",
      HERO_SENTINEL_END,
      "<tr><td>Body text here</td></tr>",
      "</table>",
    ].join("\n")
    const r = copyMergeByExample(html, [
      block(
        [
          { key: "hero_headline", example: "Hero headline here" },
          { key: "body_text", example: "Body text here" },
        ],
        { hero_headline: "Bem-vinda à loja", body_text: "Texto do corpo" },
        { block_type: "hero" },
      ),
    ])
    expect(r.html).toContain("<td>Bem-vinda à loja</td>")
    // hero_values carrega SÓ o que caiu entre as sentinelas.
    expect(r.report.hero_values).toEqual(["Bem-vinda à loja"])
    const anchors = Object.fromEntries(r.anchors.map((a) => [a.key, a]))
    expect(anchors.hero_headline.inHero).toBe(true)
    expect(anchors.body_text.inHero).toBe(false)
  })

  it("valor que é MARCAÇÃO é recusado (value_is_html) e o HTML fica intacto", () => {
    const html = "<table><tr><td>Brand tagline</td></tr></table>"
    const r = copyMergeByExample(html, [
      block(
        [{ key: "tagline", example: "Brand tagline" }],
        { tagline: '<img src="https://x/logo.png">' },
      ),
    ])
    expect(r.html).toBe(html)
    expect(r.report.merged).toBe(0)
    expect(r.report.skipped[0]).toMatchObject({
      key: "tagline",
      reason: "value_is_html",
    })
  })

  it("sem_lugar não altera o HTML e entra no report com o motivo (fail-open)", () => {
    const html = "<table><tr><td>Outro texto</td></tr></table>"
    const r = copyMergeByExample(html, [
      block(
        [{ key: "headline", example: "Summer Sale" }],
        { headline: "Valor que não tem onde entrar" },
      ),
    ])
    expect(r.html).toBe(html)
    expect(r.report.sem_lugar).toEqual([
      { block_id: "blk-1", key: "headline", motivo: "nao_encontrado" },
    ])
    expect(r.report.campos[0].desfecho).toBe("sem_lugar")
    expect(r.report.campos[0].para).toBeNull()
  })

  it("campo ancorado SEM valor do n8n fica registrado como copy_ausente e a frase sobrevive", () => {
    const html = "<table><tr><td>Original phrase stays</td></tr></table>"
    const r = copyMergeByExample(html, [
      block([{ key: "headline", example: "Original phrase stays" }], {}),
    ])
    expect(r.html).toBe(html)
    expect(r.report.campos[0]).toMatchObject({
      desfecho: "ancorado_exemplo",
      motivo: "copy_ausente",
      para: null,
    })
  })

  it("irmãos idênticos + espelho MSO: o espelho no comentário também é preenchido", () => {
    const html = [
      "<table><tr><td>Name.</td></tr></table>",
      '<!--[if mso]><table><tr><td>Name.</td></tr></table><![endif]-->',
    ].join("\n")
    const r = copyMergeByExample(html, [
      block([{ key: "review_1_name", example: "Name." }], {
        review_1_name: "Marina S.",
      }),
    ])
    // A árvore só vê a ocorrência real (o comentário não é nó de texto),
    // então o casamento é único — e o espelho MSO é trocado por código.
    expect(r.report.merged).toBe(1)
    const mainCount = (r.html.match(/Marina S\./g) ?? []).length
    expect(mainCount).toBe(2)
    expect(r.html).not.toContain("Name.")
  })

  it("neutraliza < e > soltos do valor (contrato do set_text herdado)", () => {
    const html = "<table><tr><td>Price note</td></tr></table>"
    const r = copyMergeByExample(html, [
      block([{ key: "note", example: "Price note" }], {
        note: "preço < 100 reais",
      }),
    ])
    expect(r.html).toContain("preço &lt; 100 reais")
  })

  it("campo de imagem (nature imagem_gerada) fica FORA do merge de texto", () => {
    const html = '<table><tr><td><img src="URL_FOTO_1" alt=""></td></tr></table>'
    const r = copyMergeByExample(html, [
      block(
        [{ key: "hero_image", example: "foto do produto", type: "image", nature: "imagem_gerada" }],
        { hero_image: "https://cdn/x.png" },
      ),
    ])
    expect(r.report.slots_total).toBe(0)
    expect(r.html).toBe(html)
  })
})

describe("mergeBlocksFromContext", () => {
  it("casa position-1 guardado por type; estrutura divergente fica sem fields", () => {
    const blocks = [
      { id: "b1", position: 1, block_type: "hero", content: { x: "1" } },
      { id: "b2", position: 2, block_type: "cta", content: null },
    ]
    const bp = [
      { type: "hero", fields: [{ key: "h", type: "text_short" }] },
      { type: "beneficios", fields: [{ key: "z", type: "text_short" }] },
    ]
    const out = mergeBlocksFromContext(blocks, bp)
    expect(out[0].fields).toHaveLength(1)
    expect(out[0].block_id).toBe("b1")
    expect(out[0].block_type).toBe("hero")
    // position 2 = bp[1] type beneficios ≠ cta → sem fields (fail-open).
    expect(out[1].fields).toHaveLength(0)
  })
})

describe("heroCopyPreserved", () => {
  it("valor sumido do fragmento → falha com o valor em missing", () => {
    const r = heroCopyPreserved(
      ["Bem-vinda à loja", "Ver ofertas"],
      "<tr><td>Bem-vinda à loja</td></tr>",
    )
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual(["Ver ofertas"])
  })

  it("valor re-espaçado/re-entidade passa (mesma régua do casamento)", () => {
    const r = heroCopyPreserved(
      ["Don't miss  this"],
      "<tr><td>Don&rsquo;t\n  miss this</td></tr>",
    )
    expect(r.ok).toBe(true)
  })

  it("bold/cor DENTRO da frase passa — é o trabalho do agente, não perda", () => {
    // Incidente Luxe Lift 21/08: guidance do coupon_line manda "valor da
    // oferta em bold e na cor de acento". O agente obedeceu e o guard, que
    // comparava o fragmento CRU, acusou copy perdida em 4 tentativas.
    const r = heroCopyPreserved(
      ["Enjoy 15% off your first order using the code:"],
      `<tr><td style="font-size:22px;">
         Enjoy <strong style="color:#B08D57;">15%</strong> off your first order using the code:
       </td></tr>`,
    )
    expect(r.ok).toBe(true)
  })

  it("wrapper no meio da palavra passa (forma colada)", () => {
    const r = heroCopyPreserved(
      ["Bem-vinda à loja"],
      "<td>Bem-vind<em>a</em> à loja</td>",
    )
    expect(r.ok).toBe(true)
  })

  it("texto realmente removido continua reprovando", () => {
    const r = heroCopyPreserved(
      ["Enjoy 15% off your first order using the code:", "WELCOME15"],
      '<tr><td><strong style="color:#B08D57;">WELCOME15</strong></td></tr>',
    )
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual(["Enjoy 15% off your first order using the code:"])
  })

  it("lista vazia passa sempre (resume, região sem copy do merge)", () => {
    expect(heroCopyPreserved([], "<tr></tr>").ok).toBe(true)
  })

  it("wordmark virado logo passa pelo alt — o prompt MANDA fazer isso", () => {
    // Incidente Luxe Lift 23/08: o campo de copy `logo` traz o nome da
    // marca, e o prompt da hero manda trocar o wordmark em texto pelo
    // <img> do logo real. O agente obedeceu, manteve a marca no alt, e o
    // guard (que apagava a tag inteira) matou o e-mail duas vezes.
    const r = heroCopyPreserved(
      ["Luxe Lift", "SHOP 10% OFF"],
      '<tr><td><img src="https://cdn/logo_main.png" alt="Luxe Lift" width="152" /></td></tr>' +
        '<tr><td><a href="https://loja.com">SHOP 10% OFF</a></td></tr>',
    )
    expect(r.ok).toBe(true)
    // Só a marca foi salva pelo atributo; o CTA sobreviveu como texto.
    expect(r.viaAtributo).toEqual(["Luxe Lift"])
  })

  it("title e aria-label contam do mesmo jeito", () => {
    expect(
      heroCopyPreserved(["Luxe Lift"], '<img title="Luxe Lift" src="x.png" />').ok,
    ).toBe(true)
    expect(
      heroCopyPreserved(["Luxe Lift"], '<a aria-label="Luxe Lift" href="#"></a>').ok,
    ).toBe(true)
  })

  it("frase só dentro de src/href NÃO conta — URL não é copy entregue", () => {
    const r = heroCopyPreserved(
      ["Luxe Lift"],
      '<tr><td><a href="https://loja.com/luxe-lift"><img src="/luxe-lift.png" /></a></td></tr>',
    )
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual(["Luxe Lift"])
  })

  it("valor que sobreviveu como TEXTO não entra em viaAtributo", () => {
    const r = heroCopyPreserved(
      ["Luxe Lift"],
      '<tr><td>Luxe Lift</td><td><img alt="Luxe Lift" src="x.png" /></td></tr>',
    )
    expect(r.ok).toBe(true)
    expect(r.viaAtributo).toEqual([])
  })
})

describe("applyStructuralFills — tokens reais da biblioteca", () => {
  it('src="URL_DO_LOGO_AQUI" vira a URL da logo e NOME_DA_MARCA (alt+texto) vira a marca', () => {
    const html = [
      "<table><tr>",
      '<td><img src="URL_DO_LOGO_AQUI" alt="NOME_DA_MARCA" width="120"></td>',
      "<td>NOME_DA_MARCA</td>",
      "</tr></table>",
    ].join("\n")
    const r = applyStructuralFills(html, {
      brandName: "Luxe Lift",
      logoUrl: "https://cdn.loja.com/logo.png",
    })
    expect(r.html).toContain('src="https://cdn.loja.com/logo.png"')
    expect(r.html).toContain('alt="Luxe Lift"')
    expect(r.html).toContain("<td>Luxe Lift</td>")
    expect(r.cleaned).toEqual([])
    expect(r.filled.map((f) => f.token)).toContain("URL_DO_LOGO_AQUI")
  })

  it("sem logoUrl a linha FICA e o token vai para cleaned (strip limpa depois)", () => {
    const html = '<table><tr><td><img src="URL_DO_LOGO_AQUI" alt=""></td></tr></table>'
    const r = applyStructuralFills(html, { brandName: "Loja" })
    expect(r.html).toBe(html)
    expect(r.cleaned).toContain("URL_DO_LOGO_AQUI")
  })

  it("arte fixa base64 na mesma linha fica intacta", () => {
    const html = [
      "<table><tr>",
      '<td><img src="data:image/png;base64,iVBORw0KGgo" alt=""></td>',
      "<td>NOME_DA_MARCA</td>",
      "</tr></table>",
    ].join("\n")
    const r = applyStructuralFills(html, { brandName: "Loja X" })
    expect(r.html).toContain("data:image/png;base64,iVBORw0KGgo")
    expect(r.html).toContain("<td>Loja X</td>")
  })

  it("dentro da hero NADA é tocado (contraste de logo é juízo do agente)", () => {
    const html = [
      "<table>",
      HERO_SENTINEL_START,
      '<tr><td><img src="URL_DO_LOGO_AQUI" alt="NOME_DA_MARCA"></td></tr>',
      HERO_SENTINEL_END,
      "<tr><td>NOME_DA_MARCA</td></tr>",
      "</table>",
    ].join("\n")
    const r = applyStructuralFills(html, {
      brandName: "Loja Y",
      logoUrl: "https://cdn/l.png",
    })
    expect(r.html).toContain('src="URL_DO_LOGO_AQUI"')
    expect(r.html).toContain('alt="NOME_DA_MARCA"')
    expect(r.html).toContain("<td>Loja Y</td>")
  })

  it("href do rodapé: URL_UNSUBSCRIBE/URL_PREFERENCIAS viram merge tag do ESP", () => {
    const html = [
      "<table><tr><td>",
      'No longer want to receive these emails? <a href="URL_UNSUBSCRIBE">Unsubscribe</a><br>',
      '<a href="URL_PREFERENCIAS">Manage my preferences</a>',
      "</td></tr></table>",
    ].join("\n")
    const r = applyStructuralFills(html, { brandName: "Luxe Lift" })
    expect(r.html).toContain('href="[unsubscribe_link]"')
    expect(r.html).toContain('href="[preferences_link]"')
    expect(r.cleaned).toEqual([])
    expect(r.filled.map((f) => f.token).sort()).toEqual([
      "URL_PREFERENCIAS",
      "URL_UNSUBSCRIBE",
    ])
  })

  it("merge tag do ESP NÃO depende de dado da loja — resolve com contexto vazio", () => {
    // Sem brandName/logoUrl o token do logo cai em `cleaned`; o do
    // descadastro não pode cair junto, senão o link morre exatamente como
    // antes da correção.
    const html = '<table><tr><td><a href="URL_UNSUBSCRIBE">Descadastrar</a></td></tr></table>'
    const r = applyStructuralFills(html, {})
    expect(r.html).toContain('href="[unsubscribe_link]"')
    expect(r.cleaned).toEqual([])
  })

  it("href de CTA continua FORA do preenchimento estrutural", () => {
    // Destino de campanha não é dado de plataforma: URL_DO_CTA_AQUI segue
    // intacto aqui e vira "link sem destino" no render-checks — deliberado.
    const html = '<table><tr><td><a href="URL_DO_CTA_AQUI">Finalizar pedido</a></td></tr></table>'
    const r = applyStructuralFills(html, { brandName: "Loja" })
    expect(r.html).toContain('href="URL_DO_CTA_AQUI"')
    expect(r.filled).toEqual([])
  })

  it("legado {{}}: EMAIL_TITLE/YEAR preenchidos, LOGO recebe o markup, sem valor vai a cleaned", () => {
    const html = [
      "<table><tr><td>{{EMAIL_TITLE}} — {{YEAR}}</td></tr>",
      "<tr><td>{{LOGO}}</td></tr>",
      "<tr><td>{{PREHEADER}}</td></tr></table>",
    ].join("\n")
    const r = applyStructuralFills(html, {
      subject: "Oferta da semana",
      year: 2026,
      logoMarkup: '<img src="https://cdn/l.png" alt="Loja">',
    })
    expect(r.html).toContain("Oferta da semana — 2026")
    expect(r.html).toContain('<td><img src="https://cdn/l.png" alt="Loja"></td>')
    expect(r.html).toContain("{{PREHEADER}}")
    expect(r.cleaned).toContain("PREHEADER")
  })
})
