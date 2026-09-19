import { describe, expect, it } from "vitest"
import {
  caminhoServidoNoHostDeFormularios,
  destinoNoHostDeFormularios,
  ehHostDeFormularios,
  hostDosFormularios,
  origemDosFormularios,
} from "../dominio"

describe("origemDosFormularios", () => {
  it("normaliza barra final, caixa e recusa o que não é http(s)", () => {
    expect(origemDosFormularios("https://Forms.Convertfy.me/")).toBe("https://forms.convertfy.me")
    expect(origemDosFormularios("")).toBeNull()
    expect(origemDosFormularios("   ")).toBeNull()
    expect(origemDosFormularios("forms.convertfy.me")).toBeNull()
    expect(origemDosFormularios("javascript:alert(1)")).toBeNull()
    expect(hostDosFormularios("https://forms.convertfy.me")).toBe("forms.convertfy.me")
    expect(hostDosFormularios(undefined)).toBeNull()
  })
})

describe("ehHostDeFormularios", () => {
  it("compara sem porta e sem caixa; sem domínio configurado nunca casa", () => {
    expect(ehHostDeFormularios("forms.convertfy.me:443", "forms.convertfy.me")).toBe(true)
    expect(ehHostDeFormularios("FORMS.convertfy.me", "forms.convertfy.me")).toBe(true)
    expect(ehHostDeFormularios("app.convertfy.me", "forms.convertfy.me")).toBe(false)
    expect(ehHostDeFormularios("forms.convertfy.me", null)).toBe(false)
    expect(ehHostDeFormularios(null, "forms.convertfy.me")).toBe(false)
  })
})

describe("caminhoServidoNoHostDeFormularios", () => {
  it("serve o formulário, as APIs públicas dele, o embed e os estáticos", () => {
    for (const p of [
      "/forms/diagnostico",
      "/forms/aplicacao?embed=1",
      "/api/public/forms/diagnostico",
      "/api/public/forms/diagnostico/submit",
      "/api/public/forms/diagnostico/session/save",
      "/api/script/form-embed.js",
      "/_next/static/chunks/x.js",
      "/images/logo da convertfy com escrito preto.png",
      "/fonts/inter.woff2",
      "/favicon.ico",
      "/robots.txt",
    ]) {
      expect(caminhoServidoNoHostDeFormularios(p.split("?")[0]), p).toBe(true)
    }
  })
  it("recusa tudo do admin, do portal e das APIs internas", () => {
    for (const p of [
      "/",
      "/login",
      "/admin",
      "/admin/comercial/forms",
      "/client/dashboard",
      "/api/crm/forms",
      "/api/crm/forms/x/media",
      "/api/public/onboarding",
      "/print/relatorio",
      "/formsx",
      "/forms",
      "/imagesx/a.png",
    ]) {
      expect(caminhoServidoNoHostDeFormularios(p), p).toBe(false)
    }
  })
})

describe("destinoNoHostDeFormularios", () => {
  const origem = "https://forms.convertfy.me"
  it("página de formulário no host do admin vai para o domínio próprio, com a query", () => {
    expect(
      destinoNoHostDeFormularios({
        pathname: "/forms/diagnostico",
        search: "?utm_source=ig&embed=1",
        host: "app.convertfy.me",
        origemConfigurada: origem,
      }),
    ).toBe("https://forms.convertfy.me/forms/diagnostico?utm_source=ig&embed=1")
  })
  it("não redireciona API, host já certo, nem sem domínio configurado", () => {
    expect(
      destinoNoHostDeFormularios({ pathname: "/api/public/forms/x", search: "", host: "app.convertfy.me", origemConfigurada: origem }),
    ).toBeNull()
    expect(
      destinoNoHostDeFormularios({ pathname: "/forms/x", search: "", host: "forms.convertfy.me:443", origemConfigurada: origem }),
    ).toBeNull()
    expect(
      destinoNoHostDeFormularios({ pathname: "/forms/x", search: "", host: "app.convertfy.me", origemConfigurada: null }),
    ).toBeNull()
  })
})
