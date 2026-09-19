import { describe, expect, it } from "vitest"
import { FONTE_BARLOW, FONTE_INTER, midiaDaPrimeiraTela, recursosDaPrimeiraTela } from "../primeira-tela"
import { LOGO_CONVERTFY_CLARA, LOGO_CONVERTFY_ESCURA } from "../logo"
import type { FormSchema } from "@/types/forms-conversational"

function schema(over: Partial<FormSchema> = {}): FormSchema {
  return {
    version: 1,
    display_mode: "conversational",
    blocks: [
      { ref: "a", type: "short_text", label: "A", midia: { tipo: "imagem", url: "https://x.supabase.co/a.png" } },
      { ref: "b", type: "short_text", label: "B", midia: { tipo: "imagem", url: "/b.png" } },
    ],
    endings: [],
    settings: {},
    ...over,
  } as unknown as FormSchema
}

describe("midiaDaPrimeiraTela", () => {
  it("é a da abertura quando ela existe, senão a do primeiro bloco", () => {
    expect(midiaDaPrimeiraTela(schema())?.url).toBe("https://x.supabase.co/a.png")
    const comAbertura = schema({
      settings: { welcome: { title: "Oi", midia: { tipo: "video", url: "/v.mp4", poster: "/cartaz.jpg" } } },
    } as never)
    expect(midiaDaPrimeiraTela(comAbertura)?.url).toBe("/v.mp4")
  })
})

describe("recursosDaPrimeiraTela", () => {
  it("logo da casa pelo modo, mídia da primeira tela, Inter por padrão, preconnect só para origem externa", () => {
    const r = recursosDaPrimeiraTela({ schema: schema(), displayMode: "conversational", theme: { mode: "dark" }, logoUrl: null })
    expect(r.imagens).toEqual([LOGO_CONVERTFY_CLARA, "https://x.supabase.co/a.png"])
    expect(r.fontes).toEqual([FONTE_INTER])
    expect(r.preconnect).toEqual(["https://x.supabase.co"])
  })
  it("vídeo pré-carrega o cartaz, nunca o vídeo", () => {
    const s = schema({
      settings: { welcome: { title: "Oi", midia: { tipo: "video", url: "/v.mp4", poster: "/cartaz.jpg" } } },
    } as never)
    const r = recursosDaPrimeiraTela({ schema: s, displayMode: "conversational", theme: {}, logoUrl: "https://loja.com/logo.png" })
    expect(r.imagens).toEqual(["https://loja.com/logo.png", "/cartaz.jpg"])
    expect(r.preconnect).toEqual(["https://loja.com"])
  })
  it("a fonte só entra quando é a do tema; logo oculta não entra; clássico não pré-carrega mídia", () => {
    expect(recursosDaPrimeiraTela({ schema: schema(), displayMode: "classic", theme: { fontFamily: "Georgia" }, logoUrl: null }))
      .toEqual({ imagens: [LOGO_CONVERTFY_ESCURA], fontes: [], preconnect: [] })
    expect(recursosDaPrimeiraTela({ schema: schema(), displayMode: "classic", theme: { fontFamily: "'Barlow Condensed'", hideLogo: true }, logoUrl: null }))
      .toEqual({ imagens: [], fontes: [FONTE_BARLOW], preconnect: [] })
  })
  it("mídia com URL vazia ou esquema estranho não vira preload nem preconnect", () => {
    const s = schema({ blocks: [{ ref: "a", type: "short_text", label: "A", midia: { tipo: "imagem", url: "  " } }] } as never)
    const r = recursosDaPrimeiraTela({ schema: s, displayMode: "conversational", theme: { hideLogo: true }, logoUrl: null })
    expect(r.imagens).toEqual([])
  })
})
