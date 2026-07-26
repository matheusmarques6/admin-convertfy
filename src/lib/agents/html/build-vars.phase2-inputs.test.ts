/**
 * Verificação de INPUTS da fase 2 (pré-execução em produção).
 *
 * Simula o estado EXATO do banco após a regeneração completa de 09/07
 * (Radiantlyhers): store_email_references persistida pelo Montador,
 * store_email_blueprints com blocks contendo copy_spec (shape novo),
 * email_blocks com copy real do n8n — e prova que:
 *
 *   1. O HTML agent recebe a reference DO MONTADOR (não o global).
 *   2. O blueprint novo (com copy_spec) não quebra nada e o purpose
 *      chega por posição.
 *   3. A copy dos blocos chega íntegra em blocks_with_content.
 *   4. O prompt final (user template renderizado) contém reference +
 *      copy e não sobra placeholder de contrato sem resolver.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { buildHtmlPromptVars } from "./build-vars"
import { HtmlPromptVarsSchema, HTML_PROMPT_VAR_KEYS } from "./contract"
import { renderImageTemplate } from "../image/template-renderer"

// O html.chain (monolítico) foi removido no split do agente HTML — o
// template sintético abaixo cobre TODAS as vars do contrato legado, que é
// o que este teste valida (cada var renderiza sem sobrar placeholder).
const ALL_VARS_TEMPLATE = HTML_PROMPT_VAR_KEYS.map((k) => `<${k}>{{${k}}}</${k}>`).join("\n")
import type { EmailBlueprint } from "@/types/email-generation"
import type { StoreBrandIdentity } from "@/types/email-workspace"

// ── Mock supabase com store_email_references (o Montador persistiu) ──
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
      then: (resolve: (v: MockTableState) => unknown) => resolve(state),
    }
    return builder
  }
  return {
    from: handler,
    storage: {
      from: () => ({
        createSignedUrl: (path: string) =>
          Promise.resolve({
            data: { signedUrl: `https://storage.example/signed/${path}` },
            error: null,
          }),
      }),
    },
  } as never
}

// Reference do Montador — table-based, com placeholders (shape real).
const MONTADOR_REFERENCE_HTML = `<!DOCTYPE html><html><head><style>:root{--bg:#f5f1ec;--accent:#ddd2c6;}</style></head>
<body><table class="email-container" width="600"><tr><td data-block="hero">{{HERO_TEXT}}</td></tr>
<tr><td data-block="coupon">{{COUPON_CODE}}</td></tr>
<tr><td data-block="footer">{{FOOTER_TEXT}}</td></tr></table>
<!-- assinatura-montador-radiantlyhers-2026 --></body></html>`

// Blueprint NOVO (pós-regeneração): blocks com purpose + copy_spec.
const blueprintNovo: EmailBlueprint = {
  id: "bp-novo",
  flow_type: "welcome",
  email_number: 1,
  objective: "Converter o novo inscrito com o cupom de boas-vindas",
  messaging: "Vestidos que parecem caros sem custar caro",
  subject_hint: "Cupom direto, sem hype",
  blocks: [
    {
      type: "hero",
      label: "Hero",
      purpose: "Hero com o cupom WELCOME10 em destaque",
      image_brief: "Vestido em ambiente clean",
      copy_spec: [
        { key: "headline", min_chars: 18, max_chars: 40 },
        { key: "cta", min_chars: 8, max_chars: 16 },
      ],
    },
    {
      type: "coupon",
      label: "Cupom",
      purpose: "Código com validade explícita",
      copy_spec: [{ key: "code", min_chars: 4, max_chars: 15 }],
    },
    {
      type: "footer",
      label: "Rodapé",
      purpose: "Rodapé padrão",
      copy_spec: [],
    },
  ],
  tone_override: null,
  updated_at: "",
  updated_by: null,
  image_aspect: "4:5",
  image_mode: "product_ref",
  image_overlay_reserve_bottom: true,
}

// Copy REAL gravada pelo callback do n8n (com token de brand pra testar
// a sanitização e image_url gerada pela fase de imagem).
const blocksComCopy = [
  {
    id: "blk1",
    position: 1,
    block_type: "hero",
    label: "Hero",
    content: {
      headline: "Your 10% off is here",
      body: "Dresses that look expensive at {{BRAND_NAME}}.",
      cta: "SHOP NOW",
      image_url: "https://storage.example/hero.png",
    },
  },
  {
    id: "blk2",
    position: 2,
    block_type: "coupon",
    label: "Cupom",
    content: { code: "WELCOME10", hint: "Valid for 48 hours" },
  },
  {
    id: "blk3",
    position: 3,
    block_type: "footer",
    label: "Rodapé",
    content: { text: "You are receiving this email because you subscribed." },
  },
]

const brand: StoreBrandIdentity = {
  id: "b1",
  store_id: "s1",
  version: 3,
  logo_main_svg: "https://storage.example/logo.svg",
  logo_main_png: null,
  logo_alt_svg: null,
  logo_alt_png: null,
  logo_monogram_svg: null,
  logo_monogram_png: null,
  logo_reverse_svg: null,
  logo_reverse_png: null,
  colors_primary: [{ hex: "#111111", name: "Preto", role: "Principal" }],
  colors_secondary: [{ hex: "#F5F1EC", name: "Areia", role: "Fundo" }],
  font_heading: "Montserrat",
  font_heading_weight: "700",
  font_body: "Arial",
  font_body_weight: "400",
  voice: [],
  trust_icons: [],
  top_products: [],
  source: "manual",
  created_at: "",
  created_by: null,
  confirmed_at: "2026-07-08T17:37:46Z",
  confirmed_by: null,
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => "image/svg+xml" },
    text: async () => "<svg viewBox='0 0 10 10'><rect/></svg>",
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function buildProdLikeVars() {
  const supa = makeSupabaseMock({
    email_flow_emails: {
      data: {
        name: "Welcome 1",
        subject: "Your 10% off is here — use WELCOME10",
        preheader: "Dresses that look expensive, fit beautifully and ship fast.",
      },
    },
    email_blocks: { data: blocksComCopy },
    // O Montador PERSISTIU a reference desta loja×email:
    store_email_references: { data: { html: MONTADOR_REFERENCE_HTML } },
    // Template global também existe — NÃO pode ser o escolhido:
    email_reference_templates: { data: { html: "<div>TEMPLATE-GLOBAL</div>" } },
  })
  return buildHtmlPromptVars({
    emailId: "e1",
    brand,
    briefing: null,
    blueprint: blueprintNovo,
    topProducts: [
      {
        id: "p1",
        name: "Bustier Dress Alice",
        price: 49,
        image_url: "https://cdn.shopify.com/alice.png",
        url: "https://radiantlyhers.com/products/alice",
      },
    ],
    storeRaw: { id: "s1", store_name: "Radiantlyhers", language: "en-US" },
    flowType: "welcome",
    emailNumber: 1,
    admin: supa,
    relaxedBrandCheck: true,
  })
}

describe("inputs da fase 2 — cenário de produção pós-regeneração", () => {
  it("HTML agent recebe a reference DO MONTADOR, não o template global", async () => {
    const vars = await buildProdLikeVars()
    expect(vars.reference_html).toBe(MONTADOR_REFERENCE_HTML)
    expect(vars.reference_html).toContain("assinatura-montador-radiantlyhers-2026")
    expect(vars.reference_html).not.toContain("TEMPLATE-GLOBAL")
  })

  it("blueprint novo (blocks com copy_spec) não quebra e purpose chega por posição", async () => {
    const vars = await buildProdLikeVars()
    const blocks = JSON.parse(vars.blocks_with_content_json) as Array<{
      position: number
      type: string
      purpose: string
      content: Record<string, unknown>
    }>
    expect(blocks).toHaveLength(3)
    expect(blocks[0].purpose).toBe("Hero com o cupom WELCOME10 em destaque")
    expect(blocks[1].purpose).toBe("Código com validade explícita")
  })

  it("copy do n8n chega íntegra, com token de brand resolvido", async () => {
    const vars = await buildProdLikeVars()
    const blocks = JSON.parse(vars.blocks_with_content_json) as Array<{
      content: Record<string, unknown>
    }>
    expect(blocks[0].content.headline).toBe("Your 10% off is here")
    // {{BRAND_NAME}} sanitizado para o nome real:
    expect(blocks[0].content.body).toBe(
      "Dresses that look expensive at Radiantlyhers.",
    )
    expect(blocks[1].content.code).toBe("WELCOME10")
  })

  it("image_map traz a imagem gerada com aspect/overlay do blueprint", async () => {
    const vars = await buildProdLikeVars()
    const imageMap = JSON.parse(vars.image_map_json) as Array<{
      id: string
      url: string
      aspect_ratio: string
      overlay: string
    }>
    expect(imageMap).toHaveLength(1)
    expect(imageMap[0]).toMatchObject({
      id: "IMG_1",
      url: "https://storage.example/hero.png",
      aspect_ratio: "4:5",
    })
  })

  it("contrato das 21 vars passa e o subject/objective vêm do banco", async () => {
    const vars = await buildProdLikeVars()
    expect(() => HtmlPromptVarsSchema.parse(vars)).not.toThrow()
    expect(vars.subject).toBe("Your 10% off is here — use WELCOME10")
    expect(vars.objective).toBe(
      "Converter o novo inscrito com o cupom de boas-vindas",
    )
    // "en-US" do banco normaliza pro código canônico "en"
    expect(vars.locale).toBe("en")
  })

  it("prompt final renderizado: reference + copy dentro, nenhum placeholder de contrato órfão", async () => {
    const vars = await buildProdLikeVars()
    const prompt = renderImageTemplate(ALL_VARS_TEMPLATE, vars)
    // O que o modelo PRECISA receber:
    expect(prompt).toContain("assinatura-montador-radiantlyhers-2026")
    expect(prompt).toContain("Your 10% off is here")
    expect(prompt).toContain("WELCOME10")
    expect(prompt).toContain("Radiantlyhers")
    // Nenhuma var do contrato ficou sem substituir no template:
    for (const key of Object.keys(vars)) {
      expect(prompt).not.toContain(`{{${key}}}`)
    }
  })
})
