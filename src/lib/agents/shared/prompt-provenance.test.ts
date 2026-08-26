import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({}),
  createClient: () => ({}),
}))

import { renderImageTemplate } from "../image/template-renderer"
import { interpolateSystem } from "../architect/llm-invoke"
import {
  buildInterpolatedSegments,
  buildSegmentedPrompt,
  concatSegments,
  type PromptSegment,
} from "./prompt-provenance"
import {
  DEFAULT_ESTRUTURADOR_SYSTEM,
  DEFAULT_ESTRUTURADOR_USER,
} from "../estruturador/estruturador-prompt"
import {
  DEFAULT_ASSEMBLER_USER,
  DEFAULT_CHOOSER_SYSTEM,
  DEFAULT_CHOOSER_USER,
} from "../architect/component-assembler.service"

/** Recompõe o prompt a partir dos segmentos, resolvendo refs pelo mapa. */
function recompose(
  segments: PromptSegment[],
  refs: Record<string, string> = {},
): string {
  return segments
    .map((s) => (s.ref != null ? (refs[s.ref] ?? "") : (s.texto ?? "")))
    .join("")
}

const ORIGINS = {
  brand_name: { cls: "loja" as const, rotulo: "Loja" },
  nicho: { cls: "loja" as const, rotulo: "Loja" },
  pesquisa: { cls: "loja" as const, rotulo: "Pesquisa" },
  intencao_email: { cls: "vault" as const, rotulo: "Intenção do email" },
  estruturador_decisao: { cls: "upstream" as const, rotulo: "Estruturador" },
}

describe("buildSegmentedPrompt", () => {
  it("recompõe byte-igual ao renderImageTemplate — template do Estruturador", () => {
    const vars = {
      brand_name: "Innova Bay",
      nicho: "casa inteligente",
      posicionamento: "(não informado)",
      tom_voz: "técnico e direto",
      persona: "Robert, o prova-antes",
      produtos_count: "5",
      top_products: "EnergySave Pro™; SmartPlug Duo",
      pesquisa: "Objeção dominante: ceticismo com 'economia de energia'.",
      flow_type: "abandoned_cart",
      email_number: "1",
      intencao_email: "Lembrar sem pressionar; prova antes de oferta.",
      capacidade_biblioteca: "hero: 8 · text: 6 · produtos da loja: 5",
      estruturas_proibidas: "(nenhuma — primeira geração)",
    }
    const { prompt, segments } = buildSegmentedPrompt(
      DEFAULT_ESTRUTURADOR_USER,
      vars,
      ORIGINS,
    )
    expect(prompt).toBe(renderImageTemplate(DEFAULT_ESTRUTURADOR_USER, vars))
    expect(segments).not.toBeNull()
    expect(recompose(segments!)).toBe(prompt)
  })

  it("recompõe byte-igual — templates do Curador e do Montador", () => {
    const vars = {
      brand_name: "Innova Bay",
      nicho: "casa inteligente",
      posicionamento: "prova antes do preço",
      persona: "Robert",
      tom_voz: "técnico",
      outline_objective: "recuperar o carrinho",
      outline_guidance: "fio: da lembrança à prova",
      outline_tone_hint: "direto",
      intencao_flow: "(não catalogada — siga o outline e o perfil da marca)",
      intencao_email: "Lembrar sem pressionar.",
      estruturador_decisao: "Objeção dominante: ceticismo…",
      briefing_marca: '{"marca":"Innova Bay"}',
      top_products: "1. EnergySave Pro™",
      blocks_json: '[{"block_index":0,"section":"hero"}]',
      memoria: "(sem histórico)",
      finalists_json: '[{"block_index":0,"opcoes":[]}]',
    }
    for (const tpl of [DEFAULT_CHOOSER_USER, DEFAULT_ASSEMBLER_USER]) {
      const { prompt, segments } = buildSegmentedPrompt(tpl, vars, ORIGINS)
      expect(prompt).toBe(renderImageTemplate(tpl, vars))
      expect(recompose(segments!)).toBe(prompt)
    }
  })

  it("var sem origem declarada vira `sistema` visível, nunca silêncio", () => {
    const { segments } = buildSegmentedPrompt(
      "a {{misteriosa}} b",
      { misteriosa: "X" },
      {},
    )
    const seg = segments!.find((s) => s.texto === "X")
    expect(seg?.cls).toBe("sistema")
    expect(seg?.rotulo).toContain("origem não declarada")
  })

  it("var desconhecida resolve para vazio (semântica do renderer) e não vira bloco", () => {
    const tpl = "a {{nao_existe}} b"
    const { prompt, segments } = buildSegmentedPrompt(tpl, {}, {})
    expect(prompt).toBe(renderImageTemplate(tpl, {}))
    expect(recompose(segments!)).toBe(prompt)
    expect(segments!.every((s) => s.cls === "agente")).toBe(true)
  })

  it("origem com ref não duplica o texto no segmento, mas o prompt o carrega", () => {
    const catalogo = "[…catálogo de 120k…]"
    const { prompt, segments } = buildSegmentedPrompt(
      "<biblioteca>{{catalogo}}</biblioteca>",
      { catalogo },
      { catalogo: { cls: "biblioteca", rotulo: "Catálogo", ref: "catalogo", sha8: "abcd1234" } },
    )
    expect(prompt).toContain(catalogo)
    const refSeg = segments!.find((s) => s.ref === "catalogo")
    expect(refSeg).toBeDefined()
    expect(refSeg!.texto).toBeUndefined()
    expect(refSeg!.sha8).toBe("abcd1234")
    expect(refSeg!.chars).toBe(catalogo.length)
    expect(recompose(segments!, { catalogo })).toBe(prompt)
  })

  it("fail-open: template com block helper devolve segments null", () => {
    const { segments } = buildSegmentedPrompt(
      "{{#if x}}a{{/if}}",
      { x: "1" },
      {},
    )
    expect(segments).toBeNull()
  })

  it("funde literais adjacentes separados por var vazia", () => {
    const { segments } = buildSegmentedPrompt("a{{vazia}}b", { vazia: "" }, {})
    expect(segments).toHaveLength(1)
    expect(segments![0].texto).toBe("ab")
  })
})

describe("buildInterpolatedSegments", () => {
  it("recompõe byte-igual ao interpolateSystem — system do Estruturador", () => {
    const vars = {
      intencao_flow: "Regra inviolável: sem desconto no toque 1.",
      progressao: "5 toques, compressão no 4.",
      referencias: '<referencia slug="ac1-luxo">…</referencia>',
      aprendizados: "(nenhum)",
    }
    const { prompt, segments } = buildInterpolatedSegments(
      DEFAULT_ESTRUTURADOR_SYSTEM,
      vars,
      {
        intencao_flow: { cls: "vault", rotulo: "Intenção do flow" },
        progressao: { cls: "vault", rotulo: "Progressão" },
        referencias: { cls: "vault", rotulo: "Referências" },
        aprendizados: { cls: "vault", rotulo: "Aprendizados" },
      },
    )
    expect(prompt).toBe(interpolateSystem(DEFAULT_ESTRUTURADOR_SYSTEM, vars))
    expect(recompose(segments!)).toBe(prompt)
  })

  it("preserva notação {{TAG}} que NÃO é chave — semântica literal", () => {
    const sys = "Use as tags {{TAG}} do HTML. Catálogo: {{catalogo}}."
    const vars = { catalogo: "[1,2,3]" }
    const { prompt, segments } = buildInterpolatedSegments(sys, vars, {
      catalogo: { cls: "biblioteca", rotulo: "Catálogo" },
    })
    expect(prompt).toBe(interpolateSystem(sys, vars))
    expect(prompt).toContain("{{TAG}}")
    expect(recompose(segments!)).toBe(prompt)
  })

  it("system do Curador: [regras] + [ref catalogo] + [regras]", () => {
    const catalogo = JSON.stringify([{ section: "hero", variantes: [] }])
    const { prompt, segments } = buildInterpolatedSegments(
      DEFAULT_CHOOSER_SYSTEM,
      { catalogo },
      {
        catalogo: {
          cls: "biblioteca",
          rotulo: "Catálogo da biblioteca",
          ref: "catalogo",
          sha8: "ffff0000",
        },
      },
      { parte: "system" },
    )
    expect(prompt).toBe(interpolateSystem(DEFAULT_CHOOSER_SYSTEM, { catalogo }))
    const classes = segments!.map((s) => s.cls)
    expect(classes).toEqual(["agente", "biblioteca", "agente"])
    expect(segments![1].ref).toBe("catalogo")
    expect(segments!.every((s) => s.parte === "system")).toBe(true)
    expect(recompose(segments!, { catalogo })).toBe(prompt)
  })
})

describe("concatSegments", () => {
  it("junta system + user; qualquer parte null invalida o conjunto", () => {
    const a: PromptSegment[] = [{ cls: "agente", rotulo: "t", texto: "a", chars: 1 }]
    const b: PromptSegment[] = [{ cls: "loja", rotulo: "l", texto: "b", chars: 1 }]
    expect(concatSegments(a, b)).toHaveLength(2)
    expect(concatSegments(a, null)).toBeNull()
  })
})
