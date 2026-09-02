import { describe, it, expect, vi } from "vitest"
import sharp from "sharp"
import { fitBackgrounds, type BackgroundFitDeps } from "./background-fit.service"
import type { EmailBlockRow } from "../html/build-vars"

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))

const URL_FOTO = "https://x.supabase.co/sign/foto.png?token=t1"
const URL_OUTRA = "https://x.supabase.co/sign/outra.png?token=t2"

function hero5(url: string, color = "#034326") {
  return `
    <td background="${url}" valign="top"
        style="background-color:${color};background-image:url('${url}');background-position:center top;background-size:60px 122px;">
      <!--[if gte mso 9]><v:rect style="width:60px;height:122px;"><v:fill type="frame" src="${url}" color="#FFFFFF" /><v:textbox><![endif]-->
      Welcome
      <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
    </td>`
}

const blocks: EmailBlockRow[] = [
  {
    id: "blk-hero",
    position: 1,
    block_type: "hero",
    label: "Hero",
    content: {
      images: {
        hero_lifestyle_consumo: { url: URL_FOTO, alt: "" },
        main_image_rounded: { url: URL_OUTRA, alt: "" },
      },
    },
    fields: [
      {
        key: "hero_lifestyle_consumo",
        type: "image",
        guidance: "Onde fica: base do ativo de fundo, abaixo da faixa chapada; não recebe nenhum texto sobreposto.",
      },
      { key: "main_image_rounded", type: "image", guidance: "último elemento do corpo" },
    ],
  },
]

async function solid(w: number, h: number) {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .png()
    .toBuffer()
}

function deps(photo: Buffer): BackgroundFitDeps & { persisted: unknown[]; uploaded: Buffer[] } {
  const persisted: unknown[] = []
  const uploaded: Buffer[] = []
  return {
    persisted,
    uploaded,
    fetchImage: async () => photo,
    upload: async (_s, png) => {
      uploaded.push(png)
      return "https://x.supabase.co/sign/composto.png?token=c"
    },
    persistComposed: async (blockId, key, composed) => {
      persisted.push({ blockId, key, composed })
    },
  }
}

describe("fitBackgrounds", () => {
  it("hero 5: foto 60×63 num box 60×122 vira faixa #034326 + foto na base, URL trocada 3×", async () => {
    const d = deps(await solid(60, 63))
    const r = await fitBackgrounds(
      { html: hero5(URL_FOTO), blocks, storeId: "s", fallbackColor: "#111111" },
      d,
    )
    expect(r.report.compostos).toHaveLength(1)
    const c = r.report.compostos[0]
    expect(c).toMatchObject({
      block_id: "blk-hero",
      key: "hero_lifestyle_consumo",
      de: URL_FOTO,
      width: 60,
      height: 122,
      band_color: "#034326",
      band_height: 59,
      side: "bottom",
      replaced: 3,
    })
    expect(r.html).not.toContain(URL_FOTO)
    expect(r.html.match(/composto\.png/g)).toHaveLength(3)
    const meta = await sharp(d.uploaded[0]).metadata()
    expect([meta.width, meta.height]).toEqual([60, 122])
    expect(d.persisted).toEqual([
      {
        blockId: "blk-hero",
        key: "hero_lifestyle_consumo",
        composed: expect.objectContaining({ para: c.para, band_height: 59, side: "bottom" }),
      },
    ])
    expect(r.report.falhas).toEqual([])
  })

  it("foto que já cobre o box → sem_ajuste, documento intacto (resume)", async () => {
    const d = deps(await solid(60, 122))
    const html = hero5(URL_FOTO)
    const r = await fitBackgrounds({ html, blocks, storeId: "s", fallbackColor: null }, d)
    expect(r.html).toBe(html)
    expect(r.report.sem_ajuste).toEqual([
      { key: "hero_lifestyle_consumo", motivo: "foto_ja_cobre_o_box" },
    ])
    expect(d.uploaded).toHaveLength(0)
  })

  it("td sem cor usa o fallback; sem fallback não compõe", async () => {
    const d = deps(await solid(60, 63))
    const html = hero5(URL_FOTO).replace("background-color:#034326;", "")
    const ok = await fitBackgrounds({ html, blocks, storeId: "s", fallbackColor: "#ABCDEF" }, d)
    expect(ok.report.compostos[0]?.band_color).toBe("#ABCDEF")
    const no = await fitBackgrounds({ html, blocks, storeId: "s", fallbackColor: null }, deps(await solid(60, 63)))
    expect(no.report.sem_ajuste).toEqual([
      { key: "hero_lifestyle_consumo", motivo: "sem_cor_para_a_faixa" },
    ])
  })

  it("URL que não é imagem gerada do email fica de fora; falha de fetch é fail-open", async () => {
    const alheia = await fitBackgrounds(
      { html: hero5("https://cdn.exemplo.com/fundo.jpg"), blocks, storeId: "s", fallbackColor: "#000000" },
      deps(await solid(60, 63)),
    )
    expect(alheia.report.sem_ajuste).toEqual([{ key: null, motivo: "url_nao_gerada_neste_email" }])

    const d = deps(await solid(60, 63))
    d.fetchImage = async () => {
      throw new Error("fetch 403")
    }
    const html = hero5(URL_FOTO)
    const r = await fitBackgrounds({ html, blocks, storeId: "s", fallbackColor: null }, d)
    expect(r.html).toBe(html)
    expect(r.report.falhas).toEqual([{ key: "hero_lifestyle_consumo", erro: "fetch 403" }])
  })
})
