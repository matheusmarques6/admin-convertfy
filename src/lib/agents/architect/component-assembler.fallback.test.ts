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
// null → o serviço usa a config DEFAULT in-code (com {{catalogo}} no system).
const loadActiveAgentConfig = vi.fn().mockResolvedValue(null)
vi.mock("./llm-invoke", async (importActual) => {
  const actual = await importActual<typeof import("./llm-invoke")>()
  return {
    ...actual,
    invokeAgent: (...a: unknown[]) => invokeAgent(...a),
    loadActiveAgentConfig: (...a: unknown[]) => loadActiveAgentConfig(...a),
  }
})

const finishGenerationRun = vi.fn().mockResolvedValue("run-1")
vi.mock("../callbacks/telemetry.callback", () => ({
  logGenerationRun: vi.fn().mockResolvedValue(""),
  startGenerationRun: vi.fn().mockResolvedValue("run-1"),
  finishGenerationRun: (...a: unknown[]) => finishGenerationRun(...a),
  computeCostCents: () => 0,
  resolveCostCents: () => 0,
}))

import {
  assembleStoreReference,
  CuratorFailedError,
} from "./component-assembler.service"
import {
  missingTelemetryKeys,
  TELEMETRY_CONTRACT,
} from "../shared/telemetry-contract"

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

// CM-3: o Curador devolve RANKING (até 3 por posição), não uma escolha.
const rank = (...ids: string[]) => ({
  raw: JSON.stringify([
    { block_index: 0, escolhas: ids.map((id) => ({ variant_id: id })) },
  ]),
  tokensInput: 5,
  tokensOutput: 5,
})
const CHOICE_V1 = rank("v1")

// CM-4: a 2ª invocação é o Montador escolhendo entre os finalistas. Nos
// testes do Curador ele confirma o rank 1 — o `mockResolvedValue` do
// beforeEach cobre qualquer chamada não coberta por `...Once`.
const pick = (...pairs: Array<[number, string]>) => ({
  raw: JSON.stringify(
    pairs.map(([block_index, variant_id]) => ({
      block_index,
      variant_id,
      rank: 1,
    })),
  ),
  tokensInput: 3,
  tokensOutput: 3,
})
const ASSEMBLER_CONFIRMA = pick([0, "v1"])

beforeEach(() => {
  h.upsertSpy.mockClear()
  invokeAgent.mockReset()
  finishGenerationRun.mockClear()
  loadActiveAgentConfig.mockReset()
  loadActiveAgentConfig.mockResolvedValue(null)
  // Default: o Montador confirma o rank 1. Testes do Curador usam
  // `mockResolvedValueOnce` para a 1ª chamada e caem aqui na 2ª.
  invokeAgent.mockResolvedValue(ASSEMBLER_CONFIRMA)
  h.variants = [variant("v1", "hero", "<div>{{HERO_HEADLINE}}</div>")]
})

describe("assembleStoreReference — escolha (LLM) + montagem (código)", () => {
  // CM-2: o passo B saiu do LLM. Uma única invocação (a escolha) e o
  // documento vem do código.
  it("escolhe (passo A) e monta por código → persiste a reference (source=code)", async () => {
    invokeAgent.mockResolvedValueOnce(CHOICE_V1)
    const res = await assembleStoreReference(baseInput)
    // 1ª = Curador (ranking), 2ª = Montador (escolha).
    expect(invokeAgent).toHaveBeenCalledTimes(2)
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

  // CM-3: o catálogo vai no SYSTEM (3º argumento do invokeAgent), para ser
  // cacheável — não mais nos vars do user.
  it("o catálogo vai no system e NÃO leva o html das variantes", async () => {
    h.variants = [
      variant("v1", "hero", "<div>UNIQUE_HTML_A {{HERO_HEADLINE}}</div>"),
      variant("v2", "hero", "<div>UNIQUE_HTML_B {{HERO_SUBHEAD}}</div>"),
    ]
    invokeAgent.mockResolvedValueOnce(CHOICE_V1)
    await assembleStoreReference(baseInput)
    const systemVars = invokeAgent.mock.calls[0][2] as Record<string, string>
    expect(systemVars.catalogo).toContain("v1")
    expect(systemVars.catalogo).toContain("v2")
    expect(systemVars.catalogo).not.toContain("UNIQUE_HTML_A")
    expect(systemVars.catalogo).not.toContain("UNIQUE_HTML_B")
    expect(systemVars.catalogo).not.toContain("<div>")
    // O user template não carrega mais candidatos.
    const vars = invokeAgent.mock.calls[0][1] as Record<string, string>
    expect(vars.candidates_json).toBeUndefined()
  })

  it("o catálogo é o mesmo entre emails (prefixo cacheável)", async () => {
    h.variants = [variant("v1", "hero", "<div>{{HERO_HEADLINE}}</div>")]
    invokeAgent.mockResolvedValueOnce(CHOICE_V1)
    await assembleStoreReference(baseInput)
    invokeAgent.mockResolvedValueOnce(CHOICE_V1)
    await assembleStoreReference({ ...baseInput, emailNumber: 2 })
    // As chamadas do Curador são a 0 e a 2 — a 1 é o Montador, que não
    // recebe systemVars.
    const catalogos = invokeAgent.mock.calls
      .map((c) => (c[2] as Record<string, string> | undefined)?.catalogo)
      .filter(Boolean)
    expect(catalogos).toHaveLength(2)
    expect(catalogos[0]).toBe(catalogos[1])
  })

  it("catálogo leva orientacao_copy/notas; schema fica FORA (é do Montador)", async () => {
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
    invokeAgent.mockResolvedValueOnce(CHOICE_V1)
    await assembleStoreReference({
      ...baseInput,
      briefingJson: '{"nicho":"PERFIL-MARCA"}',
      topProductNames: ["Produto A", "Produto B"],
    })
    const systemVars = invokeAgent.mock.calls[0][2] as Record<string, string>
    expect(systemVars.catalogo).toContain("GUIDANCE-COPY")
    expect(systemVars.catalogo).toContain("NOTAS-LAYOUT")
    // CM-3: o output_schema saiu do Curador — é insumo exclusivo do Montador.
    expect(systemVars.catalogo).not.toContain('"headline"')
    expect(systemVars.catalogo).not.toContain("EXEMPLO-NAO-VAI")
    expect(systemVars.catalogo).not.toContain("GUIDE-CAMPO-NAO-VAI")
    const chooserVars = invokeAgent.mock.calls[0][1] as Record<string, string>
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

  // CM-3: sem o score do pré-filtro NÃO existe mais fallback top-1. Id
  // inventado nas duas tentativas → falha explícita, sem arquitetura gravada.
  it("id inventado nas 2 tentativas → CuratorFailedError, sem persistir", async () => {
    const bad = { raw: '[{"block_index":0,"escolhas":[{"variant_id":"nao-existe"}]}]', tokensInput: 1, tokensOutput: 1 }
    invokeAgent.mockReset()
    invokeAgent.mockResolvedValue(bad)
    await expect(assembleStoreReference(baseInput)).rejects.toThrow(
      CuratorFailedError,
    )
    // O Montador nem chega a rodar: a exceção sobe antes.
    expect(invokeAgent).toHaveBeenCalledTimes(2)
    expect(h.upsertSpy).not.toHaveBeenCalled()
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

// ── CM-3: retry, guard de catálogo e caminhos de falha ────────────────
describe("Curador — retry e falha", () => {
  it("1ª tentativa com JSON quebrado, 2ª boa → segue e conta 2 tentativas", async () => {
    invokeAgent
      .mockResolvedValueOnce({ raw: "não é json", tokensInput: 1, tokensOutput: 1 })
      .mockResolvedValueOnce(CHOICE_V1)
    const res = await assembleStoreReference(baseInput)
    // 2 tentativas do Curador + 1 do Montador.
    expect(invokeAgent).toHaveBeenCalledTimes(3)
    expect(res.source).toBe("code")
    expect(res.variantIds).toEqual(["v1"])
  })

  it("JSON quebrado nas 2 tentativas → CuratorFailedError, sem persistir", async () => {
    const bad = { raw: "prosa sem json", tokensInput: 1, tokensOutput: 1 }
    invokeAgent.mockReset()
    invokeAgent.mockResolvedValue(bad)
    await expect(assembleStoreReference(baseInput)).rejects.toThrow(
      /curador_failed/,
    )
    expect(invokeAgent).toHaveBeenCalledTimes(2)
    expect(h.upsertSpy).not.toHaveBeenCalled()
  })

  it("invoke lançando erro nas 2 tentativas → CuratorFailedError", async () => {
    invokeAgent.mockReset()
    invokeAgent.mockRejectedValue(new Error("timeout"))
    await expect(assembleStoreReference(baseInput)).rejects.toThrow(
      CuratorFailedError,
    )
    expect(invokeAgent).toHaveBeenCalledTimes(2)
  })

  it("não retenta o Curador quando a 1ª tentativa já é válida", async () => {
    invokeAgent.mockResolvedValueOnce(CHOICE_V1)
    await assembleStoreReference(baseInput)
    // Só as 2 invocações do fluxo normal: Curador + Montador.
    expect(invokeAgent).toHaveBeenCalledTimes(2)
  })

  // O system é editável na aba Agentes: sem o catálogo o Curador escolheria
  // no vazio. Falha explícita, e o LLM nem é chamado.
  it("system sem {{catalogo}} → falha antes de invocar o modelo", async () => {
    loadActiveAgentConfig.mockResolvedValueOnce({
      id: "cfg-1",
      model: "anthropic/claude-sonnet-4.6",
      temperature: 0.2,
      max_tokens: 8192,
      system_prompt: "Escolha a melhor variante. (alguém apagou o catálogo)",
      user_template: "{{blocks_json}}",
    })
    await expect(assembleStoreReference(baseInput)).rejects.toThrow(
      /catalogo_ausente/,
    )
    expect(invokeAgent).not.toHaveBeenCalled()
  })

  // A migration do CM-3 grava system_prompt = '' (corte seco). Sem o
  // fallback para o DEFAULT, o guard de {{catalogo}} dispararia em falso e
  // TODA geração falharia.
  it("config do banco com prompt vazio → usa o DEFAULT in-code", async () => {
    loadActiveAgentConfig.mockResolvedValueOnce({
      id: "cfg-1",
      model: "anthropic/claude-sonnet-4.6",
      temperature: 0.2,
      max_tokens: 8192,
      system_prompt: "",
      user_template: "",
    })
    invokeAgent.mockResolvedValueOnce(CHOICE_V1)
    const res = await assembleStoreReference(baseInput)
    expect(res.source).toBe("code")
    const systemVars = invokeAgent.mock.calls[0][2] as Record<string, string>
    expect(systemVars.catalogo).toContain("v1")
  })

  it("config do banco custom com {{catalogo}} é respeitada", async () => {
    loadActiveAgentConfig.mockResolvedValueOnce({
      id: "cfg-1",
      model: "anthropic/claude-sonnet-4.6",
      temperature: 0.5,
      max_tokens: 4096,
      system_prompt: "PROMPT CUSTOM\n{{catalogo}}",
      user_template: "{{blocks_json}}",
    })
    invokeAgent.mockResolvedValueOnce(CHOICE_V1)
    await assembleStoreReference(baseInput)
    const config = invokeAgent.mock.calls[0][0] as Record<string, unknown>
    expect(config.system_prompt).toContain("PROMPT CUSTOM")
    expect(config.max_tokens).toBe(4096)
    expect(config.temperature).toBe(0.5)
  })

  it("posição sem finalista válido é pulada, o resto segue", async () => {
    h.variants = [
      variant("v1", "hero", "<tr><td>{{HERO_HEADLINE}}</td></tr>"),
      variant("f1", "footer", "<tr><td>{{FOOTER_TAGLINE}}</td></tr>"),
    ]
    invokeAgent.mockResolvedValueOnce({
      // Só a hero foi rankeada; o footer ficou de fora.
      raw: JSON.stringify([
        { block_index: 0, escolhas: [{ variant_id: "v1" }] },
      ]),
      tokensInput: 1,
      tokensOutput: 1,
    })
    const res = await assembleStoreReference({
      ...baseInput,
      structure: [
        { section: "hero", label: "Hero" },
        { section: "footer", label: "Footer" },
      ],
    })
    expect(res.source).toBe("code")
    expect(res.variantIds).toEqual(["v1"])
    expect(res.slots[1].kind).toBe("missing")
    expect(res.html).not.toContain("{{FOOTER_TAGLINE}}")
  })

  it("indicação de outra seção é descartada (catálogo vai inteiro)", async () => {
    h.variants = [
      variant("v1", "hero", "<tr><td>{{HERO_HEADLINE}}</td></tr>"),
      variant("f1", "footer", "<tr><td>{{FOOTER_TAGLINE}}</td></tr>"),
    ]
    invokeAgent.mockResolvedValueOnce({
      // f1 é footer, indicado para a posição de hero.
      raw: JSON.stringify([
        { block_index: 0, escolhas: [{ variant_id: "f1" }, { variant_id: "v1" }] },
      ]),
      tokensInput: 1,
      tokensOutput: 1,
    })
    const res = await assembleStoreReference(baseInput)
    expect(res.variantIds).toEqual(["v1"])
  })

  it("o ranking completo vai para a telemetria", async () => {
    h.variants = [
      variant("v1", "hero", "<tr><td>{{HERO_HEADLINE}}</td></tr>"),
      variant("v2", "hero", "<tr><td>{{HERO_SUBHEAD}}</td></tr>"),
    ]
    invokeAgent.mockResolvedValueOnce(rank("v2", "v1"))
    await assembleStoreReference(baseInput)
    const call = finishGenerationRun.mock.calls.find(
      (c) => (c[1] as { agent?: string }).agent === "assembler_chooser",
    )
    const parsed = (call![1] as { parsedOutput: Record<string, unknown> })
      .parsedOutput
    expect(parsed.ranking).toEqual({ 0: ["v2", "v1"] })
    expect(parsed.attempts).toBe(1)
    expect(parsed.catalog_variants).toBe(2)
  })
})

// ── CM-4: o Montador escolhe entre os finalistas ──────────────────────
describe("Montador — escolha de conjunto", () => {
  const doisHeros = () => {
    h.variants = [
      variant("v1", "hero", "<tr><td>{{HERO_HEADLINE}}</td></tr>"),
      variant("v2", "hero", "<tr><td>{{HERO_SUBHEAD}}</td></tr>"),
    ]
  }

  const asmRun = () =>
    finishGenerationRun.mock.calls.find(
      (c) => (c[1] as { agent?: string }).agent === "assembler",
    )![1] as { parsedOutput: Record<string, unknown>; status: string }

  it("recebe os finalistas do Curador, com rank e schema compacto", async () => {
    h.variants = [
      {
        ...variant("v1", "hero", "<tr><td>{{HERO_HEADLINE}}</td></tr>"),
        copy_guidance: "GUIA",
        output_schema: [
          {
            key: "headline",
            label: "Headline",
            type: "text_short",
            max_len: 40,
            required: true,
            example: "EXEMPLO-NAO-VAI",
            guidance: "GUIDE-NAO-VAI",
          },
        ],
      },
      variant("v2", "hero", "<tr><td>{{HERO_SUBHEAD}}</td></tr>"),
    ]
    invokeAgent.mockResolvedValueOnce(rank("v1", "v2"))
    await assembleStoreReference(baseInput)

    const vars = invokeAgent.mock.calls[1][1] as Record<string, string>
    const finalistas = JSON.parse(vars.finalists_json)
    expect(finalistas[0].block_index).toBe(0)
    expect(finalistas[0].opcoes.map((o: { rank: number }) => o.rank)).toEqual([1, 2])
    expect(finalistas[0].opcoes[0].variant_id).toBe("v1")
    // O schema é o insumo EXCLUSIVO do Montador...
    expect(finalistas[0].opcoes[0].campos[0].key).toBe("headline")
    expect(finalistas[0].opcoes[0].campos[0].required).toBe(true)
    // ...na versão compacta: example/guidance servem à copy, não à escolha.
    expect(vars.finalists_json).not.toContain("EXEMPLO-NAO-VAI")
    expect(vars.finalists_json).not.toContain("GUIDE-NAO-VAI")
    // E nada de HTML: ele não escreve nada.
    expect(vars.finalists_json).not.toContain("{{HERO_HEADLINE}}")
  })

  it("recebe a mesma memória do Curador, sem query nova", async () => {
    doisHeros()
    invokeAgent.mockResolvedValueOnce(rank("v1", "v2"))
    await assembleStoreReference(baseInput)
    const curadorVars = invokeAgent.mock.calls[0][1] as Record<string, string>
    const montadorVars = invokeAgent.mock.calls[1][1] as Record<string, string>
    expect(montadorVars.memoria).toBe(curadorVars.memoria)
  })

  it("escolha do rank 2 vira a variante do documento e conta desvio", async () => {
    doisHeros()
    invokeAgent
      .mockResolvedValueOnce(rank("v1", "v2"))
      .mockResolvedValueOnce({
        raw: JSON.stringify([
          {
            block_index: 0,
            variant_id: "v2",
            rank: 2,
            motivo: "o 1º repete a faixa da hero anterior",
          },
        ]),
        tokensInput: 3,
        tokensOutput: 3,
      })
    const res = await assembleStoreReference(baseInput)
    expect(res.variantIds).toEqual(["v2"])
    expect(res.html).toContain("{{HERO_SUBHEAD}}")

    const parsed = asmRun().parsedOutput
    expect(parsed.desvios).toBe(1)
    expect(parsed.degraded).toBe(false)
    expect(
      (parsed.desvios_por_posicao as Array<{ motivo: string }>)[0].motivo,
    ).toContain("repete a faixa")
  })

  it("confirmação do rank 1 não conta desvio", async () => {
    doisHeros()
    invokeAgent.mockResolvedValueOnce(rank("v1", "v2"))
    await assembleStoreReference(baseInput)
    expect(asmRun().parsedOutput.desvios).toBe(0)
  })

  // Aqui o fallback é legítimo: o ranking do Curador já é composição válida.
  it("Montador falhando → cai no rank 1 e o email sai mesmo assim", async () => {
    doisHeros()
    invokeAgent
      .mockResolvedValueOnce(rank("v1", "v2"))
      .mockRejectedValueOnce(new Error("timeout"))
    const res = await assembleStoreReference(baseInput)
    expect(res.source).toBe("code")
    expect(res.variantIds).toEqual(["v1"])
    const run = asmRun()
    expect(run.status).toBe("error")
    expect(run.parsedOutput.degraded).toBe(true)
    expect(
      (run.parsedOutput.forced_rank1 as Array<{ reason: string }>)[0].reason,
    ).toBe("malformed")
  })

  it("id fora dos finalistas → rank 1, registrado, email sai", async () => {
    doisHeros()
    invokeAgent.mockResolvedValueOnce(rank("v1", "v2")).mockResolvedValueOnce({
      raw: JSON.stringify([
        { block_index: 0, variant_id: "inventado", rank: 1 },
      ]),
      tokensInput: 1,
      tokensOutput: 1,
    })
    const res = await assembleStoreReference(baseInput)
    expect(res.variantIds).toEqual(["v1"])
    expect(
      (asmRun().parsedOutput.forced_rank1 as Array<{ reason: string }>)[0]
        .reason,
    ).toBe("not_finalist")
  })

  // Regressão: o CM-4 removeu o run antigo que carregava as stats da
  // montagem e elas ficaram só em log.warn, fora do banco — justo o dado do
  // selo "seções puladas". O run do Montador passou a fechar DEPOIS da
  // montagem para carregá-las.
  it("o run do Montador carrega as stats da montagem", async () => {
    h.variants = [variant("v1", "hero", "<tr><td>{{HERO_HEADLINE}}</td></tr>")]
    invokeAgent.mockResolvedValueOnce(CHOICE_V1)
    await assembleStoreReference({
      ...baseInput,
      structure: [
        { section: "hero", label: "Hero" },
        // Sem variante de footer na biblioteca → posição pulada.
        { section: "footer", label: "Footer" },
      ],
    })
    const parsed = (
      finishGenerationRun.mock.calls.find(
        (c) => (c[1] as { agent?: string }).agent === "assembler",
      )![1] as { parsedOutput: Record<string, unknown> }
    ).parsedOutput

    expect(parsed.blocks_assembled).toBe(1)
    expect(parsed.blocks_skipped).toEqual([
      {
        block_index: 1,
        section: "footer",
        label: "Footer",
        reason: "missing",
      },
    ])
    expect(parsed.reference_source).toBe("code")
    // Self-checks da concatenação: sempre limpos.
    expect(parsed.marker_selfcheck).toBe("ok")
    expect(parsed.image_tags_dropped).toEqual([])
    expect(parsed.html_chars).toBeGreaterThan(0)
  })

  // Sem ranking não há o que escolher: pagar um LLM para não decidir nada.
  it("ranking vazio → Montador não é invocado", async () => {
    const bad = {
      raw: '[{"block_index":0,"escolhas":[{"variant_id":"nao-existe"}]}]',
      tokensInput: 1,
      tokensOutput: 1,
    }
    invokeAgent.mockReset()
    invokeAgent.mockResolvedValue(bad)
    await expect(assembleStoreReference(baseInput)).rejects.toThrow(
      CuratorFailedError,
    )
    // 2 tentativas do Curador e nada mais.
    expect(invokeAgent).toHaveBeenCalledTimes(2)
  })
})

// ── Contrato de telemetria: inegociável ───────────────────────────────
// Perder um campo de telemetria não quebra teste, não quebra typecheck e não
// gera alerta: o email é entregue e o run fica verde. Foi assim que o
// blocks_skipped sumiu entre o CM-2 e o CM-4. Estes testes fazem a perda
// virar falha.
describe("contrato de telemetria", () => {
  const parsedOf = (agent: string) =>
    (
      finishGenerationRun.mock.calls.find(
        (c) => (c[1] as { agent?: string }).agent === agent,
      )?.[1] as { parsedOutput?: unknown } | undefined
    )?.parsedOutput

  it("Curador grava todas as chaves do contrato", async () => {
    invokeAgent.mockResolvedValueOnce(CHOICE_V1)
    await assembleStoreReference(baseInput)
    expect(missingTelemetryKeys("assembler_chooser", parsedOf("assembler_chooser"))).toEqual([])
  })

  it("Montador grava todas as chaves do contrato", async () => {
    invokeAgent.mockResolvedValueOnce(CHOICE_V1)
    await assembleStoreReference(baseInput)
    expect(missingTelemetryKeys("assembler", parsedOf("assembler"))).toEqual([])
  })

  // O caminho de falha é justamente onde a telemetria mais importa: é o
  // único registro do que aconteceu.
  it("Curador falhando grava o contrato do mesmo jeito", async () => {
    const bad = { raw: "sem json", tokensInput: 1, tokensOutput: 1 }
    invokeAgent.mockReset()
    invokeAgent.mockResolvedValue(bad)
    await expect(assembleStoreReference(baseInput)).rejects.toThrow()
    expect(missingTelemetryKeys("assembler_chooser", parsedOf("assembler_chooser"))).toEqual([])
  })

  it("Montador degradado grava o contrato do mesmo jeito", async () => {
    invokeAgent
      .mockResolvedValueOnce(CHOICE_V1)
      .mockRejectedValueOnce(new Error("timeout"))
    await assembleStoreReference(baseInput)
    const parsed = parsedOf("assembler") as Record<string, unknown>
    expect(missingTelemetryKeys("assembler", parsed)).toEqual([])
    expect(parsed.degraded).toBe(true)
  })

  it("cada chave do contrato tem um motivo escrito", () => {
    for (const [agent, keys] of Object.entries(TELEMETRY_CONTRACT)) {
      for (const [key, reason] of Object.entries(keys)) {
        expect(reason.length, `${agent}.${key} sem motivo`).toBeGreaterThan(20)
      }
    }
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
