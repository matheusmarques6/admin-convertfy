import { describe, expect, it } from "vitest"
import { chaveDeTexto, dedupePorChave } from "./texto"

describe("chaveDeTexto / dedupePorChave (09/09)", () => {
  it("normaliza acento, caixa e pontuação", () => {
    expect(chaveDeTexto("Não prometer prazo — com HORA fechada!")).toBe("nao prometer prazo com hora fechada")
  })
  it("dedupe mantém a PRIMEIRA forma; idiomas diferentes continuam distintos", () => {
    expect(dedupePorChave(["Não prometer prazo.", "nao prometer prazo", " ", "Do not promise a deadline"])).toEqual([
      "Não prometer prazo.",
      "Do not promise a deadline",
    ])
  })
})
