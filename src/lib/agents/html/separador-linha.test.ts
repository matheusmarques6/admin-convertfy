import { describe, expect, it } from "vitest"

import { formaPorId } from "./separador-catalogo"
import { linhaDeSeparacao } from "./separador-linha"

const ONDA = formaPorId("onda")!
const FILETE = formaPorId("filete")!

describe("linhaDeSeparacao", () => {
  it("NUNCA emite <table> — a conta do runner derrubaria o passo inteiro", () => {
    // O guard conta `<table[\s>]` antes e depois e o step é fail-open: a
    // conta errada descarta TODO o plano de cor, não só a separação.
    for (const forma of [ONDA, FILETE]) {
      const html = linhaDeSeparacao({
        forma,
        fundo: "#FFFFFF",
        tinta: "#034326",
        src: "https://cdn/x.png",
      })
      expect(html, forma.id).not.toMatch(/<table[\s>]/i)
      expect(html, forma.id).not.toMatch(/<\/table>/i)
    }
  })

  it("o filete são três <tr> e não precisa de imagem", () => {
    const html = linhaDeSeparacao({ forma: FILETE, fundo: "#FFFFFF", tinta: "#1F1F1F" })
    expect(html.match(/<tr>/g)).toHaveLength(3)
    expect(html).toContain('bgcolor="#1F1F1F"')
    expect(html).toContain('bgcolor="#FFFFFF"')
    expect(html).not.toContain("<img")
  })

  it("o respiro do filete soma a altura que o catálogo declara", () => {
    // Se divergirem, o plano reserva um espaço e o documento usa outro.
    const html = linhaDeSeparacao({ forma: FILETE, fundo: "#FFFFFF", tinta: "#1F1F1F" })
    const alturas = [...html.matchAll(/height="(\d+)"/g)].map((m) => Number(m[1]))
    expect(alturas.reduce((a, b) => a + b, 0)).toBe(FILETE.alturaPx)
  })

  it("PNG sem src devolve VAZIO — nada de <tr> fantasma", () => {
    // Falhou o upload, a separação não entra. Linha que ocupa altura e não
    // desenha nada quebra o ritmo que o plano decidiu.
    expect(linhaDeSeparacao({ forma: ONDA, fundo: "#FFF", tinta: "#000" })).toBe("")
    expect(linhaDeSeparacao({ forma: ONDA, fundo: "#FFF", tinta: "#000", src: null })).toBe("")
  })

  it("a imagem sai com alt VAZIO, 600px e o bgcolor da faixa de cima", () => {
    const html = linhaDeSeparacao({
      forma: ONDA,
      fundo: "#FFFFFF",
      tinta: "#034326",
      src: "https://cdn/onda.png",
    })
    expect(html).toContain('alt=""')
    expect(html).toContain('width="600"')
    expect(html).toContain(`height="${ONDA.alturaPx}"`)
    // Imagem bloqueada é rotina em e-mail: sem o bgcolor de cima, a peça
    // abriria uma tira branca no meio da troca de fundo.
    expect(html).toContain('bgcolor="#FFFFFF"')
    expect(html).toContain("display:block")
  })
})
