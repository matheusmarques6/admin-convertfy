import { describe, expect, it } from "vitest"
import {
  buildEvolutionMessageContent,
  buildInstanceName,
  extractConnectionUpdate,
  extractStatusUpdate,
  isValidWebhookSecret,
  jidToPhone,
  mapEvolutionStatus,
  normalizeEvolutionEvent,
  parseEvolutionEnvelope,
  phoneToJid,
  shouldSkipRemoteJid,
} from "./evolution-content"
import { shouldApplyStatus } from "./message-content"

describe("normalizeEvolutionEvent", () => {
  it("configurado MAIÚSCULO_UNDERSCORE → recebido minúsculo.pontuado", () => {
    expect(normalizeEvolutionEvent("MESSAGES_UPSERT")).toBe("messages.upsert")
    expect(normalizeEvolutionEvent("CONNECTION_UPDATE")).toBe("connection.update")
  })
  it("passthrough do formato já recebido", () => {
    expect(normalizeEvolutionEvent("messages.upsert")).toBe("messages.upsert")
    expect(normalizeEvolutionEvent(" send.message ")).toBe("send.message")
  })
})

describe("parseEvolutionEnvelope", () => {
  it("extrai event/instance/data e normaliza o event", () => {
    const env = parseEvolutionEnvelope({ event: "MESSAGES_UPSERT", instance: "cvfy_a", data: { key: {} } })
    expect(env).toEqual({ event: "messages.upsert", instance: "cvfy_a", data: { key: {} } })
  })
  it("malformado → null", () => {
    expect(parseEvolutionEnvelope(null)).toBeNull()
    expect(parseEvolutionEnvelope({ event: "x" })).toBeNull()
    expect(parseEvolutionEnvelope({ event: "x", instance: "i", data: [] })).toBeNull()
  })
})

describe("jidToPhone", () => {
  it("DM simples", () => {
    expect(jidToPhone("5531999999999@s.whatsapp.net")).toBe("5531999999999")
  })
  it("remove sufixo de device :N", () => {
    expect(jidToPhone("5531999999999:12@s.whatsapp.net")).toBe("5531999999999")
  })
  it("grupo/@lid/broadcast → null", () => {
    expect(jidToPhone("123456-789@g.us")).toBeNull()
    expect(jidToPhone("98765@lid")).toBeNull()
    expect(jidToPhone("status@broadcast")).toBeNull()
  })
  it("vazio/null → null", () => {
    expect(jidToPhone(null)).toBeNull()
    expect(jidToPhone("")).toBeNull()
  })
})

describe("phoneToJid", () => {
  it("normaliza dígitos e adiciona sufixo DM", () => {
    expect(phoneToJid("+55 (31) 99999-9999")).toBe("5531999999999@s.whatsapp.net")
  })
})

describe("shouldSkipRemoteJid", () => {
  it.each([
    ["5531999999999@s.whatsapp.net", false],
    ["123456-789@g.us", true],
    ["98765@lid", true],
    ["status@broadcast", true],
    ["12345@newsletter", true],
    [null, true],
    ["", true],
  ])("%s → skip=%s", (jid, expected) => {
    expect(shouldSkipRemoteJid(jid as string | null)).toBe(expected)
  })
})

describe("mapEvolutionStatus", () => {
  it.each([
    ["PENDING", null],
    ["SERVER_ACK", "sent"],
    ["DELIVERY_ACK", "delivered"],
    ["READ", "read"],
    ["PLAYED", "read"],
    ["ERROR", "failed"],
    ["WHATEVER", null],
    [null, null],
  ])("%s → %s", (input, expected) => {
    expect(mapEvolutionStatus(input as string | null)).toBe(expected)
  })

  it("composição com shouldApplyStatus: READ antes de DELIVERY_ACK não regride", () => {
    // READ chega primeiro → aplica read
    expect(shouldApplyStatus("sent", mapEvolutionStatus("READ")!)).toBe(true)
    // DELIVERY_ACK atrasado depois do read → NÃO regride
    expect(shouldApplyStatus("read", mapEvolutionStatus("DELIVERY_ACK")!)).toBe(false)
  })
})

describe("buildEvolutionMessageContent", () => {
  const key = { id: "MSG1", remoteJid: "5531999999999@s.whatsapp.net", fromMe: false }

  it("conversation → text", () => {
    const c = buildEvolutionMessageContent({ key, pushName: "Ana", messageTimestamp: 1750000000, message: { conversation: "oi" } })
    expect(c).toMatchObject({ contentType: "text", body: "oi", externalId: "MSG1", fromMe: false, pushName: "Ana", timestamp: 1750000000 })
  })

  it("extendedTextMessage → text", () => {
    const c = buildEvolutionMessageContent({ key, message: { extendedTextMessage: { text: "link http://x" } } })
    expect(c).toMatchObject({ contentType: "text", body: "link http://x" })
  })

  it("imageMessage com caption e base64", () => {
    const c = buildEvolutionMessageContent({
      key,
      message: { imageMessage: { caption: "olha", mimetype: "image/jpeg" }, base64: "AAAA" },
    })
    expect(c).toMatchObject({ contentType: "image", body: "olha", mediaBase64: "AAAA", mediaMime: "image/jpeg" })
  })

  it("audioMessage sem base64 (fallback fica pro caller)", () => {
    const c = buildEvolutionMessageContent({ key, message: { audioMessage: { mimetype: "audio/ogg; codecs=opus" } } })
    expect(c).toMatchObject({ contentType: "audio", body: null, mediaBase64: null, mediaMime: "audio/ogg; codecs=opus" })
  })

  it("documentMessage com fileName", () => {
    const c = buildEvolutionMessageContent({
      key,
      message: { documentMessage: { fileName: "nota.pdf", mimetype: "application/pdf" }, base64: "BBBB" },
    })
    expect(c).toMatchObject({ contentType: "document", body: "nota.pdf", mediaFilename: "nota.pdf", mediaBase64: "BBBB" })
  })

  it("videoMessage / stickerMessage", () => {
    expect(buildEvolutionMessageContent({ key, message: { videoMessage: { caption: "v" } } })).toMatchObject({
      contentType: "video",
      body: "v",
      mediaMime: "video/mp4",
    })
    expect(buildEvolutionMessageContent({ key, message: { stickerMessage: {} } })).toMatchObject({
      contentType: "sticker",
      mediaMime: "image/webp",
    })
  })

  it("locationMessage → coords + label", () => {
    const c = buildEvolutionMessageContent({
      key,
      message: { locationMessage: { degreesLatitude: -19.9, degreesLongitude: -43.9, name: "BH" } },
    })
    expect(c).toMatchObject({ contentType: "location", body: "-19.9,-43.9 · BH" })
  })

  it("contactMessage → contact", () => {
    const c = buildEvolutionMessageContent({ key, message: { contactMessage: { displayName: "João" } } })
    expect(c).toMatchObject({ contentType: "contact", body: "João" })
  })

  it("fromMe=true preservado (outbound espelhada do celular)", () => {
    const c = buildEvolutionMessageContent({
      key: { ...key, fromMe: true },
      message: { conversation: "respondi do celular" },
    })
    expect(c?.fromMe).toBe(true)
  })

  it("reactionMessage e tipos desconhecidos → null (skip v1)", () => {
    expect(buildEvolutionMessageContent({ key, message: { reactionMessage: { text: "👍" } } })).toBeNull()
    expect(buildEvolutionMessageContent({ key, message: { pollCreationMessage: {} } })).toBeNull()
  })

  it("malformado (sem key.id / sem message) → null", () => {
    expect(buildEvolutionMessageContent({ message: { conversation: "x" } })).toBeNull()
    expect(buildEvolutionMessageContent({ key })).toBeNull()
  })
})

describe("extractStatusUpdate", () => {
  it("shape data.key.id + data.status", () => {
    expect(
      extractStatusUpdate({ key: { id: "M1", remoteJid: "55@s.whatsapp.net" }, status: "DELIVERY_ACK" }),
    ).toEqual({ externalId: "M1", remoteJid: "55@s.whatsapp.net", status: "DELIVERY_ACK" })
  })
  it("shape data.keyId + data.update.status (builds antigas)", () => {
    expect(extractStatusUpdate({ keyId: "M2", update: { status: "READ" } })).toEqual({
      externalId: "M2",
      remoteJid: null,
      status: "READ",
    })
  })
  it("sem id ou status → null", () => {
    expect(extractStatusUpdate({ status: "READ" })).toBeNull()
    expect(extractStatusUpdate({ keyId: "M3" })).toBeNull()
  })
})

describe("extractConnectionUpdate", () => {
  it("open com wuid → ownerPhone", () => {
    expect(extractConnectionUpdate({ state: "open", wuid: "5531988887777:1@s.whatsapp.net", statusReason: 200 })).toEqual({
      state: "open",
      ownerPhone: "5531988887777",
      statusCode: 200,
    })
  })
  it("close com statusCode 401 (deslogado)", () => {
    expect(extractConnectionUpdate({ state: "close", statusCode: 401 })).toEqual({
      state: "close",
      ownerPhone: null,
      statusCode: 401,
    })
  })
  it("estado inválido → null", () => {
    expect(extractConnectionUpdate({ state: "weird" })).toBeNull()
  })
})

describe("isValidWebhookSecret", () => {
  it("match exato", () => {
    expect(isValidWebhookSecret("abc123", "abc123")).toBe(true)
  })
  it("mismatch de conteúdo e de tamanho", () => {
    expect(isValidWebhookSecret("abc124", "abc123")).toBe(false)
    expect(isValidWebhookSecret("abc", "abc123")).toBe(false)
  })
  it("vazio/null nunca valida", () => {
    expect(isValidWebhookSecret("", "")).toBe(false)
    expect(isValidWebhookSecret(null, "abc")).toBe(false)
    expect(isValidWebhookSecret("abc", undefined)).toBe(false)
  })
})

describe("buildInstanceName", () => {
  it("prefixo determinístico da org + sufixo aleatório de 6", () => {
    const name = buildInstanceName("a1b2c3d4-e5f6-7890-abcd-ef1234567890")
    expect(name).toMatch(/^cvfy_a1b2c3d4_[a-z0-9]{6}$/)
  })
  it("duas chamadas não colidem (sufixo aleatório)", () => {
    const a = buildInstanceName("a1b2c3d4-e5f6-7890-abcd-ef1234567890")
    const b = buildInstanceName("a1b2c3d4-e5f6-7890-abcd-ef1234567890")
    expect(a).not.toBe(b)
  })
})
