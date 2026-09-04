import { describe, it, expect } from "vitest"
import { fontesEfetivas, parseTypographyOverride } from "./fontes-efetivas"

const MARCA = {
  font_heading: "Montserrat",
  font_heading_weight: "black 900",
  font_body: "Montserrat",
  font_body_weight: "400",
}

describe("fontesEfetivas", () => {
  it("sem override, é a identidade da marca", () => {
    const f = fontesEfetivas(MARCA, null)
    expect(f).toMatchObject({
      heading: "Montserrat",
      body: "Montserrat",
      classePrincipal: "sans",
      daPeca: false,
    })
  })

  it("override vence campo a campo — o que não foi trocado segue da marca", () => {
    const f = fontesEfetivas(MARCA, {
      fontes: { heading: "Playfair Display" },
      ops: [],
    })
    expect(f.heading).toBe("Playfair Display")
    expect(f.body).toBe("Montserrat")
    expect(f.headingWeight).toBe("black 900")
    expect(f.daPeca).toBe(true)
  })

  it("a classe principal acompanha a fonte da PEÇA — é o que o guard do par lê", () => {
    expect(fontesEfetivas(MARCA, null).classePrincipal).toBe("sans")
    expect(
      fontesEfetivas(MARCA, { fontes: { heading: "Lora" }, ops: [] }).classePrincipal,
    ).toBe("serif")
  })

  it("string vazia no override não conta como escolha", () => {
    const f = fontesEfetivas(MARCA, { fontes: { heading: "   " }, ops: [] })
    expect(f.heading).toBe("Montserrat")
    expect(f.daPeca).toBe(false)
  })

  it("sem marca e sem override, cai no padrão sem quebrar", () => {
    expect(fontesEfetivas(null, null)).toMatchObject({
      heading: "Inter",
      headingWeight: "400",
      daPeca: false,
    })
  })
})

describe("parseTypographyOverride", () => {
  it("linha antiga (null) não vira override", () => {
    expect(parseTypographyOverride(null)).toBeNull()
    expect(parseTypographyOverride({})).toBeNull()
  })

  it("lê fontes e ops, tolerando o que faltar", () => {
    const o = parseTypographyOverride({
      fontes: { heading: "Sora" },
      ops: [{ item: 3, peso: 700, motivo: "x" }],
      atualizado_em: "2026-09-04T00:00:00.000Z",
    })
    expect(o?.fontes?.heading).toBe("Sora")
    expect(o?.ops).toHaveLength(1)
    expect(o?.atualizado_em).toBe("2026-09-04T00:00:00.000Z")
  })

  it("só ops, sem fontes, ainda é override", () => {
    expect(parseTypographyOverride({ ops: [{ item: 1, motivo: "x" }] })?.ops).toHaveLength(1)
  })
})
