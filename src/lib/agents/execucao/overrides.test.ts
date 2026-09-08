/**
 * Overrides por execução: a linha dura manual × produção e a régua de
 * degradação.
 *
 * Os casos são os modos de falha que a feature existe para não ter: um pin
 * atravessando para produção (e-mail de cliente com copy congelada de outro
 * e-mail) e um "desativar" que só mata a peça 220s depois.
 */

import { describe, it, expect } from "vitest"
import { MAIN_ORDER } from "@/lib/agents/studio-graph"
import {
  DEGRADACAO,
  ESTAGIO_ANTES,
  NOS_COM_OVERRIDE,
  deveParar,
  gateFor,
  nodeExiste,
  overridesSoEsteNo,
  resumirOverrides,
  validarOverrides,
  type ExecutionOverrides,
} from "./overrides"

const PIN = { kind: "reusar" } as const

describe("a linha dura manual × produção", () => {
  const cheio: ExecutionOverrides = {
    disabled: ["typography", "qa"],
    pinned: { copy: PIN, blueprint: PIN },
    stop_after: "color_format",
    start_from: "typography",
  }

  it("produção devolve gate NEUTRO mesmo com overrides cheios", () => {
    // É o que impede um pin esquecido de mandar ao cliente um e-mail com a
    // copy congelada de outro. O gate não consulta intenção, consulta modo.
    for (const node of NOS_COM_OVERRIDE) {
      const g = gateFor(node, cheio, "producao")
      expect(g.disabled, node).toBe(false)
      expect(g.pinned, node).toBe(false)
    }
  })

  it("produção nunca para no meio", () => {
    expect(deveParar("color_format", cheio, "producao")).toBe(false)
    expect(deveParar("color_format", cheio, "manual")).toBe(true)
  })

  it("manual sem overrides também é neutro", () => {
    expect(gateFor("typography", null, "manual").disabled).toBe(false)
    expect(gateFor("typography", {}, "manual").disabled).toBe(false)
  })
})

describe("gateFor", () => {
  it("desativado fica desativado, com motivo", () => {
    const g = gateFor("typography", { disabled: ["typography"] }, "manual")
    expect(g.disabled).toBe(true)
    expect(g.pinned).toBe(false)
    expect(g.motivo).toContain("desativado")
  })

  it("pinado também não executa — e o motivo é OUTRO", () => {
    // Mesmo mecanismo (não executa), intenção diferente: desativar é
    // lacuna, pinar é "a saída gravada serve". É a intenção que a régua lê.
    const g = gateFor("assembler_chooser", { pinned: { assembler_chooser: PIN } }, "manual")
    expect(g.disabled).toBe(true)
    expect(g.pinned).toBe(true)
    expect(g.motivo).toContain("pinado")
  })

  it("pin vence quando o nó está nas duas listas", () => {
    const g = gateFor(
      "copy",
      { disabled: ["copy"], pinned: { copy: PIN } },
      "manual",
    )
    expect(g.pinned).toBe(true)
  })
})

describe("a régua de degradação", () => {
  it("TODO nó com override tem degradação declarada", () => {
    // "Desativar todos os nós, com aviso" só é honesto se o aviso existir
    // para todos. Nó novo no grafo sem entrada aqui reprova este teste em
    // vez de aparecer na tela sem explicação.
    for (const node of NOS_COM_OVERRIDE) {
      expect(DEGRADACAO[node], node).toBeDefined()
      expect(DEGRADACAO[node].motivo.length, node).toBeGreaterThan(10)
    }
  })

  it.each(["assembler_chooser", "blueprint", "copy", "copy_dispatch"])(
    "%s desativado sem pin é RECUSADO antes de gastar",
    (node) => {
      const r = validarOverrides({ disabled: [node] })
      expect(r).toHaveLength(1)
      expect(r[0].node).toBe(node)
      // O motivo tem de dizer o que fazer, não só que deu errado.
      expect(r[0].motivo.toLowerCase()).toMatch(/pine|reative/)
    },
  )

  it.each(["assembler_chooser", "blueprint", "copy", "copy_dispatch"])(
    "%s desativado COM pin passa — o pin declara que o insumo existe",
    (node) => {
      expect(
        validarOverrides({ disabled: [node], pinned: { [node]: PIN } }),
      ).toEqual([])
    },
  )

  it("passa_adiante e roda_degradado nunca recusam", () => {
    const naoRecusam = NOS_COM_OVERRIDE.filter(
      (n) => DEGRADACAO[n].kind !== "recusa",
    )
    expect(validarOverrides({ disabled: naoRecusam })).toEqual([])
  })

  it("nó inexistente e nó sintético são recusados", () => {
    expect(validarOverrides({ disabled: ["nao_existe"] })[0].motivo).toContain(
      "inexistente",
    )
    expect(validarOverrides({ disabled: ["trigger"] })[0].motivo).toContain(
      "sintético",
    )
    expect(validarOverrides({ pinned: { out: PIN } })[0].motivo).toContain(
      "sintético",
    )
  })
})

describe("parar e retomar", () => {
  it("parar depois de um nó desativado é recusado", () => {
    const r = validarOverrides({ disabled: ["typography"], stop_after: "typography" })
    expect(r[0].motivo).toContain("desativado")
  })

  it("parar depois de um nó PINADO é permitido — o nó acontece via pin", () => {
    expect(
      validarOverrides({ pinned: { typography: PIN }, stop_after: "typography" }),
    ).toEqual([])
  })

  it("start_from fora dos steps de HTML é recusado, dizendo a alternativa", () => {
    const r = validarOverrides({ start_from: "assembler_chooser" })
    expect(r).toHaveLength(1)
    expect(r[0].motivo).toContain("pine os nós anteriores")
  })

  it("parar antes de começar é recusado", () => {
    const r = validarOverrides({ start_from: "typography", stop_after: "hero_section" })
    expect(r.some((x) => x.motivo.includes("antes de começar"))).toBe(true)
  })

  it("todo estágio de retomada aponta para um nó real do grafo", () => {
    for (const node of Object.keys(ESTAGIO_ANTES)) {
      expect(nodeExiste(node), node).toBe(true)
      expect(NOS_COM_OVERRIDE.includes(node), node).toBe(true)
    }
  })
})

describe("overridesSoEsteNo — o atalho do 'Execute step'", () => {
  it("pina tudo antes, para depois e retoma no ponto certo", () => {
    const ov = overridesSoEsteNo("typography")
    expect(ov.stop_after).toBe("typography")
    expect(ov.start_from).toBe("typography")
    // Nada DEPOIS dele é pinado — o que vem depois simplesmente não roda,
    // porque a execução para.
    expect(ov.pinned).toHaveProperty("copy")
    expect(ov.pinned).toHaveProperty("hero_section")
    expect(ov.pinned).not.toHaveProperty("typography")
    expect(ov.pinned).not.toHaveProperty("color_format")
  })

  it("nó de fase 1 sai sem start_from — não há estágio persistido lá", () => {
    const ov = overridesSoEsteNo("blueprint")
    expect(ov.start_from).toBeUndefined()
    expect(ov.stop_after).toBe("blueprint")
  })

  it("o atalho NUNCA produz override que o servidor recusa", () => {
    // A invariante que importa: o botão da tela monta os overrides, e se o
    // atalho pudesse gerar algo reprovado pela régua, o clique daria 422 —
    // um botão que existe para falhar.
    for (const node of NOS_COM_OVERRIDE) {
      expect(validarOverrides(overridesSoEsteNo(node)), node).toEqual([])
    }
  })

  it("o primeiro nó do pipeline não pina ninguém", () => {
    const primeiro = MAIN_ORDER[1] // [0] é o trigger
    expect(Object.keys(overridesSoEsteNo(primeiro).pinned ?? {})).toEqual([])
  })
})

describe("resumirOverrides", () => {
  it("descreve o que a execução mudou", () => {
    const t = resumirOverrides({
      disabled: ["qa"],
      pinned: { copy: PIN },
      stop_after: "typography",
      start_from: "typography",
    })
    expect(t).toContain("1 desativado(s): qa")
    expect(t).toContain("1 pinado(s)")
    expect(t).toContain("retoma de typography")
    expect(t).toContain("para depois de typography")
  })

  it("execução sem override diz isso, em vez de string vazia", () => {
    expect(resumirOverrides(null)).toBe("sem overrides")
    expect(resumirOverrides({})).toBe("sem overrides")
  })
})
