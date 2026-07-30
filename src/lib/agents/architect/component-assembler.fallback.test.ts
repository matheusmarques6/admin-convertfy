import { describe, it, expect, vi, beforeEach } from "vitest"

// Estado mutável da biblioteca (email_component_variants) + spy do upsert.
const h = vi.hoisted(() => ({
  upsertSpy: vi.fn().mockResolvedValue({ error: null }),
  variants: [] as Array<Record<string, unknown>>,
}))

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "email_component_variants") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: h.variants, error: null }),
          }),
        }
      }
      if (table === "store_email_references") {
        return {
          upsert: (...args: unknown[]) => {
            h.upsertSpy(...args)
            return Promise.resolve({ error: null })
          },
        }
      }
      return {}
    },
  }),
  createClient: () => ({}),
}))

const invokeAgent = vi.fn()
vi.mock("./llm-invoke", async (importActual) => {
  const actual = await importActual<typeof import("./llm-invoke")>()
  return {
    ...actual,
    invokeAgent: (...a: unknown[]) => invokeAgent(...a),
    loadActiveAgentConfig: vi.fn().mockResolvedValue(null), // usa DEFAULT config
  }
})

vi.mock("../callbacks/telemetry.callback", () => ({
  logGenerationRun: vi.fn().mockResolvedValue(""),
  startGenerationRun: vi.fn().mockResolvedValue("run-1"),
  finishGenerationRun: vi.fn().mockResolvedValue("run-1"),
  computeCostCents: () => 0,
  resolveCostCents: () => 0,
}))

vi.mock("./component-deriver", () => ({
  buildMatchContext: () => ({}),
  prefilterCandidates: (pool: unknown[]) => pool, // sem ranqueamento no teste
  seededShuffle: (arr: unknown[]) => arr, // sem embaralhar no teste (ordem estável)
  seedFrom: () => 0,
}))

import { assembleStoreReference } from "./component-assembler.service"

function variant(id: string, blockType: string, html: string) {
  return {
    id,
    block_type: blockType,
    name: `${blockType} ${id}`,
    html,
    description: null,
    slots: [],
    niche_affinity: [],
    positioning: [],
    mood: [],
    density: null,
    tags: [],
    thumbnail: null,
    is_active: true,
    version: 1,
    created_at: "2026-01-01",
    created_by: null,
  }
}

const baseInput = {
  storeId: "s1",
  flowType: "welcome",
  emailNumber: 1,
  batchId: "b1",
  brandName: "Loja",
  nicho: "",
  posicionamento: "",
  tomVoz: "",
  mood: "",
  persona: "",
  briefingJson: "{}",
  topProductNames: [],
  outlineObjective: "",
  outlineGuidance: "",
  outlineToneHint: "",
  referenceTemplateHtml: "",
  structure: [{ section: "hero", label: "Hero" }],
}

const CHOICE_V1 = { raw: '[{"block_index":0,"variant_id":"v1"}]', tokensInput: 5, tokensOutput: 5 }
const HTML_OK = {
  raw: "<!DOCTYPE html><html><body><div>ok</div></body></html>",
  tokensInput: 10,
  tokensOutput: 20,
}

beforeEach(() => {
  h.upsertSpy.mockClear()
  invokeAgent.mockReset()
  h.variants = [variant("v1", "hero", "<div>{{HERO_HEADLINE}}</div>")]
})

describe("assembleStoreReference — escolha (LLM) + montagem (código)", () => {
  // CM-2: o passo B saiu do LLM. Uma única invocação (a escolha) e o
  // documento vem do código.
  it("escolhe (passo A) e monta por código → persiste a reference (source=code)", async () => {
    invokeAgent.mockResolvedValueOnce(CHOICE_V1)
    const res = await assembleStoreReference(baseInput)
    expect(invokeAgent).toHaveBeenCalledTimes(1)
    expect(h.upsertSpy).toHaveBeenCalledTimes(1)
    expect(res.html).toContain("</html>")
    expect(res.html).toContain("{{HERO_HEADLINE}}")
    expect(res.html).toContain("<!-- cfy:block:0:hero:start -->")
    expect(res.variantIds).toEqual(["v1"])
    expect(res.source).toBe("code")
  })

  it("o documento montado vai para o upsert com model='code' e slot_map", async () => {
    invokeAgent.mockResolvedValueOnce(CHOICE_V1)
    await assembleStoreReference(baseInput)
    const row = h.upsertSpy.mock.calls[0][0] as Record<string, unknown>
    expect(row.model).toBe("code")
    expect(row.source).toBe("ai")
    expect(row.variant_ids).toEqual(["v1"])
    expect(row.slot_map).toEqual([
      {
        block_index: 0,
        section: "hero",
        label: "Hero",
        variant_id: "v1",
        variant_name: "hero v1",
      },
    ])
  })

  it("nenhum LLM recebe o HTML da variante", async () => {
    invokeAgent.mockResolvedValueOnce(CHOICE_V1)
    await assembleStoreReference(baseInput)
    for (const call of invokeAgent.mock.calls) {
      const vars = call[1] as Record<string, string>
      expect(JSON.stringify(vars)).not.toContain("{{HERO_HEADLINE}}")
    }
  })

  it("o HTML das variantes NÃO entra no passo A (só descrição/metadados)", async () => {
    h.variants = [
      variant("v1", "hero", "<div>UNIQUE_HTML_A {{HERO_HEADLINE}}</div>"),
      variant("v2", "hero", "<div>UNIQUE_HTML_B {{HERO_SUBHEAD}}</div>"),
    ]
    invokeAgent.mockResolvedValueOnce(CHOICE_V1).mockResolvedValueOnce(HTML_OK)
    await assembleStoreReference(baseInput)
    // 1ª chamada = passo A (chooser). Os vars NÃO podem conter o html das variantes.
    const chooserVars = invokeAgent.mock.calls[0][1] as Record<string, string>
    expect(chooserVars.candidates_json).toContain("v1")
    expect(chooserVars.candidates_json).not.toContain("UNIQUE_HTML_A")
    expect(chooserVars.candidates_json).not.toContain("UNIQUE_HTML_B")
    expect(chooserVars.candidates_json).not.toContain("<div>")
  })

  it("passo A recebe orientacao_copy/campos_copy/notas + perfil da marca + top products", async () => {
    h.variants = [
      {
        ...variant("v1", "hero", "<div>{{HERO_HEADLINE}}</div>"),
        copy_guidance: "GUIDANCE-COPY",
        long_description: "NOTAS-LAYOUT",
        output_schema: [
          {
            key: "headline",
            label: "Headline",
            type: "text_short",
            max_len: 40,
            required: true,
            example: "EXEMPLO-NAO-VAI",
            guidance: "GUIDE-CAMPO-NAO-VAI",
          },
        ],
      },
    ]
    invokeAgent.mockResolvedValueOnce(CHOICE_V1).mockResolvedValueOnce(HTML_OK)
    await assembleStoreReference({
      ...baseInput,
      briefingJson: '{"nicho":"PERFIL-MARCA"}',
      topProductNames: ["Produto A", "Produto B"],
    })
    const chooserVars = invokeAgent.mock.calls[0][1] as Record<string, string>
    expect(chooserVars.candidates_json).toContain("GUIDANCE-COPY")
    expect(chooserVars.candidates_json).toContain("NOTAS-LAYOUT")
    expect(chooserVars.candidates_json).toContain('"headline"')
    // campos_copy é o schema COMPACTO: example/guidance por campo ficam fora.
    expect(chooserVars.candidates_json).not.toContain("EXEMPLO-NAO-VAI")
    expect(chooserVars.candidates_json).not.toContain("GUIDE-CAMPO-NAO-VAI")
    expect(chooserVars.briefing_marca).toContain("PERFIL-MARCA")
    expect(chooserVars.top_products).toContain("1. Produto A")
    expect(chooserVars.top_products).toContain("2. Produto B")
  })

  // CM-2: o passo B nao pode mais "falhar" (nao ha LLM). O caminho de
  // degradacao agora e: nenhum bloco entrou no documento.
  it("toda variante recusada → source=none, sem persistir", async () => {
    // Fragmento so com comentario: nao sobra nada para embrulhar.
    h.variants = [variant("v1", "hero", "<!-- {{HERO_HEADLINE}} -->")]
    invokeAgent.mockResolvedValueOnce(CHOICE_V1)
    const res = await assembleStoreReference(baseInput)
    expect(res.source).toBe("none")
    expect(h.upsertSpy).not.toHaveBeenCalled()
  })

  it("toda variante recusada + global curado → devolve o global sem persistir", async () => {
    h.variants = [variant("v1", "hero", "<!-- {{HERO_HEADLINE}} -->")]
    invokeAgent.mockResolvedValueOnce(CHOICE_V1)
    const res = await assembleStoreReference({
      ...baseInput,
      referenceTemplateHtml: "<html>curado</html>",
    })
    expect(res.source).toBe("none")
    expect(res.html).toContain("curado")
    expect(h.upsertSpy).not.toHaveBeenCalled()
  })

  it("passo A sem escolha válida → top-1 da biblioteca; monta e persiste (source=code)", async () => {
    invokeAgent.mockResolvedValueOnce({
      raw: '[{"block_index":0,"variant_id":"nao-existe"}]',
      tokensInput: 1,
      tokensOutput: 1,
    })
    const res = await assembleStoreReference(baseInput)
    expect(res.variantIds).toEqual(["v1"])
    expect(res.source).toBe("code")
    expect(h.upsertSpy).toHaveBeenCalledTimes(1)
  })

  it("biblioteca vazia + global curado → NÃO chama LLM nem persiste; devolve o global (source=global)", async () => {
    h.variants = []
    const curated = "<!DOCTYPE html><html><body><div>curado</div></body></html>"
    const res = await assembleStoreReference({ ...baseInput, referenceTemplateHtml: curated })
    expect(invokeAgent).not.toHaveBeenCalled()
    expect(h.upsertSpy).not.toHaveBeenCalled()
    expect(res.html).toBe(curated)
    expect(res.variantIds).toEqual([])
    expect(res.source).toBe("global")
  })

  it("biblioteca vazia e sem global → html vazio, sem persistir (source=none)", async () => {
    h.variants = []
    const res = await assembleStoreReference(baseInput)
    expect(invokeAgent).not.toHaveBeenCalled()
    expect(h.upsertSpy).not.toHaveBeenCalled()
    expect(res.html).toBe("")
    expect(res.source).toBe("none")
  })
})

describe("findDroppedImageTags (self-check da concatenação)", () => {
  it("detecta tags de imagem que sumiram do documento", async () => {
    const { findDroppedImageTags } = await import("./component-assembler.service")
    const chosen = JSON.stringify([
      { block_index: 0, html: '<td background="{{HERO_IMAGE}}"><img alt="{{HERO_IMAGE_ALT}}"></td>' },
      { block_index: 1, html: '<img src="{{PRODUCT_1_IMAGE}}"><img src="{{PRODUCT_1_THUMB_2}}">' },
    ])
    const output = '<html><body><td>{{HERO_CTA_LABEL}}</td><img src="{{PRODUCT_1_IMAGE}}"></body></html>'
    expect(findDroppedImageTags(chosen, output)).toEqual([
      "HERO_IMAGE",
      "HERO_IMAGE_ALT",
      "PRODUCT_1_THUMB_2",
    ])
  })

  it("vazio quando todas as tags de imagem sobrevivem (ou não há nenhuma)", async () => {
    const { findDroppedImageTags } = await import("./component-assembler.service")
    expect(
      findDroppedImageTags('<img src="{{HERO_IMAGE}}">', '<img src="{{ HERO_IMAGE }}">'),
    ).toEqual([])
    expect(findDroppedImageTags("<p>sem imagem</p>", "<p>out</p>")).toEqual([])
  })
})
