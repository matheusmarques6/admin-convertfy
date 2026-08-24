import { describe, expect, it } from "vitest"

import {
  contrastRatio,
  deriveColorRoles,
  deriveSurfaces,
  relativeLuminance,
} from "./color-roles"

describe("deriveColorRoles", () => {
  it("paleta vazia → defaults seguros (bg branco, text preto)", () => {
    const r = deriveColorRoles([], [])
    expect(r.bg).toBe("#FFFFFF")
    expect(r.text).toBe("#1F1F1F")
    expect(r.heading).toBe("#1F1F1F")
    expect(r.button_bg).toBe("#1F1F1F")
    expect(r.button_text).toBe("#FFFFFF")
    // accent != button_bg por causa do luminance shift (fix P1.7).
    // Em paleta vazia, button_bg cai em DEFAULT_DARK e o accent
    // calculado em fallback colide com ele — shift garante variacao.
    expect(r.accent).not.toBe(r.button_bg)
  })

  it("usa role explicito Fundo / Principal / Destaque quando presente", () => {
    const r = deriveColorRoles(
      [
        { hex: "#FFF5EE", name: "Creme", role: "Fundo" },
        { hex: "#2C1810", name: "Cacau", role: "Principal" },
        { hex: "#D4621A", name: "Laranja", role: "Destaque" },
      ],
      [],
    )
    expect(r.bg).toBe("#FFF5EE")
    expect(r.text).toBe("#1F1F1F") // bg claro → texto preto
    expect(r.heading).toBe("#2C1810") // Principal contrasta com bg claro
    expect(r.button_bg).toBe("#2C1810")
    expect(r.button_text).toBe("#FFFFFF") // button escuro → texto branco
    expect(r.accent).toBe("#D4621A")
  })

  it("sem role definido cai em fallback: lightest=bg, primeira primaria=button", () => {
    const r = deriveColorRoles(
      [
        { hex: "#000000", name: "Preto", role: "" },
        { hex: "#F0F0F0", name: "Cinza", role: "" },
      ],
      [],
    )
    expect(r.bg).toBe("#F0F0F0") // mais clara
    expect(r.button_bg).toBe("#000000") // primeira primaria
    expect(r.button_text).toBe("#FFFFFF")
  })

  it("aceita hex sem # e shorthand 3-digits", () => {
    const r = deriveColorRoles(
      [{ hex: "fff", name: "Branco", role: "Fundo" }],
      [{ hex: "000", name: "Preto", role: "Destaque" }],
    )
    expect(r.bg).toBe("#FFFFFF")
    expect(r.accent).toBe("#000000")
  })

  it("descarta hex invalido sem quebrar derivacao", () => {
    const r = deriveColorRoles(
      [
        { hex: "not-a-color", name: "Lixo", role: "Principal" },
        { hex: "#3366FF", name: "Azul", role: "" },
      ],
      [],
    )
    expect(r.button_bg).toBe("#3366FF")
  })

  it("heading cai em text quando Principal nao contrasta com bg", () => {
    // Principal cinza médio em bg cinza claro → contraste < 4.5 → heading = text
    const r = deriveColorRoles(
      [
        { hex: "#FAFAFA", name: "Fundo", role: "Fundo" },
        { hex: "#A0A0A0", name: "Cinza", role: "Principal" },
      ],
      [],
    )
    expect(r.heading).toBe(r.text)
  })

  it("accent cai em segunda primaria quando nao ha role=Destaque", () => {
    const r = deriveColorRoles(
      [
        { hex: "#FFFFFF", name: "Branco", role: "Fundo" },
        { hex: "#000000", name: "Preto", role: "Principal" },
        { hex: "#FF6600", name: "Laranja", role: "" },
      ],
      [],
    )
    expect(r.accent).toBe("#FF6600")
  })

  it("paleta mono (so' uma cor preta) → accent NAO igual a button_bg", () => {
    const r = deriveColorRoles(
      [{ hex: "#000000", name: "Preto", role: "" }],
      [],
    )
    expect(r.button_bg).toBe("#000000")
    expect(r.accent).not.toBe(r.button_bg)
    // accent deve ter mudado por shift de luminance (clareou pq button_bg e' escuro)
    expect(r.accent).not.toBe("#000000")
  })

  it("paleta mono branca → accent escurece em vez de clarear", () => {
    const r = deriveColorRoles(
      [{ hex: "#FFFFFF", name: "Branco", role: "Principal" }],
      [],
    )
    expect(r.button_bg).toBe("#FFFFFF")
    expect(r.accent).not.toBe("#FFFFFF")
    // accent deve ter ficado mais escuro
    expect(r.accent).not.toBe(r.button_bg)
  })

  it("role Fundo ESCURO → guard força canvas branco (evita faixas pretas)", () => {
    // Captura de marca em site dark gravava Fundo=preto; o canvas do email
    // saía escuro em volta do container branco fixo = faixas pretas nas
    // laterais. O guard de luminance força branco e o text volta a preto.
    const r = deriveColorRoles(
      [
        { hex: "#0A0A0A", name: "Preto", role: "Fundo" },
        { hex: "#FFD700", name: "Ouro", role: "Principal" },
      ],
      [],
    )
    expect(r.bg).toBe("#FFFFFF")
    expect(r.text).toBe("#1F1F1F")
  })

  it("paleta toda escura sem role → fallback lightest é escuro → guard força branco", () => {
    // Caso real (lojas de moda com paleta preto/grafite): lightest() de
    // cores escuras ainda é escuro — sem o guard, o email saía com faixas
    // escuras nas laterais.
    const r = deriveColorRoles(
      [
        { hex: "#000000", name: "Preto", role: "" },
        { hex: "#3A3A3A", name: "Grafite", role: "" },
      ],
      [],
    )
    expect(r.bg).toBe("#FFFFFF")
    expect(r.text).toBe("#1F1F1F")
  })

  it("role Fundo CLARO segue respeitado (guard não interfere)", () => {
    const r = deriveColorRoles(
      [
        { hex: "#FAF7F2", name: "Areia", role: "Fundo" },
        { hex: "#1F1F1F", name: "Preto", role: "Principal" },
      ],
      [],
    )
    expect(r.bg).toBe("#FAF7F2")
  })
})

describe("superfícies (surface / surface_strong)", () => {
  // Paleta REAL da Luxe Lift: duas cores, e foi ela que produziu o colapso
  // de 7 cinzas de painel num único #FAF5F3.
  const LUXE = [
    { hex: "#3D2820", name: "Nova cor", role: "Principal" },
    { hex: "#FAF5F3", name: "Nova cor", role: "Principal" },
  ]

  it("os dois níveis são mais escuros que o canvas, em ordem", () => {
    const r = deriveColorRoles(LUXE, [])
    expect(r.bg).toBe("#FAF5F3")
    expect(relativeLuminance(r.surface)).toBeLessThan(relativeLuminance(r.bg))
    expect(relativeLuminance(r.surface_strong)).toBeLessThan(
      relativeLuminance(r.surface),
    )
  })

  it("o painel se separa do canvas o bastante para ser percebido", () => {
    const r = deriveColorRoles(LUXE, [])
    expect(contrastRatio(r.bg, r.surface)).toBeGreaterThanOrEqual(1.08)
  })

  it("o texto continua legível EM CIMA do painel", () => {
    const r = deriveColorRoles(LUXE, [])
    expect(contrastRatio(r.text, r.surface_strong)).toBeGreaterThanOrEqual(4.5)
  })

  it("as duas fórmulas produzem tons distintos, ambos válidos", () => {
    const lum = deriveColorRoles(LUXE, [], "luminance")
    const mix = deriveColorRoles(LUXE, [], "mix")
    expect(lum.surface).not.toBe(mix.surface)
    for (const r of [lum, mix]) {
      expect(contrastRatio(r.bg, r.surface)).toBeGreaterThanOrEqual(1.08)
      expect(contrastRatio(r.text, r.surface_strong)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("bg médio-claro: o piso de LEITURA vence a separação", () => {
    // Canvas já puxado para o meio do caminho. Escurecer o painel na dose
    // cheia deixaria o texto escuro sem contraste; o tonalizador desce a
    // dose até passar, mesmo que o painel fique discreto.
    const r = deriveSurfaces("#8A8A8A", "#1F1F1F", "#1F1F1F", "luminance")
    expect(contrastRatio("#1F1F1F", r.surface_strong)).toBeGreaterThanOrEqual(
      4.5,
    )
  })

  it("paleta vazia ainda devolve superfícies utilizáveis", () => {
    const r = deriveColorRoles([], [])
    expect(r.bg).toBe("#FFFFFF")
    expect(r.surface).not.toBe(r.bg)
    expect(contrastRatio(r.text, r.surface)).toBeGreaterThanOrEqual(4.5)
  })

  it("a mistura puxa o painel na direção da cor escura da marca", () => {
    // Marca com escuro AZUL: o painel misturado tem de ficar mais azul que
    // o obtido só baixando a luminância do bege.
    const azul = [
      { hex: "#0B1D51", name: "x", role: "Principal" },
      { hex: "#FAF5F3", name: "y", role: "Fundo" },
    ]
    const mix = deriveColorRoles(azul, [], "mix")
    const lum = deriveColorRoles(azul, [], "luminance")
    const azulidade = (hex: string) =>
      parseInt(hex.slice(5, 7), 16) - parseInt(hex.slice(1, 3), 16)
    expect(azulidade(mix.surface_strong)).toBeGreaterThan(
      azulidade(lum.surface_strong),
    )
  })
})
