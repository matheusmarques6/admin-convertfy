import { describe, it, expect, vi } from "vitest"
import { loadPhotoDirections } from "./photo-directions"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))

/** Cliente falso que registra os ids pedidos e devolve o que o teste mandar. */
function fakeAdmin(
  result: { data?: unknown; error?: { message: string } },
  capture?: { ids?: string[] },
): AnyClient {
  return {
    from: () => ({
      select: () => ({
        in: (_col: string, ids: string[]) => {
          if (capture) capture.ids = ids
          return Promise.resolve({ data: null, error: null, ...result })
        },
      }),
    }),
  }
}

describe("loadPhotoDirections", () => {
  it("indexa a direção por variant_id e ignora as vazias", async () => {
    const admin = fakeAdmin({
      data: [
        { id: "v-1", photo_direction: "Still em fundo neutro." },
        { id: "v-2", photo_direction: "   " },
        { id: "v-3", photo_direction: null },
      ],
    })
    const out = await loadPhotoDirections(admin, [
      { variant_id: "v-1" },
      { variant_id: "v-2" },
      { variant_id: "v-3" },
    ])
    expect(out).toEqual({ "v-1": "Still em fundo neutro." })
  })

  it("deduplica ids — dois blocos da mesma variante são uma consulta só", async () => {
    const capture: { ids?: string[] } = {}
    const admin = fakeAdmin({ data: [] }, capture)
    await loadPhotoDirections(admin, [
      { variant_id: "v-1" },
      { variant_id: " v-1 " },
      { variant_id: "v-2" },
    ])
    expect(capture.ids).toEqual(["v-1", "v-2"])
  })

  it("sem blocos, sem blueprint ou só com variant_id vazio → não consulta", async () => {
    const capture: { ids?: string[] } = {}
    const admin = fakeAdmin({ data: [] }, capture)
    expect(await loadPhotoDirections(admin, undefined)).toEqual({})
    expect(await loadPhotoDirections(admin, [{ variant_id: null }])).toEqual({})
    expect(capture.ids).toBeUndefined()
  })

  // Fail-open: sem direção o agente compõe como sempre compôs. Derrubar a
  // geração da imagem por causa disso seria desproporcional.
  it("erro do banco → mapa vazio, sem lançar", async () => {
    const admin = fakeAdmin({ error: { message: "boom" } })
    await expect(
      loadPhotoDirections(admin, [{ variant_id: "v-1" }]),
    ).resolves.toEqual({})
  })
})
