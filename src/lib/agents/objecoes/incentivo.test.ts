import { describe, expect, it } from "vitest"

import { SEM_INCENTIVO, incentivoDoOutline, mecanicaDoIncentivo } from "./incentivo"

// A mecânica é DERIVADA por código. Fixá-la aqui é o que garante que ela
// acompanhe todo caminho que devolve incentivo ativo — override, tradução
// e pt-BR — em vez de só o primeiro que alguém lembrou de cobrir.
const MECANICA = mecanicaDoIncentivo(true)

const WELCOME_1 = {
  coupon_code: "BEMVINDO10",
  coupon_codes: { en: "WELCOME10", pl: "WITAJ10" },
  coupon_value: "10%",
}

describe("incentivoDoOutline (14/09)", () => {
  it("toque sem código no outline = sem incentivo, mesmo que a loja fale inglês", () => {
    expect(incentivoDoOutline({ coupon_code: null, coupon_codes: null }, "en")).toEqual(SEM_INCENTIVO)
    expect(incentivoDoOutline(null, "en")).toEqual(SEM_INCENTIVO)
    expect(incentivoDoOutline({ coupon_code: "  " }, "pt-BR")).toEqual(SEM_INCENTIVO)
  })

  it("pt-BR usa o próprio coupon_code, sem marcar tradução faltante", () => {
    expect(incentivoDoOutline(WELCOME_1, "pt-BR")).toEqual({
      existe: true, mecanica: MECANICA, codigo: "BEMVINDO10", valor: "10%", origem: "outline_pt", traducao_faltante: false,
    })
    expect(incentivoDoOutline(WELCOME_1, null).origem).toBe("outline_pt")
  })

  it("idioma com tradução cadastrada usa o código traduzido", () => {
    expect(incentivoDoOutline(WELCOME_1, "en")).toEqual({
      existe: true, mecanica: MECANICA, codigo: "WELCOME10", valor: "10%", origem: "outline_traduzido", traducao_faltante: false,
    })
    // Variante regional e caixa: `en-US` cai em `en`.
    expect(incentivoDoOutline(WELCOME_1, "en-US").codigo).toBe("WELCOME10")
    expect(incentivoDoOutline(WELCOME_1, "PL").codigo).toBe("WITAJ10")
  })

  // O sintoma da Hero Boxers: loja inglesa, cupom em português. Agora o
  // código sai (o toque TEM cupom) mas o defeito fica DECLARADO.
  it("idioma sem tradução cai no pt-BR e marca traducao_faltante", () => {
    expect(incentivoDoOutline(WELCOME_1, "da")).toEqual({
      existe: true, mecanica: MECANICA, codigo: "BEMVINDO10", valor: "10%", origem: "outline_pt", traducao_faltante: true,
    })
    // Idioma livre (texto que o formulário deixou passar) é idioma sem tradução.
    expect(incentivoDoOutline(WELCOME_1, "afrikaans").traducao_faltante).toBe(true)
  })

  it("override da loja vence tudo, inclusive um toque sem cupom no outline", () => {
    expect(incentivoDoOutline(WELCOME_1, "en", "hero15")).toEqual({
      existe: true, mecanica: MECANICA, codigo: "HERO15", valor: "10%", origem: "override_loja", traducao_faltante: false,
    })
    expect(incentivoDoOutline({ coupon_code: null }, "en", "HERO15").origem).toBe("override_loja")
    // Override em branco não é override.
    expect(incentivoDoOutline(WELCOME_1, "en", "   ").origem).toBe("outline_traduzido")
  })

  it("tradução vazia ou não-string é ignorada", () => {
    const r = incentivoDoOutline({ coupon_code: "BEMVINDO10", coupon_codes: { en: "", de: 42 } }, "de")
    expect(r.codigo).toBe("BEMVINDO10")
    expect(r.traducao_faltante).toBe(true)
  })

  it("códigos saem normalizados em maiúsculas e sem espaço", () => {
    expect(incentivoDoOutline({ coupon_code: " bemvindo10 " }, "pt-BR").codigo).toBe("BEMVINDO10")
  })
})
