/**
 * O rascunho de overrides da execução manual.
 *
 * O que estes casos guardam: desativar e pinar são EXCLUSIVOS na tela. Os
 * dois impedem o nó de rodar, e o `gateFor` faz o pin vencer quando os dois
 * estão ligados — mas mostrar os dois selos ao mesmo tempo faria o operador
 * não saber qual valeu, e a régua de degradação lê justamente a diferença
 * (desativar é lacuna; pinar é "a saída gravada serve").
 */

import { describe, it, expect } from "vitest"
import {
  RASCUNHO_VAZIO,
  alternarDesativado,
  alternarParada,
  alternarPin,
  projetarRascunho,
  rascunhoVazio,
} from "./execucao-manual"
import { validarOverrides } from "@/lib/agents/execucao/overrides"

describe("alternarDesativado", () => {
  it("liga, desliga e volta ao rascunho vazio", () => {
    const um = alternarDesativado(RASCUNHO_VAZIO, "typography")
    expect(um.disabled).toEqual(["typography"])
    const zero = alternarDesativado(um, "typography")
    // Não basta a lista ficar vazia: `{disabled: []}` faria a barra de
    // disparo aparecer com "sem overrides".
    expect(rascunhoVazio(zero)).toBe(true)
  })

  it("desativar TIRA o pin do mesmo nó", () => {
    const pinado = alternarPin(RASCUNHO_VAZIO, "copy")
    const desativado = alternarDesativado(pinado, "copy")
    expect(desativado.disabled).toEqual(["copy"])
    expect(desativado.pinned ?? {}).toEqual({})
  })
})

describe("alternarPin", () => {
  it("liga, desliga e volta ao rascunho vazio", () => {
    const um = alternarPin(RASCUNHO_VAZIO, "blueprint")
    expect(um.pinned).toEqual({ blueprint: { kind: "reusar" } })
    expect(rascunhoVazio(alternarPin(um, "blueprint"))).toBe(true)
  })

  it("pinar TIRA a desativação do mesmo nó — e é o que destrava a recusa", () => {
    // Desativar o Blueprint é recusado; pinar é aceito. Se o pin não
    // limpasse a desativação, o clique em "Pinar" deixaria o nó nas duas
    // listas e a régua continuaria reprovando por causa da lista antiga.
    const desativado = alternarDesativado(RASCUNHO_VAZIO, "blueprint")
    expect(validarOverrides(desativado)).toHaveLength(1)
    const pinado = alternarPin(desativado, "blueprint")
    expect(pinado.disabled ?? []).toEqual([])
    expect(validarOverrides(pinado)).toEqual([])
  })
})

describe("alternarParada", () => {
  it("marca e desmarca o ponto de parada", () => {
    const para = alternarParada(RASCUNHO_VAZIO, "color_format")
    expect(para.stop_after).toBe("color_format")
    expect(rascunhoVazio(alternarParada(para, "color_format"))).toBe(true)
  })

  it("escolher outro nó move a parada, não acumula", () => {
    const a = alternarParada(RASCUNHO_VAZIO, "typography")
    const b = alternarParada(a, "color_format")
    expect(b.stop_after).toBe("color_format")
  })
})

describe("projetarRascunho", () => {
  const runs = {
    hero_section: { status: "sucesso" },
    typography: { status: "sucesso" },
    color_format: { status: "aguardando" },
  }

  it("quem não vai rodar aparece como pulado ANTES do disparo", () => {
    const out = projetarRascunho(runs, {
      disabled: ["typography"],
      pinned: { hero_section: { kind: "reusar" } },
    })
    expect(out?.typography.status).toBe("pulado")
    expect(out?.hero_section.status).toBe("pulado")
    // Quem não foi tocado mantém o status da execução real.
    expect(out?.color_format.status).toBe("aguardando")
  })

  it("rascunho vazio devolve a MESMA referência — sem re-render à toa", () => {
    expect(projetarRascunho(runs, RASCUNHO_VAZIO)).toBe(runs)
    expect(projetarRascunho(runs, { disabled: [] })).toBe(runs)
  })

  it("sem runs não inventa nada", () => {
    expect(projetarRascunho(null, { disabled: ["qa"] })).toBeNull()
  })

  it("não muta o objeto de entrada", () => {
    projetarRascunho(runs, { disabled: ["typography"] })
    expect(runs.typography.status).toBe("sucesso")
  })
})
