/**
 * Testes funcionais do client da Graph API com fetch mockado nos
 * FORMATOS REAIS de resposta da Meta — inclusive o cenário do incidente
 * "(#100) Tried accessing nonexisting field" (ID da Página salvo no
 * lugar do instagram_business_account.id).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  discoverPageForIgUser,
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
let authHeaders: string[] = []

function mockGraph(list: Route[]) {
  routes = list
}

beforeEach(() => {
  calls = []
  authHeaders = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      calls.push(url)
      authHeaders.push(init?.headers?.Authorization ?? "")
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

describe("fetchInstagramConversations (duas fases)", () => {
  // Fase 1: lista LEVE (sem mensagens aninhadas). Fase 2: mensagens por
  // conversa. Formatos reais da Meta.
  const listBody = {
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
      },
    ],
  }
  const messagesBody = {
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
  }

  it("lista leve + mensagens por conversa (sem Página conhecida)", async () => {
    mockGraph([
      {
        match: (u) => u.includes("/17841400000000001/conversations"),
        status: 200,
        body: listBody,
      },
      { match: (u) => u.includes("/t_100/messages"), status: 200, body: messagesBody },
    ])
    const res = await fetchInstagramConversations(config)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data[0].participants).toHaveLength(2)
    expect(res.data[0].messages).toHaveLength(2)
    expect(res.data[0].messages[0].from_id).toBe("660000000000001")
    // A lista NÃO pede mensagens aninhadas (era o que estourava o #1).
    expect(calls[0]).not.toContain("messages.limit")
    expect(calls).toHaveLength(2)
  })

  it("com Página conhecida, ela é o PRIMEIRO caminho e usa o TOKEN DE PÁGINA", async () => {
    mockGraph([
      {
        match: (u) => u.includes("/17841400000000009/conversations"),
        status: 200,
        body: listBody,
      },
      { match: (u) => u.includes("/t_100/messages"), status: 200, body: messagesBody },
    ])
    const res = await fetchInstagramConversations(config, {
      pageId: "17841400000000009",
      pageToken: "PAGE-token-abc",
    })
    expect(res.ok).toBe(true)
    expect(calls[0]).toContain("/17841400000000009/conversations")
    // Bearer da PÁGINA nas duas fases (o do canal levava 190).
    expect(authHeaders[0]).toBe("Bearer PAGE-token-abc")
    expect(authHeaders[1]).toBe("Bearer PAGE-token-abc")
  })

  it("'(#1) reduce the amount of data' na LISTA → retry com metade do limit", async () => {
    mockGraph([
      {
        match: (u) => u.includes("/conversations") && u.includes("limit=20"),
        status: 400,
        body: graphError(1, "Please reduce the amount of data you're asking for, then retry your request"),
      },
      {
        match: (u) => u.includes("/conversations") && u.includes("limit=10"),
        status: 200,
        body: listBody,
      },
      { match: (u) => u.includes("/t_100/messages"), status: 200, body: messagesBody },
    ])
    const res = await fetchInstagramConversations(config)
    expect(res.ok).toBe(true)
    expect(calls[1]).toContain("limit=10")
  })

  it("'(#1)' nas MENSAGENS → retry menor; falha persistente não derruba o todo", async () => {
    mockGraph([
      {
        match: (u) => u.includes("/conversations"),
        status: 200,
        body: {
          data: [
            ...listBody.data,
            { id: "t_200", participants: { data: [{ id: "77" }] } },
          ],
        },
      },
      {
        match: (u) => u.includes("/t_100/messages") && u.includes("limit=25"),
        status: 400,
        body: graphError(1, "Please reduce the amount of data you're asking for"),
      },
      {
        match: (u) => u.includes("/t_100/messages") && u.includes("limit=12"),
        status: 200,
        body: messagesBody,
      },
      // t_200 falha de vez (erro não-#1) → entra sem mensagens.
      {
        match: (u) => u.includes("/t_200/messages"),
        status: 400,
        body: graphError(100, "(#100) whatever"),
      },
    ])
    const res = await fetchInstagramConversations(config)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.find((c) => c.id === "t_100")?.messages).toHaveLength(2)
    expect(res.data.find((c) => c.id === "t_200")?.messages).toHaveLength(0)
  })

  it("190 'must be called with a Page Access Token' NÃO vira 'expirado'", async () => {
    mockGraph([
      {
        match: () => true,
        status: 400,
        body: graphError(190, "(#190) This method must be called with a Page Access Token"),
      },
    ])
    const res = await fetchInstagramConversations(config)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.message).not.toContain("expirado")
    expect(res.error.message).toContain("token de PÁGINA")
  })

  it("Página nega (#3) → fallback pro IG User", async () => {
    mockGraph([
      {
        match: (u) => u.includes("/17841400000000009/conversations"),
        status: 400,
        body: graphError(3, "(#3) Application does not have the capability to make this API call."),
      },
      {
        match: (u) => u.includes("/17841400000000001/conversations"),
        status: 200,
        body: listBody,
      },
      { match: (u) => u.includes("/t_100/messages"), status: 200, body: messagesBody },
    ])
    const res = await fetchInstagramConversations(config, { pageId: "17841400000000009" })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data).toHaveLength(1)
  })

  it("sem pageId e erro #3 → mensagem acionável (capability do app)", async () => {
    mockGraph([
      {
        match: () => true,
        status: 400,
        body: graphError(3, "(#3) Application does not have the capability to make this API call."),
      },
    ])
    const res = await fetchInstagramConversations(config)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.code).toBe("3")
    expect(res.error.message).toContain("Messenger")
    expect(res.error.message).toContain("instagram_manage_messages")
    expect(calls).toHaveLength(1)
  })
})

describe("discoverPageForIgUser", () => {
  it("acha a Página do canal e traz o TOKEN de Página junto", async () => {
    mockGraph([
      {
        match: (u) => u.includes("/me/accounts"),
        status: 200,
        body: {
          data: [
            { id: "111", name: "Outra Página" },
            {
              id: "17841400000000009",
              name: "Convertfy",
              access_token: "PAGE-token-abc",
              instagram_business_account: { id: "17841400000000001" },
            },
          ],
        },
      },
    ])
    expect(await discoverPageForIgUser(config)).toEqual({
      id: "17841400000000009",
      access_token: "PAGE-token-abc",
    })
    // O request pede o access_token da Página explicitamente.
    expect(calls[0]).toContain("access_token")
  })

  it("sem Página correspondente devolve null", async () => {
    mockGraph([
      {
        match: (u) => u.includes("/me/accounts"),
        status: 200,
        body: { data: [{ id: "111", instagram_business_account: { id: "999" } }] },
      },
    ])
    expect(await discoverPageForIgUser(config)).toBeNull()
  })

  it("token sem pages_show_list (erro) devolve null sem lançar", async () => {
    mockGraph([
      { match: () => true, status: 403, body: graphError(200, "Permissions error") },
    ])
    expect(await discoverPageForIgUser(config)).toBeNull()
  })
})
