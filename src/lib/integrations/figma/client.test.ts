/**
 * Testes do parse de URL do Figma (parte pura do client).
 */

import { describe, it, expect } from "vitest"
import { parseFigmaUrl } from "./client"

describe("parseFigmaUrl", () => {
  it("extrai file key de URL /file/", () => {
    const r = parseFigmaUrl("https://www.figma.com/file/AbCdEf123456/Campanha")
    expect(r?.fileKey).toBe("AbCdEf123456")
    expect(r?.nodeId).toBeNull()
  })

  it("extrai file key de URL /design/", () => {
    const r = parseFigmaUrl(
      "https://www.figma.com/design/XyZ9876543210/Campanha-Julho?m=auto",
    )
    expect(r?.fileKey).toBe("XyZ9876543210")
  })

  it("converte node-id 1-23 para 1:23", () => {
    const r = parseFigmaUrl(
      "https://www.figma.com/design/XyZ9876543210/C?node-id=12-345",
    )
    expect(r?.nodeId).toBe("12:345")
  })

  it("URLs inválidas retornam null", () => {
    expect(parseFigmaUrl(null)).toBeNull()
    expect(parseFigmaUrl("")).toBeNull()
    expect(parseFigmaUrl("https://google.com/file/AbCdEf123456")).toBeNull()
    expect(parseFigmaUrl("https://www.figma.com/proto/short")).toBeNull()
  })
})
