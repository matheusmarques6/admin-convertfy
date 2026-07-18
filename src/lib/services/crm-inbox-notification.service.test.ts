import { describe, expect, it } from "vitest"
import {
  buildNotificationPreview,
  pickRecipients,
} from "./crm-inbox-notification.service"

describe("buildNotificationPreview", () => {
  it("texto curto passa direto", () => {
    expect(buildNotificationPreview("text", "oi, tudo bem?")).toBe("oi, tudo bem?")
  })

  it("texto longo trunca em 120 chars com reticências", () => {
    const long = "a".repeat(200)
    const preview = buildNotificationPreview("text", long)
    expect(preview.length).toBe(120)
    expect(preview.endsWith("…")).toBe(true)
  })

  it("mídia vira label fixo, ignorando caption/filename no body", () => {
    expect(buildNotificationPreview("image", "foto da nota")).toBe("📷 Imagem")
    expect(buildNotificationPreview("audio", null)).toBe("🎤 Áudio")
    expect(buildNotificationPreview("video", null)).toBe("🎬 Vídeo")
    expect(buildNotificationPreview("document", "nota.pdf")).toBe("📄 Documento")
    expect(buildNotificationPreview("sticker", null)).toBe("Figurinha")
    expect(buildNotificationPreview("location", "-19.9,-43.9")).toBe("📍 Localização")
    expect(buildNotificationPreview("contact", "João")).toBe("👤 Contato")
  })

  it("body null/vazio/whitespace → fallback genérico", () => {
    expect(buildNotificationPreview("text", null)).toBe("Nova mensagem")
    expect(buildNotificationPreview("text", "")).toBe("Nova mensagem")
    expect(buildNotificationPreview("text", "   ")).toBe("Nova mensagem")
  })

  it("tipos com corpo legível (interactive/system) usam o body", () => {
    expect(buildNotificationPreview("interactive", "Confirmar")).toBe("Confirmar")
    expect(buildNotificationPreview("system", "Reagiu com 👍")).toBe("Reagiu com 👍")
  })
})

describe("pickRecipients", () => {
  const members = ["user-a", "user-b", "user-c"]

  it("responsável ativo → só ele", () => {
    expect(pickRecipients("user-b", members)).toEqual(["user-b"])
  })

  it("responsável fora da org/inativo → broadcast (não engole a notificação)", () => {
    expect(pickRecipients("user-x", members)).toEqual(members)
  })

  it("sem responsável → broadcast para todos os ativos", () => {
    expect(pickRecipients(null, members)).toEqual(members)
  })

  it("org sem membros ativos → ninguém", () => {
    expect(pickRecipients(null, [])).toEqual([])
    expect(pickRecipients("user-a", [])).toEqual([])
  })
})
