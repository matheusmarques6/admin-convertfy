/**
 * Testes do client do Figma: parse de URL (parte pura) e integração com o
 * orçamento de exports (só /images/ adquire slot; sem slot → FigmaError 429).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const acquireExportSlot = vi.fn()
vi.mock("./export-budget", () => ({
  acquireExportSlot: (...args: unknown[]) => acquireExportSlot(...args),
}))

import { parseFigmaUrl, figmaGetFile, figmaExportImages } from "./client"

describe("parseFigmaUrl", () => {
  it("extrai file key de URL /file/", () => {
    const r = parseFigmaUrl("https://www.figma.com/file/AbCdEf123456/Campanha")
    expect(r?.fileKey).toBe("AbCdEf123456")
    expect(r?.nodeId).toBeNull()
  })

  it("extrai file key de URL /design/", () => {
    const r = parseFigmaUrl(
      "https://www.figma.com/design/XyZ9876543210/Campanha-Julho?m=auto",
    )
    expect(r?.fileKey).toBe("XyZ9876543210")
  })

  it("converte node-id 1-23 para 1:23", () => {
    const r = parseFigmaUrl(
      "https://www.figma.com/design/XyZ9876543210/C?node-id=12-345",
    )
    expect(r?.nodeId).toBe("12:345")
  })

  it("URLs inválidas retornam null", () => {
    expect(parseFigmaUrl(null)).toBeNull()
    expect(parseFigmaUrl("")).toBeNull()
    expect(parseFigmaUrl("https://google.com/file/AbCdEf123456")).toBeNull()
    expect(parseFigmaUrl("https://www.figma.com/proto/short")).toBeNull()
  })
})

describe("orçamento de exports (acquireExportSlot no figmaFetch)", () => {
  beforeEach(() => {
    process.env.FIGMA_PERSONAL_TOKEN = "test-token"
    acquireExportSlot.mockReset().mockResolvedValue({ ok: true, waitedMs: 0 })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ images: { "1:0": "https://s3.example/a.png" } }),
      })),
    )
  })

  afterEach(() => {
    delete process.env.FIGMA_PERSONAL_TOKEN
    vi.unstubAllGlobals()
  })

  it("figmaExportImages adquire 1 slot por chunk de /images/", async () => {
    // 60 ids → 2 chunks de 50 → 2 requests → 2 slots.
    const ids = Array.from({ length: 60 }, (_, i) => `1:${i}`)
    await figmaExportImages("KEY", ids)
    expect(acquireExportSlot).toHaveBeenCalledTimes(2)
  })

  it("figmaGetFile (/files/) NÃO consome orçamento", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ name: "f", document: { id: "0:0", name: "d", type: "DOCUMENT" } }),
      })),
    )
    await figmaGetFile("KEY")
    expect(acquireExportSlot).not.toHaveBeenCalled()
  })

  it("sem slot dentro da janela → FigmaError 429 sem chamar a API", async () => {
    acquireExportSlot.mockResolvedValue({ ok: false, waitedMs: 75000 })
    await expect(figmaExportImages("KEY", ["1:0"])).rejects.toMatchObject({
      name: "FigmaError",
      status: 429,
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("retry de 429 da Figma readquire slot (2 chamadas)", async () => {
    let call = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1
        if (call === 1) {
          return {
            ok: false,
            status: 429,
            headers: { get: (h: string) => (h === "Retry-After" ? "1" : null) },
            json: async () => ({}),
          }
        }
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({ images: { "1:0": "https://s3.example/a.png" } }),
        }
      }),
    )
    await figmaExportImages("KEY", ["1:0"])
    expect(acquireExportSlot).toHaveBeenCalledTimes(2)
    expect(call).toBe(2)
  })

  it("FigmaError propaga o detalhe do corpo da resposta", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        headers: { get: () => null },
        json: async () => ({ err: "Render request too large" }),
      })),
    )
    await expect(figmaExportImages("KEY", ["1:0"])).rejects.toThrow(
      /Render request too large/,
    )
  })
})
