import { describe, expect, it } from "vitest"
import { botaoDoGate, framesDaReferencia, pareceNumeroDeDestaque, separarCopyEArte, tipoDoSlide, tipoDesenhaImagem } from "./referencia-para-documento"
import type { ReferenciaSlide } from "./types"

const s = (ordem: number, extra: Partial<ReferenciaSlide> = {}): ReferenciaSlide => ({
  ordem,
  imagemUrl: `/api/ai/convertia/imagem/stores/org-1/email-assets/ref-${ordem}.png`,
  ...extra,
})

describe("pareceNumeroDeDestaque", () => {
  it("aceita o que cabe como número gigante", () => {
    expect(pareceNumeroDeDestaque("41%")).toBe(true)
    expect(pareceNumeroDeDestaque("8x")).toBe(true)
    expect(pareceNumeroDeDestaque("2.000")).toBe(true)
    expect(pareceNumeroDeDestaque("R$ 300")).toBe(true)
  })

  it("recusa frase — é o caso comum da transcrição", () => {
    expect(pareceNumeroDeDestaque("Você sabe de cabeça quanto faturou ontem.")).toBe(false)
    expect(pareceNumeroDeDestaque("8% dos clientes fazem 41% do faturamento")).toBe(false)
    expect(pareceNumeroDeDestaque("")).toBe(false)
    expect(pareceNumeroDeDestaque("Turbo")).toBe(false)
  })
})

describe("tipoDoSlide", () => {
  it("dado com frase vira texto — senão a copy encolhe até sumir", () => {
    expect(tipoDoSlide(s(2, { tipo: "dado", titulo: "Você sabe de cabeça quanto faturou ontem." }), 1, 5)).toBe("texto")
  })

  it("dado com número continua dado", () => {
    expect(tipoDoSlide(s(2, { tipo: "dado", titulo: "41%" }), 1, 5)).toBe("dado")
  })

  it("sem tipo declarado, a posição decide e nada de adivinhar prova/lista", () => {
    expect(tipoDoSlide(s(1), 0, 4)).toBe("capa")
    expect(tipoDoSlide(s(4), 3, 4)).toBe("cta")
    expect(tipoDoSlide(s(2), 1, 4)).toBe("texto")
  })

  it("os outros tipos passam intactos", () => {
    expect(tipoDoSlide(s(3, { tipo: "prova", titulo: "Não é achismo." }), 2, 5)).toBe("prova")
    expect(tipoDoSlide(s(3, { tipo: "lista", titulo: "Três erros" }), 2, 5)).toBe("lista")
  })
})

describe("framesDaReferencia", () => {
  const slides = [
    s(1, { tipo: "capa", titulo: "8% dos clientes fazem 41% do faturamento", corpo: "você conhece os seus 8%?" }),
    s(2, { tipo: "dado", titulo: "Você sabe de cabeça quanto faturou ontem.", corpo: "Sabe seu ROAS, seu CPA." }),
    s(3, { tipo: "prova", titulo: "Não é achismo. É medição.", corpo: "O Smile.io cruzou 1,1 bilhão de compras." }),
    s(4, { tipo: "cta", titulo: "Quer ver os seus 8%?", corpo: "Comente MÉTODO" }),
  ]

  it("a copy entra no campo que o tipo desenha", () => {
    const { frames } = framesDaReferencia(slides)
    // capa e CTA usam `subtitulo`; o meio usa `corpo`.
    expect(frames[0].textos.subtitulo).toBe("você conhece os seus 8%?")
    expect(frames[0].textos.corpo).toBeUndefined()
    expect(frames[1].textos.corpo).toBe("Sabe seu ROAS, seu CPA.")
    expect(frames[3].textos.subtitulo).toBe("Comente MÉTODO")
  })

  it("a imagem entra onde o tipo desenha foto, e o resto é REPORTADO", () => {
    const { frames, imagemSemLugar } = framesDaReferencia(slides)
    expect(frames[0].slotsImagem).toBe(1)
    expect(frames[0].imagens.slot1?.url).toContain("ref-1.png")
    expect(frames[2].imagens.slot1?.url).toContain("ref-3.png")
    // O CTA não desenha foto: a imagem fica fora e a tela diz qual.
    expect(frames[3].slotsImagem).toBe(0)
    expect(frames[3].imagens.slot1).toBeUndefined()
    expect(imagemSemLugar).toEqual([4])
  })

  it("copy longa é PRESERVADA e apenas sinalizada", () => {
    const { frames, camposLongos } = framesDaReferencia(slides)
    expect(frames[2].textos.titulo).toBe("Não é achismo. É medição.")
    // O corpo da prova tem limite de 120; a frase do slide 3 cabe.
    const daCapa = camposLongos.find((c) => c.ordem === 1 && c.campo === "titulo")
    expect(daCapa).toBeUndefined()
    const longo = framesDaReferencia([s(1, { tipo: "capa", titulo: "x".repeat(80) })])
    expect(longo.camposLongos[0]).toMatchObject({ ordem: 1, campo: "titulo", chars: 80, limite: 56 })
    expect(longo.frames[0].textos.titulo).toHaveLength(80)
  })

  it("mantém a sequência mesmo com slide sem copy e fora de ordem", () => {
    const { frames } = framesDaReferencia([s(3, { tipo: "cta" }), s(1, { tipo: "capa", titulo: "A" }), s(2)])
    expect(frames.map((f) => f.tipo)).toEqual(["capa", "texto", "cta"])
    expect(frames.map((f) => f.frameId)).toEqual(["f1", "f2", "f3"])
  })
})

describe("botaoDoGate", () => {
  it("usa a palavra da referência e não inventa promessa sem ela", () => {
    expect(botaoDoGate("método", "Comente PALAVRA")).toBe("Comente MÉTODO")
    expect(botaoDoGate(null, "Comente PALAVRA")).toBe("Comente PALAVRA")
    expect(botaoDoGate("   ", "Comente X")).toBe("Comente X")
  })
})

describe("tipoDesenhaImagem", () => {
  it("é a lista real do renderer", () => {
    expect((["capa", "texto", "prova", "lista", "mec"] as const).every((t) => tipoDesenhaImagem(t))).toBe(true)
    expect(tipoDesenhaImagem("dado")).toBe(false)
    expect(tipoDesenhaImagem("cta")).toBe(false)
  })
})

describe("separarCopyEArte", () => {
  // Texto REAL da referência "8% dos clientes fazem 41% do faturamento".
  const CORPO_2 =
    'Sabe seu ROAS, seu CPA, quanto gastou em criativo essa semana. [card com 4 métricas: ROAS 3,2 ↗ · CPA R$ 42,80 ↘] Agora responde: quantos dos seus clientes compraram pela segunda vez? · DESLIZE →'

  it("a fala fica na copy e a arte sai dela", () => {
    const { copy, arte } = separarCopyEArte(CORPO_2)
    expect(copy).toBe("Sabe seu ROAS, seu CPA, quanto gastou em criativo essa semana. Agora responde: quantos dos seus clientes compraram pela segunda vez?")
    expect(copy).not.toContain("[")
    expect(copy).not.toMatch(/DESLIZE/i)
    expect(arte).toContain("card com 4 métricas")
  })

  it("o botão descrito vira arte, não parágrafo", () => {
    const { copy, arte } = separarCopyEArte("você conhece os seus 8%? · botão: NOSSO MÉTODO → · foto de pessoa em contraste")
    expect(copy).toBe("você conhece os seus 8%?")
    expect(arte).toContain('botão "NOSSO MÉTODO"')
  })

  it("texto sem arte passa intacto", () => {
    expect(separarCopyEArte("Não é achismo. É medição.")).toEqual({ copy: "Não é achismo. É medição.", arte: "" })
    expect(separarCopyEArte("")).toEqual({ copy: "", arte: "" })
  })
})
