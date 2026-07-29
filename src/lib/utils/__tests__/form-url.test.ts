import { describe, it, expect, afterEach, vi } from "vitest"

import { buildFormUrl, buildBriefingUrl, resolveAppBaseUrl } from "../form-url"
import { secureToken } from "../secure-token"

const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL

afterEach(() => {
  if (ORIGINAL_APP_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL
  vi.unstubAllGlobals()
})

describe("resolveAppBaseUrl", () => {
  it("prefere NEXT_PUBLIC_APP_URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.exemplo.com"
    expect(resolveAppBaseUrl()).toBe("https://app.exemplo.com")
  })

  it("remove barras finais", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.exemplo.com///"
    expect(resolveAppBaseUrl()).toBe("https://app.exemplo.com")
  })

  it("cai no window.location.origin quando nao ha env", () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    vi.stubGlobal("window", { location: { origin: "https://preview.local" } })
    expect(resolveAppBaseUrl()).toBe("https://preview.local")
  })

  it("cai no host de producao sem env e sem window", () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    expect(resolveAppBaseUrl()).toBe("https://admin.convertfy.com")
  })

  it("env vence o window — e o que alinha servidor e browser", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.exemplo.com"
    vi.stubGlobal("window", { location: { origin: "https://preview.local" } })
    expect(resolveAppBaseUrl()).toBe("https://app.exemplo.com")
  })
})

describe("buildFormUrl / buildBriefingUrl", () => {
  it("monta a URL do formulario", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.exemplo.com"
    expect(buildFormUrl("tok123")).toBe("https://app.exemplo.com/form/tok123")
  })

  it("monta a URL do briefing", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.exemplo.com"
    expect(buildBriefingUrl("tok123")).toBe(
      "https://app.exemplo.com/form/tok123/briefing",
    )
  })

  it("aceita base explicita e normaliza a barra final", () => {
    expect(buildFormUrl("tok123", "https://outro.com/")).toBe(
      "https://outro.com/form/tok123",
    )
  })
})

describe("secureToken", () => {
  it("respeita o tamanho pedido", () => {
    expect(secureToken(24)).toHaveLength(24)
    expect(secureToken(32)).toHaveLength(32)
    expect(secureToken(1)).toHaveLength(1)
  })

  it("devolve vazio para tamanho nao positivo", () => {
    expect(secureToken(0)).toBe("")
    expect(secureToken(-5)).toBe("")
  })

  it("usa apenas caracteres alfanumericos (URL-safe)", () => {
    for (let i = 0; i < 50; i++) {
      expect(secureToken(24)).toMatch(/^[A-Za-z0-9]+$/)
    }
  })

  it("nao repete tokens", () => {
    const seen = new Set(Array.from({ length: 500 }, () => secureToken(24)))
    expect(seen.size).toBe(500)
  })

  it("distribui sem vies grosseiro de modulo", () => {
    // Rejection sampling: nenhum caractere deve dominar. Com 62 simbolos e
    // 62_000 amostras a media e ~1000; folga larga pra nao ficar flaky.
    const counts = new Map<string, number>()
    for (const ch of secureToken(62_000)) {
      counts.set(ch, (counts.get(ch) ?? 0) + 1)
    }
    expect(counts.size).toBe(62)
    for (const n of counts.values()) {
      expect(n).toBeGreaterThan(700)
      expect(n).toBeLessThan(1300)
    }
  })
})
