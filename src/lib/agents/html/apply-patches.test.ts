/**
 * Aplicador de ops do color_format — o vocabulário encolheu em 20/08:
 * img/set_text/remove_slot/remove_row viraram código (image-merge e
 * copy-merge); sobraram replace (find único) e recolor (troca global por
 * valor de cor).
 */

import { describe, it, expect } from "vitest"
import { applyOps, parseOps, OpsParseError } from "./apply-patches"
import { HERO_SENTINEL_START, HERO_SENTINEL_END } from "./hero-locator"

describe("parseOps", () => {
  it("aceita replace e recolor com envelope {ops:[...]}", () => {
    const ops = parseOps(
      '{"ops":[{"action":"replace","find":"x","replace":"y"},{"action":"recolor","from":"#111111","to":"#222222"}]}',
    )
    expect(ops).toHaveLength(2)
    expect(ops[0]).toMatchObject({ action: "replace", find: "x" })
    expect(ops[1]).toMatchObject({ action: "recolor", from: "#111111" })
  })

  it("action do vocabulário antigo (set_text/img) é ERRO de config, não silêncio", () => {
    expect(() =>
      parseOps('{"ops":[{"action":"set_text","tag":"X","value":"y"}]}'),
    ).toThrow(OpsParseError)
    expect(() =>
      parseOps('{"ops":[{"action":"img","tag":"X","url":"https://x"}]}'),
    ).toThrow(OpsParseError)
  })

  it("recolor com from/to que não são cor é rejeitado no parse", () => {
    expect(() =>
      parseOps('{"ops":[{"action":"recolor","from":"azul","to":"#111111"}]}'),
    ).toThrow(OpsParseError)
  })

  it("fences markdown e texto em volta são tolerados", () => {
    const ops = parseOps(
      'antes\n```json\n{"ops":[{"action":"replace","find":"a","replace":"b"}]}\n```',
    )
    expect(ops).toHaveLength(1)
  })
})

describe("applyOps — replace", () => {
  it("find ÚNICO é trocado; ambíguo e ausente são pulados com a razão", () => {
    const html = "<td>alpha</td><td>beta</td><td>beta</td>"
    const r = applyOps(
      html,
      [
        { action: "replace", find: "alpha", replace: "ALPHA" },
        { action: "replace", find: "beta", replace: "BETA" },
        { action: "replace", find: "gamma", replace: "GAMMA" },
      ],
      { allowHero: true },
    )
    expect(r.html).toContain("ALPHA")
    expect(r.html).not.toContain("BETA")
    expect(r.applied).toBe(1)
    expect(r.skipped.map((s) => s.reason).sort()).toEqual([
      "find_ambiguous",
      "find_not_found",
    ])
  })

  it("hero protegida quando allowHero=false; liberada quando true", () => {
    const html = [
      "<table>",
      HERO_SENTINEL_START,
      "<tr><td>hero copy</td></tr>",
      HERO_SENTINEL_END,
      "</table>",
    ].join("\n")
    const blocked = applyOps(
      html,
      [{ action: "replace", find: "hero copy", replace: "x" }],
      { allowHero: false },
    )
    expect(blocked.skipped[0].reason).toBe("hero_protected")
    const allowed = applyOps(
      html,
      [{ action: "replace", find: "hero copy", replace: "nova copy" }],
      { allowHero: true },
    )
    expect(allowed.html).toContain("nova copy")
  })

  it("splices sobrepostos: o da direita vence, o outro vira overlapping_edit", () => {
    const html = "<td>um dois tres</td>"
    const r = applyOps(
      html,
      [
        { action: "replace", find: "um dois tres", replace: "A" },
        { action: "replace", find: "dois", replace: "B" },
      ],
      { allowHero: true },
    )
    expect(r.skipped.some((s) => s.reason === "overlapping_edit")).toBe(true)
    expect(r.applied).toBe(1)
  })
})

describe("applyOps — recolor", () => {
  it("troca global por VALOR (todas as formas equivalentes) e conta como aplicada", () => {
    const html =
      '<td style="color:#111111">a</td><td bgcolor="#111111">b</td>'
    const r = applyOps(
      html,
      [{ action: "recolor", from: "#111111", to: "#ABCDEF" }],
      { allowHero: true },
    )
    expect(r.html).not.toContain("#111111")
    expect((r.html.match(/#ABCDEF/gi) ?? []).length).toBe(2)
    expect(r.applied).toBe(1)
  })

  it("cor ausente no documento → find_not_found (telemetria, não erro)", () => {
    const r = applyOps(
      "<td>sem cor</td>",
      [{ action: "recolor", from: "#123456", to: "#654321" }],
      { allowHero: true },
    )
    expect(r.applied).toBe(0)
    expect(r.skipped[0].reason).toBe("find_not_found")
  })
})

// ── recolor com escopo + guard de contraste (20/08) ────────────────────

describe("parseOps — where", () => {
  it("aceita where do vocabulário fechado", () => {
    const ops = parseOps(
      '{"ops":[{"action":"recolor","from":"#000000","to":"#3D2820","where":"background"}]}',
    )
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ action: "recolor", where: "background" })
  })

  it("op sem where continua válida (global)", () => {
    const ops = parseOps('{"ops":[{"action":"recolor","from":"#000","to":"#FFF"}]}')
    expect(ops[0]).not.toHaveProperty("where")
  })

  it("where fora do vocabulário lança OpsParseError", () => {
    expect(() =>
      parseOps(
        '{"ops":[{"action":"recolor","from":"#000","to":"#FFF","where":"botao"}]}',
      ),
    ).toThrow(OpsParseError)
  })
})

describe("applyOps — escopo e contraste", () => {
  const DOC = [
    '<td style="background:#000000;"><a style="color:#FFFFFF;">CTA</a></td>',
    '<p style="color:#000000;">corpo</p>',
  ].join("\n")

  it("aplica ops escopadas e conta OCORRÊNCIAS, não só ops", () => {
    const res = applyOps(
      DOC,
      [
        { action: "recolor", from: "#000000", to: "#3D2820", where: "background" },
        { action: "recolor", from: "#000000", to: "#1F1F1F", where: "color" },
      ],
      { allowHero: true },
    )
    expect(res.applied).toBe(2)
    expect(res.recoloredOccurrences).toBe(2)
    expect(res.html).toContain("background:#3D2820")
    expect(res.html).toContain("color:#1F1F1F")
  })

  it("guard: fundo e texto da mesma origem pro mesmo destino → contrast_risk", () => {
    const res = applyOps(
      DOC,
      [
        { action: "recolor", from: "#000000", to: "#3D2820", where: "background" },
        { action: "recolor", from: "#000000", to: "#3D2820", where: "color" },
      ],
      { allowHero: true },
    )
    expect(res.applied).toBe(1)
    expect(res.skipped).toHaveLength(1)
    expect(res.skipped[0].reason).toBe("contrast_risk")
    // O texto sobreviveu: nada de seção monocromática ilegível.
    expect(res.html).toContain('style="color:#000000;">corpo')
  })

  // Nome antigo era "destinos diferentes para fundo e texto passam", o que
  // soava como garantia de que o par estava seguro. Ele cobre só o guard de
  // seção monocromática; legibilidade é dos testes de conserto do PAR abaixo.
  it("guard monocromático não dispara quando os destinos diferem", () => {
    const res = applyOps(
      DOC,
      [
        { action: "recolor", from: "#000000", to: "#3D2820", where: "background" },
        { action: "recolor", from: "#000000", to: "#1F1F1F", where: "color" },
      ],
      { allowHero: true },
    )
    expect(res.skipped).toHaveLength(0)
  })

  // ── Conserto do PAR ────────────────────────────────────────────────
  // Regressao real (Luxe Lift, 22/08): o agente pintou o fundo de um botao
  // com a cor da marca e o rotulo branco ficou intacto — 1,05:1. Ate entao
  // um teste afirmava que "destinos diferentes passam", sem olhar se os
  // dois destinos eram ambos claros.
  const BOTAO = [
    '<table><tr><td style="width:556px;background:#BEBEBE;">',
    '<a style="font-size:25px;font-weight:700;color:#FFFFFF;">SHOP</a>',
    "</td></tr></table>",
  ].join("\n")

  it("recolor so do FUNDO que quebra o contraste conserta o texto em cima", () => {
    const res = applyOps(
      BOTAO,
      [{ action: "recolor", from: "#BEBEBE", to: "#FAF5F3", where: "background" }],
      { allowHero: true },
    )
    // A op vale: o botao fica na cor da marca.
    expect(res.applied).toBe(1)
    expect(res.html).toContain("background:#FAF5F3")
    // E o texto deixa de ser branco invisivel.
    expect(res.html).not.toContain("color:#FFFFFF")
    expect(res.pairedTextFixes).toBe(1)
    expect(res.contrastRemaining).toBe(0)
  })

  it("recolor de fundo que NAO quebra o contraste nao toca no texto", () => {
    const res = applyOps(
      BOTAO,
      [{ action: "recolor", from: "#BEBEBE", to: "#3D2820", where: "background" }],
      { allowHero: true },
    )
    expect(res.html).toContain("background:#3D2820")
    expect(res.html).toContain("color:#FFFFFF")
    expect(res.pairedTextFixes).toBe(0)
  })

  it("contraste que ja estava ruim ANTES nao e consertado em silencio", () => {
    // #BEBEBE + branco ja e 2,3:1. Sem op nenhuma tocando esse fundo, o
    // step nao mexe — o achado fica para o render-check reportar.
    const res = applyOps(
      BOTAO,
      [{ action: "recolor", from: "#123456", to: "#654321" }],
      { allowHero: true },
    )
    expect(res.pairedTextFixes).toBe(0)
    expect(res.html).toContain("color:#FFFFFF")
    expect(res.contrastRemaining).toBe(1)
  })

  it("fundo em FOTO: a op passa e o texto fica intacto (e a hero)", () => {
    const HERO = [
      '<table><tr><td style="background-image:url(https://cdn/h.png);">',
      '<div style="font-size:50px;color:#FFFFFF;">Welcome</div>',
      '</td></tr><tr><td style="background:#BEBEBE;">x</td></tr></table>',
    ].join("\n")
    const res = applyOps(
      HERO,
      [{ action: "recolor", from: "#BEBEBE", to: "#FAF5F3", where: "background" }],
      { allowHero: true },
    )
    expect(res.html).toContain("color:#FFFFFF")
    expect(res.pairedTextFixes).toBe(0)
  })

  it("op escopada sem alvo vira find_not_found", () => {
    const res = applyOps(
      DOC,
      [{ action: "recolor", from: "#000000", to: "#3D2820", where: "css-var" }],
      { allowHero: true },
    )
    expect(res.applied).toBe(0)
    expect(res.skipped[0].reason).toBe("find_not_found")
    expect(res.recoloredOccurrences).toBe(0)
  })
})

describe("guarda de PAINEL — o destaque que colapsa no próprio fundo", () => {
  // Tons derivados da paleta real da Luxe Lift (duas cores: #3D2820/#FAF5F3).
  const SURF = { surface: "#F3E6E1", surface_strong: "#E9D4CB" }

  /** Canvas branco com um painel cinza dentro — a forma da `produtos 4`. */
  const painel = (canvas: string, card: string) =>
    `<table width="600" style="background:${canvas};"><tr><td>` +
    `<table width="598" style="background:${card};"><tr><td>` +
    '<span style="color:#000000">Product Feature</span>' +
    "</td></tr></table></td></tr></table>"

  it("dois fundos aninhados no mesmo destino: o de dentro é reerguido", () => {
    // As ops REAIS do run 5f676526: o canvas e o card indo ao mesmo hex.
    const r = applyOps(
      painel("#FFFFFF", "#D9D9D9"),
      [
        { action: "recolor", from: "#FFFFFF", to: "#FAF5F3", where: "background" },
        { action: "recolor", from: "#D9D9D9", to: "#FAF5F3" },
      ],
      { allowHero: true, surfaces: SURF },
    )
    expect(r.panelFixes).toBe(1)
    expect(r.html).toContain("background:#FAF5F3;") // canvas
    expect(r.html).toContain(`background:${SURF.surface};`) // painel de pé
  })

  it("sem os tons de superfície, a guarda não roda (comportamento antigo)", () => {
    const r = applyOps(
      painel("#FFFFFF", "#D9D9D9"),
      [
        { action: "recolor", from: "#FFFFFF", to: "#FAF5F3", where: "background" },
        { action: "recolor", from: "#D9D9D9", to: "#FAF5F3" },
      ],
      { allowHero: true },
    )
    expect(r.panelFixes).toBe(0)
    expect(r.html).not.toContain(SURF.surface)
  })

  it("painel DENTRO de painel sobe para o tom forte", () => {
    const html =
      '<table style="background:#FFFFFF;"><tr><td>' +
      '<table style="background:#EFEFEF;"><tr><td>' +
      '<table style="background:#D9D9D9;"><tr><td>x</td></tr></table>' +
      "</td></tr></table></td></tr></table>"
    const r = applyOps(
      html,
      [
        { action: "recolor", from: "#FFFFFF", to: "#FAF5F3", where: "background" },
        { action: "recolor", from: "#EFEFEF", to: "#FAF5F3" },
        { action: "recolor", from: "#D9D9D9", to: "#FAF5F3" },
      ],
      { allowHero: true, surfaces: SURF },
    )
    expect(r.html).toContain(`background:${SURF.surface};`)
    expect(r.html).toContain(`background:${SURF.surface_strong};`)
  })

  it("td repetindo a cor do table NÃO vira painel novo", () => {
    // Redundância de compatibilidade: nunca foi um degrau visual, e pintá-la
    // criaria uma camada que o designer não desenhou.
    const html =
      '<table style="background:#EFEFEF;"><tr>' +
      '<td bgcolor="#EFEFEF">x</td></tr></table>'
    const r = applyOps(
      html,
      [{ action: "recolor", from: "#EFEFEF", to: "#FAF5F3" }],
      { allowHero: true, surfaces: SURF },
    )
    expect(r.panelFixes).toBe(0)
    expect(r.html).not.toContain(SURF.surface)
  })

  it("painel cujo destino NÃO foi pintado por estas ops fica como está", () => {
    // Canvas e painel já eram iguais na entrada — problema anterior a este
    // step, e consertá-lo em silêncio esconderia de onde ele veio.
    const r = applyOps(
      painel("#FAF5F3", "#FAF5F3"),
      [{ action: "recolor", from: "#000000", to: "#1F1F1F", where: "color" }],
      { allowHero: true, surfaces: SURF },
    )
    expect(r.panelFixes).toBe(0)
  })

  it("tom inválido desliga a guarda, NÃO derruba o passo de cor", () => {
    // Um contexto sem os papéis novos chegava como {surface: undefined} e
    // explodia dentro do aplicador: as duas tentativas do step falhavam e o
    // e-mail saía sem NENHUMA cor de marca — para consertar um painel.
    // Guarda de acabamento falha para o lado aberto.
    const r = applyOps(
      painel("#FFFFFF", "#D9D9D9"),
      [{ action: "recolor", from: "#D9D9D9", to: "#FAF5F3" }],
      {
        allowHero: true,
        surfaces: { surface: undefined, surface_strong: "" } as unknown as {
          surface: string
          surface_strong: string
        },
      },
    )
    expect(r.panelFixes).toBe(0)
    expect(r.applied).toBe(1)
  })

  it("o conserto de par mede o texto contra o fundo FINAL do painel", () => {
    // Texto branco dentro do card: depois de reerguido o painel fica claro,
    // então o rótulo tem de virar escuro. Se o par medisse o fundo
    // colapsado, mediria a cor errada.
    const html =
      '<table style="background:#000000;"><tr><td>' +
      '<table style="background:#D9D9D9;"><tr><td>' +
      '<span style="color:#FFFFFF">Feature</span>' +
      "</td></tr></table></td></tr></table>"
    const r = applyOps(
      html,
      [
        { action: "recolor", from: "#000000", to: "#FAF5F3", where: "background" },
        { action: "recolor", from: "#D9D9D9", to: "#FAF5F3" },
      ],
      { allowHero: true, surfaces: SURF },
    )
    expect(r.panelFixes).toBe(1)
    expect(r.html).not.toContain('color:#FFFFFF')
  })
})
