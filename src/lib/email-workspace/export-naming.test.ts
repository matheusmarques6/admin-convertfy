import { describe, expect, it } from "vitest"
import { emailExportBasename, slugify } from "./export-naming"

describe("slugify", () => {
  it("remove acentos e vira kebab-case", () => {
    expect(slugify("Boas-Vindas à Loja")).toBe("boas-vindas-a-loja")
  })

  it("colapsa caracteres especiais em hifen unico", () => {
    expect(slugify("Carrinho   Abandonado #3!")).toBe("carrinho-abandonado-3")
  })

  it("corta em 60 chars e remove hifens das pontas", () => {
    const long = "a".repeat(80)
    expect(slugify(long)).toHaveLength(60)
    expect(slugify("---abc---")).toBe("abc")
  })

  it("fallback 'email' para string vazia", () => {
    expect(slugify("!!!")).toBe("email")
  })
})

describe("emailExportBasename", () => {
  it("usa flow_type quando presente", () => {
    expect(
      emailExportBasename(
        { flow_type: "welcome", name: "Welcome Flow" },
        { number: 1, name: "Boas-vindas" },
      ),
    ).toBe("welcome-01-boas-vindas")
  })

  it("cai para o nome do flow sem flow_type", () => {
    expect(
      emailExportBasename(
        { flow_type: null, name: "Etapas de Envio" },
        { number: 12, name: "Pedido Pago" },
      ),
    ).toBe("etapas-de-envio-12-pedido-pago")
  })

  it("padZero no numero do email", () => {
    expect(
      emailExportBasename(
        { flow_type: "upsell", name: "Upsell" },
        { number: 3, name: "Upsell 3" },
      ),
    ).toBe("upsell-03-upsell-3")
  })
})
