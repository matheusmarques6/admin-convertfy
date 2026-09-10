import { describe, expect, it } from "vitest"

import {
  aplicaFaixasEBotoes,
  COLOR_PLANO_MODE_PADRAO,
  normalizarModo,
} from "./color-plano-mode"

describe("color_plano_mode", () => {
  it("nasce em shadow — a frente começa medindo", () => {
    expect(COLOR_PLANO_MODE_PADRAO).toBe("shadow")
  })

  it("valor desconhecido cai no padrão, não em on", () => {
    // O lado seguro de errar aqui é decidir e não aplicar. Cair em `on` por
    // um valor estranho no banco mudaria a aparência de e-mail de cliente
    // sem ninguém ter pedido.
    expect(normalizarModo("ligado")).toBe("shadow")
    expect(normalizarModo(null)).toBe("shadow")
    expect(normalizarModo(undefined)).toBe("shadow")
    expect(normalizarModo(1)).toBe("shadow")
  })

  it("aceita os três modos declarados", () => {
    expect(normalizarModo("off")).toBe("off")
    expect(normalizarModo("shadow")).toBe("shadow")
    expect(normalizarModo("on")).toBe("on")
  })

  it("só `on` aplica faixa e botão — shadow decide e grava", () => {
    expect(aplicaFaixasEBotoes("on")).toBe(true)
    expect(aplicaFaixasEBotoes("shadow")).toBe(false)
    expect(aplicaFaixasEBotoes("off")).toBe(false)
  })
})
