/**
 * Casos travados na biblioteca REAL: tokens de src/alt das 38 variantes
 * ativas, arte fixa base64 dos footers, placeholder de export do Figma, selo
 * repetido e dimensões deliberadamente diferentes entre schema e HTML
 * (ativo 90×230 vs slot 74×215 — dimensão NUNCA é âncora).
 */

import { describe, expect, it } from "vitest"
import { stripUnresolvedAttrTokens } from "./post-process"
import {
  assignImageSlots,
  blockIndexesInRange,
  findAttrSlots,
  keyOrdinal,
  locateBlockRegions,
  type AttrSlot,
  type ImageField,
} from "./slot-finder"

const imageField = (
  key: string,
  overrides: Partial<ImageField> = {},
): ImageField => ({
  block_id: "blk-1",
  blockIndice: null,
  key,
  url: `https://cdn.convertfy.me/${key}.png`,
  ...overrides,
})

describe("locateBlockRegions", () => {
  it("resolve as regiões pelos marcadores cfy:block do Montador", () => {
    const html = [
      "<!-- cfy:block:0:hero:start -->",
      "<table><tr><td>hero</td></tr></table>",
      "<!-- cfy:block:0:hero:end -->",
      "<!-- cfy:block:1:beneficios:start -->",
      "<table><tr><td>beneficios</td></tr></table>",
      "<!-- cfy:block:1:beneficios:end -->",
    ].join("\n")
    const regions = locateBlockRegions(html)
    expect(regions).toHaveLength(2)
    expect(regions[0]).toMatchObject({ indice: 0, tipo: "hero" })
    expect(regions[1]).toMatchObject({ indice: 1, tipo: "beneficios" })
    expect(html.slice(regions[0].range.start, regions[0].range.end)).toContain(
      "hero",
    )
    expect(
      html.slice(regions[0].range.start, regions[0].range.end),
    ).not.toContain("beneficios")
  })

  it("marcador de start sem end é ignorado (documento truncado não engole vizinhos)", () => {
    const html = [
      "<!-- cfy:block:0:hero:start -->",
      "<td>hero</td>",
      "<!-- cfy:block:1:cta:start -->",
      "<td>cta</td>",
      "<!-- cfy:block:1:cta:end -->",
    ].join("\n")
    const regions = locateBlockRegions(html)
    expect(regions).toHaveLength(1)
    expect(regions[0].indice).toBe(1)
  })
})

describe("blockIndexesInRange", () => {
  it("devolve os blocos que INTERSECTAM o range (a hero pode começar no meio de um)", () => {
    const html = [
      "<!-- cfy:block:0:header:start --><td>logo</td><!-- cfy:block:0:header:end -->",
      "<!-- cfy:block:1:hero:start --><td>hero</td><!-- cfy:block:1:hero:end -->",
      "<!-- cfy:block:2:cta:start --><td>cta</td><!-- cfy:block:2:cta:end -->",
    ].join("\n")
    const heroAt = html.indexOf("<td>hero</td>")
    expect(
      blockIndexesInRange(html, { start: heroAt, end: heroAt + 13 }),
    ).toEqual([1])
    expect(blockIndexesInRange(html, { start: 0, end: html.length })).toEqual([
      0, 1, 2,
    ])
  })
})

describe("findAttrSlots", () => {
  it("encontra tokens de src e alt com o range EXATO do valor", () => {
    const html = [
      '<img src="URL_DA_IMAGEM_1" alt="ALT_DA_IMAGEM_1" width="600">',
    ].join("\n")
    const slots = findAttrSlots(html)
    expect(slots).toHaveLength(2)
    expect(slots[0]).toMatchObject({ token: "URL_DA_IMAGEM_1", attr: "src" })
    expect(slots[1]).toMatchObject({ token: "ALT_DA_IMAGEM_1", attr: "alt" })
    expect(html.slice(slots[0].valueRange.start, slots[0].valueRange.end)).toBe(
      "URL_DA_IMAGEM_1",
    )
    expect(slots[0].imgRange).not.toBeNull()
    expect(
      html.slice(slots[0].imgRange!.start, slots[0].imgRange!.end),
    ).toContain("<img")
  })

  it("arte fixa base64 e asset hospedado NUNCA viram slot", () => {
    const html = [
      '<img src="data:image/png;base64,iVBORw0KGgo" alt="">',
      '<img src="https://cdn.convertfy.me/lojas/selo.png" alt="">',
      '<img src="URL_FOTO_1" alt="">',
    ].join("\n")
    const slots = findAttrSlots(html)
    expect(slots).toHaveLength(1)
    expect(slots[0].token).toBe("URL_FOTO_1")
  })

  it("src de export do Figma vira slot sintético", () => {
    // `body 2 - bridge textos linha produtos` (Luxe Lift, 24/08): a regra
    // "URL http real não é slot" assumia que a URL resolve para uma imagem.
    // Esta não carrega — é placeholder da ferramenta de design. A imagem do
    // bloco era gerada, paga, e não tinha onde entrar.
    const html =
      '<img src="https://www.figma.com/api/mcp/asset/d9880f17-4c4a-4c00" alt="">'
    const slots = findAttrSlots(html)
    expect(slots).toHaveLength(1)
    expect(slots[0]).toMatchObject({
      token: "URL_EXPORT_1",
      attr: "src",
      synthetic: true,
    })
    expect(html.slice(slots[0].valueRange.start, slots[0].valueRange.end)).toBe(
      "https://www.figma.com/api/mcp/asset/d9880f17-4c4a-4c00",
    )
  })

  it("o CDN assinado do Figma conta como export", () => {
    // Expira: hoje carrega, na semana que vem é ícone quebrado.
    const html = '<img src="https://s3-alpha-sig.figma.com/img/ab/cd?x=1" alt="">'
    expect(findAttrSlots(html)[0]).toMatchObject({ synthetic: true })
  })

  it("dois exports no mesmo bloco viram dois destinos, em ordem de documento", () => {
    const html = [
      "<!-- cfy:block:0:body:start -->",
      '<img src="https://www.figma.com/api/mcp/asset/aaa" alt="">',
      '<img src="https://www.figma.com/api/mcp/asset/bbb" alt="">',
      "<!-- cfy:block:0:body:end -->",
    ].join("\n")
    const out = assignImageSlots(findAttrSlots(html), [
      imageField("collage_photo_a", { blockIndice: 0 }),
      imageField("collage_photo_b", { blockIndice: 0 }),
    ])
    expect(out.map((a) => a.slot?.token)).toEqual([
      "URL_EXPORT_1",
      "URL_EXPORT_2",
    ])
    expect(out.map((a) => a.desfecho)).toEqual([
      "ancorado_token",
      "ancorado_token",
    ])
  })

  it("exports em blocos diferentes não colidem no mesmo token", () => {
    // Numerar por BLOCO daria `URL_EXPORT_1` nos dois; `assignImageSlots`
    // agrupa por token, então os dois destinos virariam um grupo só e o
    // segundo bloco ficaria sem candidato.
    const html = [
      "<!-- cfy:block:0:body:start -->",
      '<img src="https://www.figma.com/api/mcp/asset/aaa" alt="">',
      "<!-- cfy:block:0:body:end -->",
      "<!-- cfy:block:1:produtos:start -->",
      '<img src="https://www.figma.com/api/mcp/asset/bbb" alt="">',
      "<!-- cfy:block:1:produtos:end -->",
    ].join("\n")
    const out = assignImageSlots(findAttrSlots(html), [
      imageField("body_photo", { blockIndice: 0 }),
      imageField("produto_photo", { blockIndice: 1 }),
    ])
    expect(out.map((a) => a.slot?.token)).toEqual([
      "URL_EXPORT_1",
      "URL_EXPORT_2",
    ])
  })

  it("sem URL gerada, o src de export fica INTACTO", () => {
    // Trocar o placeholder do designer por `src=""` não melhora nada.
    const html =
      '<img src="https://www.figma.com/api/mcp/asset/aaa" alt="">' +
      '<img src="URL_FOTO_1" alt="">'
    expect(stripUnresolvedAttrTokens(html)).toContain(
      'src="https://www.figma.com/api/mcp/asset/aaa"',
    )
  })

  it("alt de slot + base64 no src: a <img> se autodeclara destino", () => {
    // Cadastro real de `produtos 4 - um produto` (Luxe Lift 23/08): o slot
    // vem com o xadrez em base64 no src e o token no alt. Sem isto a
    // imagem era gerada, paga, e não tinha onde entrar.
    const html =
      '<img src="data:image/png;base64,iVBORw0KGgoAAAA" width="292" height="332"' +
      ' alt="ALT_DO_PRODUTO" style="display:block;">'
    const slots = findAttrSlots(html)
    const src = slots.find((x) => x.attr === "src")
    expect(src).toMatchObject({ token: "URL_DO_PRODUTO", synthetic: true })
    // O range aponta para o base64 — é ele que será substituído pela URL.
    expect(html.slice(src!.valueRange.start, src!.valueRange.end)).toBe(
      "data:image/png;base64,iVBORw0KGgoAAAA",
    )
  })

  it("o token sintético preserva o ordinal do alt", () => {
    // `assignImageSlots` casa por ordinal: sem preservá-lo, a foto do
    // produto 2 cairia no card do 1.
    const html =
      '<img src="data:image/png;base64,AAA" alt="ALT_PRODUTO_1">' +
      '<img src="data:image/png;base64,BBB" alt="ALT_PRODUTO_2">'
    const slots = findAttrSlots(html)
    const assigns = assignImageSlots(slots, [
      imageField("product_2_image", { url: "https://cdn/dois.png" }),
      imageField("product_1_image", { url: "https://cdn/um.png" }),
    ])
    expect(assigns[0].slot?.token).toBe("URL_PRODUTO_2")
    expect(assigns[1].slot?.token).toBe("URL_PRODUTO_1")
  })

  it("base64 SEM token no alt continua arte fixa", () => {
    // Ícone social do rodapé: promovê-lo a destino colocaria uma foto
    // gerada no lugar do desenho do designer.
    const html = '<img src="data:image/png;base64,iVBORw0" alt="Instagram">'
    expect(findAttrSlots(html)).toHaveLength(0)
  })

  it("alt ESTRUTURAL não promove o base64 do logo a slot de imagem", () => {
    const html = '<img src="data:image/png;base64,iVBORw0" alt="NOME_DA_MARCA">'
    const slots = findAttrSlots(html)
    expect(slots.every((x) => x.attr !== "src")).toBe(true)
  })

  it("<img> que já tem token de src real não ganha slot duplicado", () => {
    const html = '<img src="URL_DO_PRODUTO" alt="ALT_DO_PRODUTO">'
    const slots = findAttrSlots(html)
    expect(slots.filter((x) => x.attr === "src")).toHaveLength(1)
    expect(slots.find((x) => x.attr === "src")?.synthetic).toBeUndefined()
  })

  it("slots saem em ordem de DOCUMENTO, sintéticos incluídos", () => {
    const html = [
      '<img src="data:image/png;base64,AAA" alt="ALT_UM">',
      '<img src="URL_DOIS" alt="">',
    ].join("\n")
    const srcs = findAttrSlots(html)
      .filter((x) => x.attr === "src")
      .map((x) => x.token)
    expect(srcs).toEqual(["URL_UM", "URL_DOIS"])
  })

  it("marca o bloco dono (cfy:block) e o espelho MSO", () => {
    const html = [
      "<!-- cfy:block:0:produtos:start -->",
      '<img src="URL_PRODUTO_1" alt="">',
      '<!--[if mso]><img src="URL_PRODUTO_1" alt=""><![endif]-->',
      "<!-- cfy:block:0:produtos:end -->",
    ].join("\n")
    const slots = findAttrSlots(html)
    expect(slots).toHaveLength(2)
    expect(slots[0]).toMatchObject({ blockIndice: 0, inMso: false })
    expect(slots[1]).toMatchObject({ blockIndice: 0, inMso: true })
    expect(slots[1].imgRange).toBeNull()
  })
})

describe("keyOrdinal", () => {
  it("último grupo numérico da key: tip_1_image → 1, review_2_photo → 2", () => {
    expect(keyOrdinal("tip_1_image")).toBe(1)
    expect(keyOrdinal("review_2_photo")).toBe(2)
    expect(keyOrdinal("product_10_image")).toBe(10)
  })

  it("key sem número → null", () => {
    expect(keyOrdinal("hero_image")).toBeNull()
    expect(keyOrdinal("main_photo")).toBeNull()
  })
})

describe("assignImageSlots", () => {
  const slotsOf = (html: string): AttrSlot[] => findAttrSlots(html)

  it("ordinal da key casa com o ordinal do token: tip_1_image → URL_*_1", () => {
    const html = [
      '<img src="URL_DA_IMAGEM_2" alt="">',
      '<img src="URL_DA_IMAGEM_1" alt="">',
    ].join("\n")
    const out = assignImageSlots(slotsOf(html), [
      imageField("tip_1_image"),
      imageField("tip_2_image"),
    ])
    expect(out[0].slot!.token).toBe("URL_DA_IMAGEM_1")
    expect(out[1].slot!.token).toBe("URL_DA_IMAGEM_2")
    expect(out.map((a) => a.desfecho)).toEqual([
      "ancorado_token",
      "ancorado_token",
    ])
  })

  it("key sem ordinal → ordem de aparição no documento", () => {
    const html = [
      '<img src="URL_TOPO_COLUNA_A" alt="">',
      '<img src="URL_TOPO_COLUNA_B" alt="">',
    ].join("\n")
    const out = assignImageSlots(slotsOf(html), [
      imageField("left_column_image"),
      imageField("right_column_image"),
    ])
    expect(out[0].slot!.token).toBe("URL_TOPO_COLUNA_A")
    expect(out[1].slot!.token).toBe("URL_TOPO_COLUNA_B")
  })

  it("campo com blockIndice só casa token do MESMO bloco", () => {
    const html = [
      "<!-- cfy:block:0:hero:start -->",
      '<img src="URL_DA_IMAGEM_1" alt="">',
      "<!-- cfy:block:0:hero:end -->",
      "<!-- cfy:block:1:produtos:start -->",
      '<img src="URL_PRODUTO_1" alt="">',
      "<!-- cfy:block:1:produtos:end -->",
    ].join("\n")
    const out = assignImageSlots(slotsOf(html), [
      imageField("product_1_image", { blockIndice: 1 }),
      imageField("other_image", { blockIndice: 2 }),
    ])
    expect(out[0].slot!.token).toBe("URL_PRODUTO_1")
    expect(out[1].desfecho).toBe("sem_lugar")
    expect(out[1].slot).toBeNull()
  })

  it("mesmo token repetido (selo ×3, espelho MSO) é UM grupo — groupSlots traz todas", () => {
    const html = [
      '<img src="URL_SELO_VERIFICADO" alt="">',
      '<img src="URL_SELO_VERIFICADO" alt="">',
      '<img src="URL_SELO_VERIFICADO" alt="">',
    ].join("\n")
    const out = assignImageSlots(slotsOf(html), [imageField("badge_image")])
    expect(out[0].desfecho).toBe("ancorado_token")
    expect(out[0].groupSlots).toHaveLength(3)
  })

  it("token estrutural (logo) e slot de alt ficam FORA do casamento de imagem", () => {
    const html = [
      '<img src="URL_DO_LOGO_AQUI" alt="NOME_DA_MARCA">',
      '<img src="URL_FOTO_1" alt="ALT_FOTO_1">',
    ].join("\n")
    const out = assignImageSlots(slotsOf(html), [imageField("hero_image")])
    expect(out[0].slot!.token).toBe("URL_FOTO_1")
  })

  it("campo sem URL gerada → imagem_sem_url (a remoção de linha é do image-merge)", () => {
    const html = '<img src="URL_FOTO_1" alt="">'
    const out = assignImageSlots(slotsOf(html), [
      imageField("hero_image", { url: null }),
    ])
    expect(out[0].desfecho).toBe("imagem_sem_url")
    expect(out[0].slot!.token).toBe("URL_FOTO_1")
  })

  it("mais campos que tokens → o excedente sai sem_lugar (fail-open)", () => {
    const html = '<img src="URL_FOTO_1" alt="">'
    const out = assignImageSlots(slotsOf(html), [
      imageField("photo_1_image"),
      imageField("photo_2_image"),
    ])
    expect(out[0].desfecho).toBe("ancorado_token")
    expect(out[1].desfecho).toBe("sem_lugar")
  })

  it("dimensões NUNCA são âncora: schema 90×230 casa com slot 74×215", () => {
    const html =
      '<img src="URL_SELO_VERIFICADO" width="74" height="215" alt="">'
    const out = assignImageSlots(slotsOf(html), [
      imageField("verified_badge", { url: "https://cdn/x-90x230.png" }),
    ])
    expect(out[0].desfecho).toBe("ancorado_token")
  })
})
