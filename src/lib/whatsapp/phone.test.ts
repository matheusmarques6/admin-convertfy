import { describe, it, expect } from "vitest"
import { normalizePhone, phoneVariants } from "./phone"

describe("normalizePhone", () => {
  it("mantém número BR já com DDI", () => {
    expect(normalizePhone("5511987654321")).toBe("5511987654321")
    expect(normalizePhone("+55 11 98765-4321")).toBe("5511987654321")
  })

  it("prefixa 55 em número BR sem DDI (celular, 11 dígitos)", () => {
    expect(normalizePhone("11987654321")).toBe("5511987654321")
  })

  it("prefixa 55 em número BR sem DDI (fixo, 10 dígitos)", () => {
    expect(normalizePhone("1187654321")).toBe("551187654321")
  })

  it("descarta máscara e formatação", () => {
    expect(normalizePhone("(11) 98765-4321")).toBe("5511987654321")
    expect(normalizePhone("55 (11) 98765-4321")).toBe("5511987654321")
  })

  it("retorna null pra número curto demais", () => {
    expect(normalizePhone("12345")).toBeNull()
    expect(normalizePhone("")).toBeNull()
    expect(normalizePhone("abc")).toBeNull()
  })

  it("respeita DDI explícito com + (não prefixa 55)", () => {
    expect(normalizePhone("+1 415 555 2671")).toBe("14155552671")
    expect(normalizePhone("+351 912 345 678")).toBe("351912345678")
  })
})

describe("phoneVariants", () => {
  it("gera variante SEM o nono dígito pra celular BR de 13 dígitos", () => {
    const variants = phoneVariants("5511987654321")
    expect(variants).toContain("5511987654321")
    expect(variants).toContain("551187654321")
    expect(variants).toHaveLength(2)
  })

  it("gera variante COM o nono dígito pra celular BR de 12 dígitos (assinante 6-9)", () => {
    const variants = phoneVariants("551187654321")
    expect(variants).toContain("551187654321")
    expect(variants).toContain("5511987654321")
    expect(variants).toHaveLength(2)
  })

  it("telefone FIXO BR (assinante 2-5) NÃO ganha variante do 9", () => {
    expect(phoneVariants("551132654321")).toEqual(["551132654321"])
    expect(phoneVariants("551145678901")).toEqual(["551145678901"])
    expect(phoneVariants("551155554444")).toEqual(["551155554444"])
  })

  it("não gera variante quando o assinante de 9 dígitos não começa com 9", () => {
    expect(phoneVariants("5511887654321")).toEqual(["5511887654321"])
  })

  it("internacional não-BR não ganha variante", () => {
    expect(phoneVariants("14155552671")).toEqual(["14155552671"])
    expect(phoneVariants("351912345678")).toEqual(["351912345678"])
  })

  it("comprimento fora do padrão BR não ganha variante", () => {
    expect(phoneVariants("55119876")).toEqual(["55119876"])
  })
})
