import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({}),
  createClient: () => ({}),
}))

import { renderImageTemplate } from "@/lib/agents/image/template-renderer"
import { heroDesignSystemBlock } from "@/lib/agents/html/format-context"
import { DEFAULT_HERO_USER_TEMPLATE } from "@/lib/agents/chains/hero.chain"

// O template ANTIGO, literal, como estava antes da troca do condicional.
const TEMPLATE_ANTIGO = DEFAULT_HERO_USER_TEMPLATE.replace(
  "{{hero_design_system_block}}<store>",
  `{{#if hero_variant_design_system}}<design_system>
{{hero_variant_design_system}}
</design_system>

{{/if}}<store>`,
)

const BASE = {
  brand_name: "Innova Bay", locale: "pt-BR",
  color_bg: "#fff", color_text: "#111", color_heading: "#000",
  color_button_bg: "#111", color_button_text: "#fff", color_accent: "#0af",
  font_heading: "Inter", font_heading_weight: "700",
  font_body: "Inter", font_body_weight: "400",
  logo_light: "u1", logo_dark: "u2",
  email_name: "Welcome 1", subject: "Bem-vindo",
  hero_source: "library", hero_variant_html: "<tr></tr>",
  hero_variant_rendered_html: "", hero_variant_schema_json: "[]",
  hero_content_json: "[]", hero_pending_json: "[]",
  hero_image_url: "https://x/y.png", hero_image_alt: "",
  hero_region_html: "<tr>região</tr>", output_contract: "CONTRATO",
}

describe("hero: template novo == template antigo, byte a byte", () => {
  it("COM design_system cadastrado", () => {
    const ds = "Fundo escuro.\nBotão pill."
    const antigo = renderImageTemplate(TEMPLATE_ANTIGO, {
      ...BASE, hero_variant_design_system: ds,
    })
    const novo = renderImageTemplate(DEFAULT_HERO_USER_TEMPLATE, {
      ...BASE,
      hero_variant_design_system: ds,
      hero_design_system_block: heroDesignSystemBlock(ds),
    })
    expect(novo).toBe(antigo)
    expect(novo).toContain("<design_system>")
  })

  it("SEM design_system", () => {
    const antigo = renderImageTemplate(TEMPLATE_ANTIGO, {
      ...BASE, hero_variant_design_system: "",
    })
    const novo = renderImageTemplate(DEFAULT_HERO_USER_TEMPLATE, {
      ...BASE,
      hero_variant_design_system: "",
      hero_design_system_block: heroDesignSystemBlock(""),
    })
    expect(novo).toBe(antigo)
    expect(novo).not.toContain("<design_system>")
    expect(novo.startsWith("<store>")).toBe(true)
  })
})

// ── Proveniência dos chains da fase 2 (migration 20261085) ──────────────
// A marcação por origem tem de RECOMPOR o prompt enviado, byte a byte —
// senão ela mente sobre o que o agente recebeu.
import {
  buildSegmentedPrompt,
  concatSegments,
} from "@/lib/agents/shared/prompt-provenance"
import {
  HERO_VAR_ORIGINS,
  TEXT_FORMAT_VAR_ORIGINS,
  COLOR_FORMAT_VAR_ORIGINS,
} from "@/lib/agents/html/format-context"
import { DEFAULT_TEXT_FORMAT_USER_TEMPLATE } from "@/lib/agents/chains/text-format.chain"
import { DEFAULT_COLOR_FORMAT_USER_TEMPLATE } from "@/lib/agents/chains/color-format.chain"
import { DEFAULT_QA_USER_TEMPLATE } from "@/lib/agents/chains/qa.chain"

describe("segmentação dos chains: recomposição byte-igual", () => {
  const casos: Array<[string, string, Record<string, string>, Record<string, unknown>]> = [
    ["hero", DEFAULT_HERO_USER_TEMPLATE, { ...BASE, hero_design_system_block: "" }, HERO_VAR_ORIGINS],
    [
      "text_format",
      DEFAULT_TEXT_FORMAT_USER_TEMPLATE,
      {
        brand_name: "Innova Bay", locale: "pt-BR",
        color_bg: "#fff", color_text: "#111", color_heading: "#000",
        color_button_bg: "#111", color_button_text: "#fff", color_accent: "#0af",
        font_heading: "Inter", font_heading_weight: "700",
        font_body: "Inter", font_body_weight: "400",
        html: "<html>doc</html>", email_name: "W1", subject: "s", preheader: "p",
        objective: "obj", messaging: "msg",
        blocks_with_content_json: "[]", fields_json: "[]", top_products_json: "[]",
      },
      TEXT_FORMAT_VAR_ORIGINS,
    ],
    [
      "color_format",
      DEFAULT_COLOR_FORMAT_USER_TEMPLATE,
      {
        brand_name: "Innova Bay", niche: "casa", locale: "pt-BR", tones: "técnico",
        color_inventory_json: "[]", brand_colors: "Primária: #111",
        color_bg: "#fff", color_text: "#111", color_heading: "#000",
        color_button_bg: "#111", color_button_text: "#fff", color_accent: "#0af",
        color_surface: "#eee", color_surface_strong: "#ddd",
        font_heading: "Inter", font_body: "Inter",
        pesquisa_full_text: "pesquisa", email_name: "W1", subject: "s",
      },
      COLOR_FORMAT_VAR_ORIGINS,
    ],
  ]

  for (const [nome, template, vars, origins] of casos) {
    it(`${nome}: concat(segmentos) == render`, () => {
      const real = renderImageTemplate(template, vars)
      const seg = buildSegmentedPrompt(
        template,
        vars,
        origins as Parameters<typeof buildSegmentedPrompt>[2],
        { parte: "user" },
      )
      expect(seg.segments).not.toBeNull()
      expect(seg.prompt).toBe(real)
      expect(seg.segments!.map((s) => s.texto ?? "").join("")).toBe(real)
      // Nenhuma var pode cair em "origem não declarada".
      expect(
        seg.segments!.filter((s) => s.rotulo.includes("origem não declarada")),
      ).toEqual([])
    })
  }

  it("qa: o renderer próprio do chain casa com o corte do helper", () => {
    const vars = {
      html: "<html></html>",
      block_views_json: "[]",
      block_contracts_json: "[]",
      blocks_json: "[]",
      briefing_json: "{}",
      brand_json: "{}",
      blueprint_objective: "Boas-vindas",
    }
    // O renderer do qa.chain: /\{\{(\w+)\}\}/g com fallback "".
    const real = DEFAULT_QA_USER_TEMPLATE.replace(
      /\{\{(\w+)\}\}/g,
      (_m, k: string) => (k in vars ? (vars as Record<string, string>)[k] : ""),
    )
    const seg = buildSegmentedPrompt(DEFAULT_QA_USER_TEMPLATE, vars, {}, {
      parte: "user",
    })
    expect(seg.prompt).toBe(real)
    expect(seg.segments!.map((s) => s.texto ?? "").join("")).toBe(real)
  })

  it("imagem: o dialeto de chave única corta o template in-code", () => {
    const template = "Marca: {MARCA}. Nicho: {NICHO}. Ideia: {EMAIL_IDEIA}."
    const vars = { MARCA: "Innova", NICHO: "casa", EMAIL_IDEIA: "o fio" }
    const real = template.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k as keyof typeof vars] ?? "")
    const seg = buildSegmentedPrompt(
      template,
      vars,
      {
        MARCA: { cls: "loja", rotulo: "Loja" },
        NICHO: { cls: "loja", rotulo: "Loja" },
        EMAIL_IDEIA: { cls: "upstream", rotulo: "Fio do Estruturador" },
      },
      { parte: "user", dialeto: "single" },
    )
    expect(seg.prompt).toBe(real)
    expect(seg.segments!.map((s) => s.texto ?? "").join("")).toBe(real)
    expect(seg.segments!.find((s) => s.texto === "o fio")?.cls).toBe("upstream")
  })

  it("concatSegments preserva a ordem system → user", () => {
    const out = concatSegments(
      [{ cls: "agente" as const, rotulo: "sys", texto: "S", chars: 1, parte: "system" as const }],
      [{ cls: "loja" as const, rotulo: "usr", texto: "U", chars: 1, parte: "user" as const }],
    )
    expect(out!.map((s) => s.texto).join("")).toBe("SU")
  })
})
