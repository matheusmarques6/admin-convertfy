/**
 * Testes do ENVIO do Instagram, com fetch mockado nos formatos reais de
 * resposta da Meta.
 *
 * O caso central é o do incidente: token de System User no node do IG
 * User devolve 190 "must be called with a Page Access Token" — válido
 * para perfil e mídias, recusado para mensagem. O envio tem de tentar a
 * PÁGINA com o token DE PÁGINA primeiro, e ainda assim manter o caminho
 * antigo como fallback (apps diferentes recusam caminhos diferentes).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  buildSendAttempts,
  buildTokenAttempts,
  replyToInstagramComment,
  sendInstagramMessage,
  subscribePageToWebhooks,
  type InstagramChannelConfig,
} from "./instagram-graph.service"

const IG_ID = "17841400000000001"
const PAGE_ID = "593971037127919"

const full: InstagramChannelConfig = {
  instagram_business_account_id: IG_ID,
  access_token: "EAAG-system-user",
  facebook_page_id: PAGE_ID,
  facebook_page_token: "EAAG-page-token",
}

const legacy: InstagramChannelConfig = {
  instagram_business_account_id: IG_ID,
  access_token: "EAAG-system-user",
}

type Route = { match: (url: string) => boolean; status: number; body: unknown }

let routes: Route[] = []
let calls: Array<{ url: string; auth: string }> = []

beforeEach(() => {
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      calls.push({ url, auth: init?.headers?.Authorization ?? "" })
      const route = routes.find((r) => r.match(url))
      if (!route) throw new Error(`rota não mockada: ${url}`)
      return { ok: route.status < 400, status: route.status, json: async () => route.body }
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

const graphError = (code: number, message: string) => ({
  error: { message, type: "OAuthException", code, fbtrace_id: "AbCdEf" },
})

const textMsg = { to: "9876543210", type: "text" as const, text: { body: "oi" } }

describe("buildSendAttempts", () => {
  it("põe a Página na frente quando há id e token dela", () => {
    expect(buildSendAttempts(full)).toEqual([
      { nodeId: PAGE_ID, token: "EAAG-page-token", via: "page" },
      { nodeId: IG_ID, token: "EAAG-system-user", via: "ig_user" },
    ])
  })

  it("canal antigo (sem Página) mantém o caminho do IG User", () => {
    expect(buildSendAttempts(legacy)).toEqual([
      { nodeId: IG_ID, token: "EAAG-system-user", via: "ig_user" },
    ])
  })

  it("page_id sem token de Página não vira tentativa — a edge recusaria", () => {
    const semToken = { ...legacy, facebook_page_id: PAGE_ID }
    expect(buildSendAttempts(semToken).map((a) => a.via)).toEqual(["ig_user"])
  })

  it("sem credencial nenhuma não há o que tentar", () => {
    expect(buildSendAttempts({ instagram_business_account_id: "", access_token: "" })).toEqual([])
  })
})

describe("buildTokenAttempts", () => {
  it("token de Página primeiro, sem repetir quando são o mesmo", () => {
    expect(buildTokenAttempts(full)).toEqual(["EAAG-page-token", "EAAG-system-user"])
    expect(
      buildTokenAttempts({ ...full, access_token: "EAAG-page-token" }),
    ).toEqual(["EAAG-page-token"])
  })
})

describe("sendInstagramMessage", () => {
  it("envia pela Página com o token de Página", async () => {
    routes = [
      {
        match: (u) => u.includes(`/${PAGE_ID}/messages`),
        status: 200,
        body: { recipient_id: "9876543210", message_id: "mid.ABC" },
      },
    ]
    const res = await sendInstagramMessage(full, textMsg)
    expect(res.success).toBe(true)
    expect(res.message_id).toBe("mid.ABC")
    expect(calls).toHaveLength(1)
    expect(calls[0].auth).toBe("Bearer EAAG-page-token")
  })

  it("Página recusada cai no IG User em vez de falhar de primeira", async () => {
    routes = [
      {
        match: (u) => u.includes(`/${PAGE_ID}/messages`),
        status: 400,
        body: graphError(3, "Application does not have the capability"),
      },
      {
        match: (u) => u.includes(`/${IG_ID}/messages`),
        status: 200,
        body: { message_id: "mid.XYZ" },
      },
    ]
    const res = await sendInstagramMessage(full, textMsg)
    expect(res.success).toBe(true)
    expect(res.message_id).toBe("mid.XYZ")
    expect(calls.map((c) => c.auth)).toEqual([
      "Bearer EAAG-page-token",
      "Bearer EAAG-system-user",
    ])
  })

  it("o 190 do incidente vira instrução, não 'token expirado'", async () => {
    routes = [
      {
        match: (u) => u.includes(`/${IG_ID}/messages`),
        status: 400,
        body: graphError(190, "This call must be called with a Page Access Token."),
      },
    ]
    const res = await sendInstagramMessage(legacy, textMsg)
    expect(res.success).toBe(false)
    expect(res.error?.code).toBe("190")
    expect(res.error?.message).toMatch(/TOKEN DE PÁGINA/i)
    expect(res.error?.message).toMatch(/Ativar recebimento/)
  })

  it("fora da janela de 24h explica a janela", async () => {
    routes = [
      {
        match: (u) => u.includes(`/${PAGE_ID}/messages`),
        status: 400,
        body: graphError(10, "Message failed to send because more than 24 hours have passed"),
      },
      {
        match: (u) => u.includes(`/${IG_ID}/messages`),
        status: 400,
        body: graphError(10, "Message failed to send because more than 24 hours have passed"),
      },
    ]
    const res = await sendInstagramMessage(full, textMsg)
    expect(res.success).toBe(false)
    expect(res.error?.message).toMatch(/janela de 24h/i)
  })

  it("preserva o PRIMEIRO erro quando todos os caminhos falham", async () => {
    routes = [
      { match: (u) => u.includes(`/${PAGE_ID}/messages`), status: 400, body: graphError(3, "no capability") },
      { match: (u) => u.includes(`/${IG_ID}/messages`), status: 400, body: graphError(100, "nonexisting field") },
    ]
    const res = await sendInstagramMessage(full, textMsg)
    expect(res.success).toBe(false)
    expect(res.error?.code).toBe("3")
  })

  it("sem credenciais nem chama a Meta", async () => {
    routes = []
    const res = await sendInstagramMessage(
      { instagram_business_account_id: "", access_token: "" },
      textMsg,
    )
    expect(res.success).toBe(false)
    expect(res.error?.code).toBe("config_missing")
    expect(calls).toHaveLength(0)
  })
})

describe("replyToInstagramComment", () => {
  it("tenta o token de Página antes do token do canal", async () => {
    routes = [
      { match: (u) => u.includes("/comment-1/replies"), status: 200, body: { id: "reply-1" } },
    ]
    const res = await replyToInstagramComment(full, "comment-1", "obrigado!")
    expect(res.success).toBe(true)
    expect(calls[0].auth).toBe("Bearer EAAG-page-token")
  })
})

describe("subscribePageToWebhooks", () => {
  it("assina a Página e devolve os campos", async () => {
    routes = [
      { match: (u) => u.includes(`/${PAGE_ID}/subscribed_apps`), status: 200, body: { success: true } },
    ]
    const res = await subscribePageToWebhooks(PAGE_ID, "EAAG-page-token")
    expect(res.success).toBe(true)
    expect(res.fields).toContain("messages")
    expect(calls[0].url).toContain("subscribed_fields=messages")
  })

  it("campo recusado pelo app cai no conjunto mínimo", async () => {
    routes = [
      {
        match: (u) => u.includes("subscribed_fields=messages,messaging_postbacks,messaging_seen"),
        status: 400,
        body: graphError(100, "(#100) Invalid subscribed_fields"),
      },
      {
        match: (u) => u.includes("subscribed_fields=messages,messaging_postbacks"),
        status: 200,
        body: { success: true },
      },
    ]
    const res = await subscribePageToWebhooks(PAGE_ID, "EAAG-page-token")
    expect(res.success).toBe(true)
    expect(res.fields).toEqual(["messages", "messaging_postbacks"])
    expect(calls).toHaveLength(2)
  })

  it("sem Página/token não chama a Meta e explica o que falta", async () => {
    routes = []
    const res = await subscribePageToWebhooks("", "")
    expect(res.success).toBe(false)
    expect(res.error?.message).toMatch(/pages_show_list/)
    expect(calls).toHaveLength(0)
  })
})
