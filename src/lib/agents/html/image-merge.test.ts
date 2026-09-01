/**
 * Escrita determinística das imagens nos tokens de atributo (F3). Os casos
 * espelham a biblioteca real: espelho MSO, selo repetido, arte fixa base64,
 * linha de imagem sem URL (removível × com copy preenchida).
 */

import { describe, expect, it } from "vitest"
import { imageMerge, type ImageMergeInput } from "./image-merge"
import type { MergeBlock } from "./copy-merge"
import { HERO_SENTINEL_START, HERO_SENTINEL_END } from "./hero-locator"

const block = (
  overrides: Partial<MergeBlock> & { fields?: MergeBlock["fields"] },
): MergeBlock => ({
  fields: [],
  content: {},
  block_id: "blk-1",
  block_type: "beneficios",
  position: 1,
  ...overrides,
})

const imageField = (key: string) => ({ key, type: "image" })

const run = (
  html: string,
  blocks: MergeBlock[],
  imageMap: ImageMergeInput["imageMap"],
) => imageMerge({ html, blocks, imageMap })

describe("imageMerge — escrita por token", () => {
  it("escreve a URL gerada no token do bloco e limpa o alt cru", () => {
    const html = [
      "<!-- cfy:block:0:beneficios:start -->",
      '<table><tr><td><img src="URL_DA_IMAGEM_1" alt="ALT_DA_IMAGEM_1" width="600"></td></tr></table>',
      "<!-- cfy:block:0:beneficios:end -->",
    ].join("\n")
    const r = run(
      html,
      [block({ fields: [imageField("body_image")] })],
      [{ block_type: "beneficios", url: "https://cdn/gerada.png", position: 1 }],
    )
    expect(r.html).toContain('src="https://cdn/gerada.png"')
    expect(r.html).toContain('alt=""')
    expect(r.html).not.toContain("URL_DA_IMAGEM_1")
    expect(r.report.merged).toBe(1)
    expect(r.report.alts_limpos).toBe(1)
    expect(r.report.campos[0]).toMatchObject({
      key: "body_image",
      desfecho: "ancorado_token",
      de: "URL_DA_IMAGEM_1",
      para: "https://cdn/gerada.png",
    })
  })

  it("token repetido (espelho MSO / selo ×3) recebe a URL em TODAS as ocorrências", () => {
    const html = [
      '<table><tr><td><img src="URL_SELO_VERIFICADO" alt=""></td></tr></table>',
      '<!--[if mso]><img src="URL_SELO_VERIFICADO" alt=""><![endif]-->',
      '<table><tr><td><img src="URL_SELO_VERIFICADO" alt=""></td></tr></table>',
    ].join("\n")
    const r = run(
      html,
      [block({ fields: [imageField("badge_image")] })],
      [{ block_type: "beneficios", url: "https://cdn/selo.png", position: 1 }],
    )
    expect((r.html.match(/https:\/\/cdn\/selo\.png/g) ?? []).length).toBe(3)
    expect(r.html).not.toContain("URL_SELO_VERIFICADO")
  })

  it("arte fixa base64 e token estrutural (logo) ficam intactos", () => {
    const html = [
      '<img src="data:image/png;base64,AAAA" alt="">',
      '<img src="URL_DO_LOGO_AQUI" alt="">',
      '<img src="URL_FOTO_1" alt="">',
    ].join("\n")
    const r = run(
      html,
      [block({ fields: [imageField("photo")] })],
      [{ block_type: "beneficios", url: "https://cdn/x.png", position: 1 }],
    )
    expect(r.html).toContain("data:image/png;base64,AAAA")
    expect(r.html).toContain('src="URL_DO_LOGO_AQUI"')
    expect(r.html).toContain('src="https://cdn/x.png"')
  })

  it("a região da hero é intocável (imagem da hero é posse do agente)", () => {
    const html = [
      "<table>",
      HERO_SENTINEL_START,
      '<tr><td><img src="URL_DA_IMAGEM_1" alt=""></td></tr>',
      HERO_SENTINEL_END,
      "</table>",
    ].join("\n")
    const r = run(
      html,
      [block({ fields: [imageField("hero_image")], block_type: "hero" })],
      [{ block_type: "hero", url: "https://cdn/hero.png", position: 1 }],
    )
    expect(r.html).toContain('src="URL_DA_IMAGEM_1"')
    expect(r.report.campos[0].desfecho).toBe("sem_lugar")
  })
})

describe("imageMerge — campo sem URL gerada", () => {
  it("linha removível some (sem outro token e sem copy preenchida)", () => {
    const html = [
      "<table><tr><td>Texto que fica</td></tr>",
      '<tr><td><img src="URL_FOTO_1" alt="ALT_FOTO_1"></td></tr></table>',
    ].join("\n")
    const r = run(html, [block({ fields: [imageField("photo")] })], [])
    expect(r.html).not.toContain("URL_FOTO_1")
    expect(r.html).not.toContain("<img")
    expect(r.html).toContain("Texto que fica")
    expect(r.report.rows_removidas).toEqual(["photo"])
    expect(r.report.campos[0]).toMatchObject({
      desfecho: "imagem_sem_url",
      motivo: "linha_removida",
    })
  })

  it("linha com copy preenchida NÃO é removida — o token é limpo (guard Luxe Lift)", () => {
    const html = [
      "<table>",
      '<tr><td><img src="URL_FOTO_REVIEW_1" alt="">Depoimento verdadeiro da cliente</td></tr>',
      "</table>",
    ].join("\n")
    const r = run(html, [block({ fields: [imageField("review_photo")] })], [])
    expect(r.html).toContain("Depoimento verdadeiro da cliente")
    expect(r.html).toContain('src=""')
    expect(r.report.rows_removidas).toEqual([])
    expect(r.report.campos[0]).toMatchObject({
      desfecho: "imagem_sem_url",
      motivo: "token_limpo",
    })
  })

  it("linha com OUTRO token de imagem não é removida (a vizinha ainda vive)", () => {
    const html = [
      "<table><tr><td>",
      '<img src="URL_TOPO_COLUNA_A" alt=""><img src="URL_TOPO_COLUNA_B" alt="">',
      "</td></tr></table>",
    ].join("\n")
    const r = run(
      html,
      [block({ fields: [imageField("left_image"), imageField("right_image")] })],
      [{ block_type: "beneficios", url: "https://cdn/a.png", position: 1 }],
    )
    // O bloco gera UMA imagem: a 1ª entra, a 2ª fica sem URL — mas a linha
    // carrega o token preenchido, então só limpa.
    expect(r.html).toContain('src="https://cdn/a.png"')
    expect(r.html).toContain("<tr>")
    expect(r.report.rows_removidas).toEqual([])
  })
})

describe("imageMerge — legado {{X_IMAGE}}", () => {
  it("token {{TAG}} do template global é trocado pela URL do imageMap; o _ALT vira vazio", () => {
    const html = [
      '<table><tr><td><img src="{{BODY_IMAGE}}" alt="{{BODY_IMAGE_ALT}}"></td></tr></table>',
    ].join("\n")
    const r = run(
      html,
      [],
      [{ block_type: "body", url: "https://cdn/body.png", tag: "BODY_IMAGE" }],
    )
    expect(r.html).toContain('src="https://cdn/body.png"')
    expect(r.html).toContain('alt=""')
    expect(r.html).not.toContain("{{BODY_IMAGE}}")
  })
})

// ── Geração por SLOT: N campos, N URLs ────────────────────────────────
// Lacuna até 22/08: nenhum teste exercitava 2+ campos `imagem_gerada`
// recebendo URLs distintas. É exatamente o caso que saía quebrado em
// produção — a variante `produtos 7 - dois produtos` declara 8 slots e o
// e-mail chegava com 7 `<img src="">`.
describe("imageMerge — N imagens por bloco", () => {
  // Tokens reais da variante `produtos 7 - dois produtos`.
  const painelHtml = [
    "<!-- cfy:block:0:products:start -->",
    "<table>",
    '<tr><td><img src="URL_FOTO_GRANDE_1" alt="ALT_1"></td></tr>',
    '<tr><td><img src="URL_FOTO_PEQUENA_1A"></td>',
    '<td><img src="URL_FOTO_PEQUENA_1B"></td>',
    '<td><img src="URL_FOTO_PEQUENA_1C"></td></tr>',
    "</table>",
    "<!-- cfy:block:0:products:end -->",
  ].join("\n")

  const painelBlock = block({
    block_type: "products",
    position: 4,
    fields: [
      imageField("panel_1_main_photo"),
      imageField("panel_1_thumb_a"),
      imageField("panel_1_thumb_b"),
      imageField("panel_1_thumb_c"),
    ],
  })

  const mapa = (pares: Array<[string, string]>) =>
    pares.map(([field_key, url]) => ({
      block_type: "products",
      position: 4,
      field_key,
      url,
    }))

  it("4 campos com 4 URLs → 4 tokens preenchidos, nenhum src vazio", () => {
    const r = run(
      painelHtml,
      [painelBlock],
      mapa([
        ["panel_1_main_photo", "https://cdn/main.png"],
        ["panel_1_thumb_a", "https://cdn/a.png"],
        ["panel_1_thumb_b", "https://cdn/b.png"],
        ["panel_1_thumb_c", "https://cdn/c.png"],
      ]),
    )
    expect(r.html).toContain('src="https://cdn/main.png"')
    expect(r.html).toContain('src="https://cdn/a.png"')
    expect(r.html).toContain('src="https://cdn/b.png"')
    expect(r.html).toContain('src="https://cdn/c.png"')
    expect(r.html).not.toContain('src=""')
    expect(r.report.merged).toBe(4)
    expect(r.report.slots_total).toBe(4)
  })

  it("cada URL vai no SEU token (ordinal + ordem), não embaralha", () => {
    const r = run(
      painelHtml,
      [painelBlock],
      mapa([
        ["panel_1_main_photo", "https://cdn/GRANDE.png"],
        ["panel_1_thumb_a", "https://cdn/A.png"],
        ["panel_1_thumb_b", "https://cdn/B.png"],
        ["panel_1_thumb_c", "https://cdn/C.png"],
      ]),
    )
    // A ordem no documento tem que espelhar a ordem dos tokens: a foto
    // grande vem antes dos três thumbs, e A/B/C na sequência. (O `alt` cru
    // é zerado pelo próprio merge, então não serve de âncora.)
    const ordem = ["GRANDE", "A", "B", "C"].map((n) =>
      r.html.indexOf(`https://cdn/${n}.png`),
    )
    expect(ordem.every((i) => i >= 0)).toBe(true)
    expect([...ordem].sort((x, y) => x - y)).toEqual(ordem)
  })

  it("URLs parciais: quem tem imagem recebe, quem não tem segue a regra antiga", () => {
    const r = run(
      painelHtml,
      [painelBlock],
      mapa([["panel_1_main_photo", "https://cdn/main.png"]]),
    )
    expect(r.html).toContain('src="https://cdn/main.png"')
    expect(r.report.merged).toBe(1)
    // Os três thumbs estão na MESMA linha e a linha tem outros tokens de
    // imagem — não é removível, então os tokens são limpos.
    expect(r.report.campos.filter((c) => c.motivo === "token_limpo")).toHaveLength(3)
  })

  it("slot pulado na geração NÃO herda a imagem do bloco por ser o primeiro", () => {
    // O lockup vem primeiro no schema e a geração o pula de propósito. Sem a
    // exclusividade entre os dois caminhos ele exibiria a foto no lugar do
    // wordmark.
    const html = [
      "<!-- cfy:block:0:hero:start -->",
      '<table><tr><td><img src="URL_LOGO_1"></td></tr>',
      '<tr><td><img src="URL_FOTO_1"></td></tr></table>',
      "<!-- cfy:block:0:hero:end -->",
    ].join("\n")
    const r = run(
      html,
      [
        block({
          block_type: "hero",
          position: 1,
          fields: [imageField("brand_lockup"), imageField("hero_campanha")],
        }),
      ],
      [
        {
          block_type: "hero",
          position: 1,
          field_key: "hero_campanha",
          url: "https://cdn/foto.png",
        },
      ],
    )
    expect(r.html).toContain('src="https://cdn/foto.png"')
    const lockup = r.report.campos.find((c) => c.key === "brand_lockup")
    expect(lockup?.para).toBeNull()
  })

  it("bloco legado (imageMap sem field_key) mantém 1 imagem no primeiro campo", () => {
    const r = run(
      painelHtml,
      [painelBlock],
      [{ block_type: "products", position: 4, url: "https://cdn/unica.png" }],
    )
    expect(r.html).toContain('src="https://cdn/unica.png"')
    expect(r.report.merged).toBe(1)
  })
})

// ── Casamento bloco ↔ marcador (28/08) ──────────────────────────────────
//
// Até aqui o mapa casava por `block_type === m.tipo`. `sanitizeBlockType`
// degrada para 'text' todo tipo fora do CHECK, e 'offer' ficou fora dele
// até a migration 20261090 — para um bloco de oferta com imagem, o filtro
// por tipo saía vazio e a imagem não entrava. Mesmo mecanismo que fez a
// copy sumir no copy_merge.

describe("imageMerge — bloco ↔ marcador", () => {
  const doc = (t1: string, t2: string, s1 = "hero", s2 = "offer") =>
    [
      `<!-- cfy:block:0:${s1}:start -->`,
      `<table><tr><td><img src="${t1}" alt="ALT_1"></td></tr></table>`,
      `<!-- cfy:block:0:${s1}:end -->`,
      `<!-- cfy:block:1:${s2}:start -->`,
      `<table><tr><td><img src="${t2}" alt="ALT_2"></td></tr></table>`,
      `<!-- cfy:block:1:${s2}:end -->`,
    ].join("\n")

  it("block_type degradado para 'text' ainda recebe a imagem", () => {
    const r = run(
      doc("URL_DA_IMAGEM_1", "URL_DA_IMAGEM_2"),
      [
        block({ block_id: "b1", block_type: "hero", position: 1, fields: [imageField("hero_img")] }),
        // O que o banco guardou antes da 20261090: 'offer' virou 'text'.
        block({ block_id: "b2", block_type: "text", position: 2, fields: [imageField("offer_img")] }),
      ],
      [
        { block_type: "hero", field_key: "hero_img", url: "https://cdn/hero.png", position: 1 },
        // O imageMap carrega o tipo DEGRADADO, como o banco guardou.
        { block_type: "text", field_key: "offer_img", url: "https://cdn/offer.png", position: 2 },
      ],
    )
    expect(r.html).toContain("https://cdn/hero.png")
    expect(r.html).toContain("https://cdn/offer.png")
    expect(r.report.merged).toBe(2)
  })

  // Duas regiões da MESMA section no documento — não havia teste nenhum,
  // e é exatamente a forma do Welcome 1 da InnovaBay (offer × 2).
  it("duas regiões da mesma section não trocam de bloco", () => {
    const r = run(
      doc("URL_DA_IMAGEM_1", "URL_DA_IMAGEM_2", "offer", "offer"),
      [
        block({ block_id: "b1", block_type: "text", position: 1, fields: [imageField("a")] }),
        block({ block_id: "b2", block_type: "text", position: 2, fields: [imageField("b")] }),
      ],
      [
        { block_type: "text", field_key: "a", url: "https://cdn/primeira.png", position: 1 },
        { block_type: "text", field_key: "b", url: "https://cdn/segunda.png", position: 2 },
      ],
    )
    // A ordem do documento manda: primeira região = primeiro bloco.
    expect(r.html.indexOf("primeira.png")).toBeGreaterThan(-1)
    expect(r.html.indexOf("primeira.png")).toBeLessThan(r.html.indexOf("segunda.png"))
  })
})

describe("imagem de FUNDO — as três formas do mesmo token", () => {
  // Bytes da variante "produtos 2" (8ef65206). A foto de fundo se declara
  // três vezes: `background=` (Outlook), `background-image:url()` (todos os
  // outros) e `<v:fill src=>` (VML). Até 01/09 só a do VML era reconhecida:
  // a foto aparecia no Outlook e o email chegava com fundo branco e os
  // marcadores flutuando em Gmail/Apple Mail — foi o que o cliente viu.
  const fundo = [
    "<!-- cfy:block:0:products:start -->",
    '<tr><td background="URL_DA_FOTO"',
    "    style=\"background-color:#FFFFFF;background-image:url('URL_DA_FOTO');background-size:cover;\">",
    '  <!--[if gte mso 9]>',
    '  <v:rect><v:fill type="frame" src="URL_DA_FOTO" color="#FFFFFF" /></v:rect>',
    "  <![endif]-->",
    "</td></tr>",
    "<!-- cfy:block:0:products:end -->",
  ].join("\n")

  it("escreve a URL nas TRÊS ocorrências", () => {
    const r = imageMerge({
      html: fundo,
      blocks: [
        {
          block_id: "b1",
          block_type: "products",
          position: 1,
          content: {},
          fields: [
            {
              key: "product_center_shot",
              example: "",
              type: "image",
              nature: "imagem_gerada",
            },
          ],
        },
      ],
      imageMap: [
        {
          block_type: "products",
          position: 1,
          field_key: "product_center_shot",
          url: "https://cdn/foto.png",
        },
      ],
    })
    expect(r.html).not.toContain("URL_DA_FOTO")
    expect(r.html.match(/https:\/\/cdn\/foto\.png/g)).toHaveLength(3)
    expect(r.report.merged).toBe(1)
  })
})
