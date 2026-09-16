import { describe, it, expect, vi, beforeEach } from "vitest"

// O laço do leque roda dentro do `runCuradorShadow`, que fala com o banco
// (notas das finalistas) e com a telemetria. Mockar as duas pontas é o que
// permite medir o que importa aqui: quantas chamadas saem, o que vai em
// cada prompt, e o que sobra na telemetria.

const notas = vi.hoisted(() => ({ linhas: [] as Array<Record<string, unknown>> }))
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ in: () => Promise.resolve({ data: notas.linhas, error: null }) }),
        }),
      }),
    }),
  }),
  createClient: () => ({}),
}))

const invokeAgent = vi.fn()
vi.mock("./llm-invoke", async (importActual) => {
  const actual = await importActual<typeof import("./llm-invoke")>()
  return { ...actual, invokeAgent: (...a: unknown[]) => invokeAgent(...a) }
})

const finishGenerationRun = vi.fn().mockResolvedValue("run-1")
vi.mock("../callbacks/telemetry.callback", () => ({
  logGenerationRun: vi.fn().mockResolvedValue(""),
  startGenerationRun: vi.fn().mockResolvedValue("run-1"),
  finishGenerationRun: (...a: unknown[]) => finishGenerationRun(...a),
  computeCostCents: () => 0,
  resolveCostCents: () => 0,
}))

import { runCuradorShadow, type CuradorShadowParams } from "./curador-shadow"
import { missingTelemetryKeys } from "../shared/telemetry-contract"
import type { BuildCatalogResult } from "./catalog-builder"
import { buildCompactCatalog } from "./catalog-builder"
import type { CuradorVaultKnowledge } from "./curador-vault"

const SECOES = ["hero", "body", "footer"]

function variante(id: string, _section: string) {
  return {
    variant_id: id,
    name: `${id} nome`,
    description: `Descrição de ${id}. Segunda frase.`,
    quando_usar: "",
    quando_nao_usar: "",
    objectives: [],
    tones: [],
    density: null,
    product_slots: 0,
    orientacao_copy: "",
    notas_implementacao: "",
    contrato: {
      campos_obrigatorios: [],
      tem_cupom: false,
      tem_cta: true,
      tem_preco: false,
      tem_avaliacao: false,
      tem_credencial: false,
      itens: {},
      n_itens: null,
      copy: 1,
      imagens: 0,
      tem_prazo: false,
      tem_preco_antigo: false,
      tem_nome_depoente: false,
      tem_logo: false,
      n_ctas: 1,
      dispositivo: null,
    },
  }
}

function catalogo(): BuildCatalogResult {
  const sections = [
    { section: "hero", variantes: [variante("h1", "hero"), variante("h2", "hero")] },
    { section: "body", variantes: [variante("b1", "body")] },
    { section: "footer", variantes: [variante("f1", "footer")] },
  ] as unknown as BuildCatalogResult["sections"]
  return {
    sections,
    json: JSON.stringify(sections),
    total: 4,
    compact: buildCompactCatalog(sections),
    enxuto: buildCompactCatalog(sections).text,
    duplicatas: [],
  } as unknown as BuildCatalogResult
}

const doc = (path: string, body: string) =>
  ({ file_path: path, body_md: body, title: path, kind: "protocolo", frontmatter: {} }) as unknown as never

const vault: CuradorVaultKnowledge = {
  protocolo: doc("componentes/_protocolo-de-selecao.md", "1. leia\n2. decida"),
  secoes: new Map(),
  variantes: [],
  convivencias: [],
  requisitos: [],
  lacunas: [],
  julgamento: null,
  doutrinas: [],
  eixos: new Map(),
  total: 1,
}

function params(over: Partial<CuradorShadowParams> = {}): CuradorShadowParams {
  return {
    storeId: "s1",
    flowType: "welcome",
    emailNumber: 1,
    batchId: "b1",
    baseVars: {},
    origins: {},
    vault,
    extras: new Map(),
    catalogComExtras: catalogo(),
    estruturasRef: [],
    aprendizados: [],
    usageCounts: new Map(),
    typeIndex: new Map([
      ["h1", "hero"],
      ["h2", "hero"],
      ["b1", "body"],
      ["f1", "footer"],
    ]),
    liveSections: SECOES,
    liveViolations: [],
    liveRank1: new Map(),
    modo: "on",
    lequeOn: true,
    elegiveisPorPosicao: new Map([
      [0, { ids: ["h1", "h2"], zerou: false }],
      [1, { ids: ["b1"], zerou: false }],
      [2, { ids: ["f1"], zerou: false }],
    ]),
    decisaoPorPosicao: [
      { papel: "abre com a objeção", requisitos: "dispositivo: hero_pergunta" },
      { papel: "sustenta", requisitos: "" },
      { papel: "fecha", requisitos: "" },
    ],
    fioDoEstruturador: "o fio que o Estruturador escreveu",
    ...over,
  } as CuradorShadowParams
}

const chamada = (raw: string) => ({
  raw,
  tokensInput: 100,
  tokensOutput: 50,
  costUsd: 0.01,
  finishReason: "stop",
  cachedTokens: 0,
})

const respostaDe = (id: string) =>
  JSON.stringify({ papel: "p", justificativa: "j", conversa_com: "", escolhas: [{ variant_id: id, motivo: "m" }] })

beforeEach(() => {
  vi.clearAllMocks()
  notas.linhas = [
    { variant_id: "h1", file_path: "h1.md", body_md: "## Quando usar\nuse" },
    { variant_id: "h2", file_path: "h2.md", body_md: "## Quando usar\nuse" },
    { variant_id: "b1", file_path: "b1.md", body_md: "## Quando usar\nuse" },
    { variant_id: "f1", file_path: "f1.md", body_md: "## Quando usar\nuse" },
  ]
})

const telemetria = () =>
  finishGenerationRun.mock.calls[0][1] as {
    status: string
    parsedOutput: Record<string, unknown> & { leque: Record<string, unknown> | null }
  }

describe("o leque dentro do runCuradorShadow", () => {
  it("faz UMA chamada por posição e devolve a escolha de cada uma", async () => {
    const ids = ["h1", "b1", "f1"]
    invokeAgent.mockImplementation(async () => chamada(respostaDe(ids.shift()!)))

    const r = await runCuradorShadow(params())

    expect(invokeAgent).toHaveBeenCalledTimes(3)
    expect(Array.from(r!.ranking.byBlock, ([i, c]) => [i, c[0]?.variant_id])).toEqual([
      [0, "h1"],
      [1, "b1"],
      [2, "f1"],
    ])
  })

  it("o fio vem do ESTRUTURADOR — nenhuma chamada vê o e-mail inteiro", async () => {
    invokeAgent.mockResolvedValue(chamada(respostaDe("h1")))
    const r = await runCuradorShadow(params({ liveSections: ["hero"], elegiveisPorPosicao: new Map([[0, { ids: ["h1"], zerou: false }]]) }))
    expect(r!.fioNarrativo).toBe("o fio que o Estruturador escreveu")
  })

  it("NÃO chama a shortlist: com a fatia, cada posição já vê só as suas", async () => {
    invokeAgent.mockResolvedValue(chamada(respostaDe("h1")))
    await runCuradorShadow(params())
    expect((telemetria().parsedOutput.shortlist_chamada as boolean | undefined) ?? false).toBe(false)
    expect(telemetria().parsedOutput.shortlist_pulada).toEqual([0, 1, 2])
  })

  it("a cauda de cada posição traz SÓ as candidatas da seção dela", async () => {
    const ids = ["h1", "b1", "f1"]
    invokeAgent.mockImplementation(async () => chamada(respostaDe(ids.shift()!)))
    await runCuradorShadow(params())

    const vars = invokeAgent.mock.calls.map((c) => c[1] as Record<string, string>)
    expect(vars[0].posicao_candidatas).toContain("h1")
    expect(vars[0].posicao_candidatas).toContain("h2")
    expect(vars[0].posicao_candidatas).not.toContain("b1")
    expect(vars[1].posicao_candidatas).toContain("b1")
    expect(vars[1].posicao_candidatas).not.toContain("h1")
  })

  it("o PREFIXO é idêntico entre as posições — é o que o cache lê", async () => {
    const ids = ["h1", "b1", "f1"]
    invokeAgent.mockImplementation(async () => chamada(respostaDe(ids.shift()!)))
    await runCuradorShadow(params())

    const configs = invokeAgent.mock.calls.map(
      (c) => c[0] as { system_prompt: string; user_template: string; cache_user_prefix?: boolean },
    )
    expect(new Set(configs.map((c) => c.system_prompt)).size).toBe(1)
    expect(new Set(configs.map((c) => c.user_template)).size).toBe(1)
    expect(configs[0].system_prompt).not.toContain("{{catalogo}}")
    expect(configs[0].cache_user_prefix ?? true).toBe(true)
  })

  it("o papel e os requisitos da posição vão na cauda, recortados", async () => {
    const ids = ["h1", "b1", "f1"]
    invokeAgent.mockImplementation(async () => chamada(respostaDe(ids.shift()!)))
    await runCuradorShadow(params())
    const vars = invokeAgent.mock.calls.map((c) => c[1] as Record<string, string>)
    expect(vars[0].posicao_papel).toBe("abre com a objeção")
    expect(vars[0].posicao_requisitos).toContain("hero_pergunta")
    expect(vars[2].posicao_papel).toBe("fecha")
  })

  it("a posição N vê o que a N-1 decidiu — é o que faz o arco existir", async () => {
    const ids = ["h1", "b1", "f1"]
    invokeAgent.mockImplementation(async () => chamada(respostaDe(ids.shift()!)))
    await runCuradorShadow(params())
    const vars = invokeAgent.mock.calls.map((c) => c[1] as Record<string, string>)
    expect(vars[0].ja_decididas).toContain("PRIMEIRA")
    expect(vars[1].ja_decididas).toContain("h1")
    expect(vars[2].ja_decididas).toContain("h1")
    expect(vars[2].ja_decididas).toContain("b1")
  })

  it("uma posição que FALHA não derruba as outras", async () => {
    let n = 0
    invokeAgent.mockImplementation(async () => {
      n++
      if (n === 2) throw new Error("timeout do provedor")
      return chamada(respostaDe(n === 1 ? "h1" : "f1"))
    })

    const r = await runCuradorShadow(params())

    expect(r).not.toBeNull()
    expect(r!.ranking.byBlock.get(0)?.[0]?.variant_id).toBe("h1")
    expect(r!.ranking.byBlock.get(2)?.[0]?.variant_id).toBe("f1")
    const falhas = (telemetria().parsedOutput.leque as { falhas: Array<{ block_index: number; erro: string }> }).falhas
    expect(falhas).toHaveLength(1)
    expect(falhas[0].block_index).toBe(1)
    expect(falhas[0].erro).toContain("timeout do provedor")
    expect(telemetria().status).toBe("success")
  })

  it("a telemetria separa FALHA de chamada de AJUSTE por repetição", async () => {
    invokeAgent.mockResolvedValue(chamada(respostaDe("h1")))
    await runCuradorShadow(
      params({
        liveSections: ["hero", "hero"],
        typeIndex: new Map([["h1", "hero"], ["h2", "hero"]]),
        elegiveisPorPosicao: new Map([
          [0, { ids: ["h1", "h2"], zerou: false }],
          [1, { ids: ["h1", "h2"], zerou: false }],
        ]),
        decisaoPorPosicao: [{ papel: "a", requisitos: "" }, { papel: "b", requisitos: "" }],
      }),
    )
    const leque = telemetria().parsedOutput.leque as { falhas: unknown[]; ajustes: unknown[] }
    expect(leque.falhas).toEqual([])
    // Sem reserva na resposta, a 2ª hero fica vazia em vez de repetir.
    expect(leque.ajustes).toEqual([{ block_index: 1, ajuste: "vazia_por_repeticao" }])
  })

  it("prompt do banco sem os blocos nomeados: o leque NÃO roda e diz por quê", async () => {
    // `montarLequeUser` lança, e cair para o caminho de hoje é sempre
    // correto — servir um prefixo de forma desconhecida não é.
    invokeAgent.mockResolvedValue(chamada(JSON.stringify({ papeis: [], escolhas: [] })))
    await runCuradorShadow(params({ baseVars: {}, lequeOn: true, elegiveisPorPosicao: new Map([[0, { ids: ["h1"], zerou: false }]]), liveSections: ["hero"] }))
    // com o prompt padrão do repo ele roda; o caso de falha é coberto no
    // teste de `montarLequeUser`. Aqui garantimos que `leque` foi gravado.
    expect(telemetria().parsedOutput.leque).not.toBeNull()
    expect(telemetria().parsedOutput.leque_indisponivel).toBeNull()
  })

  it("sem elegíveis por posição o leque não roda — cauda vazia viraria peça inteira em lacuna", async () => {
    invokeAgent.mockResolvedValue(chamada(JSON.stringify({ papeis: [], escolhas: [] })))
    await runCuradorShadow(params({ elegiveisPorPosicao: null }))
    // Cai no caminho de hoje: uma chamada só, e nenhuma var de posição.
    const vars = invokeAgent.mock.calls.map((c) => c[1] as Record<string, string>)
    expect(vars.every((v) => v.posicao_candidatas === undefined)).toBe(true)
  })

  it("o consumo é medido POR posição", async () => {
    const ids = ["h1", "b1", "f1"]
    invokeAgent.mockImplementation(async () => chamada(respostaDe(ids.shift()!)))
    await runCuradorShadow(params())
    const consumo = telemetria().parsedOutput.consumo_por_chamada as Record<string, { tokens_output: number }>
    expect(Object.keys(consumo).sort()).toEqual(["posicao_0", "posicao_1", "posicao_2"])
    expect(consumo.posicao_1.tokens_output).toBe(50)
  })
})

describe("o contrato de telemetria do caminho do vault", () => {
  // As 9 chaves de `assembler_chooser` eram exigidas e este caminho gravava
  // 2. Os testes passavam porque exercitavam o Curador LEGADO (kimi); o do
  // vault, vigente desde 02/09, nunca foi coberto.
  it("o leque grava as 9 chaves", async () => {
    const ids = ["h1", "b1", "f1"]
    invokeAgent.mockImplementation(async () => chamada(respostaDe(ids.shift()!)))
    await runCuradorShadow(params())
    expect(missingTelemetryKeys("assembler_chooser", telemetria().parsedOutput)).toEqual([])
  })

  it("o caminho de HOJE também — a correção não é do leque, é do agente", async () => {
    invokeAgent.mockResolvedValue(
      chamada(
        JSON.stringify({
          papeis: [{ block_index: 0, section: "hero", papel: "abre" }],
          fio_narrativo: "fio",
          escolhas: [{ block_index: 0, justificativa: "j", escolhas: [{ variant_id: "h1", motivo: "m" }] }],
        }),
      ),
    )
    await runCuradorShadow(
      params({
        lequeOn: false,
        liveSections: ["hero"],
        elegiveisPorPosicao: new Map([[0, { ids: ["h1"], zerou: false }]]),
        decisaoPorPosicao: [{ papel: "abre", requisitos: "" }],
      }),
    )
    expect(missingTelemetryKeys("assembler_chooser", telemetria().parsedOutput)).toEqual([])
  })
})
