import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mcpOAuthRedirectUri, publicOrigin } from "./public-origin"

const req = (headers: Record<string, string>, origin = "https://interno.vercel.app") => ({
  headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
  nextUrl: { origin },
})

describe("publicOrigin", () => {
  const saved = { ...process.env }
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.APP_URL
  })
  afterEach(() => {
    process.env = { ...saved }
  })

  it("a variável de ambiente vence tudo", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.convertfy.me"
    expect(publicOrigin(req({ "x-forwarded-host": "preview.vercel.app" }))).toBe(
      "https://app.convertfy.me",
    )
  })

  it("normaliza barra final e ausência de protocolo", () => {
    process.env.NEXT_PUBLIC_APP_URL = "app.convertfy.me/"
    expect(publicOrigin(req({}))).toBe("https://app.convertfy.me")
  })

  it("sem env, usa os cabeçalhos do proxy", () => {
    expect(
      publicOrigin(req({ "x-forwarded-host": "app.convertfy.me", "x-forwarded-proto": "https" })),
    ).toBe("https://app.convertfy.me")
  })

  it("cadeia de proxy: vale o primeiro host", () => {
    expect(
      publicOrigin(
        req({ "x-forwarded-host": "app.convertfy.me, interno", "x-forwarded-proto": "https, http" }),
      ),
    ).toBe("https://app.convertfy.me")
  })

  it("cai para o host da requisição e, por fim, para o origin", () => {
    expect(publicOrigin(req({ host: "app.convertfy.me" }))).toBe("https://app.convertfy.me")
    expect(publicOrigin(req({}))).toBe("https://interno.vercel.app")
  })

  it("as duas pontas do OAuth produzem o MESMO redirect_uri", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.convertfy.me"
    // start (host de preview) e callback (domínio final) — o AS exige
    // que sejam idênticos, e é onde o fluxo quebrava.
    const start = mcpOAuthRedirectUri(req({ "x-forwarded-host": "preview-abc.vercel.app" }))
    const callback = mcpOAuthRedirectUri(req({ "x-forwarded-host": "app.convertfy.me" }))
    expect(start).toBe(callback)
    expect(start).toBe("https://app.convertfy.me/api/ai/mcp-oauth/callback")
  })
})
