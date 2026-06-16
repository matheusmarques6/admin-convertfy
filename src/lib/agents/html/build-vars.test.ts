import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { buildHtmlPromptVars } from "./build-vars"
import { HtmlPromptVarsSchema } from "./contract"
import type { EmailBlueprint } from "@/types/email-generation"
import type { StoreBrandIdentity } from "@/types/email-workspace"

// ── Mock SupabaseClient minimalista ──────────────────────────────────
// Simula a API encadeada `from().select().eq().maybeSingle()` que
// build-vars usa. Cada chamada `from(table)` retorna o handler do
// table; cada handler responde com o `data` configurado.

interface MockTableState {
  data: unknown
  error?: unknown
}

function makeSupabaseMock(tables: Record<string, MockTableState>) {
  const handler = (table: string) => {
    const state = tables[table] ?? { data: null }
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => Promise.resolve(state),
      // build-vars usa await direto em alguns lugares (ex: order sem
      // maybeSingle pra blocks). Builder e' awaitable.
      then: (resolve: (v: MockTableState) => unknown) => resolve(state),
    }
    return builder
  }
  return {
    from: handler,
    // storage.from(bucket).createSignedUrl(path, ttl) — usado por
    // pngImgTagFromUrl pra renovar a URL do logo pra 365d. Retorna uma URL
    // fresca previsivel pro teste.
    storage: {
      from: () => ({
        createSignedUrl: (path: string) =>
          Promise.resolve({
            data: { signedUrl: `https://storage.example/signed/${path}?token=fresh365` },
            error: null,
          }),
      }),
    },
  } as never
}

const baseBrand: StoreBrandIdentity = {
  id: "b1",
  store_id: "s1",
  version: 1,
  logo_main_svg: "https://storage.example/logo.svg",
  logo_main_png: null,
  logo_alt_svg: null,
  logo_alt_png: null,
  logo_monogram_svg: null,
  logo_monogram_png: null,
  logo_reverse_svg: null,
  logo_reverse_png: null,
  colors_primary: [
    { hex: "#1F1F1F", name: "Preto", role: "Principal" },
    { hex: "#FF6600", name: "Laranja", role: "Destaque" },
  ],
  colors_secondary: [{ hex: "#FAFAFA", name: "Off-white", role: "Fundo" }],
  font_heading: "Playfair Display",
  font_heading_weight: "700",
  font_body: "Inter",
  font_body_weight: "400",
  voice: [],
  trust_icons: [],
  top_products: [],
  source: "manual",
  created_at: "",
  created_by: null,
  confirmed_at: null,
  confirmed_by: null,
}

const baseBlueprint: EmailBlueprint = {
  id: "bp1",
  flow_type: "welcome",
  email_number: 1,
  objective: "Boas-vindas",
  messaging: "Tom aspiracional",
  subject_hint: null,
  blocks: [
    { type: "hero", label: "Hero", purpose: "Banner principal com produto" },
    { type: "cta", label: "CTA", purpose: "Botão principal" },
  ],
  tone_override: null,
  updated_at: "",
  updated_by: null,
  image_aspect: "4:5",
  image_mode: "product_ref",
  image_overlay_reserve_bottom: true,
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => "image/svg+xml" },
    text: async () => "<svg viewBox='0 0 100 100'><rect/></svg>",
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function setup(overrides: {
  emailRow?: { name: string; subject: string; preheader: string } | null
  blocks?: Array<Record<string, unknown>>
  refHtml?: string | null
  brand?: StoreBrandIdentity | null
  blueprint?: EmailBlueprint | null
  storeRaw?: Record<string, unknown>
  relaxedBrandCheck?: boolean
}) {
  const supa = makeSupabaseMock({
    email_flow_emails: {
      data:
        overrides.emailRow === undefined
          ? { name: "Welcome E1", subject: "Olá!", preheader: "Bem-vindo" }
          : overrides.emailRow,
    },
    email_blocks: { data: overrides.blocks ?? [] },
    email_reference_templates: {
      data: { html: overrides.refHtml ?? "<div>ref</div>" },
    },
  })
  return buildHtmlPromptVars({
    emailId: "e1",
    brand: overrides.brand === undefined ? baseBrand : overrides.brand,
    briefing: null,
    blueprint: overrides.blueprint === undefined ? baseBlueprint : overrides.blueprint,
    topProducts: [
      { id: "p1", name: "Produto 1", price: 99, image_url: "https://img/p1.jpg", url: "https://store/p1" },
    ],
    storeRaw: overrides.storeRaw ?? { store_name: "Loja Teste", language: "pt-BR" },
    flowType: "welcome",
    emailNumber: 1,
    admin: supa,
    relaxedBrandCheck: overrides.relaxedBrandCheck,
  })
}

describe("buildHtmlPromptVars", () => {
  it("happy path: 21 vars preenchidas e contrato Zod passa", async () => {
    const vars = await setup({
      blocks: [
        {
          id: "blk1",
          position: 1,
          block_type: "hero",
          label: "Hero",
          content: { headline: "Olá", image_url: "https://img/hero.jpg" },
        },
      ],
    })
    expect(Object.keys(vars).length).toBe(21)
    expect(() => HtmlPromptVarsSchema.parse(vars)).not.toThrow()
    expect(vars.brand_name).toBe("Loja Teste")
    expect(vars.locale).toBe("pt-BR")
    expect(vars.color_button_bg).toBe("#1F1F1F")
    expect(vars.color_accent).toBe("#FF6600")
    expect(vars.font_heading).toBe("Playfair Display")
    expect(vars.objective).toBe("Boas-vindas")
    expect(vars.messaging).toBe("Tom aspiracional")
    expect(vars.logo_svg).toContain("<svg")
  })

  it("brand null → lanca BrandIncompleteError (precheck), nao gera com defaults", async () => {
    await expect(setup({ brand: null })).rejects.toMatchObject({
      name: "BrandIncompleteError",
      missing: ["brand_identity"],
    })
  })

  it("brand sem cores → lanca BrandIncompleteError listando 'colors'", async () => {
    const semCores = { ...baseBrand, colors_primary: [], colors_secondary: [] }
    await expect(setup({ brand: semCores })).rejects.toMatchObject({
      name: "BrandIncompleteError",
      missing: expect.arrayContaining(["colors"]),
    })
  })

  it("brand sem logo SVG nem PNG → lanca BrandIncompleteError listando 'logo'", async () => {
    const semLogo = { ...baseBrand, logo_main_svg: null, logo_main_png: null }
    await expect(setup({ brand: semLogo })).rejects.toMatchObject({
      name: "BrandIncompleteError",
      missing: expect.arrayContaining(["logo"]),
    })
  })

  it("logo_main_png (signed URL do nosso bucket) → <img src> com URL renovada 365d, sem base64", async () => {
    const soPng = {
      ...baseBrand,
      logo_main_svg: null,
      logo_main_png:
        "https://proj.supabase.co/storage/v1/object/sign/onboarding-visual-assets/stores/s1/brand/logo_main_png-123-logo.png?token=old7d",
    }
    const vars = await setup({ brand: soPng })
    // Renova a signed URL (365d) em vez de embutir o PNG como base64.
    expect(vars.logo_svg).toContain('<img src="https://storage.example/signed/')
    expect(vars.logo_svg).toContain("stores/s1/brand/logo_main_png-123-logo.png")
    expect(vars.logo_svg).not.toContain("data:image/png;base64")
  })

  it("logo_main_png fora do nosso bucket → fallback usa a URL armazenada direto", async () => {
    const soPng = {
      ...baseBrand,
      logo_main_svg: null,
      logo_main_png: "https://cdn.externo.com/logo.png",
    }
    const vars = await setup({ brand: soPng })
    expect(vars.logo_svg).toContain('<img src="https://cdn.externo.com/logo.png"')
    expect(vars.logo_svg).not.toContain("data:image/png;base64")
  })

  it("relaxedBrandCheck=true + brand sem cores nem logo → nao joga, logo_svg vazio", async () => {
    const vazia = {
      ...baseBrand,
      logo_main_svg: null,
      logo_main_png: null,
      colors_primary: [],
      colors_secondary: [],
    }
    const vars = await setup({ brand: vazia, relaxedBrandCheck: true })
    expect(vars.logo_svg).toBe("")
    expect(vars.color_bg).toBe("#FFFFFF") // default via deriveColorRoles
  })

  it("relaxedBrandCheck=true + brand=null → AINDA joga (sem brand identity nenhuma)", async () => {
    await expect(
      setup({ brand: null, relaxedBrandCheck: true }),
    ).rejects.toMatchObject({
      name: "BrandIncompleteError",
      missing: ["brand_identity"],
    })
  })

  it("content do bloco com {{BRAND_NAME}} → resolvido pelo brandName no JSON final", async () => {
    const vars = await setup({
      blocks: [
        {
          id: "blk1",
          position: 1,
          block_type: "hero",
          label: "Hero",
          content: {
            headline: "Bem-vindo {{BRAND_NAME}}!",
            body: "A {{ brand_name }} agradece sua visita.",
          },
        },
      ],
    })
    const blocks = JSON.parse(vars.blocks_with_content_json)
    expect(blocks[0].content.headline).toBe("Bem-vindo Loja Teste!")
    expect(blocks[0].content.body).toBe("A Loja Teste agradece sua visita.")
  })

  it("blocks sem image_url → image_map_json vira []", async () => {
    const vars = await setup({
      blocks: [
        {
          id: "blk1",
          position: 1,
          block_type: "text",
          label: "Texto",
          content: { headline: "Sem imagem" },
        },
      ],
    })
    expect(JSON.parse(vars.image_map_json)).toEqual([])
  })

  it("blueprint sem hint pro position → purpose usa label", async () => {
    const vars = await setup({
      blueprint: { ...baseBlueprint, blocks: [] },
      blocks: [
        {
          id: "blk1",
          position: 1,
          block_type: "hero",
          label: "Hero label",
          content: {},
        },
      ],
    })
    const blocks = JSON.parse(vars.blocks_with_content_json)
    expect(blocks[0].purpose).toBe("Hero label")
  })

  it("fetch SVG 404 → logo_svg vazio, sem throw", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: { get: () => null },
      text: async () => "",
    })
    const vars = await setup({})
    expect(vars.logo_svg).toBe("")
  })

  it("fetch SVG retorna HTML (não-SVG) → logo_svg vazio", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => "text/html" },
      text: async () => "<html><body>not svg</body></html>",
    })
    const vars = await setup({})
    expect(vars.logo_svg).toBe("")
  })

  it("language como label PT → normaliza pra pt-BR via languageLabelToCode", async () => {
    const vars = await setup({
      storeRaw: { store_name: "Loja Teste", language: "Português" },
    })
    expect(vars.locale).toBe("pt-BR")
  })

  it("language com valor lixo → cai pra DEFAULT_LOCALE", async () => {
    const vars = await setup({
      storeRaw: { store_name: "Loja Teste", language: "klingon" },
    })
    expect(vars.locale).toBe("pt-BR")
  })

  it("blueprint sem image_overlay_reserve_bottom → image_map overlay default 'needs_html_overlay'", async () => {
    const vars = await setup({
      blueprint: { ...baseBlueprint, image_overlay_reserve_bottom: null },
      blocks: [
        {
          id: "blk1",
          position: 1,
          block_type: "hero",
          label: "Hero",
          content: { image_url: "https://img/hero.jpg" },
        },
      ],
    })
    const map = JSON.parse(vars.image_map_json)
    expect(map[0].overlay).toBe("needs_html_overlay")
  })

  it("blueprint com image_overlay_reserve_bottom=false → overlay='burned'", async () => {
    const vars = await setup({
      blueprint: { ...baseBlueprint, image_overlay_reserve_bottom: false },
      blocks: [
        {
          id: "blk1",
          position: 1,
          block_type: "hero",
          label: "Hero",
          content: { image_url: "https://img/hero.jpg" },
        },
      ],
    })
    const map = JSON.parse(vars.image_map_json)
    expect(map[0].overlay).toBe("burned")
  })
})
