import { describe, it, expect } from "vitest"
import { sequenciaParaJson } from "./component-assembler.service"

describe("sequenciaParaJson (a <sequencia_do_email> dos Curadores)", () => {
  it("posição com intenção da Arquitetura leva `intencao`; as outras não", () => {
    const json = JSON.parse(
      sequenciaParaJson([
        { section: "hero", label: "hero" },
        { section: "body", label: "Atacar a objeção…", intencao: "Atacar a objeção 'funciona?' de frente." },
        { section: "footer", label: "footer", intencao: "  " },
      ]),
    )
    expect(json).toEqual([
      { block_index: 0, section: "hero", componente: "hero" },
      {
        block_index: 1,
        section: "body",
        componente: "Atacar a objeção…",
        intencao: "Atacar a objeção 'funciona?' de frente.",
      },
      { block_index: 2, section: "footer", componente: "footer" },
    ])
  })
})
