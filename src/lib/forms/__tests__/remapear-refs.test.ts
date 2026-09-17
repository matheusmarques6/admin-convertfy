import { describe, expect, it } from "vitest"
import { mapaPorPosicao, remapearRefs } from "../remapear-refs"
import { normalizarSchema } from "../schema"

const base = () =>
  normalizarSchema({
    display_mode: "conversational",
    blocks: [
      {
        ref: "novo-0",
        type: "radio",
        label: "Faturamento",
        options: ["A", "B"],
        logic: [
          { conditions: [{ ref: "novo-0", operator: "equals", value: "A" }], logic: "and", goto: "novo-1" },
          { conditions: [{ ref: "novo-0", operator: "equals", value: "B" }], logic: "and", goto: "ending:fora" },
        ],
      },
      { ref: "novo-1", type: "text", label: "Loja" },
    ],
    endings: [{ ref: "ok", title: "Obrigado" }, { ref: "fora", title: "Fora" }],
  })

describe("remapearRefs", () => {
  it("troca o ref do bloco, o goto e o ref da condição", () => {
    const r = remapearRefs(base(), { "novo-0": "id-a", "novo-1": "id-b" })
    expect(r.blocks[0].ref).toBe("id-a")
    expect(r.blocks[1].ref).toBe("id-b")
    expect(r.blocks[0].logic?.[0].goto).toBe("id-b")
    expect(r.blocks[0].logic?.[0].conditions[0].ref).toBe("id-a")
  })

  it("não toca em ending: — o ref do final é escolhido por quem edita", () => {
    const r = remapearRefs(base(), { "novo-0": "id-a", fora: "OUTRO" })
    expect(r.blocks[0].logic?.[1].goto).toBe("ending:fora")
  })

  it("mapa vazio devolve o MESMO objeto — nada a refazer, nada a re-renderizar", () => {
    const s = base()
    expect(remapearRefs(s, {})).toBe(s)
  })

  it("não muta a entrada", () => {
    const s = base()
    remapearRefs(s, { "novo-0": "id-a" })
    expect(s.blocks[0].ref).toBe("novo-0")
  })

  it("ref fora do mapa fica como está", () => {
    const r = remapearRefs(base(), { "novo-0": "id-a" })
    expect(r.blocks[1].ref).toBe("novo-1")
    expect(r.blocks[0].logic?.[0].goto).toBe("novo-1")
  })
})

describe("mapaPorPosicao", () => {
  it("casa pela posição", () => {
    expect(mapaPorPosicao([{ posicao: 1, ref: "novo-1" }], ["id-0", "id-1", "id-2"])).toEqual({
      "novo-1": "id-1",
    })
  })

  it("posição sem id não inventa troca", () => {
    expect(mapaPorPosicao([{ posicao: 7, ref: "novo-7" }], ["id-0"])).toEqual({})
  })

  it("id igual ao ref não entra no mapa", () => {
    expect(mapaPorPosicao([{ posicao: 0, ref: "id-0" }], ["id-0"])).toEqual({})
  })
})
