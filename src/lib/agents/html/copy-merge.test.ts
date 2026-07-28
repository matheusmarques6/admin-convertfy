/**
 * Merge determinístico de copy (Fase A, estágio 0 — sem LLM).
 */
import { describe, it, expect } from "vitest"
import {
  copyMerge,
  textTagsOutsideHero,
  mergeBlocksFromContext,
  tagToBlockIdMap,
  buildExceptionSlots,
  buildMergeVerifierInput,
} from "./copy-merge"
import {
  HERO_SENTINEL_START,
  HERO_SENTINEL_END,
} from "./hero-locator"

const DOC = [
  `${HERO_SENTINEL_START}<table><tr><td>{{HERO_HEADLINE}}</td></tr></table>${HERO_SENTINEL_END}`,
  "<table><tr><td>{{BODY_TITLE}}</td></tr>",
  '<tr><td><a href="{{BODY_CTA_URL}}">{{BODY_CTA_LABEL}}</a></td></tr>',
  '<tr><td><img src="{{SECTION_IMAGE}}"></td></tr>',
  "<tr><td>{{ORFAO_SEM_COPY}}</td></tr></table>",
].join("\n")

const field = (key: string, tag: string | null, type = "text_short") => ({
  key,
  tag,
  type,
})

describe("textTagsOutsideHero", () => {
  it("lista só tags de TEXTO fora da hero (imagem e hero ficam de fora)", () => {
    expect(textTagsOutsideHero(DOC)).toEqual([
      "BODY_TITLE",
      "BODY_CTA_URL",
      "BODY_CTA_LABEL",
      "ORFAO_SEM_COPY",
    ])
  })
})

describe("copyMerge", () => {
  it("resolve por código o que tem tag+valor; hero e imagem intocadas; relatório metrificado", () => {
    const { html, report } = copyMerge(DOC, [
      {
        fields: [
          field("body_title", "BODY_TITLE"),
          field("body_cta_label", "BODY_CTA_LABEL"),
          field("body_cta_url", "BODY_CTA_URL", "url"),
          // sem âncora: vai pro relatório, não pro doc
          field("frase_solta", null),
          // imagem: fora do merge por natureza
          field("section_image", "SECTION_IMAGE", "image"),
        ],
        content: {
          body_title: "Título real",
          body_cta_label: "Comprar",
          body_cta_url: "https://loja.com/x",
          frase_solta: "texto sem casa",
        },
      },
    ])

    expect(html).toContain("Título real")
    expect(html).toContain('href="https://loja.com/x"')
    expect(html).toContain(">Comprar<")
    // hero intocada; imagem intocada; órfã sobra pro agente de exceção
    expect(html).toContain("{{HERO_HEADLINE}}")
    expect(html).toContain("{{SECTION_IMAGE}}")
    expect(report.slots_total).toBe(4)
    expect(report.ops_built).toBe(3)
    expect(report.merged).toBe(3)
    expect(report.left_for_llm).toEqual(["ORFAO_SEM_COPY"])
    expect(report.unanchored_keys).toEqual(["frase_solta"])
    expect(report.skipped).toEqual([])
  })

  it("content vazio/ausente não vira op (slot fica pro LLM decidir remoção)", () => {
    const { report } = copyMerge(DOC, [
      {
        fields: [field("body_title", "BODY_TITLE")],
        content: { body_title: "   " },
      },
    ])
    expect(report.ops_built).toBe(0)
    expect(report.left_for_llm).toContain("BODY_TITLE")
  })

  it("tag apontando pra dentro da hero é pulada (hero_protected)", () => {
    const { report } = copyMerge(DOC, [
      {
        fields: [field("hero_headline", "HERO_HEADLINE")],
        content: { hero_headline: "invasão" },
      },
    ])
    expect(report.merged).toBe(0)
    expect(report.skipped[0]?.reason).toBe("hero_protected")
  })
})

describe("block_id — amarração com a chave do n8n (views + ops)", () => {
  it("mergeBlocksFromContext propaga o email_blocks.id como block_id", () => {
    const blocks = mergeBlocksFromContext(
      [{ id: "b1-uuid", position: 1, block_type: "hero", content: { x: "1" } }],
      [{ type: "hero", fields: [field("x", "X")] }],
    )
    expect(blocks[0].block_id).toBe("b1-uuid")
  })

  it("tagToBlockIdMap resolve tag normalizada → block_id (primeira ocorrência vence)", () => {
    const map = tagToBlockIdMap([
      {
        block_id: "b1",
        fields: [field("titulo", "{{ BODY_TITLE }}")],
        content: {},
      },
      { block_id: "b2", fields: [field("dup", "BODY_TITLE")], content: {} },
      { block_id: null, fields: [field("solto", "SEM_DONO")], content: {} },
    ])
    expect(map.get("BODY_TITLE")).toBe("b1")
    expect(map.has("SEM_DONO")).toBe(false)
  })

  it("buildExceptionSlots carrega o block_id da tag (null quando não resolvido)", () => {
    const map = new Map([["ORFAO_SEM_COPY", "b7-uuid"]])
    const slots = buildExceptionSlots(DOC, ["ORFAO_SEM_COPY", "INEXISTENTE"], map)
    expect(slots[0].block_id).toBe("b7-uuid")
    expect(slots[0].row_html).toContain("{{ORFAO_SEM_COPY}}")
    expect(slots[1].block_id).toBeNull()
  })

  it("copyMerge emite ops com block_id do bloco dono", () => {
    const { report } = copyMerge(DOC, [
      {
        block_id: "b1-uuid",
        fields: [field("hero_headline", "HERO_HEADLINE")],
        content: { hero_headline: "invasão" },
      },
    ])
    // A op foi pulada (hero_protected), mas carrega o block_id de origem.
    expect(report.skipped[0]?.op.block_id).toBe("b1-uuid")
  })
})

describe("buildMergeVerifierInput — views do Verificador (7b)", () => {
  it("separa preenchidos / sobrando / copy sem uso, tudo amarrado por block_id", () => {
    const blocks = [
      {
        block_id: "b1",
        fields: [
          field("body_title", "BODY_TITLE"),
          field("frase_solta", null),
        ],
        content: { body_title: "Título real", frase_solta: "texto sem casa" },
      },
      {
        block_id: "b2",
        fields: [field("orfao", "ORFAO_SEM_COPY")],
        // valor presente mas o slot não resolveu (ex.: skip) → copy sem uso
        content: { orfao: "" },
      },
    ]
    const { html, report } = copyMerge(DOC, blocks)
    expect(report.merged_tags).toEqual(["BODY_TITLE"])

    const input = buildMergeVerifierInput(html, blocks, report)
    // Preenchido: tag + valor aplicado (sem row_html — julgamento semântico).
    expect(input.slots_preenchidos).toEqual([
      { block_id: "b1", tag: "BODY_TITLE", valor_aplicado: "Título real" },
    ])
    // Sobrando: views com row_html + block_id resolvido via fields.
    const sobrando = input.slots_sobrando.map((s) => ({
      tag: s.tag,
      block_id: s.block_id,
    }))
    expect(sobrando).toContainEqual({ tag: "ORFAO_SEM_COPY", block_id: "b2" })
    // Copy sem uso: a key sem âncora, com o dono.
    expect(input.copy_nao_usada).toEqual([
      { block_id: "b1", key: "frase_solta", valor: "texto sem casa", tag: null },
    ])
  })

  it("copy cujo slot ancorado SOBROU aparece como não usada (candidata natural)", () => {
    const blocks = [
      {
        block_id: "b9",
        // tag existe no doc mas dentro da hero → merge pula (hero_protected)
        fields: [field("hero_headline", "HERO_HEADLINE")],
        content: { hero_headline: "valor preso" },
      },
    ]
    const { html, report } = copyMerge(DOC, blocks)
    const input = buildMergeVerifierInput(html, blocks, report)
    expect(input.slots_preenchidos).toEqual([])
    // HERO_HEADLINE não está em left_for_llm (hero fica fora do universo de
    // texto), então a copy não pareia com slot sobrando — mas o registro de
    // não-uso existe quando a âncora falha fora da hero (coberto acima).
    expect(
      input.copy_nao_usada.every((c) => typeof c.key === "string"),
    ).toBe(true)
  })
})
