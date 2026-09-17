import { describe, expect, it } from "vitest"
import { analisarRival, compararComONosso, formatoDoRival, mediana, ordenarPosts, pautaDoTema, temaDaLegenda, type PerfilRival, type PostRival } from "./analise"

const perfil = (seguidores: number | null = 68_568): PerfilRival => ({
  handle: "turbo.partners",
  nome: "Turbo Partners",
  bio: "Aceleramos negócios",
  avatar: null,
  seguidores,
  posts: 1056,
})

let seq = 0
const post = (curtidas: number, comentarios = 0, o: Partial<PostRival> = {}): PostRival => {
  seq++
  return {
    id: `p${seq}`,
    fmt: "Carrossel",
    head: `Tema ${seq}`,
    legenda: `Tema ${seq}`,
    curtidas,
    comentarios,
    permalink: null,
    thumb: null,
    publicadoEm: `2026-09-${String(seq).padStart(2, "0")}T12:00:00Z`,
    slides: null,
    ...o,
  }
}

describe("análise do rival", () => {
  it("o destaque mede o post contra a MEDIANA do próprio perfil", () => {
    // O eixo da referência (curtidas + comentários) ranqueia o tamanho da
    // conta; o que se quer saber é o que performou acima do normal DELE.
    const a = analisarRival(perfil(), [post(100), post(110), post(90), post(105), post(1000)])
    expect(a.medianaQuente).toBe(105)
    const campeao = a.posts.find((p) => p.quente === 1000)!
    expect(campeao.destaque).toBeCloseTo(1000 / 105)
    expect(a.posts.find((p) => p.quente === 90)!.destaque).toBeLessThan(1)
  })

  it("amostra curta não inventa destaque", () => {
    const a = analisarRival(perfil(), [post(100), post(900)])
    expect(a.medianaQuente).toBeNull()
    expect(a.posts.every((p) => p.destaque == null)).toBe(true)
  })

  it("a fórmula é PARCIAL e a saída declara isso", () => {
    // De terceiro não há salvos nem compartilhamentos: comparar com a nossa
    // taxa completa sem dizer seria comparar coisas diferentes.
    const a = analisarRival(perfil(), [post(100, 10)])
    expect(a.completa).toBe(false)
    expect(a.formula).toBe("(curtidas + comentários) ÷ seguidores × 100")
  })

  it("sem seguidores a taxa é null, nunca zero", () => {
    const a = analisarRival(perfil(null), [post(100, 10)])
    expect(a.posts[0].taxa).toBeNull()
    expect(a.taxaMediana).toBeNull()
  })

  it("a taxa por post usa curtidas + comentários sobre seguidores", () => {
    const a = analisarRival(perfil(1000), [post(20, 10)])
    expect(a.posts[0].taxa).toBeCloseTo(3)
  })

  it("ordenar por destaque cai para o absoluto quando não há mediana", () => {
    const a = analisarRival(perfil(), [post(10), post(900)])
    expect(ordenarPosts(a.posts, "destaque")[0].quente).toBe(900)
  })

  it("o filtro de formato não muda a ordem dos que ficam", () => {
    const a = analisarRival(perfil(), [
      post(10, 0, { fmt: "Reels" }),
      post(900, 0, { fmt: "Carrossel" }),
      post(500, 0, { fmt: "Carrossel" }),
      post(20, 0, { fmt: "Reels" }),
      post(30, 0, { fmt: "Imagem" }),
    ])
    const so = ordenarPosts(a.posts, "quente", "Carrossel")
    expect(so).toHaveLength(2)
    expect(so[0].quente).toBe(900)
  })

  it("recentes ordena pela data, não pelo número", () => {
    const a = analisarRival(perfil(), [post(900, 0, { publicadoEm: "2026-01-01T00:00:00Z" }), post(10, 0, { publicadoEm: "2026-09-01T00:00:00Z" })])
    expect(ordenarPosts(a.posts, "recentes")[0].quente).toBe(10)
  })

  it("a pauta leva o TEMA e proíbe reproduzir o texto", () => {
    const p = pautaDoTema({ head: "8% dos clientes fazem 41% do faturamento", fmt: "Carrossel" }, "@turbo.partners")
    expect(p).toContain("8% dos clientes")
    expect(p).toContain("@turbo.partners")
    expect(p).toMatch(/nosso ângulo/i)
    expect(p).toMatch(/não reproduza/i)
  })

  it("a comparação com o nosso perfil usa a MESMA fórmula parcial dos dois lados", () => {
    // Comparar a parcial dele com a completa nossa inflaria o nosso lado
    // por construção.
    expect(compararComONosso(2, 1)?.vezes).toBeCloseTo(2)
    expect(compararComONosso(2, 1)?.quem).toBe("deles")
    expect(compararComONosso(2, 1)?.nota).toMatch(/parcial/)
    expect(compararComONosso(1, 1.02)?.quem).toBe("empate")
    expect(compararComONosso(null, 1)).toBeNull()
    expect(compararComONosso(1, 0)).toBeNull()
  })

  it("o número EXIBIDO acompanha a legenda, nunca a contradiz", () => {
    // O primeiro render mostrava "0,1×" com "o seu perfil engaja 6,7× o
    // deles" ao lado — número contra a própria legenda. `vezes` é sempre a
    // magnitude da frase; `razao` guarda a conta crua.
    const c = compararComONosso(0.49, 3.29)!
    expect(c.quem).toBe("nosso")
    expect(c.razao).toBeLessThan(1)
    expect(c.vezes).toBeCloseTo(6.7, 1)
    expect(c.nota).toContain("6,7×")
    expect(c.vezes).toBeGreaterThanOrEqual(1)
  })

  it("o tema sai da primeira linha útil, pulando hashtag solta", () => {
    expect(temaDaLegenda("#turbopartners\nO erro que custa caro")).toBe("O erro que custa caro")
    expect(temaDaLegenda(null)).toBe("(sem legenda)")
    expect(temaDaLegenda("x".repeat(200)).length).toBeLessThanOrEqual(120)
  })

  it("o formato sai dos campos da Graph API", () => {
    expect(formatoDoRival("CAROUSEL_ALBUM", "FEED")).toBe("Carrossel")
    expect(formatoDoRival("VIDEO", "REELS")).toBe("Reels")
    expect(formatoDoRival("VIDEO", null)).toBe("Reels")
    expect(formatoDoRival("VIDEO", "FEED")).toBe("Vídeo")
    expect(formatoDoRival("IMAGE", "FEED")).toBe("Imagem")
  })

  it("mediana com amostra par é a média dos dois do meio", () => {
    expect(mediana([1, 2, 3, 4])).toBe(2.5)
    expect(mediana([5])).toBe(5)
    expect(mediana([])).toBeNull()
  })
})
