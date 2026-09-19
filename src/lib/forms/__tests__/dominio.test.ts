import { describe, expect, it } from "vitest"
import {
  caminhoServidoNoHostDeFormularios,
  chegouPeloHostDeFormularios,
  destinoNoHostDeFormularios,
  dominioDesligado,
  ehHostDeFormularios,
  ehHostDeFormulariosPorConvencao,
  hostDosFormularios,
  origemDerivadaDoHost,
  origemDosFormularios,
  origemVigente,
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
  it("`off` desliga a variável e a convenção", () => {
    expect(dominioDesligado("off")).toBe(true)
    expect(dominioDesligado(" OFF ")).toBe(true)
    expect(dominioDesligado("")).toBe(false)
    expect(dominioDesligado(undefined)).toBe(false)
    expect(origemDosFormularios("off")).toBeNull()
    expect(origemVigente("app.convertfy.me", "off")).toBeNull()
    expect(chegouPeloHostDeFormularios("forms.convertfy.me", "off")).toBe(false)
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

describe("convenção forms.<apex>", () => {
  it("reconhece o host sem precisar da variável — o caso do domínio recém-conectado", () => {
    expect(ehHostDeFormulariosPorConvencao("forms.convertfy.me")).toBe(true)
    expect(ehHostDeFormulariosPorConvencao("FORMS.convertfy.me:443")).toBe(true)
    expect(chegouPeloHostDeFormularios("forms.convertfy.me", undefined)).toBe(true)
    expect(chegouPeloHostDeFormularios("forms.convertfy.me", "")).toBe(true)
  })
  it("não confunde admin, preview da Vercel, localhost nem IP com host de formulários", () => {
    for (const h of ["app.convertfy.me", "convertfy.me", "forms", "forms.localhost", "localhost:3000", "127.0.0.1", "forms.vercel.app", "admin-git-x.vercel.app", "formsx.convertfy.me", null]) {
      expect(ehHostDeFormulariosPorConvencao(h), String(h)).toBe(false)
      expect(chegouPeloHostDeFormularios(h, undefined), String(h)).toBe(false)
    }
  })
  it("a variável pina um host fora da convenção, e a convenção continua valendo ao lado", () => {
    expect(chegouPeloHostDeFormularios("cadastro.convertfy.me", "https://cadastro.convertfy.me")).toBe(true)
    expect(chegouPeloHostDeFormularios("forms.convertfy.me", "https://cadastro.convertfy.me")).toBe(true)
  })
})

describe("origemDerivadaDoHost / origemVigente", () => {
  it("deriva forms.<apex> do host do admin, do apex e do próprio host de formulários", () => {
    expect(origemDerivadaDoHost("app.convertfy.me")).toBe("https://forms.convertfy.me")
    expect(origemDerivadaDoHost("admin.convertfy.com:443")).toBe("https://forms.convertfy.com")
    expect(origemDerivadaDoHost("www.convertfy.me")).toBe("https://forms.convertfy.me")
    expect(origemDerivadaDoHost("convertfy.me")).toBe("https://forms.convertfy.me")
    expect(origemDerivadaDoHost("forms.convertfy.me")).toBe("https://forms.convertfy.me")
  })
  it("não deriva onde a convenção não existe", () => {
    for (const h of ["localhost:3000", "127.0.0.1", "admin-convertfy-git-x.vercel.app", "", null, undefined]) {
      expect(origemDerivadaDoHost(h), String(h)).toBeNull()
    }
  })
  it("a variável vence a convenção; sem variável a convenção deriva; `off` zera", () => {
    expect(origemVigente("app.convertfy.me", "https://cadastro.convertfy.me")).toBe("https://cadastro.convertfy.me")
    expect(origemVigente("app.convertfy.me", undefined)).toBe("https://forms.convertfy.me")
    expect(origemVigente("localhost:3000", undefined)).toBeNull()
    expect(origemVigente("app.convertfy.me", "off")).toBeNull()
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
