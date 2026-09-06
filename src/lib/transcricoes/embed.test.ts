import { describe, expect, it } from "vitest"
import { codigoDoInstagram, comandoSeek, idDoTiktok, idDoYoutube, montarEmbed } from "./embed"

describe("extração de id", () => {
  it("pega o id do YouTube em todas as formas que a normalização produz", () => {
    expect(idDoYoutube("https://youtube.com/watch?v=abc123")).toBe("abc123")
    expect(idDoYoutube("https://www.youtube.com/watch?v=abc123&t=90")).toBe("abc123")
    expect(idDoYoutube("https://youtu.be/abc123")).toBe("abc123")
    expect(idDoYoutube("https://youtube.com/shorts/abc123")).toBe("abc123")
    expect(idDoYoutube("https://youtube.com/live/abc123")).toBe("abc123")
  })

  it("recusa host que não é do YouTube", () => {
    // Sem isso, "meuyoutube.com.br/watch?v=x" viraria um embed do YouTube
    // com id inventado — iframe quebrado sem explicação.
    expect(idDoYoutube("https://vimeo.com/watch?v=abc")).toBeNull()
    expect(idDoYoutube("não é url")).toBeNull()
  })

  it("pega reel, post e tv do Instagram", () => {
    expect(codigoDoInstagram("https://instagram.com/p/CODE1")).toBe("CODE1")
    expect(codigoDoInstagram("https://www.instagram.com/reel/CODE2/")).toBe("CODE2")
    expect(codigoDoInstagram("https://instagram.com/tv/CODE3")).toBe("CODE3")
    expect(codigoDoInstagram("https://tiktok.com/p/CODE")).toBeNull()
  })

  it("pega o id numérico do TikTok", () => {
    expect(idDoTiktok("https://tiktok.com/@perfil/video/7123456789")).toBe("7123456789")
    expect(idDoTiktok("https://www.tiktok.com/@a.b/video/7123456789?is_from_webapp=1")).toBe("7123456789")
    // O encurtador vm.tiktok.com só o yt-dlp resolve; aqui não há id.
    expect(idDoTiktok("https://vm.tiktok.com/ZMabc/")).toBeNull()
  })
})

describe("montarEmbed", () => {
  it("YouTube aceita tempo e leva o start quando há posição inicial", () => {
    const e = montarEmbed("https://youtube.com/watch?v=abc123", "youtube", 754)
    expect(e?.aceitaTempo).toBe(true)
    expect(e?.proporcao).toBe("16/9")
    expect(e?.url).toContain("/embed/abc123")
    expect(e?.url).toContain("start=754")
    // enablejsapi é o que permite o seekTo sem recarregar o iframe.
    expect(e?.url).toContain("enablejsapi=1")
  })

  it("não escreve start=0 — parâmetro à toa muda a URL sem mudar nada", () => {
    expect(montarEmbed("https://youtube.com/watch?v=abc123", "youtube", 0)?.url).not.toContain("start=")
    expect(montarEmbed("https://youtube.com/watch?v=abc123", "youtube", null)?.url).not.toContain("start=")
  })

  it("Instagram e TikTok embutem mas NÃO aceitam pular para o tempo", () => {
    // É a diferença que a tela precisa respeitar: prometer o pulo e não
    // entregar é pior do que dizer que o player não faz isso.
    const ig = montarEmbed("https://instagram.com/p/CODE1", "instagram", 300)
    expect(ig?.aceitaTempo).toBe(false)
    expect(ig?.proporcao).toBe("9/16")
    expect(ig?.url).toBe("https://www.instagram.com/p/CODE1/embed")
    expect(ig?.url).not.toContain("300")

    const tt = montarEmbed("https://tiktok.com/@p/video/7123456789", "tiktok", 300)
    expect(tt?.aceitaTempo).toBe(false)
    expect(tt?.url).toBe("https://www.tiktok.com/embed/v2/7123456789")
  })

  it("upload não tem o que embutir", () => {
    // O arquivo é descartado depois da transcrição: sobra o texto.
    expect(montarEmbed("https://qualquer.coisa/x.mp4", "upload", 0)).toBeNull()
  })

  it("URL ausente ou irreconhecível devolve null em vez de iframe quebrado", () => {
    expect(montarEmbed(null, "youtube", 0)).toBeNull()
    expect(montarEmbed("", "youtube", 0)).toBeNull()
    expect(montarEmbed("https://youtube.com/playlist?list=PL1", "youtube", 0)).toBeNull()
  })
})

describe("comandoSeek", () => {
  it("monta o comando da IFrame API com o segundo inteiro", () => {
    expect(JSON.parse(comandoSeek(93.7))).toEqual({
      event: "command",
      func: "seekTo",
      args: [93, true],
    })
  })

  it("nunca manda segundo negativo", () => {
    expect(JSON.parse(comandoSeek(-5)).args[0]).toBe(0)
  })
})
