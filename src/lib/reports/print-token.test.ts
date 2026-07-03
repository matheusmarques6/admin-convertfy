import { describe, it, expect, beforeEach, vi } from "vitest"

import { createPrintToken, verifyPrintToken } from "./print-token"

const REPORT = "f28959c0-d7d5-46c7-8c56-675dd7a4bfa1"

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv("PDF_TOKEN_SECRET", "test-secret")
})

describe("print-token — acesso do Chromium à página /print", () => {
  it("token gerado valida para o mesmo reportId", () => {
    const token = createPrintToken(REPORT)
    expect(verifyPrintToken(REPORT, token)).toBe(true)
  })

  it("NÃO valida para outro reportId (token amarrado ao report)", () => {
    const token = createPrintToken(REPORT)
    expect(verifyPrintToken("11111111-1111-4111-8111-111111111111", token)).toBe(false)
  })

  it("expira após o TTL (5 min)", () => {
    const now = Date.now()
    const token = createPrintToken(REPORT, now)
    expect(verifyPrintToken(REPORT, token, now + 4 * 60 * 1000)).toBe(true)
    expect(verifyPrintToken(REPORT, token, now + 6 * 60 * 1000)).toBe(false)
  })

  it("rejeita token adulterado (exp esticado ou assinatura trocada)", () => {
    const token = createPrintToken(REPORT)
    const [exp, sig] = token.split(".")
    expect(verifyPrintToken(REPORT, `${Number(exp) + 999999}.${sig}`)).toBe(false)
    expect(verifyPrintToken(REPORT, `${exp}.AAAA${sig.slice(4)}`)).toBe(false)
  })

  it("rejeita formatos inválidos e vazio", () => {
    expect(verifyPrintToken(REPORT, null)).toBe(false)
    expect(verifyPrintToken(REPORT, undefined)).toBe(false)
    expect(verifyPrintToken(REPORT, "")).toBe(false)
    expect(verifyPrintToken(REPORT, "sem-ponto")).toBe(false)
    expect(verifyPrintToken(REPORT, ".so-assinatura")).toBe(false)
    expect(verifyPrintToken(REPORT, "nan.assinatura")).toBe(false)
  })

  it("segredo diferente invalida (rotação de PDF_TOKEN_SECRET)", () => {
    const token = createPrintToken(REPORT)
    vi.stubEnv("PDF_TOKEN_SECRET", "outro-segredo")
    expect(verifyPrintToken(REPORT, token)).toBe(false)
  })
})
