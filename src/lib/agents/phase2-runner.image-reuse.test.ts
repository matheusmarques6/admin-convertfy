/**
 * reuseImagesFromPreviousRuns — reaproveitamento de imagens antigas quando
 * o agente de imagem está desligado (generate_images=false).
 *
 * A copy nova sobrescreve o content dos blocos (callback troca o objeto
 * inteiro), então a image_url anterior vive só na telemetria: runs de
 * imagem success com parsed_output { blockId, imageUrl } (avatares:
 * kind/itemIndex). O helper recupera a URL MAIS RECENTE por bloco/avatar
 * e re-grava no content.
 */
import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({})),
  createClient: vi.fn(() => ({})),
}))
vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))

import { reuseImagesFromPreviousRuns } from "./phase2-runner.service"

interface FakeState {
  blocks: Array<{ id: string; block_type: string; content: Record<string, unknown> }>
  runs: Array<{ parsed_output: Record<string, unknown>; created_at: string }>
  updates: Array<{ id: string; content: Record<string, unknown> }>
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function fakeAdmin(state: FakeState): any {
  return {
    from: (table: string) => {
      const filters: Array<{ col: string; val: unknown }> = []
      const chain: any = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters.push({ col, val })
          return chain
        },
        order: () => chain,
        limit: () => chain,
        update: (data: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => {
            state.updates.push({ id, content: data.content as Record<string, unknown> })
            return Promise.resolve({ error: null })
          },
        }),
        then: (resolve: (v: { data: unknown; error: null }) => void) => {
          const data = table === "email_blocks" ? state.blocks : state.runs
          resolve({ data, error: null })
        },
      }
      return chain
    },
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const URL_NOVA = "https://cdn/img-nova.png"
const URL_VELHA = "https://cdn/img-velha.png"
const URL_AVATAR = "https://cdn/avatar-0.png"

describe("reuseImagesFromPreviousRuns", () => {
  it("re-grava a image_url MAIS RECENTE do bloco quando o content foi limpo pela copy nova", async () => {
    const state: FakeState = {
      blocks: [{ id: "b1", block_type: "hero", content: { headline: "X" } }],
      runs: [
        // desc: primeiro = mais recente
        { parsed_output: { blockId: "b1", imageUrl: URL_NOVA }, created_at: "2" },
        { parsed_output: { blockId: "b1", imageUrl: URL_VELHA }, created_at: "1" },
      ],
      updates: [],
    }
    const reused = await reuseImagesFromPreviousRuns(fakeAdmin(state), "e1")
    expect(reused).toBe(1)
    expect(state.updates[0].id).toBe("b1")
    expect(state.updates[0].content.image_url).toBe(URL_NOVA)
    // copy preservada — merge, não replace
    expect(state.updates[0].content.headline).toBe("X")
  })

  it("bloco que JÁ tem image_url não é tocado; sem run anterior também não", async () => {
    const state: FakeState = {
      blocks: [
        { id: "b1", block_type: "hero", content: { image_url: "https://ja/tem.png" } },
        { id: "b2", block_type: "products", content: {} },
      ],
      runs: [{ parsed_output: { blockId: "b1", imageUrl: URL_VELHA }, created_at: "1" }],
      updates: [],
    }
    const reused = await reuseImagesFromPreviousRuns(fakeAdmin(state), "e1")
    expect(reused).toBe(0)
    expect(state.updates).toHaveLength(0)
  })

  it("testimonials: avatar_url reaproveitado por item (kind=testimonial_avatar + itemIndex)", async () => {
    const state: FakeState = {
      blocks: [
        {
          id: "b3",
          block_type: "testimonials",
          content: { items: [{ author: "Ana" }, { author: "Bia" }] },
        },
      ],
      runs: [
        {
          parsed_output: {
            blockId: "b3",
            kind: "testimonial_avatar",
            itemIndex: 0,
            imageUrl: URL_AVATAR,
          },
          created_at: "1",
        },
      ],
      updates: [],
    }
    const reused = await reuseImagesFromPreviousRuns(fakeAdmin(state), "e1")
    expect(reused).toBe(1)
    const items = state.updates[0].content.items as Array<Record<string, unknown>>
    expect(items[0].avatar_url).toBe(URL_AVATAR)
    expect(items[1].avatar_url).toBeUndefined()
  })
})
