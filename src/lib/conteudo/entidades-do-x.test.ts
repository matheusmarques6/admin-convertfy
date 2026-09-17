import { describe, expect, it } from "vitest"
import { partesDeEntidades, partesDeTweet, temEntidadeDoX } from "./entidades-do-x"

const links = (t: string) => partesDeEntidades(t).filter((p) => p.link).map((p) => p.texto)

describe("entidades do X no texto do post", () => {
  it("menção e hashtag viram link", () => {
    expect(links("valeu @convertfy pelo #ecommerce")).toEqual(["@convertfy", "#ecommerce"])
  })

  it("e-mail NÃO vira menção — é o erro que pinta metade de um endereço", () => {
    // Sem a fronteira à esquerda, `joao@convertfy.me` sairia com
    // "@convertfy" azul no meio do e-mail. O X não faz isso.
    expect(links("fala com joao@convertfy.me")).toEqual([])
    expect(links("fala com joao@convertfy.me e @convertfy")).toEqual(["@convertfy"])
  })

  it("o handle vai até 20 caracteres — 15 é o limite de CADASTRO", () => {
    // Foi onde meu palpite errou: `validMentionOrList` da lib oficial usa
    // `[a-zA-Z0-9_]{1,20}`. Com 20, entra inteiro.
    expect(links("oi @abcdefghijklmnopqrst!")).toEqual(["@abcdefghijklmnopqrst"])
    // Com 21, a lib oficial também extrai os 20 primeiros.
    const p = partesDeEntidades("oi @abcdefghijklmnopqrstu fim")
    expect(p.map((x) => x.texto).join("")).toBe("oi @abcdefghijklmnopqrstu fim")
  })

  it("a menção morre pelo que vem DEPOIS (endMentionMatch)", () => {
    // Letra acentuada, outro @ ou `://` logo após o handle invalidam.
    expect(links("oi @convertfyé")).toEqual([])
    expect(links("oi @convertfy@x")).toEqual([])
  })

  it("hashtag só de dígitos é TEXTO — senão data e preço viram link", () => {
    expect(links("bateu #2026 de meta")).toEqual([])
    expect(links("bateu #meta2026")).toEqual(["#meta2026"])
  })

  it("hashtag com acento entra; o hífen encerra", () => {
    expect(links("#promoção #e-commerce")).toEqual(["#promoção", "#e"])
  })

  it("URL entra e a pontuação final fica de fora", () => {
    expect(links("veja https://convertfy.me/planos.")).toEqual(["https://convertfy.me/planos"])
    expect(links("veja www.convertfy.me, depois")).toEqual(["www.convertfy.me"])
  })

  it("domínio solto NÃO vira link, de propósito", () => {
    // Errar para menos custa uma cor; para mais, pinta "comprou.Depois".
    expect(links("acesse convertfy.me hoje")).toEqual([])
    expect(links("ele comprou.Depois sumiu")).toEqual([])
  })

  it("o texto sai inteiro, na ordem, sem perder nem duplicar caractere", () => {
    const t = "oi @a #b https://x.com/y fim"
    expect(partesDeEntidades(t).map((p) => p.texto).join("")).toBe(t)
  })

  it("não inventa link em texto comum", () => {
    expect(temEntidadeDoX("8% dos clientes fazem 41% do faturamento")).toBe(false)
    expect(temEntidadeDoX("custa R$ 2.497 por mês")).toBe(false)
  })

  it("compõe com o destaque da casa, e a entidade vence a cor", () => {
    // `**x**` é marcação nossa e some do texto visível; a menção é do X.
    const p = partesDeTweet("a **régua do @convertfy** vale")
    expect(p.map((x) => x.texto).join("")).toBe("a régua do @convertfy vale")
    const mencao = p.find((x) => x.texto === "@convertfy")
    expect(mencao).toEqual({ texto: "@convertfy", destaque: true, link: true })
  })

  it("texto vazio não quebra", () => {
    expect(partesDeEntidades("")).toEqual([])
    expect(partesDeTweet("")).toEqual([])
  })

  it("o @ no começo do texto conta", () => {
    expect(links("@convertfy explicou tudo")).toEqual(["@convertfy"])
    expect(links("(@convertfy) explicou")).toEqual(["@convertfy"])
  })
})
