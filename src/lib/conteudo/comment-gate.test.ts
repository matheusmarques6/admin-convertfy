import { describe, expect, it } from "vitest"
import { impedimentosDoGate, palavraDoDocumento, respostaSugerida } from "./comment-gate"
import type { DocFrame, Documento, Perfil } from "./types"

const frameCta = (textos: Record<string, string>): DocFrame =>
  ({ frameId: "f-cta", tipo: "cta", label: "CTA", campos: ["titulo", "subtitulo"], textos, oculto: false }) as unknown as DocFrame

const doc = (over: Partial<Documento> = {}) =>
  ({ palavraChave: "SEGMENTO", perfil: "canal-1", cta: { texto: "Comente SEGMENTO" }, frames: [], ...over }) as unknown as Documento

const perfilIg = { canal: "instagram" } as Perfil

describe("comment gate no Estúdio: o que dá para ligar", () => {
  it("palavra vai para o gatilho sem espaço e em caixa alta", () => {
    expect(palavraDoDocumento({ palavraChave: "  segmento " })).toBe("SEGMENTO")
    expect(palavraDoDocumento({ palavraChave: "" })).toBe("")
  })

  it("com palavra e perfil de Instagram, nada impede", () => {
    expect(impedimentosDoGate(doc(), perfilIg)).toEqual([])
  })

  it("sem palavra não dá para ligar — o gatilho responderia a qualquer comentário", () => {
    expect(impedimentosDoGate(doc({ palavraChave: "   " }), perfilIg)).toEqual(["sem_palavra"])
  })

  it("sem perfil, e canal fora do Instagram, cada um com seu motivo", () => {
    expect(impedimentosDoGate(doc({ perfil: "" }), null)).toEqual(["sem_perfil"])
    expect(impedimentosDoGate(doc(), { canal: "youtube" } as unknown as Perfil)).toEqual(["canal_nao_suportado"])
  })

  it("a resposta sai do CTA do próprio carrossel quando ele entrega algo", () => {
    const d = doc({ frames: [frameCta({ corpo: "Te mando o passo a passo completo em PDF, é só comentar." })] })
    expect(respostaSugerida(d)).toBe("Te mando o passo a passo completo em PDF, é só comentar.")
  })

  it("'Comente SEGMENTO' é o pedido, não a entrega: cai no texto que nomeia a palavra", () => {
    const d = doc({ frames: [frameCta({ subtitulo: "Comente SEGMENTO" })] })
    expect(respostaSugerida(d)).toContain("SEGMENTO")
    expect(respostaSugerida(d)).not.toBe("Comente SEGMENTO")
  })

  it("sem CTA e sem palavra, ainda devolve texto utilizável", () => {
    expect(respostaSugerida(doc({ palavraChave: "", frames: [] }))).toContain("carrossel")
  })

  it("CTA oculto não é fonte — o que não está na peça não foi combinado com ninguém", () => {
    const oculto = { ...frameCta({ corpo: "Mando o guia completo pra você agora" }), oculto: true } as DocFrame
    expect(respostaSugerida(doc({ frames: [oculto] }))).toContain("SEGMENTO")
  })
})
