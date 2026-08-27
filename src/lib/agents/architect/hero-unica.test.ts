import { describe, it, expect } from "vitest"
import { garantirHeroUnica, type PosicaoEscolhida } from "./hero-unica"

// Catálogo de mentira: o id diz a forma, para o teste não precisar de banco.
const FORMAS: Record<string, string> = {
  "hero-1": "hero",
  "hero-2": "hero",
  "hero-3": "hero",
  "body-1": "body",
  "body-2": "body",
  "offer-1": "offer",
}
const formaDe = (id: string) => FORMAS[id]

const pos = (
  index: number,
  papel: string,
  escolhido: string | null,
  finalistas: string[] = [],
): PosicaoEscolhida => ({ index, papel, escolhido, finalistas })

describe("garantirHeroUnica", () => {
  // O caso real (Innova, 27/08): Estruturador pediu hero · body, e o Montador
  // pôs "hero section 10" na posição do body. Duas heroes no documento e o
  // localizador recusa por ambiguidade — geração perdida.
  it("o PAPEL de hero fica com a hero; a outra desce o ranking", () => {
    const r = garantirHeroUnica(
      [
        pos(0, "hero", "hero-1", ["hero-1", "hero-2"]),
        pos(1, "body", "hero-2", ["hero-2", "body-1", "body-2"]),
      ],
      formaDe,
    )
    expect(r.escolhas).toEqual([
      { index: 0, variant_id: "hero-1" },
      { index: 1, variant_id: "body-1" },
    ])
    expect(r.trocas).toEqual([
      {
        index: 1,
        papel: "body",
        de: "hero-2",
        para: "body-1",
        motivo: "forma_hero_duplicada",
      },
    ])
  })

  // Sem ninguém com o papel, a hero é a ABERTURA do email.
  it("sem posição de papel hero, fica a primeira do documento", () => {
    const r = garantirHeroUnica(
      [
        pos(2, "products", "hero-2", ["hero-2", "offer-1"]),
        pos(1, "body", "hero-1", ["hero-1", "body-1"]),
      ],
      formaDe,
    )
    // A ordem do DOCUMENTO manda, não a ordem em que as posições chegaram.
    expect(r.escolhas).toEqual([
      { index: 2, variant_id: "offer-1" },
      { index: 1, variant_id: "hero-1" },
    ])
  })

  it("pula a própria escolhida e para na primeira forma diferente", () => {
    const r = garantirHeroUnica(
      [
        pos(0, "hero", "hero-1", ["hero-1"]),
        pos(1, "body", "hero-2", ["hero-2", "hero-3", "body-2"]),
      ],
      formaDe,
    )
    expect(r.escolhas[1].variant_id).toBe("body-2")
  })

  // Perder um bloco é ruim; derrubar a geração inteira é pior. E os dois
  // casos ficam registrados.
  it("todas as finalistas são hero → posição vira missing, com motivo", () => {
    const r = garantirHeroUnica(
      [
        pos(0, "hero", "hero-1", ["hero-1"]),
        pos(1, "body", "hero-2", ["hero-2", "hero-3"]),
      ],
      formaDe,
    )
    expect(r.escolhas[1].variant_id).toBeNull()
    expect(r.trocas[0].motivo).toBe("sem_alternativa")
  })

  it("três heroes: só a do papel sobrevive", () => {
    const r = garantirHeroUnica(
      [
        pos(0, "body", "hero-1", ["hero-1", "body-1"]),
        pos(1, "hero", "hero-2", ["hero-2"]),
        pos(2, "offer", "hero-3", ["hero-3", "offer-1"]),
      ],
      formaDe,
    )
    expect(r.escolhas.map((e) => e.variant_id)).toEqual([
      "body-1",
      "hero-2",
      "offer-1",
    ])
    expect(r.trocas).toHaveLength(2)
  })

  it("uma hero só é identidade — a regra não age à toa", () => {
    const entrada = [
      pos(0, "hero", "hero-1", ["hero-1"]),
      pos(1, "body", "body-1", ["body-1"]),
      pos(2, "offer", "offer-1", ["offer-1"]),
    ]
    const r = garantirHeroUnica(entrada, formaDe)
    expect(r.escolhas.map((e) => e.variant_id)).toEqual([
      "hero-1",
      "body-1",
      "offer-1",
    ])
    expect(r.trocas).toEqual([])
  })

  it("posição sem escolha e lista vazia não explodem", () => {
    expect(garantirHeroUnica([], formaDe).escolhas).toEqual([])
    const r = garantirHeroUnica(
      [pos(0, "hero", null, []), pos(1, "body", "body-1", [])],
      formaDe,
    )
    expect(r.trocas).toEqual([])
  })

  // Id fora do catálogo é tratado como não-hero: inventar forma seria pior
  // que deixar passar — e o localizador continua como última defesa.
  it("variante desconhecida não conta como hero", () => {
    const r = garantirHeroUnica(
      [
        pos(0, "hero", "hero-1", ["hero-1"]),
        pos(1, "body", "fantasma", ["fantasma"]),
      ],
      formaDe,
    )
    expect(r.trocas).toEqual([])
    expect(r.escolhas[1].variant_id).toBe("fantasma")
  })
})
