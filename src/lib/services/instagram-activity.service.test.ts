/**
 * Testes funcionais do client da Graph API com fetch mockado nos
 * FORMATOS REAIS de resposta da Meta — inclusive o cenário do incidente
 * "(#100) Tried accessing nonexisting field" (ID da Página salvo no
 * lugar do instagram_business_account.id).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  fetchInstagramConversations,
  fetchInstagramProfile,
  fetchInstagramRecentMedia,
  resolveInstagramAccount,
} from "./instagram-activity.service"
import type { InstagramChannelConfig } from "./instagram-graph.service"

const config: InstagramChannelConfig = {
  instagram_business_account_id: "17841400000000001",
  access_token: "EAAG-test-token",
}

type Route = { match: (url: string) => boolean; status: number; body: unknown }

let routes: Route[] = []
let calls: string[] = []

function mockGraph(list: Route[]) {
  routes = list
}

beforeEach(() => {
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url)
      const route = routes.find((r) => r.match(url))
      if (!route) throw new Error(`rota não mockada: ${url}`)
      return {
        ok: route.status < 400,
        status: route.status,
        json: async () => route.body,
      }
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Formato real de erro da Graph API
const graphError = (code: number, message: string) => ({
  error: { message, type: "OAuthException", code, fbtrace_id: "AbCdEf" },
})

describe("fetchInstagramProfile", () => {
  it("parseia o payload real do IG User node", async () => {
    mockGraph([
      {
        match: (u) => u.includes("/17841400000000001?fields="),
        status: 200,
        body: {
          username: "convertfy",
          name: "Convertfy",
          biography: "Email marketing",
          profile_picture_url: "https://scontent.cdninstagram.com/pic.jpg",
          followers_count: 1234,
          follows_count: 321,
          media_count: 87,
          id: "17841400000000001",
        },
      },
    ])
    const res = await fetchInstagramProfile(config)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.username).toBe("convertfy")
    expect(res.data.followers_count).toBe(1234)
    expect(res.data.website).toBeNull()
  })

  it("erro 190 (token) vira mensagem de reconexão", async () => {
    mockGraph([
      {
        match: () => true,
        status: 401,
        body: graphError(190, "Error validating access token: Session has expired"),
      },
    ])
    const res = await fetchInstagramProfile(config)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.code).toBe("190")
    expect(res.error.message).toContain("reconecte o canal")
  })

  it("erro #100 (nonexisting field) explica ID de Página / permissões", async () => {
    mockGraph([
      {
        match: () => true,
        status: 400,
        body: graphError(100, "(#100) Tried accessing nonexisting field (username)"),
      },
    ])
    const res = await fetchInstagramProfile(config)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.code).toBe("100")
    expect(res.error.message).toContain("Página do Facebook")
    expect(res.error.message).toContain("instagram_basic")
  })
})

describe("resolveInstagramAccount — o cenário do incidente", () => {
  it("ID de Página com Instagram vinculado → corrige pro IG ID", async () => {
    mockGraph([
      {
        match: (u) => u.includes("metadata=1"),
        status: 200,
        body: { id: "17841400000000001", metadata: { type: "page" } },
      },
      {
        match: (u) => u.includes("fields=instagram_business_account"),
        status: 200,
        body: {
          instagram_business_account: { id: "17841499999999999" },
          id: "17841400000000001",
        },
      },
    ])
    const res = await resolveInstagramAccount(config)
    expect(res.ok).toBe(true)
    expect(res.corrected).toBe(true)
    expect(res.resolved_id).toBe("17841499999999999")
    expect(res.page_id).toBe("17841400000000001")
  })

  it("ID de Página SEM Instagram acessível → erro acionável", async () => {
    mockGraph([
      {
        match: (u) => u.includes("metadata=1"),
        status: 200,
        body: { id: "17841400000000001", metadata: { type: "page" } },
      },
      {
        match: (u) => u.includes("fields=instagram_business_account"),
        status: 400,
        body: graphError(100, "(#100) Tried accessing nonexisting field (instagram_business_account)"),
      },
    ])
    const res = await resolveInstagramAccount(config)
    expect(res.ok).toBe(false)
    expect(res.error?.code).toBe("page_without_ig")
    expect(res.error?.message).toContain("instagram_manage_messages")
  })

  it("IG User de verdade → passthrough sem correção", async () => {
    mockGraph([
      {
        match: (u) => u.includes("metadata=1"),
        status: 200,
        body: { id: "17841400000000001", metadata: { type: "igprofessionalaccount" } },
      },
    ])
    const res = await resolveInstagramAccount(config)
    expect(res.ok).toBe(true)
    expect(res.corrected).toBe(false)
    expect(res.resolved_id).toBe(config.instagram_business_account_id)
    // Não deve ter feito a 2ª chamada (follow do vínculo)
    expect(calls).toHaveLength(1)
  })

  it("token inválido no probe → repassa o erro amigável", async () => {
    mockGraph([
      { match: () => true, status: 401, body: graphError(190, "Session has expired") },
    ])
    const res = await resolveInstagramAccount(config)
    expect(res.ok).toBe(false)
    expect(res.error?.code).toBe("190")
  })
})

describe("fetchInstagramRecentMedia", () => {
  it("parseia posts com comentários aninhados (formato real)", async () => {
    mockGraph([
      {
        match: (u) => u.includes("/media?"),
        status: 200,
        body: {
          data: [
            {
              id: "17900001",
              caption: "Lançamento!",
              media_type: "IMAGE",
              media_url: "https://scontent.cdninstagram.com/m.jpg",
              permalink: "https://www.instagram.com/p/abc/",
              timestamp: "2026-08-01T12:00:00+0000",
              like_count: 42,
              comments_count: 2,
              comments: {
                data: [
                  { id: "1801", text: "Top!", username: "cliente1", timestamp: "2026-08-01T13:00:00+0000" },
                  { id: "1802", text: "Quero", username: "cliente2", timestamp: "2026-08-01T14:00:00+0000" },
                ],
              },
            },
            { id: "17900002", media_type: "VIDEO", thumbnail_url: "https://cdn/t.jpg" },
          ],
          paging: { cursors: { before: "x", after: "y" } },
        },
      },
    ])
    const res = await fetchInstagramRecentMedia(config, 12)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data).toHaveLength(2)
    expect(res.data[0].comments.map((c) => c.username)).toEqual(["cliente1", "cliente2"])
    expect(res.data[1].thumbnail_url).toBe("https://cdn/t.jpg")
    expect(res.data[1].comments).toEqual([])
  })
})

describe("fetchInstagramConversations", () => {
  const conversationsBody = {
    data: [
      {
        id: "t_100",
        updated_time: "2026-08-04T10:00:00+0000",
        participants: {
          data: [
            { id: "17841400000000001", username: "convertfy" },
            { id: "660000000000001", username: "lead_maria" },
          ],
        },
        messages: {
          data: [
            {
              id: "mid.123",
              created_time: "2026-08-04T10:00:00+0000",
              message: "Oi, quero saber do plano",
              from: { id: "660000000000001", username: "lead_maria" },
            },
            {
              id: "mid.124",
              created_time: "2026-08-04T10:05:00+0000",
              message: "Claro! Te explico",
              from: { id: "17841400000000001", username: "convertfy" },
            },
          ],
        },
      },
    ],
  }

  it("parseia conversas no IG User node", async () => {
    mockGraph([
      {
        match: (u) => u.includes("/17841400000000001/conversations"),
        status: 200,
        body: conversationsBody,
      },
    ])
    const res = await fetchInstagramConversations(config)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data[0].participants).toHaveLength(2)
    expect(res.data[0].messages[0].from_id).toBe("660000000000001")
  })

  it("edge negada no IG User (#100) cai pro fallback via Página", async () => {
    mockGraph([
      {
        match: (u) => u.includes("/17841400000000001/conversations"),
        status: 400,
        body: graphError(100, "(#100) Tried accessing nonexisting field (conversations)"),
      },
      {
        match: (u) => u.includes("/17841400000000009/conversations"),
        status: 200,
        body: conversationsBody,
      },
    ])
    const res = await fetchInstagramConversations(config, { pageId: "17841400000000009" })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data).toHaveLength(1)
    expect(calls).toHaveLength(2)
  })

  it("sem pageId, o erro #100 é repassado (sem fallback cego)", async () => {
    mockGraph([
      {
        match: () => true,
        status: 400,
        body: graphError(100, "(#100) Tried accessing nonexisting field (conversations)"),
      },
    ])
    const res = await fetchInstagramConversations(config)
    expect(res.ok).toBe(false)
    expect(calls).toHaveLength(1)
  })
})
