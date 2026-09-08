import { describe, it, expect } from "vitest"
import { stripHeavyFields, MAX_RAW_PAYLOAD_BYTES } from "./webhook-payload"

const bigBase64 = "A".repeat(MAX_RAW_PAYLOAD_BYTES + 1_000)

describe("stripHeavyFields", () => {
  it("payload pequeno passa intacto — o cru é o que torna reprocessável", () => {
    const p = { event: "messages.upsert", data: { key: { id: "x" }, message: { conversation: "oi" } } }
    const r = stripHeavyFields(p)
    expect(r.stripped).toBe(false)
    expect(r.payload).toBe(p)
  })

  it("remove base64 quando passa do teto", () => {
    const p = { event: "messages.upsert", data: { message: { base64: bigBase64, conversation: "oi" } } }
    const r = stripHeavyFields(p)
    expect(r.stripped).toBe(true)
    expect(JSON.stringify(r.payload)).not.toContain("AAAA")
    expect((r.payload as { data: { message: { conversation: string } } }).data.message.conversation).toBe("oi")
  })

  it("remove em qualquer profundidade", () => {
    const p = { a: { b: { c: [{ jpegThumbnail: bigBase64, keep: 1 }] } } }
    const r = stripHeavyFields(p, { force: true })
    expect(r.stripped).toBe(true)
    expect(JSON.stringify(r.payload)).not.toContain("AAAA")
    expect(JSON.stringify(r.payload)).toContain('"keep":1')
  })

  it("force remove mesmo abaixo do teto", () => {
    const p = { data: { message: { base64: "abc" } } }
    const r = stripHeavyFields(p, { force: true })
    expect(r.stripped).toBe(true)
    expect(JSON.stringify(r.payload)).not.toContain("abc")
  })

  it("preserva a chave da mensagem — é o que dá idempotência", () => {
    const p = { data: { key: { id: "wamid.X", remoteJid: "5531@s.whatsapp.net" }, message: { base64: bigBase64 } } }
    const r = stripHeavyFields(p)
    const out = r.payload as { data: { key: { id: string; remoteJid: string } } }
    expect(out.data.key.id).toBe("wamid.X")
    expect(out.data.key.remoteJid).toBe("5531@s.whatsapp.net")
  })

  it("não quebra com null, arrays e primitivos", () => {
    const p = { a: null, b: [1, "x", null], c: 3 }
    const r = stripHeavyFields(p, { force: true })
    expect(r.payload).toEqual(p)
    expect(r.stripped).toBe(false)
  })

  it("reporta o tamanho original para log", () => {
    const r = stripHeavyFields({ data: { message: { base64: bigBase64 } } })
    expect(r.originalBytes).toBeGreaterThan(MAX_RAW_PAYLOAD_BYTES)
  })

  it("base64 vazio não conta como remoção", () => {
    const r = stripHeavyFields({ data: { message: { base64: "" } } }, { force: true })
    expect(r.stripped).toBe(false)
  })
})
