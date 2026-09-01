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
  isLogoKey,
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
  // ── Escopo por bloco (incidente 01/09) ───────────────────────────────
  //
  // O botão do segundo produto saiu "1 SEE HOW IT WORKS". Causa: o
  // `cta_label` do bloco 3 (example "SHOP NOW") achou duas ocorrências
  // livres — a sua e o miolo do "1 SHOP NOW", que é do bloco 4 e não tem
  // campo nenhum — e a regra 5 escreveu nas duas, deixando o "1 " na
  // frente. Um campo não pode escrever fora do próprio bloco.
  const doisProdutos = [
    "<!-- cfy:block:0:products:start -->",
    "<table><tr><td>SHOP NOW</td></tr></table>",
    "<!-- cfy:block:0:products:end -->",
    "<!-- cfy:block:1:products:start -->",
    "<table><tr><td>1 SHOP NOW</td></tr><tr><td>2 SHOP NOW</td></tr></table>",
    "<!-- cfy:block:1:products:end -->",
  ].join("\n")

  it("campo de um bloco NÃO escreve dentro de outro bloco", () => {
    const r = copyMergeByExample(doisProdutos, [
      block([{ key: "cta_label", example: "SHOP NOW" }], {
        cta_label: "SEE HOW IT WORKS",
      }, { block_id: "b3", block_type: "products" }),
      block([{ key: "product_cta_label", example: "2 SHOP NOW" }], {
        product_cta_label: "SEE DETAILS",
      }, { block_id: "b4", block_type: "products" }),
    ])
    expect(r.html).toContain("<td>SEE HOW IT WORKS</td>")
    expect(r.html).toContain("<td>SEE DETAILS</td>")
    // O que o bug produzia:
    expect(r.html).not.toContain("1 SEE HOW IT WORKS")
    // O "1 SHOP NOW" fica INTACTO — é texto sem dono, e sem dono ninguém
    // escreve. Ele aparece na auditoria de texto órfão, não no email.
    expect(r.html).toContain("<td>1 SHOP NOW</td>")
    expect(r.report.escopo).toBe("por_bloco")
    expect(r.report.escopo_degradado).toEqual([])
  })

  // A regra 5 continua viva DENTRO do bloco: a fita repetida de propósito
  // (o "Black Friday" ×16 da body 2) tem um campo só e todas as cópias.
  it("frase repetida dentro do MESMO bloco continua sendo escrita em todas", () => {
    const html = [
      "<!-- cfy:block:0:body:start -->",
      "<table><tr><td>Black Friday</td></tr><tr><td>Black Friday</td></tr></table>",
      "<!-- cfy:block:0:body:end -->",
    ].join("\n")
    const r = copyMergeByExample(html, [
      block([{ key: "fita", example: "Black Friday" }], { fita: "Semana do Cliente" }, {
        block_id: "b1",
        block_type: "body",
      }),
    ])
    expect(r.html.match(/Semana do Cliente/g)).toHaveLength(2)
    expect(r.report.campos[0].ocorrencias).toBe(2)
  })

  it("documento sem marcadores cai no índice global (legado)", () => {
    const r = copyMergeByExample("<td>SHOP NOW</td>", [
      block([{ key: "cta_label", example: "SHOP NOW" }], { cta_label: "Ver ofertas" }, {
        block_id: "b1",
      }),
    ])
    expect(r.html).toContain("Ver ofertas")
    expect(r.report.escopo).toBe("global")
  })

  // Marcador desalinhado não pode apagar a copy do bloco em silêncio: se o
  // escopo não ancora nada e o global ancoraria, volta ao global e AVISA.
  it("bloco cujo escopo não acha nada degrada para global e registra", () => {
    const html = [
      "<!-- cfy:block:0:hero:start -->",
      "<td>nada aqui</td>",
      "<!-- cfy:block:0:hero:end -->",
      "<td>Shop the collection</td>",
    ].join("\n")
    const r = copyMergeByExample(html, [
      block([{ key: "cta_label", example: "Shop the collection" }], {
        cta_label: "Ver ofertas",
      }, { block_id: "b1", block_type: "hero" }),
    ])
    expect(r.html).toContain("Ver ofertas")
    expect(r.report.escopo_degradado).toEqual(["b1"])
  })

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
  const campo = (key: string) => ({ key, type: "text_short" as const })

  it("o contrato vem da LINHA do bloco", () => {
    const out = mergeBlocksFromContext(
      [
        {
          id: "b1",
          position: 1,
          block_type: "hero",
          content: { h: "oi" },
          fields: [campo("h"), campo("sub")],
        },
      ],
      // Blueprint com contrato DIFERENTE: a linha manda.
      [{ type: "hero", fields: [campo("outro")] }],
    )
    expect(out.blocks[0].fields.map((f) => f.key)).toEqual(["h", "sub"])
    expect(out.blocos_sem_contrato).toEqual([])
  })

  // O bug do Welcome 1 da InnovaBay (28/08): 'offer' fora do CHECK fazia o
  // bloco nascer 'text', o tipo não batia com o do blueprint e os campos
  // sumiam calados. Com o contrato na linha, o tipo não decide mais nada.
  it("block_type divergente do blueprint não perde mais o contrato", () => {
    const out = mergeBlocksFromContext(
      [
        {
          id: "b2",
          position: 2,
          block_type: "text", // degradado por sanitizeBlockType
          content: { manifesto_headline: "Does it work?" },
          fields: [campo("manifesto_headline")],
        },
      ],
      [{ type: "hero", fields: [] }, { type: "offer", fields: [campo("z")] }],
    )
    expect(out.blocks[0].fields.map((f) => f.key)).toEqual(["manifesto_headline"])
    expect(out.blocos_sem_contrato).toEqual([])
  })

  it("linha sem contrato cai no blueprint por position-1 + type (legado)", () => {
    const out = mergeBlocksFromContext(
      [{ id: "b1", position: 1, block_type: "hero", content: { h: "1" } }],
      [{ type: "hero", fields: [campo("h")] }],
    )
    expect(out.blocks[0].fields).toHaveLength(1)
    expect(out.blocks[0].block_id).toBe("b1")
    expect(out.blocos_sem_contrato).toEqual([])
  })

  // Antes isto era `fields: []` e ponto — o fail-open MUDO que entregou o
  // texto de exemplo da variante ao cliente. Agora tem nome e sai no run.
  it("bloco COM copy e sem contrato em nenhuma fonte é reportado", () => {
    const out = mergeBlocksFromContext(
      [
        {
          id: "b2",
          position: 2,
          block_type: "cta",
          content: { z: "copy que não tem onde entrar", vazio: "  " },
        },
      ],
      [{ type: "hero", fields: [] }, { type: "beneficios", fields: [campo("z")] }],
    )
    expect(out.blocks[0].fields).toHaveLength(0)
    expect(out.blocos_sem_contrato).toEqual([
      {
        block_id: "b2",
        position: 2,
        block_type: "cta",
        // `vazio` é só espaço — não conta como copy a colocar.
        keys_na_copy: ["z"],
      },
    ])
  })

  // Bloco estrutural (divider/spacer) não tem copy nem contrato: não é erro.
  it("bloco sem contrato e SEM copy não é reportado", () => {
    const out = mergeBlocksFromContext(
      [{ id: "b3", position: 1, block_type: "divider", content: null }],
      [],
    )
    expect(out.blocos_sem_contrato).toEqual([])
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

  // O incidente de 01/09, com os bytes do run. O botão à prova de bala se
  // escreve DUAS vezes (VML do Outlook + demais clientes); sem as tags os
  // dois viram texto colado e o código aparece duplicado no meio da frase.
  // Na tela o cliente lê uma vez só, certa — e o guard matava o email.
  it("duplicação MSO do botão passa — o código repetido não é perda", () => {
    const r = heroCopyPreserved(
      ["Use code WELCOME10 for 10% off your first order"],
      `<td>
         <!--[if mso]>
         <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml">
           <center>Use code <b>WELCOME10</b></center>
         </v:roundrect>
         <![endif]-->
         <!--[if !mso]><!-- -->
         <span class="pill">WELCOME10</span> for 10% off your first order
         <!--<![endif]-->
       </td>`,
    )
    expect(r.ok).toBe(true)
  })

  // A copy do n8n volta com markdown literal e o agente renderiza como
  // markup. Sexta forma da mesma falsa acusação, vista no run de 01/09.
  it("markdown do n8n virando <strong> passa", () => {
    const r = heroCopyPreserved(
      ["You signed up — here's your reward: **10% off** your first order"],
      `<td>You signed up — here&rsquo;s your reward:
         <strong>10% off</strong> your first order</td>`,
    )
    expect(r.ok).toBe(true)
  })

  // O contrapeso: sem isto o critério novo viraria enfeite. As palavras
  // existem no documento, espalhadas — a frase não está lá.
  it("palavras espalhadas pelo documento NÃO salvam frase apagada", () => {
    const r = heroCopyPreserved(
      ["Use code WELCOME10 for 10% off your first order"],
      `<td>Use our app</td>
       <td>${"filler word ".repeat(30)}</td>
       <td>code WELCOME10 expires soon</td>
       <td>${"more filler ".repeat(30)}</td>
       <td>for 10% off on your next order</td>`,
    )
    expect(r.ok).toBe(false)
    expect(r.missing).toHaveLength(1)
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

  // ── Separador trocado (InnovaBay, 28/08) ──────────────────────────────
  //
  // O merge aplicou "Use code: WELCOME10 — valid at checkout"; o agente
  // destacou o código e trocou o travessão por uma quebra de linha, que é
  // o que um travessão faz na tela. O guard reprovou e, somado a um 402 do
  // OpenRouter na 1ª tentativa, matou o email.

  it("travessão trocado por <br> passa — o texto está inteiro", () => {
    const r = heroCopyPreserved(
      ["Use code: WELCOME10 — valid at checkout"],
      '<td style="font-weight:400;">Use code: <strong style="font-weight:900;">WELCOME10</strong><br>valid at checkout</td>',
    )
    expect(r.ok).toBe(true)
  })

  it("hífen, pipe e bullet contam como o mesmo separador", () => {
    const passa = (fragmento: string) =>
      heroCopyPreserved(["Frete grátis - hoje"], fragmento).ok
    expect(passa("<td>Frete grátis | hoje</td>")).toBe(true)
    expect(passa("<td>Frete grátis • hoje</td>")).toBe(true)
    expect(passa("<td>Frete grátis<br>hoje</td>")).toBe(true)
  })

  // O afrouxamento tem limite: trocar o separador é layout, sumir com
  // metade da frase não é.
  it("metade da frase removida continua reprovando", () => {
    const r = heroCopyPreserved(
      ["Use code: WELCOME10 — valid at checkout"],
      "<td>Use code: WELCOME10</td>",
    )
    expect(r.ok).toBe(false)
    expect(r.missing).toHaveLength(1)
  })

  // ── Wordmark virado <img> do logo REAL (InnovaBay, 28/08) ─────────────
  //
  // A defesa pelo `alt` (23/08) exige a string exata. Aqui a copy do campo
  // `logo` é "InnovaBay" e o alt traz o nome da loja, "Innova Bay nova" —
  // grafias diferentes. O agente pôs o logo certo e foi reprovado.

  const LOGO = "https://cdn.supabase.co/storage/v1/object/sign/brand/logo-Black.png"
  const imgLogo = (url = LOGO, alt = "Innova Bay nova") =>
    `<tr><td><img src="${url}" alt="${alt}" width="136" /></td></tr>`

  it("wordmark virado logo REAL passa e entra em viaLogo", () => {
    const r = heroCopyPreserved(["InnovaBay"], imgLogo(), {
      logoValues: ["InnovaBay"],
      logoSrcs: [LOGO],
    })
    expect(r.ok).toBe(true)
    expect(r.viaLogo).toEqual(["InnovaBay"])
    expect(r.viaAtributo).toEqual([])
  })

  it("a URL do logo é assinada: token diferente ainda casa", () => {
    const r = heroCopyPreserved(["InnovaBay"], imgLogo(`${LOGO}?token=abc123`), {
      logoValues: ["InnovaBay"],
      logoSrcs: [`${LOGO}?token=ZZZ_outro_token`],
    })
    expect(r.ok).toBe(true)
  })

  // O guard verifica que o LOGO entrou — não aceita imagem qualquer.
  it("imagem que não é o logo da loja NÃO salva", () => {
    const r = heroCopyPreserved(
      ["InnovaBay"],
      imgLogo("https://cdn/foto-do-produto.png", "produto"),
      { logoValues: ["InnovaBay"], logoSrcs: [LOGO] },
    )
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual(["InnovaBay"])
  })

  it("marca apagada sem pôr o logo continua reprovando", () => {
    const r = heroCopyPreserved(["InnovaBay"], "<tr><td></td></tr>", {
      logoValues: ["InnovaBay"],
      logoSrcs: [LOGO],
    })
    expect(r.ok).toBe(false)
  })

  // Só o campo de logo ganha esse passe: outro valor não vira imagem.
  it("valor que não é de logo não é salvo pelo <img>", () => {
    const r = heroCopyPreserved(["InnovaBay", "SHOP 10% OFF"], imgLogo(), {
      logoValues: ["InnovaBay"],
      logoSrcs: [LOGO],
    })
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual(["SHOP 10% OFF"])
    expect(r.viaLogo).toEqual(["InnovaBay"])
  })

  it("sem o 3º parâmetro o comportamento é o de antes", () => {
    expect(heroCopyPreserved(["InnovaBay"], imgLogo()).ok).toBe(false)
  })
})

describe("isLogoKey", () => {
  it("reconhece as formas do campo de logo", () => {
    expect(isLogoKey("logo")).toBe(true)
    expect(isLogoKey("LOGO")).toBe(true)
    expect(isLogoKey("logo_light")).toBe(true)
    expect(isLogoKey("brand_logo")).toBe(true)
  })

  it("não confunde com copy que só menciona a palavra", () => {
    expect(isLogoKey("logotipo_headline")).toBe(false)
    expect(isLogoKey("headline")).toBe(false)
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

describe("applyStructuralFills — token de plataforma sem dono", () => {
  // Com o merge por bloco, o preheader da arte de outro bloco deixou de
  // ser sobrescrito por acidente. Ele não pode ficar literal no email.
  it("esvazia o token que sobrou, sem remover a linha", () => {
    const html =
      '<div style="display:none;">TEXTO_DE_PREHEADER_AQUI</div><td>Oi</td>'
    const r = applyStructuralFills(html, { brandName: "InnovaBay" })
    expect(r.html).not.toContain("TEXTO_DE_PREHEADER_AQUI")
    expect(r.html).toContain('<div style="display:none;"></div>')
    expect(r.html).toContain("<td>Oi</td>")
    expect(r.cleaned).toContain("TEXTO_DE_PREHEADER_AQUI")
  })

  // A armadilha: "qualquer palavra em SCREAMING_SNAKE" apagaria o código
  // do cupom que o merge acabou de escrever. A régua é o sufixo _AQUI.
  it("NÃO apaga copy em caixa alta — o cupom fica", () => {
    const html = "<div>WELCOME10</div>"
    const r = applyStructuralFills(html, { brandName: "InnovaBay" })
    expect(r.html).toContain("WELCOME10")
    expect(r.cleaned).not.toContain("WELCOME10")
  })
})
