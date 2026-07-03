import { describe, it, expect } from "vitest"
import { createHmac } from "crypto"
import { verifyWebhookSignature, normalizePhone, WhatsAppCloudError, extractWebhookMessageText } from "./cloud-api"

const APP_SECRET = "test_app_secret_42"

function signFixture(body: string): string {
  return "sha256=" + createHmac("sha256", APP_SECRET).update(body, "utf8").digest("hex")
}

describe("verifyWebhookSignature", () => {
  it("aceita assinatura válida estilo Meta", async () => {
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] })
    const sig = signFixture(body)
    expect(await verifyWebhookSignature(body, sig, APP_SECRET)).toBe(true)
  })

  it("rejeita body adulterado", async () => {
    const original = '{"a":1}'
    const sig = signFixture(original)
    expect(await verifyWebhookSignature('{"a":2}', sig, APP_SECRET)).toBe(false)
  })

  it("rejeita secret errado", async () => {
    const body = '{"x":true}'
    const sig = signFixture(body)
    expect(await verifyWebhookSignature(body, sig, "wrong_secret")).toBe(false)
  })

  it("rejeita assinatura vazia/ausente", async () => {
    expect(await verifyWebhookSignature("{}", null, APP_SECRET)).toBe(false)
    expect(await verifyWebhookSignature("{}", undefined, APP_SECRET)).toBe(false)
    expect(await verifyWebhookSignature("{}", "", APP_SECRET)).toBe(false)
  })

  it("aceita assinatura sem prefixo sha256=", async () => {
    const body = '{"y":1}'
    const bare = signFixture(body).replace("sha256=", "")
    expect(await verifyWebhookSignature(body, bare, APP_SECRET)).toBe(true)
  })

  it("short-circuit em length mismatch (sem crash)", async () => {
    expect(await verifyWebhookSignature("{}", "sha256=deadbeef", APP_SECRET)).toBe(false)
  })
})

describe("normalizePhone", () => {
  it("remove + e formata BR", () => {
    expect(normalizePhone("+5511999998888")).toBe("5511999998888")
    expect(normalizePhone("(11) 99999-8888")).toBe("5511999998888")
  })

  it("fallback digits-only pra entrada não parseável", () => {
    expect(normalizePhone("abc")).toBe("")
  })
})

describe("WhatsAppCloudError", () => {
  it("classifica códigos da Meta", () => {
    expect(new WhatsAppCloudError({ code: 131047 }).isWindowExpired()).toBe(true)
    expect(new WhatsAppCloudError({ code: 132015 }).isTemplatePaused()).toBe(true)
    expect(new WhatsAppCloudError({ code: 132016 }).isTemplateDisabled()).toBe(true)
    expect(new WhatsAppCloudError({ code: 190 }).isAuthError()).toBe(true)
    expect(new WhatsAppCloudError({ code: 4 }).isRateLimited()).toBe(true)
    expect(new WhatsAppCloudError({ code: 80007 }).isRateLimited()).toBe(true)
    expect(new WhatsAppCloudError({ code: 131048 }).isSpamRateLimited()).toBe(true)
    expect(new WhatsAppCloudError({ code: 100 }).isAuthError()).toBe(false)
  })
})

describe("extractWebhookMessageText", () => {
  const base = { from: "5511999998888", id: "wamid.x", timestamp: "0", type: "text" }

  it("extrai texto, captions e replies interativos", () => {
    expect(extractWebhookMessageText({ ...base, text: { body: "oi" } })).toBe("oi")
    expect(
      extractWebhookMessageText({
        ...base,
        type: "image",
        image: { id: "1", mime_type: "image/jpeg", sha256: "", caption: "foto" },
      }),
    ).toBe("foto")
    expect(
      extractWebhookMessageText({
        ...base,
        type: "interactive",
        interactive: { type: "button_reply", button_reply: { id: "b1", title: "Sim" } },
      }),
    ).toBe("Sim")
  })

  it("retorna vazio pra tipos sem texto", () => {
    expect(
      extractWebhookMessageText({ ...base, type: "audio", audio: { id: "1", mime_type: "audio/ogg", sha256: "" } }),
    ).toBe("")
  })
})
