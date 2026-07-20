import { describe, expect, it } from "vitest"
import {
  applyRefinerDelta,
  applyShapesDelta,
  applySpacingDelta,
  extractFontOccurrences,
  extractRadiusOccurrences,
  extractSectionJunctions,
  extractSpacingOccurrences,
  injectFontImport,
  type RefinerDelta,
} from "./apply-delta"
import { findWhitelistFont } from "./font-whitelist"

// Fixture table-based no shape real dos emails do pipeline.
const EMAIL = `<!DOCTYPE html><html><head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap');
  body { font-family: Arial, sans-serif; }
  @media screen and (max-width:600px) { .h1 { font-size: 34px !important; } }
</style>
</head>
<body>
<table width="600">
  <tr><td style="font-family:'Montserrat',Arial,sans-serif;font-size:48px;font-weight:bold;">RADIANTLYHERS</td></tr>
  <tr><td style="font-family:'Montserrat',Arial,sans-serif;font-size:18px;">Dresses that look expensive without the price.</td></tr>
  <tr><td><a href="https://store.com" style="font-family:'Montserrat',Arial,sans-serif;font-size:16px;">SHOP NOW</a></td></tr>
  <tr><td style="font-family:'Inter',Arial,sans-serif;font-size:11px;">© 2026 Radiantlyhers. Unsubscribe.</td></tr>
</table>
</body></html>`

describe("extractFontOccurrences", () => {
  it("inventaria só as ocorrências do body, indexadas na ordem", () => {
    const occ = extractFontOccurrences(EMAIL)
    // 4 no body — as 2 do <style> (base + media query) ficam de fora.
    expect(occ).toHaveLength(4)
    expect(occ.map((o) => o.index)).toEqual([0, 1, 2, 3])
    expect(occ[0].fontSizePx).toBe(48)
    expect(occ[0].textSnippet).toContain("RADIANTLYHERS")
    expect(occ[3].textSnippet).toContain("Unsubscribe")
  })
})

describe("applyRefinerDelta", () => {
  const font = findWhitelistFont("Playfair Display")!

  it("troca só os índices alvo; demais ocorrências ficam intactas", () => {
    const delta: RefinerDelta = {
      strategy: "serif_luxury",
      rationale: "luxo",
      display_font: { family: "Playfair Display", weights: [700] },
      targets: [{ index: 0, role: "brand_name", font_weight: 700, letter_spacing: "-1.5px" }],
    }
    const out = applyRefinerDelta(EMAIL, delta, font)
    expect(out).toContain(
      "font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; font-weight: 700; letter-spacing: -1.5px",
    )
    // O corpo (índice 1), o CTA (2) e o legal (3) NÃO mudam:
    expect(out).toContain(`font-family:'Montserrat',Arial,sans-serif;font-size:18px`)
    expect(out).toContain(`font-family:'Montserrat',Arial,sans-serif;font-size:16px`)
    expect(out).toContain(`font-family:'Inter',Arial,sans-serif;font-size:11px`)
    // <style> do head intocado:
    expect(out).toContain("body { font-family: Arial, sans-serif; }")
  })

  it("clampa letter-spacing fora da faixa [-3px, 2px]", () => {
    const delta: RefinerDelta = {
      strategy: "serif_luxury",
      rationale: "",
      display_font: { family: "Playfair Display", weights: [] },
      targets: [{ index: 0, role: "brand_name", letter_spacing: "-9px" }],
    }
    const out = applyRefinerDelta(EMAIL, delta, font)
    expect(out).toContain("letter-spacing: -3px")
  })

  it("mono_weight_contrast mantém a família e só muda o peso", () => {
    const delta: RefinerDelta = {
      strategy: "mono_weight_contrast",
      rationale: "",
      display_font: null,
      targets: [{ index: 0, role: "brand_name", font_weight: 200 }],
    }
    const out = applyRefinerDelta(EMAIL, delta, null)
    expect(out).toContain("font-family: 'Montserrat',Arial,sans-serif; font-weight: 200")
  })

  it("peso indisponível na fonte → mais próximo disponível", () => {
    const dmSerif = findWhitelistFont("DM Serif Display")! // só 400
    const delta: RefinerDelta = {
      strategy: "serif_luxury",
      rationale: "",
      display_font: { family: "DM Serif Display", weights: [400] },
      targets: [{ index: 0, role: "brand_name", font_weight: 800 }],
    }
    const out = applyRefinerDelta(EMAIL, delta, dmSerif)
    expect(out).toContain("font-weight: 400")
  })

  it("strategy none / targets vazio → HTML byte-a-byte igual", () => {
    const none: RefinerDelta = { strategy: "none", rationale: "", display_font: null, targets: [] }
    expect(applyRefinerDelta(EMAIL, none, null)).toBe(EMAIL)
  })
})

describe("injectFontImport", () => {
  const RULE =
    "@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap');"

  it("injeta no primeiro <style> e é idempotente", () => {
    const once = injectFontImport(EMAIL, RULE)
    expect(once).toContain(RULE)
    expect(once.indexOf(RULE)).toBeLessThan(once.indexOf("Montserrat:wght"))
    expect(injectFontImport(once, RULE)).toBe(once)
  })

  it("sem <style> → cria antes do </head>", () => {
    const bare = "<!DOCTYPE html><html><head></head><body></body></html>"
    const out = injectFontImport(bare, RULE)
    expect(out).toContain(`<style>`)
    expect(out).toContain(RULE)
  })
})

// ── Fixture v2: formas + espaçamento + seções no wrapper 600px ─────────
const EMAIL_V2 = `<!DOCTYPE html><html><head>
<style>.btn { border-radius: 4px; }</style>
</head>
<body style="margin:0">
<div style="max-width:600px;margin:0 auto;">
  <div style="padding-top:24px;padding-bottom:24px;">
    <img src="https://cdn/hero.png" style="width:100%;border-radius:12px;" />
    <h1 style="font-size:44px;">Welcome</h1>
    <a href="https://store.com/shop" style="background:#111;color:#fff;border-radius:5px;padding-top:12px;">SHOP NOW</a>
  </div>
  <div style="height:40px"></div>
  <div style="padding-top:16px;">
    <div style="border-radius: 50%;width:48px;height:48px;">A</div>
    <div style="border-radius:0;padding-bottom:60px;">Coupon WELCOME10</div>
    <a href="https://store.com/all" style="color:#111;">SHOP ALL</a>
  </div>
  <div style="margin-top:88px;line-height:20px;">Footer text</div>
</div>
</body></html>`

describe("extractRadiusOccurrences", () => {
  it("inventaria radius inline + <a> sem radius; exclui <img> e radius em %", () => {
    const occ = extractRadiusOccurrences(EMAIL_V2)
    // Esperados na ordem do body: a[5px], div[0], a[sem radius].
    // Fora: img (border-radius:12px — imagem NUNCA), div 50% (avatar),
    // divs sem radius que não são <a>, e o .btn do <style> do head.
    expect(occ).toHaveLength(3)
    expect(occ[0]).toMatchObject({ index: 0, tag: "a", hasRadius: true, currentPx: 5 })
    expect(occ[1]).toMatchObject({ index: 1, tag: "div", hasRadius: true, currentPx: 0 })
    expect(occ[2]).toMatchObject({ index: 2, tag: "a", hasRadius: false, currentPx: null })
    expect(occ[2].textSnippet).toContain("SHOP ALL")
  })
})

describe("applyShapesDelta", () => {
  it("substitui radius existente e adiciona em <a> sem radius, só nos alvos", () => {
    const out = applyShapesDelta(EMAIL_V2, [
      { index: 0, radius_px: 15 },
      { index: 2, radius_px: 5 },
    ])
    expect(out).toContain("border-radius: 15px;padding-top:12px")
    expect(out).toContain(`style="color:#111; border-radius: 5px;"`)
    // Não-alvos intactos: img continua 12px, cupom continua 0, avatar 50%.
    expect(out).toContain("border-radius:12px")
    expect(out).toContain("border-radius:0;padding-bottom:60px")
    expect(out).toContain("border-radius: 50%")
  })

  it("clampa radius_px em [0, 24]", () => {
    const out = applyShapesDelta(EMAIL_V2, [{ index: 0, radius_px: 80 }])
    expect(out).toContain("border-radius: 24px")
    const out2 = applyShapesDelta(EMAIL_V2, [{ index: 0, radius_px: -5 }])
    expect(out2).toContain("border-radius: 0px")
  })
})

describe("extractSpacingOccurrences", () => {
  it("inventaria longhands >= 8px do body; ignora line-height e o <style>", () => {
    const occ = extractSpacingOccurrences(EMAIL_V2)
    // padding-top:24, padding-bottom:24, height:48 (avatar), height:40
    // (spacer)... ordem do documento: 24, 24, 40, 16, 48, 60, 88.
    // padding-top:12 do CTA também entra (>= 8).
    const values = occ.map((o) => `${o.prop}:${o.currentPx}`)
    expect(values).toEqual([
      "padding-top:24",
      "padding-bottom:24",
      "padding-top:12",
      "height:40",
      "padding-top:16",
      "height:48",
      "padding-bottom:60",
      "margin-top:88",
    ])
    // line-height:20px NÃO entra:
    expect(occ.some((o) => o.currentPx === 20)).toBe(false)
  })
})

describe("extractSectionJunctions / applySpacingDelta", () => {
  it("acha as junções entre os filhos diretos do wrapper 600px", () => {
    const junctions = extractSectionJunctions(EMAIL_V2)
    // 4 filhos diretos (hero, spacer, cupom, footer) → 3 junções.
    expect(junctions).toHaveLength(3)
    expect(junctions[0].beforeSnippet).toContain("SHOP NOW")
    expect(junctions[2].afterSnippet).toContain("Footer")
  })

  it("adjust troca valores por índice (clampado) sem tocar o resto", () => {
    const out = applySpacingDelta(EMAIL_V2, [{ index: 7, value_px: 120 }], [])
    expect(out).toContain("margin-top: 120px")
    expect(out).toContain("padding-top:24px") // não-alvo intacto
    const clamped = applySpacingDelta(EMAIL_V2, [{ index: 7, value_px: 900 }], [])
    expect(clamped).toContain("margin-top: 160px")
  })

  it("insert injeta spacer na junção certa; junção inválida é ignorada", () => {
    const out = applySpacingDelta(EMAIL_V2, [], [
      { junction: 2, height_px: 64 },
      { junction: 99, height_px: 40 },
    ])
    const spacer = `<div style="height:64px"></div>`
    expect(out).toContain(spacer)
    // O spacer entra DEPOIS do cupom e ANTES do footer:
    expect(out.indexOf(spacer)).toBeGreaterThan(out.indexOf("WELCOME10"))
    expect(out.indexOf(spacer)).toBeLessThan(out.indexOf("Footer text"))
    // Junção 99 ignorada → só 1 spacer novo:
    expect(out.match(/height:64px/g)).toHaveLength(1)
  })

  it("teto de 6 inserções e clamp da altura do spacer", () => {
    const inserts = Array.from({ length: 8 }, (_, i) => ({
      junction: i % 3,
      height_px: 500,
    }))
    const out = applySpacingDelta(EMAIL_V2, [], inserts)
    const spacers = out.match(/<div style="height:160px"><\/div>/g) ?? []
    expect(spacers.length).toBeLessThanOrEqual(6)
    expect(spacers.length).toBeGreaterThan(0)
  })
})

describe("applySpacingDelta — spacers em junção de TABELA (foster parenting)", () => {
  // Email real (Montador) é table-based: as junções ficam entre </tr> e <tr>.
  // Uma <div> ali é inválida — o cliente de email a arranca da tabela e
  // empilha no TOPO (gap de ~430px na Luxe Lift w#3). O spacer precisa
  // virar <tr><td> válido no MESMO ponto.
  // Wrapper 600px é a PRÓPRIA <table> (como no email real do Montador) —
  // os filhos diretos são <tr>, então as junções caem entre </tr> e <tr>.
  const EMAIL_TABLE = `<!DOCTYPE html><html><body style="margin:0">
<table role="presentation" class="email-container" style="width:600px; max-width:600px;">
  <tr><td style="padding-top:24px;">HERO SHOP NOW</td></tr>
  <tr><td style="padding-bottom:60px;">Coupon WELCOME10</td></tr>
  <tr><td style="margin-top:88px;">Footer text</td></tr>
</table>
</body></html>`

  it("insert entre </tr> e <tr> vira <tr><td> válido — nunca <div> órfã", () => {
    // Sanidade da fixture: as junções REALMENTE existem entre as <tr>s.
    expect(extractSectionJunctions(EMAIL_TABLE)).toHaveLength(2)
    const out = applySpacingDelta(EMAIL_TABLE, [], [
      { junction: 0, height_px: 96 },
    ])
    // Nenhuma div-spacer órfã sobrevivendo entre linhas da tabela:
    expect(out).not.toMatch(/<\/tr>\s*<div\b[^>]*height/i)
    // O respiro existe como linha de tabela Outlook-safe:
    expect(out).toContain(
      'height:96px;line-height:96px;font-size:0;mso-line-height-rule:exactly;',
    )
  })

  it("normaliza a div órfã mesmo se o HTML já vier com uma (rede de segurança)", () => {
    const withOrphan = EMAIL_TABLE.replace(
      "</tr>\n  <tr><td style=\"padding-bottom:60px;\">",
      "</tr><div style=\"height:80px\"></div>\n  <tr><td style=\"padding-bottom:60px;\">",
    )
    const out = applySpacingDelta(withOrphan, [], [{ junction: 0, height_px: 64 }])
    expect(out).not.toMatch(/<\/tr>\s*<div\b[^>]*height/i)
  })
})

describe("applySpacingDelta — guard: height de elemento com background-image", () => {
  const EMAIL_HERO_BG = `<!DOCTYPE html><html><body style="margin:0">
<div style="max-width:600px;margin:0 auto;">
  <div style="background-image:url('https://cdn/hero.png');background-size:cover;height:320px;">HERO</div>
  <div style="padding-top:64px;">Texto</div>
</div>
</body></html>`

  it("recusa adjust que mexeria no height do hero bg (mídia, não respiro)", () => {
    // Inventário: height:320 (index 0), padding-top:64 (index 1).
    const occ = extractSpacingOccurrences(EMAIL_HERO_BG)
    expect(occ[0]).toMatchObject({ prop: "height", currentPx: 320 })

    const out = applySpacingDelta(EMAIL_HERO_BG, [{ index: 0, value_px: 160 }], [])
    expect(out).toContain("height:320px")   // intacto
    expect(out).not.toContain("height: 160px")
  })

  it("índices seguem sincronizados: adjust no padding (index 1) ainda funciona", () => {
    const out = applySpacingDelta(EMAIL_HERO_BG, [{ index: 1, value_px: 120 }], [])
    expect(out).toContain("padding-top: 120px")
    expect(out).toContain("height:320px")
  })
})
