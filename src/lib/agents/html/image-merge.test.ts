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
