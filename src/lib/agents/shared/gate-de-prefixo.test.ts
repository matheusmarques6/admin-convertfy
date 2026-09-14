import { describe, expect, it } from "vitest"

import { GateDePrefixo, esperaDoGatePorEnv } from "./gate-de-prefixo"

/** Relógio e sono controlados: o teste avança o tempo à mão. */
function relogio() {
  let t = 1_000
  const dormindo: Array<{ ate: number; acordar: () => void }> = []
  return {
    agora: () => t,
    dormir: (ms: number) =>
      new Promise<void>((r) => {
        dormindo.push({ ate: t + ms, acordar: r })
      }),
    avancar(ms: number) {
      t += ms
      for (const d of [...dormindo]) {
        if (d.ate <= t) {
          dormindo.splice(dormindo.indexOf(d), 1)
          d.acordar()
        }
      }
    },
  }
}

describe("GateDePrefixo", () => {
  it("o primeiro passa na hora; o segundo com a MESMA chave espera o primeiro sair", async () => {
    const r = relogio()
    const gate = new GateDePrefixo({ esperaMs: 15_000, agora: r.agora, dormir: r.dormir })
    const a = await gate.entrar("k")
    expect(a.primeiro).toBe(true)
    expect(gate.emVoo).toBe(1)

    let bResolvido = false
    const b = gate.entrar("k").then((x) => {
      bResolvido = true
      return x
    })
    await Promise.resolve()
    expect(bResolvido).toBe(false)

    a.sair()
    const rb = await b
    expect(rb.primeiro).toBe(false)
    expect(gate.emVoo).toBe(0)
  })

  it("o seguidor não espera além de esperaMs desde o INÍCIO do primeiro", async () => {
    const r = relogio()
    const gate = new GateDePrefixo({ esperaMs: 15_000, agora: r.agora, dormir: r.dormir })
    await gate.entrar("k") // o primeiro nunca sai (chamada longa)
    r.avancar(5_000)
    let pronto = false
    const b = gate.entrar("k").then((x) => {
      pronto = true
      return x
    })
    await Promise.resolve()
    expect(pronto).toBe(false)
    r.avancar(10_000) // 15 s desde o início do primeiro
    const rb = await b
    expect(rb.primeiro).toBe(false)
    expect(rb.esperouMs).toBe(10_000)
  })

  it("chaves diferentes não se esperam; esperaMs 0 desliga o gate", async () => {
    const r = relogio()
    const gate = new GateDePrefixo({ esperaMs: 15_000, agora: r.agora, dormir: r.dormir })
    const a = await gate.entrar("k1")
    const b = await gate.entrar("k2")
    expect(a.primeiro && b.primeiro).toBe(true)
    a.sair()
    b.sair()

    const off = new GateDePrefixo({ esperaMs: 0, agora: r.agora, dormir: r.dormir })
    await off.entrar("k")
    const c = await off.entrar("k")
    expect(c.primeiro).toBe(true)
    expect(off.emVoo).toBe(0)
  })

  it("erro do primeiro (sair no finally) solta os seguidores; a chave fica livre para o próximo", async () => {
    const r = relogio()
    const gate = new GateDePrefixo({ esperaMs: 15_000, agora: r.agora, dormir: r.dormir })
    const a = await gate.entrar("k")
    const b = gate.entrar("k")
    a.sair()
    await b
    const c = await gate.entrar("k")
    expect(c.primeiro).toBe(true)
    c.sair()
  })

  it("esperaDoGatePorEnv: default 15 s, número válido vence, lixo cai no default", () => {
    expect(esperaDoGatePorEnv({})).toBe(15_000)
    expect(esperaDoGatePorEnv({ CACHE_STAGGER_MS: "0" })).toBe(0)
    expect(esperaDoGatePorEnv({ CACHE_STAGGER_MS: "3000" })).toBe(3000)
    expect(esperaDoGatePorEnv({ CACHE_STAGGER_MS: "x" })).toBe(15_000)
  })
})
