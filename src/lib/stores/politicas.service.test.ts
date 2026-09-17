import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }))
vi.mock("@/lib/agents/architect/llm-invoke", () => ({ invokeAgent: vi.fn() }))

import { capturarPoliticas } from "./politicas.service"

function adminMock(storeUrl: string | null, updateErr: { code: string; message: string } | null = null) {
  const updates: unknown[] = []
  const admin = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "s1", store_url: storeUrl }, error: null }) }) }),
      update: (payload: unknown) => {
        updates.push(payload)
        return { eq: async () => ({ error: updateErr }) }
      },
    }),
  }
  return { admin: admin as never, updates }
}

const HTML_TROCA = `<html><body><h1>Refund policy</h1><p>We have a 30-day return policy, which means you have 30 days after receiving your item to request a return.</p></body></html>`
const HTML_FRETE = `<html><body><h1>Shipping</h1><p>Free shipping on orders over $50. Orders ship within 3-5 business days.</p></body></html>`

describe("capturarPoliticas", () => {
  it("lê as duas páginas, extrai por regex e grava", async () => {
    const { admin, updates } = adminMock("heroboxers.com")
    const baixar = vi.fn(async (u: URL) => ({
      ok: true as const,
      url: u.toString(),
      status: 200,
      tipo: "html",
      corpo: u.pathname.includes("refund") ? HTML_TROCA : HTML_FRETE,
    }))
    const r = await capturarPoliticas(admin, "s1", { baixar, lerComModelo: null, agora: () => new Date("2026-09-14T10:00:00Z") })
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    expect(r.politicas.troca).toMatchObject({ dias: 30, url: "https://heroboxers.com/policies/refund-policy" })
    expect(r.politicas.frete).toMatchObject({ gratis: true, gratis_condicao: "$50", prazo: "3-5 business days" })
    expect(r.politicas.fonte).toBe("pagina_publica")
    expect(r.gravado).toBe(true)
    expect(updates).toHaveLength(1)
  })

  it("404 registra o status em erros e tenta a próxima URL", async () => {
    const { admin } = adminMock("heroboxers.com")
    const baixar = vi.fn(async (u: URL) =>
      u.pathname === "/policies/refund-policy"
        ? { ok: false as const, status: 404, motivo: "A página respondeu HTTP 404." }
        : { ok: true as const, url: u.toString(), status: 200, tipo: "html", corpo: u.pathname.includes("troca") ? HTML_TROCA : HTML_FRETE },
    )
    const r = await capturarPoliticas(admin, "s1", { baixar, lerComModelo: null })
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    expect(r.politicas.erros[0]).toMatchObject({ url: "https://heroboxers.com/policies/refund-policy", status: 404 })
    expect(r.politicas.troca?.url).toBe("https://heroboxers.com/pages/trocas-e-devolucoes")
  })

  it("redirecionamento para IP interno é recusado pelo guard (nunca chega ao fetch)", async () => {
    const { admin } = adminMock("http://169.254.169.254/")
    const baixar = vi.fn()
    const r = await capturarPoliticas(admin, "s1", { baixar, lerComModelo: null })
    expect(baixar).not.toHaveBeenCalled()
    expect(r.status).toBe("nada_encontrado")
    if (r.status === "nada_encontrado") expect(r.politicas.erros.length).toBeGreaterThan(0)
  })

  it("loja sem URL devolve sem_url; coluna ausente não grava e não lança", async () => {
    expect((await capturarPoliticas(adminMock(null).admin, "s1", { lerComModelo: null })).status).toBe("sem_url")
    const { admin } = adminMock("heroboxers.com", { code: "42703", message: "column politicas does not exist" })
    const baixar = vi.fn(async (u: URL) => ({ ok: true as const, url: u.toString(), status: 200, tipo: "html", corpo: HTML_TROCA }))
    const r = await capturarPoliticas(admin, "s1", { baixar, lerComModelo: null })
    expect(r.status).toBe("ok")
    if (r.status === "ok") expect(r.gravado).toBe(false)
  })

  it("página que existe sem número: o modelo lê e cita; fonte vira llm", async () => {
    const { admin } = adminMock("heroboxers.com")
    const baixar = vi.fn(async (u: URL) => ({
      ok: true as const,
      url: u.toString(),
      status: 200,
      tipo: "html",
      corpo: u.pathname.includes("refund")
        ? `<html><body><p>Our return policy is simple. Reach out within the standard window after delivery and we sort it out.</p></body></html>`
        : `<html><body><p>Nothing about shipping here at all, just words.</p></body></html>`,
    }))
    const lerComModelo = vi.fn(async (_t: string, tipo: "troca" | "frete") => (tipo === "troca" ? { dias: 21, trecho: "within 21 days" } : null))
    const r = await capturarPoliticas(admin, "s1", { baixar, lerComModelo })
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    expect(r.politicas.troca).toMatchObject({ dias: 21, texto: "within 21 days" })
    expect(r.politicas.fonte).toBe("llm")
  })
})
