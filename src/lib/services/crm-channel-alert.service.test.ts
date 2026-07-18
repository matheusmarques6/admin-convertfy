import { describe, expect, it } from "vitest"
import { buildDisconnectReason } from "./crm-channel-alert.service"

describe("buildDisconnectReason", () => {
  it("logged_out (401) orienta a ler o QR de novo", () => {
    expect(buildDisconnectReason("logged_out")).toContain("QR code")
  })

  it("close genérico pede verificação/reconexão", () => {
    expect(buildDisconnectReason("close")).toContain("caiu")
  })

  it("connecting sinaliza reconexão em andamento", () => {
    expect(buildDisconnectReason("connecting")).toContain("reconectar")
  })

  it("unreachable inclui o detalhe do erro quando presente", () => {
    const reason = buildDisconnectReason("unreachable", "Evolution 500 em /instance/connectionState")
    expect(reason).toContain("não respondeu")
    expect(reason).toContain("Evolution 500")
  })

  it("unreachable sem detalhe não deixa parênteses vazios", () => {
    const reason = buildDisconnectReason("unreachable", null)
    expect(reason).not.toContain("(")
  })

  it("send_refused explica a recusa de envio", () => {
    expect(buildDisconnectReason("send_refused")).toContain("envio")
  })

  it("kind desconhecido tem fallback genérico com detalhe", () => {
    const reason = buildDisconnectReason("whatever", "x")
    expect(reason).toContain("problema de conexão")
    expect(reason).toContain("x")
  })
})
