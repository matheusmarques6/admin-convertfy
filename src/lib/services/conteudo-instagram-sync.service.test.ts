/**
 * Varredura de mídias do Instagram — o que o backfill do histórico depende:
 * o cursor tem de sobreviver ao teto de páginas, ao orçamento de tempo e a
 * uma falha no meio da paginação (senão o histórico recomeça do zero a cada
 * rodada e nunca chega ao fim do perfil).
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { pathDoNext, primeiraPaginaMedia, varrerMedia } from "./conteudo-instagram-sync.service"
import type { InstagramChannelConfig } from "./instagram-graph.service"

const config: InstagramChannelConfig = {
  instagram_business_account_id: "1784",
  access_token: "tok",
  facebook_page_id: null,
}

const NEXT = (cursor: string) => `https://graph.facebook.com/v20.0/1784/media?fields=id&limit=50&after=${cursor}`

function midia(id: string, dia: string) {
  return { id, timestamp: `${dia}T12:00:00+0000` }
}

/** Responde às chamadas na ordem dada; cada entrada é o corpo JSON. */
function mockGraph(paginas: Array<{ status?: number; body: unknown }>) {
  const chamadas: string[] = []
  const fn = vi.fn(async (url: string) => {
    chamadas.push(url)
    const p = paginas.shift() ?? { body: { data: [] } }
    return { ok: (p.status ?? 200) < 400, status: p.status ?? 200, json: async () => p.body } as unknown as Response
  })
  vi.stubGlobal("fetch", fn)
  return chamadas
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("pathDoNext", () => {
  it("guarda só o path relativo à versão da API", () => {
    expect(pathDoNext(NEXT("C1"))).toBe("/1784/media?fields=id&limit=50&after=C1")
  })

  it("devolve null sem próxima página", () => {
    expect(pathDoNext(undefined)).toBeNull()
  })
})

describe("varrerMedia", () => {
  it("para no teto de páginas e devolve o cursor da próxima", async () => {
    mockGraph([
      { body: { data: [midia("a", "2026-09-01")], paging: { next: NEXT("C1") } } },
      { body: { data: [midia("b", "2026-08-01")], paging: { next: NEXT("C2") } } },
    ])

    const res = await varrerMedia(config, { maxPaginas: 2 })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.midias.map((m) => m.id)).toEqual(["a", "b"])
    expect(res.data.paginas).toBe(2)
    expect(res.data.proxima).toBe("/1784/media?fields=id&limit=50&after=C2")
    expect(res.data.maisAntiga).toBe("2026-08-01T12:00:00+0000")
  })

  it("retoma do cursor em vez de começar do topo", async () => {
    const chamadas = mockGraph([{ body: { data: [midia("z", "2024-01-01")] } }])

    const res = await varrerMedia(config, { cursor: "/1784/media?after=C9", maxPaginas: 5 })

    expect(chamadas[0]).toContain("after=C9")
    expect(chamadas[0]).not.toContain(encodeURIComponent("children{id}"))
    expect(res.ok && res.data.proxima).toBeNull()
  })

  it("marca fim do perfil quando não há próxima página", async () => {
    mockGraph([{ body: { data: [midia("a", "2026-09-01")] } }])
    const res = await varrerMedia(config)
    expect(res.ok && res.data.proxima).toBeNull()
  })

  it("falha no meio da varredura preserva o lote e o cursor", async () => {
    mockGraph([
      { body: { data: [midia("a", "2026-09-01")], paging: { next: NEXT("C1") } } },
      { status: 500, body: { error: { message: "Please reduce the amount of data", code: 1 } } },
    ])

    const res = await varrerMedia(config, { maxPaginas: 5 })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.midias.map((m) => m.id)).toEqual(["a"])
    expect(res.data.proxima).toBe("/1784/media?fields=id&limit=50&after=C1")
  })

  it("erro logo na primeira página é erro de verdade", async () => {
    mockGraph([{ status: 400, body: { error: { message: "Token expirado", code: 190 } } }])
    const res = await varrerMedia(config)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.meta).toBe(190)
  })

  it("orçamento de tempo estourado interrompe antes da próxima página", async () => {
    const chamadas = mockGraph([{ body: { data: [midia("a", "2026-09-01")], paging: { next: NEXT("C1") } } }])

    const res = await varrerMedia(config, { maxPaginas: 10, ateMs: Date.now() - 1 })

    expect(chamadas).toHaveLength(0)
    expect(res.ok && res.data.proxima).toBe(primeiraPaginaMedia(config))
  })

  it("desdeIso corta na borda da janela e não pede mais páginas", async () => {
    const chamadas = mockGraph([
      { body: { data: [midia("a", "2026-09-01"), midia("b", "2026-06-01")], paging: { next: NEXT("C1") } } },
      { body: { data: [midia("c", "2026-01-01")] } },
    ])

    const res = await varrerMedia(config, { desdeIso: "2026-08-01", maxPaginas: 5 })

    expect(chamadas).toHaveLength(1)
    expect(res.ok && res.data.midias.map((m) => m.id)).toEqual(["a"])
    // Fim da janela pedida ≠ fim do perfil: não há cursor a guardar.
    expect(res.ok && res.data.proxima).toBeNull()
  })

  it("canal sem token não chama a Graph API", async () => {
    const chamadas = mockGraph([])
    const res = await varrerMedia({ ...config, access_token: "" })
    expect(chamadas).toHaveLength(0)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.code).toBe("config_missing")
  })
})
