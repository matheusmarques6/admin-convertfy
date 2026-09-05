/**
 * A URL normalizada é a chave de deduplicação. Os dois erros possíveis são
 * silenciosos: variar com rastreador duplica o vídeo na biblioteca; colapsar
 * vídeos diferentes recusa o segundo como duplicado e ele nunca é
 * transcrito. Daí a bateria abaixo.
 */

import { describe, expect, it } from "vitest"
import { detectarPlataforma, extrairLinks, limparUrl, linksNaoSuportados, normalizarUrl } from "./url"

describe("detectarPlataforma", () => {
  it("reconhece as três plataformas em qualquer forma de host", () => {
    expect(detectarPlataforma("https://www.youtube.com/watch?v=abc")).toBe("youtube")
    expect(detectarPlataforma("youtu.be/abc")).toBe("youtube")
    expect(detectarPlataforma("https://www.youtube-nocookie.com/embed/abc")).toBe("youtube")
    expect(detectarPlataforma("https://instagram.com/reel/XYZ/")).toBe("instagram")
    expect(detectarPlataforma("https://vm.tiktok.com/ZM123/")).toBe("tiktok")
  })

  it("devolve null para o que não é plataforma suportada", () => {
    expect(detectarPlataforma("https://vimeo.com/12345")).toBeNull()
    expect(detectarPlataforma("não é url")).toBeNull()
    expect(detectarPlataforma("")).toBeNull()
  })
})

describe("normalizarUrl", () => {
  it("colapsa as formas do MESMO vídeo do YouTube", () => {
    const canonica = "https://youtube.com/watch?v=dQw4w9WgXcQ"
    for (const forma of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ?si=abc123",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=news&feature=share",
    ]) {
      expect(normalizarUrl(forma)).toBe(canonica)
    }
  })

  it("não colapsa vídeos diferentes", () => {
    expect(normalizarUrl("https://youtu.be/aaa")).not.toBe(normalizarUrl("https://youtu.be/bbb"))
  })

  it("reel, reels e p do Instagram apontam para a mesma mídia", () => {
    const c = "https://instagram.com/p/CxYz123"
    expect(normalizarUrl("https://www.instagram.com/reel/CxYz123/?igsh=xx")).toBe(c)
    expect(normalizarUrl("https://instagram.com/reels/CxYz123")).toBe(c)
    expect(normalizarUrl("https://instagram.com/p/CxYz123/")).toBe(c)
  })

  it("TikTok mantém perfil e id do vídeo", () => {
    expect(normalizarUrl("https://www.tiktok.com/@convertfy/video/7412?is_from_webapp=1")).toBe(
      "https://tiktok.com/@convertfy/video/7412",
    )
  })

  it("URL que não é plataforma suportada não vira chave de dedupe", () => {
    // Sem chave o dedupe não opina: melhor entrar duas vezes do que recusar
    // um vídeo legítimo por palpite.
    expect(normalizarUrl("https://vimeo.com/999")).toBeNull()
  })
})

describe("limparUrl", () => {
  it("tira rastreadores e fragmento, preserva o resto", () => {
    expect(limparUrl("https://youtube.com/watch?v=abc&t=42&utm_medium=x&si=y#top")).toBe(
      "https://youtube.com/watch?v=abc&t=42",
    )
  })

  it("completa o esquema quando falta", () => {
    expect(limparUrl("youtu.be/abc")).toBe("https://youtu.be/abc")
  })
})

describe("extrairLinks", () => {
  it("aceita vários links, um por linha, na ordem digitada", () => {
    const t = `https://youtu.be/aaa
      https://instagram.com/reel/bbb/
      https://www.tiktok.com/@x/video/1`
    expect(extrairLinks(t)).toEqual([
      "https://youtu.be/aaa",
      "https://instagram.com/reel/bbb/",
      "https://www.tiktok.com/@x/video/1",
    ])
  })

  it("some com duplicata dentro do próprio texto", () => {
    // A fila não pode mostrar a mesma linha duas vezes antes de chamar o
    // servidor: o usuário colou o mesmo vídeo em duas formas.
    const t = "https://youtu.be/aaa?si=1\nhttps://www.youtube.com/watch?v=aaa"
    expect(extrairLinks(t)).toHaveLength(1)
  })

  it("ignora texto solto e link de plataforma não suportada", () => {
    expect(extrairLinks("olha isso https://vimeo.com/1 e mais nada")).toEqual([])
  })
})

describe("linksNaoSuportados", () => {
  it("aponta o que parece link e não é suportado", () => {
    expect(linksNaoSuportados("https://vimeo.com/1 https://youtu.be/a")).toEqual(["https://vimeo.com/1"])
  })
})
