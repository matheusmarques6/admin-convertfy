import { describe, expect, it } from "vitest"
import { decodeBase64Media, extForMime } from "./media"

describe("decodeBase64Media", () => {
  const helloB64 = Buffer.from("hello").toString("base64")

  it("base64 cru → buffer, sem mime", () => {
    const r = decodeBase64Media(helloB64)
    expect(r).not.toBeNull()
    expect(Buffer.from(r!.buffer).toString()).toBe("hello")
    expect(r!.mimeFromDataUri).toBeNull()
  })

  it("data-URI → buffer + mime extraído", () => {
    const r = decodeBase64Media(`data:image/png;base64,${helloB64}`)
    expect(r).not.toBeNull()
    expect(Buffer.from(r!.buffer).toString()).toBe("hello")
    expect(r!.mimeFromDataUri).toBe("image/png")
  })

  it("vazio/inválido → null", () => {
    expect(decodeBase64Media("")).toBeNull()
    expect(decodeBase64Media("data:image/png;base64,")).toBeNull()
  })
})

describe("extForMime", () => {
  it("mime conhecido, com e sem parâmetros", () => {
    expect(extForMime("audio/ogg")).toBe("ogg")
    expect(extForMime("audio/ogg; codecs=opus")).toBe("ogg")
  })
  it("desconhecido cai no sufixo do mime; null → bin", () => {
    expect(extForMime("application/x-foo")).toBe("xfoo")
    expect(extForMime(null)).toBe("bin")
  })
})
