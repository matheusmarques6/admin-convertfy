import { describe, expect, it } from "vitest"
import { LOGO_CONVERTFY_CLARA, LOGO_CONVERTFY_ESCURA, logoDoFormulario } from "../logo"

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
