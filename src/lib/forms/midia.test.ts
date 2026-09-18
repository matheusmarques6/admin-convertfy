import { describe, it, expect } from "vitest"
import { normalizarMidia, urlDeMidiaUtil } from "./midia"

describe("urlDeMidiaUtil", () => {
  it("aceita http, https e caminho do próprio domínio", () => {
    expect(urlDeMidiaUtil("https://cdn.convertfy.me/a.png")).toBe(true)
    expect(urlDeMidiaUtil("http://exemplo.com/a.png")).toBe(true)
    expect(urlDeMidiaUtil("/uploads/video.mp4")).toBe(true)
  })

  it("recusa esquema executável, em qualquer caixa", () => {
    // A mídia vai para um `src` de página pública: é o mesmo risco do
    // destino do final, e a mesma régua.
    expect(urlDeMidiaUtil("javascript:alert(1)")).toBe(false)
    expect(urlDeMidiaUtil("JaVaScRiPt:alert(1)")).toBe(false)
    expect(urlDeMidiaUtil("  javascript:alert(1)  ")).toBe(false)
  })

  it("recusa data: — um vídeo em base64 seria servido em toda visita", () => {
    expect(urlDeMidiaUtil("data:image/png;base64,iVBORw0KGgo=")).toBe(false)
  })

  it("recusa protocolo-relativo, vazio e não-string", () => {
    expect(urlDeMidiaUtil("//outro.com/a.png")).toBe(false)
    expect(urlDeMidiaUtil("")).toBe(false)
    expect(urlDeMidiaUtil("   ")).toBe(false)
    expect(urlDeMidiaUtil(null)).toBe(false)
    expect(urlDeMidiaUtil(undefined)).toBe(false)
  })
})

describe("normalizarMidia", () => {
  it("mídia sem url utilizável vira null — a tela segue sem ela", () => {
    expect(normalizarMidia({ tipo: "imagem", url: "javascript:x" })).toBeNull()
    expect(normalizarMidia({ tipo: "imagem" })).toBeNull()
    expect(normalizarMidia(null)).toBeNull()
    expect(normalizarMidia("https://x.com/a.png")).toBeNull()
  })

  it("deduz o tipo pela extensão quando ele não vem", () => {
    expect(normalizarMidia({ url: "/a/video.mp4" })?.tipo).toBe("video")
    expect(normalizarMidia({ url: "/a/clip.webm?v=2" })?.tipo).toBe("video")
    expect(normalizarMidia({ url: "/a/print.png" })?.tipo).toBe("imagem")
  })

  it("na dúvida é IMAGEM: vídeo em <img> mostra algo, imagem em <video> some", () => {
    expect(normalizarMidia({ url: "https://cdn.x/arquivo" })?.tipo).toBe("imagem")
    expect(normalizarMidia({ tipo: "coisa", url: "/a.png" })?.tipo).toBe("imagem")
  })

  it("alt ausente é null — imagem decorativa não é lida pelo leitor de tela", () => {
    expect(normalizarMidia({ url: "/a.png" })?.alt).toBeNull()
    expect(normalizarMidia({ url: "/a.png", alt: "Dashboard" })?.alt).toBe("Dashboard")
  })

  it("autoplay e poster só entram quando válidos", () => {
    const m = normalizarMidia({ url: "/v.mp4", autoplay: true, poster: "/p.png" })
    expect(m).toEqual({ tipo: "video", url: "/v.mp4", alt: null, autoplay: true, poster: "/p.png" })
    const semPoster = normalizarMidia({ url: "/v.mp4", poster: "javascript:x" })
    expect(semPoster).not.toHaveProperty("poster")
    expect(normalizarMidia({ url: "/v.mp4", autoplay: "sim" })).not.toHaveProperty("autoplay")
  })

  it("apara o espaço em volta da url", () => {
    expect(normalizarMidia({ url: "  /a.png  " })?.url).toBe("/a.png")
  })
})
