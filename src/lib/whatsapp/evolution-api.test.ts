import { afterEach, describe, expect, it, vi } from "vitest"
import {
  EvolutionAPI,
  EvolutionAPIError,
  parseConnectResponse,
  parseConnectionState,
  parseCreateInstanceResponse,
  parseSendResponse,
  sendJitterMs,
  verifyEvolutionApiKey,
} from "./evolution-api"

// ─── Parsers puros (variações de build) ───────────────────────────

describe("parseCreateInstanceResponse", () => {
  it("hash como string (v2 atual)", () => {
    const r = parseCreateInstanceResponse({ hash: "tok123", qrcode: { base64: "data:image/png;base64,x" } }, "i1")
    expect(r).toEqual({ instanceName: "i1", instanceApikey: "tok123", qrBase64: "data:image/png;base64,x", pairingCode: null })
  })
  it("hash.apikey (builds antigas)", () => {
    const r = parseCreateInstanceResponse({ hash: { apikey: "tok456" } }, "i1")
    expect(r.instanceApikey).toBe("tok456")
  })
  it("sem hash → null token, sem quebrar", () => {
    const r = parseCreateInstanceResponse({}, "i1")
    expect(r).toEqual({ instanceName: "i1", instanceApikey: null, qrBase64: null, pairingCode: null })
  })
})

describe("parseConnectionState", () => {
  it("shape aninhado { instance: { state } }", () => {
    expect(parseConnectionState({ instance: { state: "open" } })).toBe("open")
  })
  it("shape flat { state }", () => {
    expect(parseConnectionState({ state: "connecting" })).toBe("connecting")
  })
  it("desconhecido → unknown", () => {
    expect(parseConnectionState({})).toBe("unknown")
    expect(parseConnectionState({ state: "weird" })).toBe("unknown")
  })
})

describe("parseConnectResponse", () => {
  it("base64 no topo", () => {
    expect(parseConnectResponse({ base64: "data:x", pairingCode: "AB-12" })).toEqual({
      qrBase64: "data:x",
      pairingCode: "AB-12",
    })
  })
  it("base64 aninhado em qrcode", () => {
    expect(parseConnectResponse({ qrcode: { base64: "data:y" } })).toEqual({ qrBase64: "data:y", pairingCode: null })
  })
})

describe("parseSendResponse", () => {
  it("key no topo", () => {
    expect(parseSendResponse({ key: { id: "M1", remoteJid: "55@s.whatsapp.net" } })).toEqual({
      externalId: "M1",
      remoteJid: "55@s.whatsapp.net",
    })
  })
  it("sem key.id → null", () => {
    expect(parseSendResponse({ status: "ok" })).toBeNull()
  })
})

describe("sendJitterMs", () => {
  it("dentro do range default", () => {
    for (let i = 0; i < 50; i++) {
      const v = sendJitterMs()
      expect(v).toBeGreaterThanOrEqual(800)
      expect(v).toBeLessThanOrEqual(2500)
    }
  })
})

// ─── Client (fetch mockado) ───────────────────────────────────────

function makeClient() {
  return new EvolutionAPI({ baseUrl: "https://evo.test", apiKey: "global-key", instanceName: "cvfy_org_abc123" })
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("EvolutionAPI client", () => {
  it("manda header apikey e monta URL com instanceName", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { instance: { state: "open" } }))
    vi.stubGlobal("fetch", fetchMock)

    const state = await makeClient().connectionState()

    expect(state).toBe("open")
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://evo.test/instance/connectionState/cvfy_org_abc123")
    expect((init.headers as Record<string, string>).apikey).toBe("global-key")
  })

  it("401 vira EvolutionAPIError.isAuthError e NÃO re-tenta", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { message: "Unauthorized" }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(makeClient().connectionState()).rejects.toSatisfy((e: unknown) => {
      return e instanceof EvolutionAPIError && e.isAuthError()
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("5xx re-tenta até 3 tentativas", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(502, { message: "bad gateway" }))
      .mockResolvedValueOnce(jsonResponse(200, { instance: { state: "close" } }))
    vi.stubGlobal("fetch", fetchMock)

    const state = await makeClient().connectionState()
    expect(state).toBe("close")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  }, 20_000)

  it("erro 'not connected' é detectado pela taxonomia", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(400, { message: "Instance not connected" }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(makeClient().connect()).rejects.toSatisfy((e: unknown) => {
      return e instanceof EvolutionAPIError && e.isNotConnected() && !e.isAuthError()
    })
  })

  it("setWebhook: envelope 400 → fallback flat", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(400, { message: "bad shape" }))
      .mockResolvedValueOnce(jsonResponse(200, {}))
    vi.stubGlobal("fetch", fetchMock)

    await makeClient().setWebhook("https://app.test/api/webhooks/evolution/sec")

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const first = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    const second = JSON.parse(fetchMock.mock.calls[1][1].body as string)
    expect(first.webhook).toBeDefined()
    expect(first.webhook.base64).toBe(true)
    expect(second.webhook).toBeUndefined()
    expect(second.url).toBe("https://app.test/api/webhooks/evolution/sec")
  })

  it("sendText devolve externalId do key.id (jitter zerado no teste)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { key: { id: "SENT1", remoteJid: "55@s.whatsapp.net" } }))
    vi.stubGlobal("fetch", fetchMock)
    // Zera o jitter pra não segurar o teste
    vi.spyOn(Math, "random").mockReturnValue(0)

    const r = await makeClient().sendText("5531999999999", "oi", 0)

    expect(r).toEqual({ externalId: "SENT1", remoteJid: "55@s.whatsapp.net" })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body).toMatchObject({ number: "5531999999999", text: "oi" })
    expect(body.delay).toBeUndefined()
  }, 10_000)

  it("send sem key.id na resposta → EvolutionAPIError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { status: "PENDING" }))
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(Math, "random").mockReturnValue(0)

    await expect(makeClient().sendText("5531999999999", "oi", 0)).rejects.toBeInstanceOf(EvolutionAPIError)
  }, 10_000)
})

// ─── verifyEvolutionApiKey (prova real, sem retry) ────────────────

describe("verifyEvolutionApiKey", () => {
  it("200 → ok:true, GET fetchInstances com header apikey", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, []))
    vi.stubGlobal("fetch", fetchMock)

    const r = await verifyEvolutionApiKey("https://evo.test/", "candidate-key")

    expect(r).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://evo.test/instance/fetchInstances")
    expect((init.headers as Record<string, string>).apikey).toBe("candidate-key")
  })

  it("401 → ok:false (key inválida), sem retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { message: "Unauthorized" }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(verifyEvolutionApiKey("https://evo.test", "bad")).resolves.toEqual({ ok: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("403 → ok:false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, {})))
    await expect(verifyEvolutionApiKey("https://evo.test", "bad")).resolves.toEqual({ ok: false })
  })

  it("500 → lança EvolutionAPIError 'Evolution inacessível' (sem retry)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { message: "boom" }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(verifyEvolutionApiKey("https://evo.test", "k")).rejects.toSatisfy((e: unknown) => {
      return e instanceof EvolutionAPIError && e.status === 500 && e.message.includes("Evolution inacessível")
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("erro de rede → lança EvolutionAPIError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")))
    await expect(verifyEvolutionApiKey("https://evo.test", "k")).rejects.toBeInstanceOf(EvolutionAPIError)
  })
})
