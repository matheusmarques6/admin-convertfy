import { describe, expect, it } from "vitest"
import { MODELOS, MODELOS_IDS, montarModelo } from "../modelos"
import { normalizarSchema } from "../schema"
import { mapaPorPosicao, remapearRefs } from "../remapear-refs"

describe("modelos do Novo formulário", () => {
  it("todo modelo listado monta, nos dois formatos, sem perder nada no normalizador", () => {
    for (const id of MODELOS_IDS) {
      for (const modo of ["classic", "conversational"] as const) {
        const m = montarModelo(id, modo)
        expect(m.campos.length).toBeGreaterThan(0)
        const s = normalizarSchema(m.draft_schema)
        expect(s.blocks.length).toBe(m.draft_schema.blocks.length)
        expect(s.endings?.length).toBe(m.draft_schema.endings?.length)
        expect(s.display_mode).toBe(modo)
      }
    }
    expect(MODELOS.map((m) => m.id)).toEqual([...MODELOS_IDS])
  })

  it("campos e blocos são o MESMO conjunto, na mesma ordem — é o que o remap por posição exige", () => {
    for (const id of MODELOS_IDS) {
      const m = montarModelo(id, "conversational")
      expect(m.draft_schema.blocks.map((b) => b.ref)).toEqual(m.campos.map((c) => c.temp_ref))
    }
  })

  it("toda regra aponta para um bloco ou final que existe", () => {
    for (const id of MODELOS_IDS) {
      const m = montarModelo(id, "conversational")
      const refs = new Set(m.draft_schema.blocks.map((b) => b.ref))
      const finais = new Set((m.draft_schema.endings ?? []).map((e) => e.ref))
      for (const b of m.draft_schema.blocks) {
        for (const r of b.logic ?? []) {
          const alvo = r.goto.startsWith("ending:") ? finais.has(r.goto.slice(7)) : refs.has(r.goto)
          expect(alvo, `${id}: ${b.ref} → ${r.goto}`).toBe(true)
          for (const c of r.conditions) expect(refs.has(c.ref), `${id}: condição ${c.ref}`).toBe(true)
        }
        if (b.proximo) {
          const alvo = b.proximo.startsWith("ending:") ? finais.has(b.proximo.slice(7)) : refs.has(b.proximo)
          expect(alvo, `${id}: ${b.ref} próximo ${b.proximo}`).toBe(true)
        }
      }
    }
  })

  it("o remap por posição troca os provisórios do diagnóstico pelos ids do banco", () => {
    const m = montarModelo("diag", "conversational")
    const ids = m.campos.map((_, i) => `id-${i}`)
    const mapa = mapaPorPosicao(m.campos.map((c, i) => ({ posicao: i, ref: c.temp_ref })), ids)
    const s = remapearRefs(m.draft_schema, mapa)
    expect(s.blocks.every((b) => b.ref.startsWith("id-"))).toBe(true)
    const fat = s.blocks.find((b) => b.alias === "faturamento")!
    expect(fat.logic?.[0].conditions[0].ref).toBe(fat.ref)
    expect(fat.logic?.[0].goto).toBe("ending:abaixo-do-corte")
  })

  it("o contador de telas do modelo bate com o agrupamento", () => {
    const m = montarModelo("diag", "conversational")
    const telas = m.draft_schema.blocks.filter((b) => !b.mesma_tela).length
    expect(telas).toBe(MODELOS.find((x) => x.id === "diag")!.telas)
  })
})
