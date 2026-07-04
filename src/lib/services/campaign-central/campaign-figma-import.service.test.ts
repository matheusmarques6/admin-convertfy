/**
 * Testes do import Figma por loja — falha parcial estruturada.
 * Rede/storage/sharp mockados; o que interessa é a ORQUESTRAÇÃO:
 * matching, batch único de export, isolamento de falha por loja.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const upserts: Array<Record<string, unknown>> = []
let existingRows: Array<{ store_id: string; status: string }> = []

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({ eq: () => Promise.resolve({ data: existingRows }) }),
      }),
      upsert: (payload: Record<string, unknown>) => {
        upserts.push(payload)
        return Promise.resolve({ error: null })
      },
    })),
    storage: {
      from: () => ({
        upload: vi.fn(async () => ({ error: null })),
        createSignedUrl: vi.fn(async () => ({
          data: { signedUrl: "https://signed.example/x.png" },
        })),
      }),
    },
  })),
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))

vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    metadata: async () => ({ width: 1200, height: 4800 }),
  })),
}))

const getCampaignHandoff = vi.fn()
vi.mock("./campaign-handoff.service", () => ({
  getCampaignHandoff: (...args: unknown[]) => getCampaignHandoff(...args),
}))

const figmaGetFile = vi.fn()
const figmaExportImages = vi.fn()
const isFigmaConfigured = vi.fn(() => true)
vi.mock("@/lib/integrations/figma/client", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/integrations/figma/client")
  >()
  return {
    ...actual,
    isFigmaConfigured: () => isFigmaConfigured(),
    figmaGetFile: (...args: unknown[]) => figmaGetFile(...args),
    figmaExportImages: (...args: unknown[]) => figmaExportImages(...args),
  }
})

import { importStoreEmailsFromFigma } from "./campaign-figma-import.service"
import { FigmaError } from "@/lib/integrations/figma/client"

function handoffWith(stores: Array<{ store_id: string; store_name: string }>) {
  return {
    suggestion_id: "sug-1",
    figma_link: "https://www.figma.com/design/AbCdEf123456/Campanha",
    stores: stores.map((s) => ({ ...s, country: "BR", language: "pt-BR", status: "ready", copy: null })),
  }
}

function figmaFileWith(frameNames: string[]) {
  return {
    name: "Campanha",
    document: {
      id: "0:0",
      name: "doc",
      type: "DOCUMENT",
      children: [
        {
          id: "0:1",
          name: "Page 1",
          type: "CANVAS",
          children: frameNames.map((name, i) => ({
            id: `1:${i}`,
            name,
            type: "FRAME",
          })),
        },
      ],
    },
  }
}

function okFetch() {
  return vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(1024),
  }))
}

beforeEach(() => {
  upserts.length = 0
  existingRows = []
  getCampaignHandoff.mockReset()
  figmaGetFile.mockReset()
  figmaExportImages.mockReset()
  isFigmaConfigured.mockReturnValue(true)
  vi.stubGlobal("fetch", okFetch())
})

describe("importStoreEmailsFromFigma", () => {
  it("importa todas as lojas quando os frames casam", async () => {
    getCampaignHandoff.mockResolvedValue(
      handoffWith([
        { store_id: "s1", store_name: "Clube Rock" },
        { store_id: "s2", store_name: "Loja Viva" },
      ]),
    )
    figmaGetFile.mockResolvedValue(figmaFileWith(["Clube Rock", "Loja Viva"]))
    figmaExportImages.mockResolvedValue({
      "1:0": "https://s3.example/a.png",
      "1:1": "https://s3.example/b.png",
    })

    const r = await importStoreEmailsFromFigma("sug-1", "org-1", "user-1")
    expect(figmaExportImages).toHaveBeenCalledTimes(1)
    expect(r.results.map((x) => x.status)).toEqual(["imported", "imported"])
    expect(upserts).toHaveLength(2)
    expect(upserts[0]).toMatchObject({
      source: "figma",
      status: "andamento",
      image_natural_w: 1200,
      image_natural_h: 4800,
    })
  })

  it("preserva status concluida no re-import", async () => {
    existingRows = [{ store_id: "s1", status: "concluida" }]
    getCampaignHandoff.mockResolvedValue(
      handoffWith([{ store_id: "s1", store_name: "Clube Rock" }]),
    )
    figmaGetFile.mockResolvedValue(figmaFileWith(["Clube Rock"]))
    figmaExportImages.mockResolvedValue({ "1:0": "https://s3.example/a.png" })

    await importStoreEmailsFromFigma("sug-1", "org-1", "user-1")
    expect(upserts[0].status).toBe("concluida")
  })

  it("loja sem frame sai no_frame com frame_names para diagnóstico", async () => {
    getCampaignHandoff.mockResolvedValue(
      handoffWith([
        { store_id: "s1", store_name: "Clube Rock" },
        { store_id: "s2", store_name: "Loja Fantasma" },
      ]),
    )
    figmaGetFile.mockResolvedValue(figmaFileWith(["Clube Rock", "Rascunhos"]))
    figmaExportImages.mockResolvedValue({ "1:0": "https://s3.example/a.png" })

    const r = await importStoreEmailsFromFigma("sug-1", "org-1", "user-1")
    const s2 = r.results.find((x) => x.store_id === "s2")
    expect(s2?.status).toBe("no_frame")
    expect(r.frame_names).toContain("Rascunhos")
  })

  it("frames duplicados viram ambiguous, nunca chutam", async () => {
    getCampaignHandoff.mockResolvedValue(
      handoffWith([{ store_id: "s1", store_name: "Clube Rock" }]),
    )
    figmaGetFile.mockResolvedValue(figmaFileWith(["Clube Rock", "Clube Rock"]))
    figmaExportImages.mockResolvedValue({})

    const r = await importStoreEmailsFromFigma("sug-1", "org-1", "user-1")
    expect(r.results[0].status).toBe("ambiguous")
    expect(upserts).toHaveLength(0)
  })

  it("falha do batch de export vira failed por loja, sem throw", async () => {
    getCampaignHandoff.mockResolvedValue(
      handoffWith([
        { store_id: "s1", store_name: "Clube Rock" },
        { store_id: "s2", store_name: "Loja Viva" },
      ]),
    )
    figmaGetFile.mockResolvedValue(figmaFileWith(["Clube Rock", "Loja Viva"]))
    figmaExportImages.mockRejectedValue(
      new FigmaError("Rate limit do Figma — tente de novo em alguns minutos", 429),
    )

    const r = await importStoreEmailsFromFigma("sug-1", "org-1", "user-1")
    expect(r.results.map((x) => x.status)).toEqual(["failed", "failed"])
    expect(r.results[0].error).toContain("Rate limit")
    expect(upserts).toHaveLength(0)
  })

  it("falha de download de UMA loja não derruba as outras", async () => {
    getCampaignHandoff.mockResolvedValue(
      handoffWith([
        { store_id: "s1", store_name: "Clube Rock" },
        { store_id: "s2", store_name: "Loja Viva" },
      ]),
    )
    figmaGetFile.mockResolvedValue(figmaFileWith(["Clube Rock", "Loja Viva"]))
    figmaExportImages.mockResolvedValue({
      "1:0": "https://s3.example/a.png",
      "1:1": "https://s3.example/b.png",
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("b.png")
          ? { ok: false, status: 500 }
          : { ok: true, arrayBuffer: async () => new ArrayBuffer(1024) },
      ),
    )

    const r = await importStoreEmailsFromFigma("sug-1", "org-1", "user-1")
    expect(r.results.find((x) => x.store_id === "s1")?.status).toBe("imported")
    const s2 = r.results.find((x) => x.store_id === "s2")
    expect(s2?.status).toBe("failed")
    expect(s2?.error).toContain("500")
    expect(upserts).toHaveLength(1)
  })

  it("store_ids restringe o retry a lojas específicas", async () => {
    getCampaignHandoff.mockResolvedValue(
      handoffWith([
        { store_id: "s1", store_name: "Clube Rock" },
        { store_id: "s2", store_name: "Loja Viva" },
      ]),
    )
    figmaGetFile.mockResolvedValue(figmaFileWith(["Clube Rock", "Loja Viva"]))
    figmaExportImages.mockResolvedValue({ "1:1": "https://s3.example/b.png" })

    const r = await importStoreEmailsFromFigma("sug-1", "org-1", "user-1", {
      storeIds: ["s2"],
    })
    expect(r.results).toHaveLength(1)
    expect(r.results[0].store_id).toBe("s2")
    expect(figmaExportImages).toHaveBeenCalledWith("AbCdEf123456", ["1:1"], {
      scale: 2,
      format: "png",
    })
  })

  it("sem token lança 422 acionável", async () => {
    isFigmaConfigured.mockReturnValue(false)
    await expect(
      importStoreEmailsFromFigma("sug-1", "org-1", "user-1"),
    ).rejects.toThrow(/FIGMA_PERSONAL_TOKEN/)
  })
})
