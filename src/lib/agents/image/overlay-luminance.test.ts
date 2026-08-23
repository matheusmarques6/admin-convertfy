import { describe, it, expect } from "vitest"
import sharp from "sharp"
import {
  hasOverlay,
  overlayFraction,
  overlaySpec,
  measureOverlayLuminance,
  overlayIsLight,
  DEFAULT_OVERLAY_FRACTION,
} from "./overlay-luminance"

/** Imagem sintética: metade de cima numa cor, metade de baixo em outra. */
async function meiaAMeia(topo: string, base: string): Promise<Buffer> {
  const faixa = (cor: string) =>
    sharp({
      create: {
        width: 40,
        height: 50,
        channels: 3,
        background: cor,
      },
    })
      .png()
      .toBuffer()
  const [a, b] = await Promise.all([faixa(topo), faixa(base)])
  return sharp({
    create: { width: 40, height: 100, channels: 3, background: "#000000" },
  })
    .composite([
      { input: a, top: 0, left: 0 },
      { input: b, top: 50, left: 0 },
    ])
    .png()
    .toBuffer()
}

describe("hasOverlay", () => {
  it("reconhece o vocabulário do cadastro real", () => {
    // Guidance de `hero_campanha_editorial` (welcome - hero section 4).
    expect(
      hasOverlay(
        "Onde fica: fundo de todo o e-mail; wordmark, lockup, tagline, cupom e CTA são sobrepostos aos 43% superiores.",
      ),
    ).toBe(true)
    expect(hasOverlay("Parede lisa ... para receber todo o overlay.")).toBe(true)
  })

  it("imagem de ilustração não é overlay", () => {
    expect(hasOverlay("Ideia: detalhe lateral do mesmo item e cor.")).toBe(false)
    expect(hasOverlay(null)).toBe(false)
  })
})

describe("overlayFraction", () => {
  it("lê a fração do próprio cadastro", () => {
    expect(overlayFraction("sobrepostos aos 43% superiores")).toBeCloseTo(0.43)
    expect(overlayFraction("ocupa os 60% do topo")).toBeCloseTo(0.6)
  })

  it("sem número, usa o default", () => {
    expect(overlayFraction("texto sobreposto na imagem")).toBe(
      DEFAULT_OVERLAY_FRACTION,
    )
    expect(overlayFraction(null)).toBe(DEFAULT_OVERLAY_FRACTION)
  })

  it("fração absurda cai no default (100% seria medir a foto inteira)", () => {
    expect(overlayFraction("100% superiores")).toBe(DEFAULT_OVERLAY_FRACTION)
    expect(overlayFraction("2% superiores")).toBe(DEFAULT_OVERLAY_FRACTION)
  })
})

describe("measureOverlayLuminance", () => {
  it("mede a faixa DE CIMA, não a imagem inteira", async () => {
    // Topo creme (como a hero que saiu), base escura.
    const buf = await meiaAMeia("#FAF5F3", "#1A1A1A")
    const topo = await measureOverlayLuminance(buf, 0.45)
    const inteira = await measureOverlayLuminance(buf, 0.95)
    expect(topo).not.toBeNull()
    expect(topo as number).toBeGreaterThan(0.8)
    // A imagem inteira dilui: é justamente por isso que a faixa importa.
    expect(inteira as number).toBeLessThan(topo as number)
  })

  it("faixa escura devolve luminância baixa", async () => {
    const buf = await meiaAMeia("#1A1A1A", "#FAF5F3")
    const topo = await measureOverlayLuminance(buf, 0.45)
    expect(topo as number).toBeLessThan(0.1)
  })

  it("buffer inválido devolve null em vez de derrubar a geração", async () => {
    expect(await measureOverlayLuminance(Buffer.from("nao sou imagem"))).toBeNull()
  })
})

describe("overlayIsLight", () => {
  it("o creme da hero reprova; o escuro passa", async () => {
    const claro = await measureOverlayLuminance(
      await meiaAMeia("#FAF5F3", "#FAF5F3"),
      0.45,
    )
    const escuro = await measureOverlayLuminance(
      await meiaAMeia("#3D2820", "#3D2820"),
      0.45,
    )
    expect(overlayIsLight(claro)).toBe(true)
    expect(overlayIsLight(escuro)).toBe(false)
  })

  it("sem medição não afirma nada", () => {
    expect(overlayIsLight(null)).toBe(false)
  })
})

describe("overlaySpec", () => {
  it("lê lado e fração do cadastro real da hero", () => {
    // `hero_campanha_editorial` de `welcome - hero section 4`.
    const spec = overlaySpec(
      "Onde fica: fundo de todo o e-mail; wordmark, lockup, tagline, cupom e" +
        " CTA são sobrepostos aos 43% superiores.",
    )
    expect(spec).toEqual({ side: "top", fraction: 0.43 })
  })

  it("overlay embaixo é reconhecido, com a fração do texto", () => {
    const spec = overlaySpec("texto sobreposto aos 30% inferiores da foto")
    expect(spec).toEqual({ side: "bottom", fraction: 0.3 })
  })

  it("sem lado explícito assume o topo — é o padrão da biblioteca", () => {
    expect(overlaySpec("headline sobreposta à imagem")).toEqual({
      side: "top",
      fraction: DEFAULT_OVERLAY_FRACTION,
    })
  })

  it("campo sem overlay devolve null (sem instrução, como antes)", () => {
    expect(overlaySpec("Ideia: detalhe lateral do mesmo item e cor.")).toBeNull()
    expect(overlaySpec(null)).toBeNull()
  })
})

describe("measureOverlayLuminance — lado", () => {
  it("mede a faixa de BAIXO quando o cadastro pede overlay embaixo", async () => {
    const buf = await meiaAMeia("#1A1A1A", "#FAF5F3")
    const base = await measureOverlayLuminance(buf, 0.45, "bottom")
    const topo = await measureOverlayLuminance(buf, 0.45, "top")
    expect(base as number).toBeGreaterThan(0.8)
    expect(topo as number).toBeLessThan(0.1)
  })
})
