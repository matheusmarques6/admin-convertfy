import { describe, it, expect } from "vitest"
import { buildMessageContent, shouldApplyStatus } from "./message-content"
import type { WebhookMessage } from "./cloud-api"

const base = { from: "5511999998888", id: "wamid.x", timestamp: "1700000000" }

describe("buildMessageContent", () => {
  it("texto", () => {
    const c = buildMessageContent({ ...base, type: "text", text: { body: "olá" } })
    expect(c).toMatchObject({ contentType: "text", body: "olá", mediaId: null })
  })

  it("imagem com caption extrai media_id e mime", () => {
    const c = buildMessageContent({
      ...base,
      type: "image",
      image: { id: "media-1", mime_type: "image/jpeg", sha256: "", caption: "foto" },
    })
    expect(c).toMatchObject({ contentType: "image", body: "foto", mediaId: "media-1", mediaMime: "image/jpeg" })
  })

  it("documento usa filename como fallback do body", () => {
    const c = buildMessageContent({
      ...base,
      type: "document",
      document: { id: "media-2", filename: "nota.pdf", mime_type: "application/pdf", sha256: "" },
    })
    expect(c).toMatchObject({ contentType: "document", body: "nota.pdf", mediaFilename: "nota.pdf" })
  })

  it("location com nome", () => {
    const c = buildMessageContent({
      ...base,
      type: "location",
      location: { latitude: -23.55, longitude: -46.63, name: "Escritório" },
    })
    expect(c.contentType).toBe("location")
    expect(c.body).toBe("-23.55,-46.63 · Escritório")
  })

  it("interactive button_reply vira body legível", () => {
    const c = buildMessageContent({
      ...base,
      type: "interactive",
      interactive: { type: "button_reply", button_reply: { id: "b1", title: "Confirmar" } },
    })
    expect(c).toMatchObject({ contentType: "interactive", body: "Confirmar" })
  })

  it("reaction vira mensagem de sistema", () => {
    const c = buildMessageContent({
      ...base,
      type: "reaction",
      reaction: { message_id: "wamid.y", emoji: "👍" },
    })
    expect(c).toMatchObject({ contentType: "system", body: "Reagiu com 👍" })
  })

  it("tipo desconhecido cai em [type]", () => {
    const c = buildMessageContent({ ...base, type: "order" } as WebhookMessage)
    expect(c).toMatchObject({ contentType: "text", body: "[order]" })
  })
})

describe("shouldApplyStatus (guard de retrograde)", () => {
  it("avança na ordem queued → sent → delivered → read", () => {
    expect(shouldApplyStatus("queued", "sent")).toBe(true)
    expect(shouldApplyStatus("sent", "delivered")).toBe(true)
    expect(shouldApplyStatus("delivered", "read")).toBe(true)
  })

  it("não retrocede (webhook fora de ordem)", () => {
    expect(shouldApplyStatus("read", "delivered")).toBe(false)
    expect(shouldApplyStatus("delivered", "sent")).toBe(false)
    expect(shouldApplyStatus("read", "read")).toBe(false)
  })

  it("failed sempre vence e é terminal", () => {
    expect(shouldApplyStatus("read", "failed")).toBe(true)
    expect(shouldApplyStatus("queued", "failed")).toBe(true)
    expect(shouldApplyStatus("failed", "delivered")).toBe(false)
  })

  it("status desconhecido nunca aplica; current desconhecido aplica", () => {
    expect(shouldApplyStatus("sent", "banana")).toBe(false)
    expect(shouldApplyStatus("received", "sent")).toBe(true)
    expect(shouldApplyStatus(null, "sent")).toBe(true)
  })
})
