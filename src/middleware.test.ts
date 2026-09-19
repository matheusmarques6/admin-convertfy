import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: vi.fn(async () => NextResponse.next()),
}))

import { middleware } from "./middleware"

function req(url: string, host: string) {
  return new NextRequest(url, { headers: { host } })
}

describe("middleware — domínio próprio dos formulários", () => {
  const original = process.env.NEXT_PUBLIC_FORMS_ORIGIN
  beforeEach(() => {
    process.env.NEXT_PUBLIC_FORMS_ORIGIN = "https://forms.convertfy.me"
  })
  afterEach(() => {
    process.env.NEXT_PUBLIC_FORMS_ORIGIN = original
  })

  it("no host dos formulários só o formulário existe: admin, login e API interna dão 404", async () => {
    for (const p of ["/admin/comercial/forms", "/login", "/api/crm/forms", "/"]) {
      const res = await middleware(req(`https://forms.convertfy.me${p}`, "forms.convertfy.me"))
      expect(res.status, p).toBe(404)
      expect(res.headers.get("x-robots-tag")).toBe("noindex")
    }
  })

  it("no host dos formulários a página e a API pública passam, embutíveis", async () => {
    for (const p of ["/forms/diagnostico?embed=1", "/api/public/forms/diagnostico/submit", "/api/script/form-embed.js"]) {
      const res = await middleware(req(`https://forms.convertfy.me${p}`, "forms.convertfy.me:443"))
      expect(res.status, p).toBe(200)
      expect(res.headers.get("content-security-policy")).toBe("frame-ancestors *")
    }
  })

  it("no host do admin a página de formulário vai de 308 para o domínio próprio, com a query", async () => {
    const res = await middleware(req("https://app.convertfy.me/forms/diagnostico?utm_source=ig", "app.convertfy.me"))
    expect(res.status).toBe(308)
    expect(res.headers.get("location")).toBe("https://forms.convertfy.me/forms/diagnostico?utm_source=ig")
  })

  it("no host do admin a API pública NÃO redireciona (os embeds antigos ainda apontam para cá)", async () => {
    const res = await middleware(req("https://app.convertfy.me/api/public/forms/x/submit", "app.convertfy.me"))
    expect(res.status).toBe(200)
  })

  it("sem a variável nada muda: /forms serve no host do app, embutível", async () => {
    process.env.NEXT_PUBLIC_FORMS_ORIGIN = ""
    const res = await middleware(req("https://app.convertfy.me/forms/diagnostico", "app.convertfy.me"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-security-policy")).toBe("frame-ancestors *")
    const admin = await middleware(req("https://app.convertfy.me/admin", "app.convertfy.me"))
    expect(admin.headers.get("x-frame-options")).toBe("DENY")
  })
})
