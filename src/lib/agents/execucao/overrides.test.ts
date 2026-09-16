/**
 * Overrides por execução: a linha dura manual × produção e a régua de
 * degradação.
 *
 * Os casos são os modos de falha que a feature existe para não ter: um pin
 * atravessando para produção (e-mail de cliente com copy congelada de outro
 * e-mail) e um "desativar" que só mata a peça 220s depois.
 */

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

import { MAIN_ORDER } from "@/lib/agents/studio-graph"
import {
  DEGRADACAO,
  ESTAGIO_ANTES,
  NOS_COM_OVERRIDE,
  NOS_QUE_PARAM,
  deveParar,
  gateFor,
  nodeExiste,
  overridesSoEsteNo,
  podeRodarSoEsteNo,
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

  it("o atalho NUNCA produz override que o servidor recusa — onde é oferecido", () => {
    // A invariante que importa: o botão da tela monta os overrides, e se o
    // atalho pudesse gerar algo reprovado pela régua, o clique daria 422 —
    // um botão que existe para falhar. Ele vale para onde o botão APARECE,
    // e quem decide isso é `podeRodarSoEsteNo`, não a lista inteira de nós
    // override-áveis: `stop_after` num nó sem ponto de parada é recusado.
    for (const node of NOS_COM_OVERRIDE.filter(podeRodarSoEsteNo)) {
      expect(validarOverrides(overridesSoEsteNo(node)), node).toEqual([])
    }
  })

  it("onde o atalho não é oferecido, ele seria recusado — por isso não é", () => {
    // O outro lado da mesma invariante: sem a régua da tela, estes nós
    // dariam um clique que falha. É a prova de que esconder o botão não é
    // capricho de UI.
    const fora = NOS_COM_OVERRIDE.filter((n) => !podeRodarSoEsteNo(n))
    expect(fora.length, "se nenhum nó ficou de fora, a régua virou ruído").toBeGreaterThan(0)
    for (const node of fora) {
      expect(validarOverrides(overridesSoEsteNo(node)), node).not.toEqual([])
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

describe("NOS_QUE_PARAM", () => {
  // A lista é uma AFIRMAÇÃO sobre outros dois arquivos: "estes nós têm
  // ponto de parada escrito". Afirmação em comentário foi exatamente o que
  // deixou `stop_after` inerte na fase 1 por meses — `deveParar` tinha UM
  // call site em todo o repositório e a validação aceitava qualquer nó.
  // Este teste é a afirmação.
  const fonteDe = (rel: string) =>
    readFileSync(new URL(rel, import.meta.url), "utf-8")

  const chamadasDe = (fonte: string): string[] =>
    [...fonte.matchAll(/\bpararAqui\("([a-z_0-9]+)"\)/g)].map((m) => m[1])

  it("é exatamente o conjunto dos call sites de `pararAqui`", () => {
    const encontrados = new Set([
      ...chamadasDe(fonteDe("../architect/generate.service.ts")),
      ...chamadasDe(fonteDe("../phase2-runner.service.ts")),
    ])
    expect([...encontrados].sort()).toEqual([...NOS_QUE_PARAM].sort())
  })

  // O helper é o que torna a lista verificável: um `deveParar` solto, fora
  // do `pararAqui`, seria um ponto de parada que a régua acima não enxerga
  // — e a lista voltaria a ser comentário. O único uso legítimo por arquivo
  // é o corpo do próprio helper.
  it("`deveParar` só é consultado de dentro do `pararAqui`", () => {
    for (const rel of ["../architect/generate.service.ts", "../phase2-runner.service.ts"]) {
      const linhas = fonteDe(rel).split("\n")
      const usos = linhas
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => /\bdeveParar\(/.test(l) && !/^\s*[*/]/.test(l))
      expect(usos, rel).toHaveLength(1)
      // O corpo do helper começa na linha logo acima; qualquer outra
      // distância é um `deveParar` fora dele.
      const acima = linhas.slice(Math.max(0, usos[0].i - 3), usos[0].i).join("\n")
      expect(acima, rel).toContain("const pararAqui")
    }
  })

  // Parar num nó que o pipeline não conhece, ou num sintético, já era
  // recusado; o que faltava era o nó REAL sem ponto de parada.
  it("todo nó da lista aceita override", () => {
    for (const node of NOS_QUE_PARAM) {
      expect(nodeExiste(node), node).toBe(true)
      expect(NOS_COM_OVERRIDE, node).toContain(node)
    }
  })

  it("recusa `stop_after` num nó real que não para", () => {
    // `qa` roda, é override-ável e NÃO tem ponto de parada. Antes: a
    // execução seguia até o fim como se nada tivesse sido pedido.
    const recusas = validarOverrides({ stop_after: "qa" })
    expect(recusas).toHaveLength(1)
    expect(recusas[0].node).toBe("qa")
    expect(recusas[0].motivo).toContain("não tem ponto de parada")
  })

  it("aceita `stop_after` em quem para", () => {
    for (const node of NOS_QUE_PARAM) {
      expect(validarOverrides({ stop_after: node }), node).toEqual([])
    }
  })

  // `overridesSoEsteNo` monta `stop_after` sozinho; se ele apontasse para
  // nó sem parada, o botão da tela nasceria recusado pela própria régua.
  it("`overridesSoEsteNo` nunca produz override que o servidor recusa", () => {
    for (const node of NOS_QUE_PARAM) {
      expect(validarOverrides(overridesSoEsteNo(node)), node).toEqual([])
    }
  })
})
