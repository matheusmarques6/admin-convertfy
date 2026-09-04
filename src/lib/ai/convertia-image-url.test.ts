import { describe, expect, it } from "vitest"
import {
  convertiaImageUrl,
  isConvertiaImagePath,
  rewriteStorageImageSrc,
  storagePathFromUrl,
} from "./convertia-image-url"

const PATH =
  "stores/493b3ca0-b34b-41d9-beae-796e9c7ca3eb/email-assets/e8489a01-fdd3-4d56-82a7-e4d6857f7244.png"

describe("isConvertiaImagePath", () => {
  it("aceita o caminho de loja e o de org", () => {
    expect(isConvertiaImagePath(PATH)).toBe(true)
    expect(
      isConvertiaImagePath(
        "stores/org-493b3ca0-b34b-41d9-beae-796e9c7ca3eb/email-assets/a.webp",
      ),
    ).toBe(true)
  })

  it("recusa travessia de diretório e caminhos de fora", () => {
    // a rota usa service role: o path É a fronteira
    expect(isConvertiaImagePath("stores/../../secrets/key.png")).toBe(false)
    expect(isConvertiaImagePath("stores/493b3ca0/email-assets/a.png")).toBe(false)
    expect(
      isConvertiaImagePath(
        "logos/493b3ca0-b34b-41d9-beae-796e9c7ca3eb/email-assets/a.png",
      ),
    ).toBe(false)
    expect(
      isConvertiaImagePath(
        "stores/493b3ca0-b34b-41d9-beae-796e9c7ca3eb/email-assets/a.svg",
      ),
    ).toBe(false)
  })
})

describe("storagePathFromUrl", () => {
  it("extrai o path de uma signed URL (o caso que quebrou)", () => {
    const signed = `https://x.supabase.co/storage/v1/object/sign/onboarding-visual-assets/${PATH}?token=eyJhbGciOi.abc.def`
    expect(storagePathFromUrl(signed)).toBe(PATH)
  })

  it("extrai de URL pública e autenticada", () => {
    expect(
      storagePathFromUrl(
        `https://x.supabase.co/storage/v1/object/public/onboarding-visual-assets/${PATH}`,
      ),
    ).toBe(PATH)
    expect(
      storagePathFromUrl(
        `https://x.supabase.co/storage/v1/object/onboarding-visual-assets/${PATH}`,
      ),
    ).toBe(PATH)
  })

  it("ignora outro bucket, outro host e path inválido", () => {
    expect(
      storagePathFromUrl(`https://x.supabase.co/storage/v1/object/public/logos/${PATH}`),
    ).toBeNull()
    expect(storagePathFromUrl("https://exemplo.com/foto.png")).toBeNull()
    expect(
      storagePathFromUrl(
        "https://x.supabase.co/storage/v1/object/sign/onboarding-visual-assets/../../etc/passwd",
      ),
    ).toBeNull()
  })
})

describe("convertiaImageUrl / rewrite", () => {
  it("monta a rota do admin", () => {
    expect(convertiaImageUrl(PATH)).toBe(`/api/ai/convertia/imagem/${PATH}`)
  })

  it("reescreve a signed URL do histórico e preserva o resto", () => {
    const signed = `https://x.supabase.co/storage/v1/object/sign/onboarding-visual-assets/${PATH}?token=abc`
    expect(rewriteStorageImageSrc(signed)).toBe(`/api/ai/convertia/imagem/${PATH}`)
    expect(rewriteStorageImageSrc("https://cdn.shopify.com/produto.jpg")).toBe(
      "https://cdn.shopify.com/produto.jpg",
    )
    expect(rewriteStorageImageSrc("/api/ai/convertia/imagem/x")).toBe(
      "/api/ai/convertia/imagem/x",
    )
  })

  it("ida e volta: a URL da rota volta a ser o path", () => {
    expect(convertiaImageUrl(PATH).endsWith(PATH)).toBe(true)
  })
})
