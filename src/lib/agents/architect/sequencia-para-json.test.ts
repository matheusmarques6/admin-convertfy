import { describe, it, expect } from "vitest"
import {
  sequenciaParaJson,
  valorDasIntencoesPorBloco,
  valorDoOutline,
} from "./component-assembler.service"
import { BLOCO_OMITIDO_PELO_ESTRUTURADOR } from "./curador-shadow"

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

/**
 * 08/09: os dois cards de curadoria global da Entrada mostravam o dado do
 * banco enquanto o modelo recebia "(omitido…)" ou nem era consultado. Quem
 * lia a run concluía que o Curador tinha lido o outline, e que a aba
 * Arquitetura estava vazia.
 */
describe("os cards de curadoria global dizem o que foi servido", () => {
  it("com o Estruturador on, o Outline declara a omissão em vez do objetivo", () => {
    const v = valorDoOutline(true, "A pessoa acabou de assinar…")
    expect(v).toContain(BLOCO_OMITIDO_PELO_ESTRUTURADOR)
    expect(v).not.toContain("acabou de assinar")
    expect(v).toMatch(/Estruturador off/)
  })

  it("com o Estruturador off, o Outline volta a mostrar o objetivo", () => {
    expect(valorDoOutline(false, "Entregar o cupom")).toBe("Entregar o cupom")
    expect(valorDoOutline(false, "")).toBe("(sem objetivo)")
  })

  it("com o Estruturador on, o zero vira 'não consultada' + o que a aba tem", () => {
    const v = valorDasIntencoesPorBloco(true, 0, 6, 2)
    expect(v).toMatch(/não consultada/)
    expect(v).toContain("2 intenção(ões)")
    expect(v).not.toMatch(/^0 de 6/)
  })

  it("sem o número da Arquitetura, diz o essencial e não inventa contagem", () => {
    const v = valorDasIntencoesPorBloco(true, 0, 6, undefined)
    expect(v).toMatch(/não consultada/)
    expect(v).not.toMatch(/\d+ intenção/)
  })

  it("com o Estruturador off, o contador antigo permanece", () => {
    expect(valorDasIntencoesPorBloco(false, 2, 5, 2)).toBe("2 de 5 posições")
  })
})
