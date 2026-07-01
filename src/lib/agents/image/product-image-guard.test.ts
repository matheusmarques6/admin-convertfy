import { describe, it, expect, vi, afterEach } from "vitest"

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))

import { isUsableProductImage } from "./product-image-guard"

function mockResponse(status: number, contentType: string | null): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (k: string) => (k.toLowerCase() === "content-type" ? contentType : null),
    },
  } as unknown as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("isUsableProductImage", () => {
  it("reprova URL ausente ou não-http", async () => {
    expect((await isUsableProductImage(null)).usable).toBe(false)
    expect((await isUsableProductImage("")).usable).toBe(false)
    expect((await isUsableProductImage("ftp://x/y.png")).reason).toBe("missing_or_invalid_url")
  })

  it("aprova HEAD 200 com content-type image/*", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(200, "image/png")))
    const r = await isUsableProductImage("https://cdn/x.png")
    expect(r.usable).toBe(true)
    expect(r.contentType).toBe("image/png")
  })

  it("reprova HTTP 403 (caso real do Shopify CDN restrito)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(403, "text/plain")))
    const r = await isUsableProductImage("https://cdn/x.png")
    expect(r.usable).toBe(false)
    expect(r.reason).toBe("http_403")
    expect(r.status).toBe(403)
  })

  it("reprova 200 que não é imagem (ex.: HTML)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(200, "text/html")))
    const r = await isUsableProductImage("https://cdn/x.png")
    expect(r.usable).toBe(false)
    expect(r.reason).toBe("not_image")
  })

  it("faz fallback GET range quando HEAD não é suportado (405)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(405, null))
      .mockResolvedValueOnce(mockResponse(206, "image/jpeg"))
    vi.stubGlobal("fetch", fetchMock)
    const r = await isUsableProductImage("https://cdn/x.jpg")
    expect(r.usable).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe("GET")
  })

  it("reprova timeout (AbortError)", async () => {
    const err = new Error("aborted")
    err.name = "AbortError"
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(err))
    const r = await isUsableProductImage("https://cdn/x.png", 10)
    expect(r.usable).toBe(false)
    expect(r.reason).toBe("timeout")
  })

  it("reprova erro de fetch genérico", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")))
    const r = await isUsableProductImage("https://cdn/x.png")
    expect(r.usable).toBe(false)
    expect(r.reason).toBe("fetch_error")
  })

  it("rasterOnly: reprova image/svg+xml (modelo de imagem não baixa/decodifica SVG)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(200, "image/svg+xml")))
    const r = await isUsableProductImage("https://cdn/logo.svg", undefined, {
      rasterOnly: true,
    })
    expect(r.usable).toBe(false)
    expect(r.reason).toBe("svg_not_raster")
  })

  it("sem rasterOnly: image/svg+xml passa (default inalterado)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(200, "image/svg+xml")))
    const r = await isUsableProductImage("https://cdn/logo.svg")
    expect(r.usable).toBe(true)
  })
})
