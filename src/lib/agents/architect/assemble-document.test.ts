import { describe, it, expect, vi } from "vitest"

// Isola o I/O: a cadeia de imports puxa createAdminClient via
// component-assembler.service (só o tipo AssemblySlot é usado aqui).
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({}),
  createClient: () => ({}),
}))

import type { EmailComponentVariant } from "@/types/email-generation"
import type { AssemblySlot } from "./component-assembler.service"
import {
  assembleDocument,
  validateBlockMarkers,
  stripBlockMarkers,
} from "./assemble-document"
import { graftHeroVariant } from "../html/hero-graft"
import { locateHeroRegion } from "../html/hero-locator"
import { extractStructureFromReference } from "./reference-structure"

function variant(
  section: string,
  name: string,
  html: string,
  extra: Partial<EmailComponentVariant> = {},
): EmailComponentVariant {
  return {
    id: `${section}-${name}`,
    block_type: section,
    name,
    html,
    rendered_html: null,
    html_tagged: null,
    tagging_status: null,
    output_schema: [],
    ...extra,
  } as unknown as EmailComponentVariant
}

function slot(section: string, name: string, html: string): AssemblySlot {
  return {
    kind: "variant",
    variant: variant(section, name, html),
    section,
    label: `${section} ${name}`,
  }
}

const missing = (section: string): AssemblySlot => ({
  kind: "missing",
  section,
  label: `${section} sem variante`,
})

const TR = (t: string) => `<tr><td>${t}</td></tr>`
const TABLE = (t: string) => `<table><tr><td>${t}</td></tr></table>`

describe("assembleDocument", () => {
  it("concatena na ordem, com um par de marcadores por bloco", () => {
    const { html, stats } = assembleDocument({
      slots: [
        slot("hero", "a", TR("{{HERO_HEADLINE}}")),
        slot("body", "b", TR("{{BODY_TEXT}}")),
        slot("footer", "c", TR("[unsubscribe_link]")),
      ],
    })

    expect(stats.blocks).toBe(3)
    expect(stats.variants).toBe(3)
    expect(stats.skipped).toEqual([])
    expect(html).toContain("<!-- cfy:block:0:hero:start -->")
    expect(html).toContain("<!-- cfy:block:2:footer:end -->")
    // Ordem: hero antes de body antes de footer.
    expect(html.indexOf("{{HERO_HEADLINE}}")).toBeLessThan(
      html.indexOf("{{BODY_TEXT}}"),
    )
    expect(html.indexOf("{{BODY_TEXT}}")).toBeLessThan(
      html.indexOf("[unsubscribe_link]"),
    )
    expect(validateBlockMarkers(html, stats.expected).status).toBe("ok")
  })

  it("preserva os placeholders byte a byte", () => {
    const { html } = assembleDocument({
      slots: [slot("hero", "a", TR("{{HERO_IMAGE}} {{HERO_HEADLINE}}"))],
    })
    expect(html).toContain("{{HERO_IMAGE}}")
    expect(html).toContain("{{HERO_HEADLINE}}")
  })

  it("usa html_tagged aprovado no lugar do exemplo", () => {
    const v = variant("hero", "a", TR("Frase real de exemplo"), {
      html_tagged: TR("{{HERO_HEADLINE}}"),
      tagging_status: "approved",
    })
    const { html } = assembleDocument({
      slots: [{ kind: "variant", variant: v, section: "hero", label: "hero" }],
    })
    expect(html).toContain("{{HERO_HEADLINE}}")
    expect(html).not.toContain("Frase real de exemplo")
  })

  it("ignora html_tagged pendente", () => {
    const v = variant("hero", "a", TR("Frase real de exemplo"), {
      html_tagged: TR("{{HERO_HEADLINE}}"),
      tagging_status: "pending",
    })
    const { html } = assembleDocument({
      slots: [{ kind: "variant", variant: v, section: "hero", label: "hero" }],
    })
    expect(html).toContain("Frase real de exemplo")
  })

  it("embrulha fragmento que começa com <table>", () => {
    const { html, stats } = assembleDocument({
      slots: [slot("hero", "a", TABLE("x"))],
    })
    expect(stats.blocks).toBe(1)
    // O <table> da variante fica dentro de um <tr><td> do container.
    expect(html).toMatch(/<tr>\s*<td align="center"[^>]*>\s*<table>/)
  })

  // Variante fora do padrão table-based é EMBRULHADA, não pulada: email sem
  // a seção é pior que uma variante cadastrada torto (wrapUnknown).
  it("embrulha fragmento fora do padrão em vez de pular", () => {
    const { html, stats } = assembleDocument({
      slots: [
        slot("hero", "a", TR("ok")),
        slot("body", "b", "<div>solto</div>"),
        slot("footer", "c", TR("fim")),
      ],
    })
    expect(stats.blocks).toBe(3)
    expect(stats.skipped).toEqual([])
    expect(stats.wrappedUnknown).toEqual(["body"])
    expect(html).toContain("solto")
    expect(html).toMatch(/<tr>\s*<td align="center"[^>]*>\s*<div>solto<\/div>/)
    expect(validateBlockMarkers(html, stats.expected).status).toBe("ok")
  })

  it("pula fragmento sem conteúdo aproveitável, sem derrubar o resto", () => {
    const { html, stats } = assembleDocument({
      slots: [
        slot("hero", "a", TR("ok")),
        // Só comentário: depois de removê-lo não sobra nada para embrulhar.
        slot("body", "b", "<!-- {{BODY_TEXT}} -->"),
        slot("footer", "c", TR("fim")),
      ],
    })
    expect(stats.blocks).toBe(2)
    expect(stats.variants).toBe(3)
    expect(stats.skipped).toEqual([
      {
        block_index: 1,
        section: "body",
        label: "body b",
        reason: "invalid_fragment",
      },
    ])
    expect(html).not.toContain("{{BODY_TEXT}}")
    expect(validateBlockMarkers(html, stats.expected).status).toBe("ok")
  })

  it("pula variante com html efetivo vazio", () => {
    const { stats } = assembleDocument({ slots: [slot("hero", "a", "   ")] })
    expect(stats.blocks).toBe(0)
    expect(stats.skipped[0].reason).toBe("empty_html")
  })

  it("posição sem variante é pulada, sem nota no HTML", () => {
    const { html, stats } = assembleDocument({
      slots: [slot("hero", "a", TR("ok")), missing("offer")],
    })
    expect(stats.blocks).toBe(1)
    expect(stats.skipped).toEqual([
      {
        block_index: 1,
        section: "offer",
        label: "offer sem variante",
        reason: "missing",
      },
    ])
    expect(html.toLowerCase()).not.toContain("reference padrao")
    expect(html).not.toContain("cfy:block:1")
  })

  // O índice do marcador é o da ESTRUTURA, não a posição no documento:
  // slot_map, blueprint e marcadores precisam falar o mesmo idioma.
  it("preserva o índice original quando uma posição é pulada", () => {
    const { html, stats } = assembleDocument({
      slots: [
        slot("hero", "a", TR("1")),
        missing("offer"),
        slot("footer", "c", TR("3")),
      ],
    })
    expect(html).toContain("<!-- cfy:block:0:hero:start -->")
    expect(html).toContain("<!-- cfy:block:2:footer:start -->")
    expect(html).not.toContain("cfy:block:1")
    expect(stats.expected).toEqual([
      { block_index: 0, section: "hero" },
      { block_index: 2, section: "footer" },
    ])
    expect(validateBlockMarkers(html, stats.expected).status).toBe("ok")
  })

  it("normaliza as fontes da loja", () => {
    const { html, stats } = assembleDocument({
      slots: [
        slot(
          "hero",
          "a",
          `<tr><td><h1 style="font-family:Courier New;font-size:30px">T</h1><p style="font-family:Trebuchet MS;font-size:14px">b</p></td></tr>`,
        ),
      ],
      fonts: { heading: "Playfair Display", body: "Inter" },
    })
    expect(stats.fontsNormalized).toBeGreaterThan(0)
    expect(html).toContain("Playfair Display")
    expect(html).toContain("Inter")
    expect(html).not.toContain("Courier New")
  })

  it("shell tem container 600px, :root e slot de preheader", () => {
    const { html } = assembleDocument({ slots: [slot("hero", "a", TR("x"))] })
    expect(html).toContain("<!DOCTYPE html>")
    expect(html).toContain("</html>")
    expect(html).toContain('width="600"')
    expect(html).toContain("--button-bg")
    expect(html).toContain("{{PREHEADER}}")
  })

  it("todos os slots pulados → documento sem bloco nenhum", () => {
    const { html, stats } = assembleDocument({
      slots: [missing("hero"), missing("body")],
    })
    expect(stats.blocks).toBe(0)
    expect(stats.expected).toEqual([])
    expect(html).toContain("</html>")
    // Sem marcador nenhum: `absent`, não `stripped`.
    expect(validateBlockMarkers(html, stats.expected).status).toBe("absent")
  })
})

describe("validateBlockMarkers", () => {
  const expected = [
    { block_index: 0, section: "hero" },
    { block_index: 1, section: "footer" },
  ]
  const doc = (body: string) => `<html><body>${body}</body></html>`

  it("pares corretos na ordem → ok", () => {
    const html = doc(
      `<!-- cfy:block:0:hero:start --><tr></tr><!-- cfy:block:0:hero:end -->` +
        `<!-- cfy:block:1:footer:start --><tr></tr><!-- cfy:block:1:footer:end -->`,
    )
    expect(validateBlockMarkers(html, expected).status).toBe("ok")
  })

  it("sem marcador → absent, html intacto", () => {
    const html = doc("<tr></tr>")
    const res = validateBlockMarkers(html, expected)
    expect(res.status).toBe("absent")
    expect(res.html).toBe(html)
  })

  it("par faltando → stripped", () => {
    const html = doc(
      `<!-- cfy:block:0:hero:start --><tr></tr><!-- cfy:block:0:hero:end -->`,
    )
    const res = validateBlockMarkers(html, expected)
    expect(res.status).toBe("stripped")
    expect(res.html).not.toContain("cfy:block")
  })

  it("section trocada → stripped", () => {
    const html = doc(
      `<!-- cfy:block:0:body:start --><tr></tr><!-- cfy:block:0:body:end -->` +
        `<!-- cfy:block:1:footer:start --><tr></tr><!-- cfy:block:1:footer:end -->`,
    )
    expect(validateBlockMarkers(html, expected).status).toBe("stripped")
  })

  it("índice fora do esperado → stripped", () => {
    const html = doc(
      `<!-- cfy:block:0:hero:start --><tr></tr><!-- cfy:block:0:hero:end -->` +
        `<!-- cfy:block:5:footer:start --><tr></tr><!-- cfy:block:5:footer:end -->`,
    )
    expect(validateBlockMarkers(html, expected).status).toBe("stripped")
  })

  it("aninhado / fora de ordem → stripped", () => {
    const html = doc(
      `<!-- cfy:block:0:hero:start --><!-- cfy:block:1:footer:start -->` +
        `<!-- cfy:block:0:hero:end --><!-- cfy:block:1:footer:end -->`,
    )
    expect(validateBlockMarkers(html, expected).status).toBe("stripped")
  })

  it("section em caixa alta ainda casa", () => {
    const html = doc(
      `<!-- cfy:block:0:HERO:start --><tr></tr><!-- cfy:block:0:HERO:end -->` +
        `<!-- cfy:block:1:Footer:start --><tr></tr><!-- cfy:block:1:Footer:end -->`,
    )
    expect(validateBlockMarkers(html, expected).status).toBe("ok")
  })
})

describe("stripBlockMarkers", () => {
  it("remove todos os marcadores", () => {
    const html = `<!-- cfy:block:0:hero:start --><tr></tr><!-- cfy:block:0:hero:end -->`
    expect(stripBlockMarkers(html)).toBe("<tr></tr>")
  })
})

// CM-2: com o documento nascendo das variantes canônicas, o enxerto da hero
// vira no-op. Ele PERMANECE no pipeline como rede para reference legada,
// gravada pelo Montador LLM e não regerada sem `force`.
describe("integração com o enxerto da hero", () => {
  const HERO = `<tr><td style="background:#111"><img src="{{HERO_IMAGE}}"><h1>{{HERO_HEADLINE}}</h1></td></tr>`

  it("documento montado por código → enxerto reconhece que já é canônico", () => {
    const { html } = assembleDocument({
      slots: [slot("hero", "a", HERO), slot("footer", "b", TR("fim"))],
    })
    const graft = graftHeroVariant(html, HERO)
    expect(graft.status).toBe("already_canonical")
  })

  it("enxerto é idempotente: o HTML resultante preserva a hero", () => {
    const { html } = assembleDocument({
      slots: [slot("hero", "a", HERO), slot("footer", "b", TR("fim"))],
    })
    const graft = graftHeroVariant(html, HERO)
    expect(graft.html).toContain("{{HERO_IMAGE}}")
    expect(graft.html).toContain("{{HERO_HEADLINE}}")
    expect(graft.html).toContain("background:#111")
    expect(graft.html).toContain("fim")
    // A hero entra UMA vez: o splice troca a região, não acumula.
    expect(graft.html.match(/\{\{HERO_HEADLINE\}\}/g)).toHaveLength(1)
  })

  // Guarda do que a montagem por código garante: com marcadores válidos, o
  // locator opera no modo `marker` e a região é exatamente o bloco da hero.
  // (No modo `tag` — reference legada sem marcadores — a região é inferida
  // pela <table> balanceada e pode englobar vizinhos sem tag canônica.)
  it("documento montado → locator opera no modo marker", () => {
    const { html } = assembleDocument({
      slots: [slot("hero", "a", HERO), slot("footer", "b", TR("fim"))],
    })
    const region = locateHeroRegion(html)
    expect(region?.mode).toBe("marker")
    const inside = html.slice(region!.start, region!.end)
    expect(inside).toContain("{{HERO_HEADLINE}}")
    expect(inside).not.toContain("fim")
  })

  it("reference legada com hero achatada → enxerto troca de verdade", () => {
    // Simula o que o Montador LLM produzia: hero sem a banda nem a imagem.
    const legado = `<html><body><table>
      <!-- cfy:block:0:hero:start --><tr><td><h1>{{HERO_HEADLINE}}</h1></td></tr><!-- cfy:block:0:hero:end -->
      <!-- cfy:block:1:footer:start --><tr><td>fim</td></tr><!-- cfy:block:1:footer:end -->
    </table></body></html>`
    const graft = graftHeroVariant(legado, HERO)
    expect(graft.status).toBe("grafted")
    expect(graft.html).toContain("{{HERO_IMAGE}}")
    expect(graft.html).toContain("background:#111")
  })
})

// O blueprint determinístico depende de extrair o esqueleto do documento
// (extractStructureFromReference). Se a cobertura cair, a geração vai para a
// rota B (LLM) — funciona, mas paga LLM sem precisar.
describe("esqueleto extraído do documento montado", () => {
  it("encontra os blocos e as tags de cada um", () => {
    const { html } = assembleDocument({
      slots: [
        slot(
          "hero",
          "a",
          `<tr><td>{{HERO_EYEBROW}}<h1>{{HERO_HEADLINE}}</h1><p>{{HERO_BODY}}</p><a href="{{HERO_CTA_URL}}">{{HERO_CTA_LABEL}}</a><img src="{{HERO_IMAGE}}"></td></tr>`,
        ),
        slot("offer", "b", TR("{{OFFER_HEADLINE}} {{COUPON_CODE}}")),
        slot("footer", "c", TR("{{FOOTER_TAGLINE}}")),
      ],
    })
    const skeleton = extractStructureFromReference(html)
    expect(skeleton).not.toBeNull()
    const types = skeleton!.blocks.map((b) => b.type)
    expect(types).toContain("hero")
    expect(types).toContain("footer")
    const hero = skeleton!.blocks.find((b) => b.type === "hero")!
    expect(hero.tags).toContain("HERO_HEADLINE")
    expect(hero.needs_image).toBe(true)
  })
})

// O formato REAL da biblioteca (jul/2026): as 38 variantes ativas estão
// cadastradas como documento completo, com o CSS no <head>. O `wrapUnknown`
// embrulhava isso em `<td>` — documento dentro de célula — e o defeito só
// aparecia lá na frente, como "fragmento contém documento" do agente de hero.
describe("variantes cadastradas como documento completo", () => {
  const asDoc = (inner: string, css = "") => `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="utf-8">${css ? `<style>${css}</style>` : ""}</head>
<body style="margin:0">${inner}</body>
</html>`

  it("nenhum documento sobra dentro do corpo montado", () => {
    const { html } = assembleDocument({
      slots: [
        slot("hero", "v1", asDoc(TABLE("hero"))),
        slot("products", "v2", asDoc(TABLE("produtos"))),
      ],
    })
    const body = html.slice(html.indexOf("<body"))
    expect(body).not.toMatch(/<!DOCTYPE|<html[\s>]/i)
    expect(body).toContain("hero")
    expect(body).toContain("produtos")
  })

  it("conta as variantes desembrulhadas", () => {
    const { stats } = assembleDocument({
      slots: [
        slot("hero", "v1", asDoc(TABLE("hero"))),
        slot("body", "v2", TR("já é fragmento")),
      ],
    })
    expect(stats.unshelled).toEqual(["hero"])
    expect(stats.blocks).toBe(2)
  })

  it("o @media da variante sobrevive no head, e não no meio da tabela", () => {
    const css = "@media (max-width:620px){.card{width:100%!important}}"
    const { html, stats } = assembleDocument({
      slots: [slot("hero", "v1", asDoc(TABLE("hero"), css))],
    })
    expect(stats.stylesInlined).toBe(1)
    const head = html.slice(0, html.indexOf("<body"))
    expect(head).toContain(css)
    expect(html.slice(html.indexOf("<body"))).not.toContain("<style")
  })

  it("CSS repetido entre variantes entra uma vez só", () => {
    const css = ".card{padding:0}"
    const { stats } = assembleDocument({
      slots: [
        slot("hero", "v1", asDoc(TABLE("a"), css)),
        slot("body", "v2", asDoc(TABLE("b"), css)),
      ],
    })
    expect(stats.stylesInlined).toBe(1)
  })

  it("o CSS da variante vem depois do base, para poder sobrescrever", () => {
    const { html } = assembleDocument({
      slots: [slot("hero", "v1", asDoc(TABLE("a"), ".email-container{width:700px}"))],
    })
    expect(html.indexOf(".email-container{width:700px}")).toBeGreaterThan(
      html.indexOf("mso-table-lspace"),
    )
  })

  it("os marcadores continuam envolvendo cada bloco", () => {
    const { html } = assembleDocument({
      slots: [slot("hero", "v1", asDoc(TABLE("hero")))],
    })
    expect(html).toContain("<!-- cfy:block:0:hero:start -->")
    expect(html).toContain("<!-- cfy:block:0:hero:end -->")
  })
})
