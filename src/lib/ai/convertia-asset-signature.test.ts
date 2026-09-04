import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  publicConvertiaAssetUrl,
  signConvertiaAssetPath,
  verifyConvertiaAssetSignature,
} from "./convertia-asset-signature"

const PATH =
  "stores/493b3ca0-b34b-41d9-beae-796e9c7ca3eb/email-assets/e8489a01-fdd3-4d56-82a7-e4d6857f7244.png"

describe("assinatura de asset público", () => {
  const saved = process.env.ENCRYPTION_KEY
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "a".repeat(64)
  })
  afterEach(() => {
    process.env.ENCRYPTION_KEY = saved
  })

  it("assina e verifica o mesmo path", () => {
    const sig = signConvertiaAssetPath(PATH)
    expect(sig.length).toBeGreaterThan(30)
    expect(verifyConvertiaAssetSignature(PATH, sig)).toBe(true)
  })

  it("um caractere a mais no path invalida — o bug da signed URL do Supabase", () => {
    const sig = signConvertiaAssetPath(PATH)
    expect(verifyConvertiaAssetSignature(PATH.replace("796e9c7ca3eb", "796e9c7c7ca3eb"), sig)).toBe(
      false,
    )
  })

  it("recusa assinatura errada, vazia ou lixo", () => {
    expect(verifyConvertiaAssetSignature(PATH, "")).toBe(false)
    expect(verifyConvertiaAssetSignature(PATH, null)).toBe(false)
    expect(verifyConvertiaAssetSignature(PATH, "abc")).toBe(false)
    expect(verifyConvertiaAssetSignature(PATH, signConvertiaAssetPath("outro/path.png"))).toBe(false)
  })

  it("path fora da árvore de assets nunca valida, mesmo assinado", () => {
    // a rota pública usa service role: o formato do path É a fronteira
    const evil = "stores/../../secrets/key.png"
    expect(verifyConvertiaAssetSignature(evil, signConvertiaAssetPath(evil))).toBe(false)
  })

  it("a chave muda → todas as assinaturas caem (revogação)", () => {
    const sig = signConvertiaAssetPath(PATH)
    process.env.ENCRYPTION_KEY = "b".repeat(64)
    expect(verifyConvertiaAssetSignature(PATH, sig)).toBe(false)
  })

  it("monta a URL absoluta com a assinatura e ida-e-volta", () => {
    const url = publicConvertiaAssetUrl("https://app.convertfy.me/", PATH)
    expect(url.startsWith(`https://app.convertfy.me/api/public/convertia-asset/${PATH}?sig=`)).toBe(
      true,
    )
    const sig = new URL(url).searchParams.get("sig")
    expect(verifyConvertiaAssetSignature(PATH, sig)).toBe(true)
  })

  it("sem ENCRYPTION_KEY não assina", () => {
    delete process.env.ENCRYPTION_KEY
    expect(() => signConvertiaAssetPath(PATH)).toThrow()
    expect(verifyConvertiaAssetSignature(PATH, "x")).toBe(false)
  })
})
