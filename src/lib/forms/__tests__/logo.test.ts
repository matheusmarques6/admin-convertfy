import { describe, expect, it } from "vitest"
import {
  ALTURA_MAXIMA_DA_LOGO,
  ALTURA_MINIMA_DA_LOGO,
  ALTURA_PADRAO_DA_LOGO,
  alturaDaLogo,
  LOGO_CONVERTFY_CLARA,
  LOGO_CONVERTFY_ESCURA,
  logoDoFormulario,
} from "../logo"

describe("logoDoFormulario", () => {
  it("sem logo própria, usa a da Convertfy", () => {
    expect(logoDoFormulario({})).toEqual({ url: LOGO_CONVERTFY_ESCURA, daCasa: true })
  })

  it("no escuro usa a versão clara — a preta sumiria no fundo", () => {
    expect(logoDoFormulario({ modo: "dark" }).url).toBe(LOGO_CONVERTFY_CLARA)
  })

  it("logo do cliente vence a da casa", () => {
    const r = logoDoFormulario({ logoUrl: "https://cdn/x.png", modo: "dark" })
    expect(r).toEqual({ url: "https://cdn/x.png", daCasa: false })
  })

  it("URL só com espaço não conta como logo própria", () => {
    expect(logoDoFormulario({ logoUrl: "   " }).daCasa).toBe(true)
  })

  it("ocultar vence tudo, inclusive a logo própria", () => {
    expect(logoDoFormulario({ logoUrl: "https://cdn/x.png", ocultar: true }).url).toBeNull()
  })
})

describe("altura da logo", () => {
  it("o padrão depende do FORMATO", () => {
    // No conversacional a logo é uma marca pequena no alto de uma
    // página inteira; no clássico é o cabeçalho de um card.
    expect(alturaDaLogo(undefined, "conversational")).toBe(ALTURA_PADRAO_DA_LOGO.conversational)
    expect(alturaDaLogo(undefined, "classic")).toBe(ALTURA_PADRAO_DA_LOGO.classic)
  })

  it("respeita o que foi escolhido", () => {
    expect(alturaDaLogo(56, "conversational")).toBe(56)
  })

  it("clampeia os dois extremos, que falham em silêncio", () => {
    // 4px é indistinguível de nenhuma logo; 400px empurra a pergunta
    // para fora da tela e nada diz que a causa foi este número.
    expect(alturaDaLogo(4, "classic")).toBe(ALTURA_MINIMA_DA_LOGO)
    expect(alturaDaLogo(400, "classic")).toBe(ALTURA_MAXIMA_DA_LOGO)
  })

  it("valor ilegível volta ao padrão em vez de virar NaN no style", () => {
    expect(alturaDaLogo(Number.NaN, "classic")).toBe(ALTURA_PADRAO_DA_LOGO.classic)
    expect(alturaDaLogo(null, "classic")).toBe(ALTURA_PADRAO_DA_LOGO.classic)
  })
})
