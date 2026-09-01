/**
 * Casos travados na biblioteca REAL (inventário de 20/08 sobre as 38
 * variantes ativas): entidades do export do Figma, contenção "Use code",
 * irmãos "Name." dos reviews, examples em JSON dos howto_steps. Se um caso
 * destes quebrar, o merge por example quebra em produção junto.
 */

import { describe, expect, it } from "vitest"
import {
  assignTextAnchors,
  buildTextIndex,
  findPhraseOccurrences,
  normalizeForMatch,
  withOriginalSlices,
  type AnchorField,
} from "./anchor-match"

const field = (key: string, example: string): AnchorField => ({
  block_id: "blk-1",
  key,
  example,
  value: `novo valor de ${key}`,
})

describe("normalizeForMatch", () => {
  it("decodifica entidades nomeadas e numéricas na mesma forma do texto puro", () => {
    expect(normalizeForMatch("Don&rsquo;t miss")).toBe("don't miss")
    expect(normalizeForMatch("Don&#8217;t miss")).toBe("don't miss")
    expect(normalizeForMatch("Don&#x2019;t miss")).toBe("don't miss")
    expect(normalizeForMatch("Don’t miss")).toBe("don't miss")
  })

  it("dobra aspas curvas, travessão e reticências na forma que o schema digita", () => {
    expect(normalizeForMatch("&ldquo;Great!&rdquo;")).toBe('"great!"')
    expect(normalizeForMatch("A &ndash; B")).toBe("a - b")
    expect(normalizeForMatch("wait&hellip;")).toBe("wait...")
  })

  it("colapsa tabs, quebras e espaços múltiplos em um espaço", () => {
    expect(normalizeForMatch("  Use\t\tcode\n  NOW  ")).toBe("use code now")
    expect(normalizeForMatch("a&nbsp;&nbsp;b")).toBe("a b")
  })

  it("símbolos de ficha de produto: &times; casa com o × do schema", () => {
    // Caso real da `offer 2`: o HTML traz "24&times; 6oz Patties" e o schema
    // "24× 6oz Patties". Sem a entidade na tabela o campo perdia a âncora.
    expect(normalizeForMatch("24&times; 6oz Patties")).toBe("24× 6oz patties")
    expect(normalizeForMatch("A &middot; B")).toBe("a · b")
    expect(normalizeForMatch("30&deg;C")).toBe("30°c")
    expect(normalizeForMatch("&frac12; off")).toBe("½ off")
  })

  it("entidade desconhecida fica literal (não vira lixo silencioso)", () => {
    expect(normalizeForMatch("x &zzz; y")).toBe("x &zzz; y")
  })
})

describe("findPhraseOccurrences", () => {
  it("casa através de entidades e devolve o range do SOURCE original", () => {
    const html = [
      "<table><tr>",
      "<td>Don&rsquo;t miss the &ldquo;Summer Sale&rdquo; event</td>",
      "</tr></table>",
    ].join("\n")
    const index = buildTextIndex(html)
    const occ = findPhraseOccurrences(index, "Don't miss the “Summer Sale” event")
    expect(occ).toHaveLength(1)
    expect(html.slice(occ[0].start, occ[0].end)).toBe(
      "Don&rsquo;t miss the &ldquo;Summer Sale&rdquo; event",
    )
  })

  it("casa com caixa e whitespace diferentes (tabs do export do Figma)", () => {
    const html = ["<td>", "\tFREE SHIPPING\ton orders\t", "</td>"].join("\n")
    const index = buildTextIndex(html)
    const occ = findPhraseOccurrences(index, "free shipping on orders")
    expect(occ).toHaveLength(1)
    expect(html.slice(occ[0].start, occ[0].end).replace(/\s+/g, " ").trim()).toBe(
      "FREE SHIPPING on orders",
    )
  })

  it("frase através de wrapper inline agora CASA (costura) — range contíguo", () => {
    // Comportamento novo (20/08): antes caía em sem_lugar; a costura de
    // runs cobre wrappers inline com texto. Fronteira de BLOCO segue
    // recusando — ver o describe "costura através de <br>".
    const html = "<td>Use <strong>code</strong> NOW</td>"
    const index = buildTextIndex(html)
    const occ = findPhraseOccurrences(index, "Use code NOW")
    expect(occ).toHaveLength(1)
    expect(html.slice(occ[0].start, occ[0].end)).toBe("Use <strong>code</strong> NOW")
  })

  it("conteúdo de <style> fica fora (não é texto que o cliente lê)", () => {
    const html = "<style>.use-code { color: red }</style><td>Use code</td>"
    const index = buildTextIndex(html)
    expect(findPhraseOccurrences(index, "use code")).toHaveLength(1)
  })

  it("scope limita a busca à região pedida (ex.: só a hero)", () => {
    const html =
      "<table><tr><td>Shop now</td></tr><tr><td>Shop now</td></tr></table>"
    const heroEnd = html.indexOf("</tr>") + "</tr>".length
    const scoped = buildTextIndex(html, { start: 0, end: heroEnd })
    expect(findPhraseOccurrences(scoped, "Shop now")).toHaveLength(1)
  })
})

describe("assignTextAnchors — desempates", () => {
  it("contenção real: o example mais LONGO ancora primeiro e libera o curto", () => {
    const html = [
      "<td>Use code CODECODE for XXXX% off</td>",
      "<td>Use code</td>",
    ].join("\n")
    const index = buildTextIndex(html)
    const out = assignTextAnchors(index, [
      field("cta_note", "Use code"),
      field("discount_line", "Use code CODECODE for XXXX% off"),
    ])
    // O curto, sozinho, acharia 2 ocorrências (a dele + a contida no longo).
    expect(out[0].desfecho).toBe("ancorado_exemplo")
    expect(out[1].desfecho).toBe("ancorado_exemplo")
    expect(html.slice(out[0].range!.start, out[0].range!.end)).toBe("Use code")
    expect(html.slice(out[1].range!.start, out[1].range!.end)).toBe(
      "Use code CODECODE for XXXX% off",
    )
  })

  it("curto que SÓ existe dentro do longo → sem_lugar:range_ja_tomado", () => {
    const html = "<td>Use code CODECODE for XXXX% off</td>"
    const index = buildTextIndex(html)
    const out = assignTextAnchors(index, [
      field("discount_line", "Use code CODECODE for XXXX% off"),
      field("cta_note", "Use code"),
    ])
    expect(out[0].desfecho).toBe("ancorado_exemplo")
    expect(out[1].desfecho).toBe("sem_lugar")
    expect(out[1].motivo).toBe("range_ja_tomado")
    expect(out[1].range).toBeNull()
  })

  it("irmãos reais dos reviews: 'Name.' ×3 casa por ordem de ocorrência × declaração", () => {
    const html = [
      "<td>Name.</td>",
      "<td>Name.</td>",
      "<td>Name.</td>",
    ].join("\n")
    const index = buildTextIndex(html)
    const out = assignTextAnchors(index, [
      field("review_1_name", "Name."),
      field("review_2_name", "Name."),
      field("review_3_name", "Name."),
    ])
    expect(out.map((a) => a.desfecho)).toEqual([
      "ancorado_exemplo",
      "ancorado_exemplo",
      "ancorado_exemplo",
    ])
    // Ordem de declaração segue a ordem no documento.
    expect(out[0].range!.start).toBeLessThan(out[1].range!.start)
    expect(out[1].range!.start).toBeLessThan(out[2].range!.start)
  })

  it("campo único com 14 ocorrências (fita repetida) → ancora em todas", () => {
    // Caso real da variante `body 2`: a fita diagonal repete o nome da
    // campanha 7× por faixa, 2 faixas. Uma loja sem Black Friday recebia o
    // email escrito Black Friday porque o merge desistia.
    const fita = Array(7).fill("<b>Black Friday</b>").join(" &middot; ")
    const html = `<td><span>${fita}</span></td><td><span>${fita}</span></td>`
    const index = buildTextIndex(html)
    const out = assignTextAnchors(index, [field("ribbon_text", "Black Friday")])
    expect(out[0].desfecho).toBe("ancorado_exemplo")
    expect(out[0].extraRanges).toHaveLength(13)
  })

  it("irmãos continuam ambíguos — só o campo ÚNICO ganha a repetição", () => {
    // A regra nova não pode vazar para a regra 4: com dois campos de valores
    // distintos disputando os mesmos lugares, chutar escreveria a copy de um
    // na frase do outro (review 8: dois cta_label p/ 4 "Shop Now").
    const html = Array(4).fill("<td>Shop Now</td>").join("")
    const index = buildTextIndex(html)
    const out = assignTextAnchors(index, [
      field("review_1_cta_label", "Shop Now"),
      field("review_3_cta_label", "Shop Now"),
    ])
    for (const a of out) {
      expect(a.desfecho).toBe("ambiguo")
      expect(a.motivo).toBe("ocorrencias_excedem_campos")
      expect(a.extraRanges).toBeUndefined()
    }
  })

  it("example mais longo leva o range antes; o curto não reivindica o contido", () => {
    // A regra nova reivindica TODAS as ocorrências livres — precisa continuar
    // respeitando o que um example mais longo já tomou.
    const html = "<td>Use code CODE10 for 10% off</td><td>Use code</td>"
    const index = buildTextIndex(html)
    const out = assignTextAnchors(index, [
      field("longo", "Use code CODE10 for 10% off"),
      field("curto", "Use code"),
    ])
    expect(out[0].desfecho).toBe("ancorado_exemplo")
    expect(out[0].extraRanges).toBeUndefined()
    // Sobrou exatamente 1 ocorrência livre de "Use code" → ancora simples.
    expect(out[1].desfecho).toBe("ancorado_exemplo")
    expect(out[1].extraRanges).toBeUndefined()
  })

  it("3 ocorrências para 2 irmãos → todos ambíguos (nunca chutar)", () => {
    const html = ["<td>Name.</td>", "<td>Name.</td>", "<td>Name.</td>"].join("\n")
    const index = buildTextIndex(html)
    const out = assignTextAnchors(index, [
      field("review_1_name", "Name."),
      field("review_2_name", "Name."),
    ])
    for (const a of out) {
      expect(a.desfecho).toBe("ambiguo")
      expect(a.motivo).toBe("ocorrencias_excedem_campos")
      expect(a.range).toBeNull()
    }
  })

  it("1 ocorrência para 2 irmãos → ambíguos com ocorrencias_insuficientes", () => {
    const html = "<td>Name.</td>"
    const index = buildTextIndex(html)
    const out = assignTextAnchors(index, [
      field("review_1_name", "Name."),
      field("review_2_name", "Name."),
    ])
    for (const a of out) {
      expect(a.desfecho).toBe("ambiguo")
      expect(a.motivo).toBe("ocorrencias_insuficientes")
    }
  })

  it("campo ÚNICO com 2 ocorrências livres → ancora nas DUAS", () => {
    // A repetição é da ARTE (mesmo CTA no topo e no rodapé) e o campo é um
    // só: escrever em uma deixaria a outra com o texto do template.
    const html = "<td>Shop now</td><td>Shop now</td>"
    const index = buildTextIndex(html)
    const out = assignTextAnchors(index, [field("cta_label", "Shop now")])
    expect(out[0].desfecho).toBe("ancorado_exemplo")
    expect(out[0].motivo).toBeUndefined()
    expect(out[0].range).not.toBeNull()
    expect(out[0].extraRanges).toHaveLength(1)
    // Ordem de documento: o extra vem depois da âncora principal.
    expect(out[0].extraRanges![0].start).toBeGreaterThan(out[0].range!.start)
  })

  it("example ausente do HTML → sem_lugar:nao_encontrado", () => {
    const html = "<td>Outro texto qualquer</td>"
    const index = buildTextIndex(html)
    const out = assignTextAnchors(index, [field("headline", "Summer Sale")])
    expect(out[0].desfecho).toBe("sem_lugar")
    expect(out[0].motivo).toBe("nao_encontrado")
  })

  // O mínimo de 4 nasceu quando a busca varria o DOCUMENTO inteiro ("OFF"
  // casava em 6 lugares). Desde o escopo por bloco (01/09) a busca é local,
  // e o corte passou a custar caro: no welcome #1 da Innova perdeu o label
  // do botão (example "CTA") e os DOIS preços ("$64", "$59") — o email saiu
  // com o preço do TEMPLATE. Curto agora ancora, sob condições estritas.
  it("example curto com ocorrência ÚNICA ancora", () => {
    const html = "<td>CTA</td>"
    const index = buildTextIndex(html)
    const out = assignTextAnchors(index, [field("cta_label", "CTA")])
    expect(out[0].desfecho).toBe("ancorado_exemplo")
  })

  it("example curto com 2+ ocorrências continua recusado", () => {
    const html = "<td>OFF</td><td>OFF</td>"
    const index = buildTextIndex(html)
    const out = assignTextAnchors(index, [field("badge", "OFF")])
    expect(out[0].desfecho).toBe("ambiguo")
    expect(out[0].motivo).toBe("frase_curta")
  })

  // A razão de o mínimo existir: substring dentro de palavra maior.
  it("example curto NÃO casa no meio de palavra/número", () => {
    const index = buildTextIndex("<td>$640</td><td>CTAS</td>")
    const precos = assignTextAnchors(index, [field("price_old", "$64")])
    expect(precos[0].desfecho).toBe("sem_lugar")
    const cta = assignTextAnchors(index, [field("cta_label", "CTA")])
    expect(cta[0].desfecho).toBe("sem_lugar")
  })

  // Preço do incidente: "$64" isolado ancora; o valor real entra no lugar.
  it("preço curto do template é substituível", () => {
    const index = buildTextIndex("<td>De $64 por $59</td>")
    const out = assignTextAnchors(index, [
      field("price_old", "$64"),
      field("price_new", "$59"),
    ])
    expect(out.map((o) => o.desfecho)).toEqual([
      "ancorado_exemplo",
      "ancorado_exemplo",
    ])
  })

  it("example de 1 caractere segue fora — não é frase", () => {
    const index = buildTextIndex("<td>-</td>")
    const out = assignTextAnchors(index, [field("sep", "-")])
    expect(out[0].desfecho).toBe("sem_lugar")
    expect(out[0].motivo).toBe("frase_curta")
  })

  it("example em JSON array (howto_steps real) → example_e_json, sem tentar partir", () => {
    const html = "<td>Cleanse skin</td><td>Apply serum</td>"
    const index = buildTextIndex(html)
    const out = assignTextAnchors(index, [
      field("howto_steps", '["Cleanse skin", "Apply serum"]'),
    ])
    expect(out[0].desfecho).toBe("sem_lugar")
    expect(out[0].motivo).toBe("example_e_json")
  })

  it("preserva a ordem de entrada dos campos no resultado", () => {
    const html = "<td>Alpha longo demais</td><td>Beta</td>"
    const index = buildTextIndex(html)
    const out = assignTextAnchors(index, [
      field("b", "Beta"),
      field("a", "Alpha longo demais"),
    ])
    expect(out[0].field.key).toBe("b")
    expect(out[1].field.key).toBe("a")
  })
})

describe("withOriginalSlices", () => {
  it("preenche o `de` com o trecho original truncado em 120", () => {
    const html = "<td>Don&rsquo;t miss this</td>"
    const index = buildTextIndex(html)
    const out = withOriginalSlices(
      html,
      assignTextAnchors(index, [field("headline", "Don't miss this")]),
    )
    expect(out[0].de).toBe("Don&rsquo;t miss this")
  })

  it("sem_lugar segue com de: null", () => {
    const html = "<td>nada aqui</td>"
    const index = buildTextIndex(html)
    const out = withOriginalSlices(
      html,
      assignTextAnchors(index, [field("headline", "Summer Sale")]),
    )
    expect(out[0].de).toBeNull()
  })
})

// ── Costura de nós de texto (STITCH_GAP_RE) — caso Luxe Lift produto 8 ──

import { findPhraseOccurrencesDetailed } from "./anchor-match"

describe("costura através de <br> e wrappers inline", () => {
  it("caso real: Product<br>Name 1 ancora com example 'Product Name 1'", () => {
    const html = "<td><div>\n  Product<br>Name 1\n</div></td>"
    const index = buildTextIndex(html)
    const out = assignTextAnchors(index, [field("product_1_name", "Product Name 1")])
    expect(out[0].desfecho).toBe("ancorado_exemplo")
    expect(out[0].costurado).toBe(true)
    // Range contíguo: engole o <br> — o splice remove a quebra junto.
    const slice = html.slice(out[0].range!.start, out[0].range!.end)
    expect(slice).toBe("Product<br>Name 1")
  })

  it("variações de <br/> e indentação entre segmentos", () => {
    const html = "<td>Section\n  <br />\n  Title 1<br></td>"
    const index = buildTextIndex(html)
    const out = assignTextAnchors(index, [field("section_title", "Section Title 1")])
    expect(out[0].desfecho).toBe("ancorado_exemplo")
    expect(out[0].costurado).toBe(true)
  })

  it("atravessa wrapper inline COM texto (Use code <span>'X'</span>)", () => {
    const html =
      "<td>Use code <span style=\"font-weight:700\">&lsquo;WELCOMEHERO&rsquo;</span> for $10 off</td>"
    const index = buildTextIndex(html)
    const out = assignTextAnchors(index, [
      field("banner_benefit", "Use code 'WELCOMEHERO' for $10 off"),
    ])
    expect(out[0].desfecho).toBe("ancorado_exemplo")
    expect(out[0].costurado).toBe(true)
  })

  it("NÃO costura através de fronteira de bloco (<td>)", () => {
    const html = "<table><tr><td>Product</td><td>Name 1</td></tr></table>"
    const index = buildTextIndex(html)
    const out = assignTextAnchors(index, [field("k", "Product Name 1")])
    expect(out[0].desfecho).toBe("sem_lugar")
    expect(out[0].motivo).toBe("nao_encontrado")
  })

  it("NÃO costura através de comentário (espelho MSO fica de fora)", () => {
    const html = "<td>Product<!--[if mso]>MSO<![endif]-->Name 1</td>"
    const index = buildTextIndex(html)
    const out = assignTextAnchors(index, [field("k", "Product Name 1")])
    expect(out[0].desfecho).toBe("sem_lugar")
  })

  it("frase inteira num segmento só não vira duplicata (dedup por range)", () => {
    const html = "<td>Product Name 1<br>and more</td>"
    const index = buildTextIndex(html)
    const occ = findPhraseOccurrencesDetailed(index, "Product Name 1")
    expect(occ).toHaveLength(1)
    expect(occ[0].costurado).toBe(false)
    const out = assignTextAnchors(index, [field("k", "Product Name 1")])
    expect(out[0].desfecho).toBe("ancorado_exemplo")
    expect(out[0].costurado).toBeUndefined()
  })

  it("campo único com 2 runs costurados → ancora nos dois, marcando costurado", () => {
    const html =
      "<td>Product<br>Name 1</td><td>Product<br>Name 1</td>"
    const index = buildTextIndex(html)
    const out = assignTextAnchors(index, [field("k", "Product Name 1")])
    expect(out[0].desfecho).toBe("ancorado_exemplo")
    expect(out[0].extraRanges).toHaveLength(1)
    expect(out[0].costurado).toBe(true)
  })

  it("irmãos idênticos com runs: ordem de ocorrência × declaração", () => {
    const html = "<td>Product<br>Name</td><td>Product<br>Name</td>"
    const index = buildTextIndex(html)
    const out = assignTextAnchors(index, [
      field("product_1_name", "Product Name"),
      field("product_2_name", "Product Name"),
    ])
    expect(out[0].desfecho).toBe("ancorado_exemplo")
    expect(out[1].desfecho).toBe("ancorado_exemplo")
    expect(out[0].range!.start).toBeLessThan(out[1].range!.start)
  })

  it("withOriginalSlices devolve o trecho com as tags do vão", () => {
    const html = "<td>THREE<br>INGREDIENTS.<br>ZERO FILLERS.</td>"
    const index = buildTextIndex(html)
    const out = withOriginalSlices(
      html,
      assignTextAnchors(index, [field("headline", "THREE INGREDIENTS. ZERO FILLERS.")]),
    )
    expect(out[0].desfecho).toBe("ancorado_exemplo")
    expect(out[0].de).toBe("THREE<br>INGREDIENTS.<br>ZERO FILLERS.")
  })
})
