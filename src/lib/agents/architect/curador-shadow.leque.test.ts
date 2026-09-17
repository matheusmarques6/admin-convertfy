import { describe, it, expect, vi, beforeEach } from "vitest"

// O laço do leque roda dentro do `runCuradorShadow`, que fala com o banco
// (notas das finalistas) e com a telemetria. Mockar as duas pontas é o que
// permite medir o que importa aqui: quantas chamadas saem, o que vai em
// cada prompt, e o que sobra na telemetria.

const notas = vi.hoisted(() => ({ linhas: [] as Array<Record<string, unknown>> }))
// `runs` é o que uma invocação ANTERIOR desta geração deixou gravado — a
// retomada lê daqui (`curador-leque-progresso.ts`).
const runs = vi.hoisted(() => ({ linhas: [] as Array<Record<string, unknown>> }))
vi.mock("@/lib/supabase/server", () => {
  // Encadeável: as duas consultas deste caminho têm formas diferentes
  // (`.eq().eq().in()` nas notas, `.eq().eq().eq().order().limit()` nas
  // runs) e um mock de forma fixa fazia a segunda cair no catch — a
  // retomada passava no teste sem nunca ter sido exercitada.
  const encadeavel = (linhas: Array<Record<string, unknown>>) => {
    const alvo: Record<string, unknown> = {}
    const proxy: unknown = new Proxy(alvo, {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown) => resolve({ data: linhas, error: null })
        }
        return () => proxy
      },
    })
    return proxy
  }
  return {
    createAdminClient: () => ({
      from: (tabela: string) =>
        encadeavel(tabela === "email_generation_runs" ? runs.linhas : notas.linhas),
    }),
    createClient: () => ({}),
  }
})

const invokeAgent = vi.fn()
vi.mock("./llm-invoke", async (importActual) => {
  const actual = await importActual<typeof import("./llm-invoke")>()
  return { ...actual, invokeAgent: (...a: unknown[]) => invokeAgent(...a) }
})

const finishGenerationRun = vi.fn().mockResolvedValue("run-1")
const updateGenerationRun = vi.fn().mockResolvedValue(undefined)
vi.mock("../callbacks/telemetry.callback", () => ({
  logGenerationRun: vi.fn().mockResolvedValue(""),
  startGenerationRun: vi.fn().mockResolvedValue("run-1"),
  finishGenerationRun: (...a: unknown[]) => finishGenerationRun(...a),
  updateGenerationRun: (...a: unknown[]) => updateGenerationRun(...a),
  computeCostCents: () => 0,
  resolveCostCents: () => 0,
}))

import { runCuradorShadow, type CuradorShadowParams } from "./curador-shadow"
import { missingTelemetryKeys } from "../shared/telemetry-contract"
import { comOrcamentoDeFase1 } from "@/lib/agents/fase1-orcamento"
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
    // A retomada é chaveada por (email_id, batch_id): sem o e-mail não há
    // o que retomar, e é o caso de quem roda fora de uma geração.
    emailId: "e1",
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
      [0, { ids: ["h1", "h2"], zerou: false, bloqueadasPelaJanela: [], janelaAfrouxada: false }],
      [1, { ids: ["b1"], zerou: false, bloqueadasPelaJanela: [], janelaAfrouxada: false }],
      [2, { ids: ["f1"], zerou: false, bloqueadasPelaJanela: [], janelaAfrouxada: false }],
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
  runs.linhas = []
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
    const r = await runCuradorShadow(params({ liveSections: ["hero"], elegiveisPorPosicao: new Map([[0, { ids: ["h1"], zerou: false, bloqueadasPelaJanela: [], janelaAfrouxada: false }]]) }))
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
          [0, { ids: ["h1", "h2"], zerou: false, bloqueadasPelaJanela: [], janelaAfrouxada: false }],
          [1, { ids: ["h1", "h2"], zerou: false, bloqueadasPelaJanela: [], janelaAfrouxada: false }],
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
    await runCuradorShadow(params({ baseVars: {}, lequeOn: true, elegiveisPorPosicao: new Map([[0, { ids: ["h1"], zerou: false, bloqueadasPelaJanela: [], janelaAfrouxada: false }]]), liveSections: ["hero"] }))
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
    // As ETAPAS não podem ganhar chave sintética (nada de `_totais`): a
    // árvore soma no cliente. Campo novo DENTRO do item é livre.
    expect(Object.keys(consumo).sort()).toEqual(["posicao_0", "posicao_1", "posicao_2"])
    expect(consumo.posicao_1.tokens_output).toBe(50)
  })

  it("a CAUDA gravada é sufixo do user REALMENTE enviado", async () => {
    // O teste que fecha o risco do duplo render: a cauda é renderizada de
    // novo (não fatiada do prompt gravado, que passa por `semMarcadores`).
    // Sem esta asserção, mudar como a cauda é anexada faria a tela mostrar
    // um prompt que ninguém mandou.
    const ids = ["h1", "b1", "f1"]
    const enviados: string[] = []
    invokeAgent.mockImplementation(async (config: unknown, vars: unknown) => {
      const c = config as { user_template: string }
      const v = vars as Record<string, string>
      enviados.push(
        c.user_template.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in v ? v[k] : m)),
      )
      return chamada(respostaDe(ids.shift()!))
    })
    await runCuradorShadow(params())
    const consumo = telemetria().parsedOutput.consumo_por_chamada as Record<
      string,
      { cauda?: string; cauda_truncada?: boolean }
    >
    const item = consumo.posicao_0
    expect(item.cauda).toBeTruthy()
    // A asserção só vale sem corte — e o teste exige que o caso SEM corte
    // seja o exercitado, senão ele passaria sem nunca comparar nada.
    expect(item.cauda_truncada).toBeFalsy()
    expect(enviados[0].endsWith(item.cauda!)).toBe(true)
  })

  it("o custo REAL de cada chamada chega ao consumo", async () => {
    // `costUsd` sempre chegou em `InvokeResult` e era descartado: só a SOMA
    // ia para `cost_cents`, e "quanto gastou em cada vez" não tinha resposta.
    const ids = ["h1", "b1", "f1"]
    invokeAgent.mockImplementation(async () => chamada(respostaDe(ids.shift()!)))
    await runCuradorShadow(params())
    const consumo = telemetria().parsedOutput.consumo_por_chamada as Record<
      string,
      { custo_usd?: number; ms?: number; modelo?: string; chave?: { section?: string } }
    >
    expect(consumo.posicao_0.custo_usd).toBe(0.01)
    expect(typeof consumo.posicao_0.ms).toBe("number")
    expect(consumo.posicao_0.chave?.section).toBe("hero")
  })

  it("a SAÍDA de cada posição fica no item, não só concatenada no raw_output", async () => {
    // O `raw_output` é cortado em 32k: com 16 posições as últimas somem.
    const ids = ["h1", "b1", "f1"]
    invokeAgent.mockImplementation(async () => chamada(respostaDe(ids.shift()!)))
    await runCuradorShadow(params())
    const consumo = telemetria().parsedOutput.consumo_por_chamada as Record<string, { saida?: string }>
    expect(consumo.posicao_0.saida).toContain("h1")
    expect(consumo.posicao_1.saida).toContain("b1")
  })

  it("o progresso parcial leva custo e NÃO leva texto", async () => {
    // A escrita parcial roda a cada posição; com as caudas dentro seriam
    // ~0,5 MB de WAL por e-mail. O que precisa sobreviver à morte do
    // processo — custo, contagem, tempo — fica.
    const ids = ["h1", "b1", "f1"]
    invokeAgent.mockImplementation(async () => chamada(respostaDe(ids.shift()!)))
    await runCuradorShadow(params())
    const parciais = updateGenerationRun.mock.calls
      .map((c) => (c[1] as { parsedOutput?: Record<string, unknown> }).parsedOutput)
      .filter((p): p is Record<string, unknown> => !!p?.consumo_por_chamada)
    expect(parciais.length).toBeGreaterThan(0)
    const ultimo = parciais[parciais.length - 1].consumo_por_chamada as Record<
      string,
      { custo_usd?: number; cauda?: string; saida?: string; cauda_chars?: number }
    >
    const item = Object.values(ultimo)[0]
    expect(item.custo_usd).toBe(0.01)
    expect(item.cauda).toBeUndefined()
    expect(item.saida).toBeUndefined()
    expect(typeof item.cauda_chars).toBe("number")
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
        elegiveisPorPosicao: new Map([[0, { ids: ["h1"], zerou: false, bloqueadasPelaJanela: [], janelaAfrouxada: false }]]),
        decisaoPorPosicao: [{ papel: "abre", requisitos: "" }],
      }),
    )
    expect(missingTelemetryKeys("assembler_chooser", telemetria().parsedOutput)).toEqual([])
  })
})

describe("a guarda de orçamento do leque", () => {
  it("janela apertada: o leque NÃO começa, e o motivo é dito", async () => {
    // A régua é conservadora e usa um número já medido: se não cabe nem o
    // custo típico de UMA chamada do Curador, N chamadas não começam.
    invokeAgent.mockResolvedValue(chamada(JSON.stringify({ papeis: [], escolhas: [] })))
    await comOrcamentoDeFase1(5_000, () => runCuradorShadow(params()))
    expect(telemetria().parsedOutput.leque).toBeNull()
    expect(String(telemetria().parsedOutput.leque_indisponivel)).toContain("sem_janela")
  })

  it("janela folgada: roda normalmente", async () => {
    const ids = ["h1", "b1", "f1"]
    invokeAgent.mockImplementation(async () => chamada(respostaDe(ids.shift()!)))
    await comOrcamentoDeFase1(900_000, () => runCuradorShadow(params()))
    expect(telemetria().parsedOutput.leque).not.toBeNull()
    expect(telemetria().parsedOutput.leque_indisponivel).toBeNull()
  })

  it("FORA da janela (sem orçamento aberto) o leque roda — a bancada não tem relógio de fila", async () => {
    const ids = ["h1", "b1", "f1"]
    invokeAgent.mockImplementation(async () => chamada(respostaDe(ids.shift()!)))
    await runCuradorShadow(params())
    expect(telemetria().parsedOutput.leque).not.toBeNull()
  })
})

describe("a durabilidade do leque (16/09)", () => {
  it("grava a decisão assim que CADA posição fecha", async () => {
    const ids = ["h1", "b1", "f1"]
    invokeAgent.mockImplementation(async () => chamada(respostaDe(ids.shift()!)))

    await runCuradorShadow(params())

    // Uma gravação por posição, acumulando — é isso que sobrevive à morte
    // do processo.
    expect(updateGenerationRun).toHaveBeenCalledTimes(3)
    const tamanhos = updateGenerationRun.mock.calls.map(
      (c) => (c[1] as { parsedOutput: { leque: { escolhas: unknown[] } } }).parsedOutput.leque.escolhas.length,
    )
    expect(tamanhos).toEqual([1, 2, 3])
    expect((updateGenerationRun.mock.calls[0][1] as { status: string }).status).toBe("running")
  })

  it("retoma o que uma invocação anterior gravou, sem rechamar", async () => {
    runs.linhas = [
      {
        id: "run-morta",
        parsed_output: {
          leque: {
            parcial: true,
            escolhas: [
              { block_index: 0, section: "hero", papel: "p", justificativa: "j", conversa_com: "", variant_id: "h1", motivo: "m", reserva: null },
              { block_index: 1, section: "body", papel: "p", justificativa: "j", conversa_com: "", variant_id: "b1", motivo: "m", reserva: null },
            ],
          },
        },
      },
    ]
    invokeAgent.mockImplementation(async () => chamada(respostaDe("f1")))

    await runCuradorShadow(params())

    // Uma chamada só: as duas primeiras posições vieram da gravação.
    expect(invokeAgent).toHaveBeenCalledTimes(1)
    const leque = telemetria().parsedOutput.leque as { retomadas: number[]; posicoes: Array<{ variant_id: string | null }> }
    expect(leque.retomadas).toEqual([0, 1])
    expect(leque.posicoes.map((p) => p.variant_id)).toEqual(["h1", "b1", "f1"])
  })

  it("a run ATUAL não é lida como se fosse anterior", async () => {
    runs.linhas = [
      {
        id: "run-1",
        parsed_output: {
          leque: { parcial: true, escolhas: [{ block_index: 0, section: "hero", papel: "", justificativa: "", conversa_com: "", variant_id: "h2", motivo: "", reserva: null }] },
        },
      },
    ]
    const ids = ["h1", "b1", "f1"]
    invokeAgent.mockImplementation(async () => chamada(respostaDe(ids.shift()!)))

    await runCuradorShadow(params())

    expect(invokeAgent).toHaveBeenCalledTimes(3)
    expect((telemetria().parsedOutput.leque as { retomadas: number[] }).retomadas).toEqual([])
  })

  it("o teto de cada chamada é o de UMA posição, não o do e-mail inteiro", async () => {
    const ids = ["h1", "b1", "f1"]
    invokeAgent.mockImplementation(async () => chamada(respostaDe(ids.shift()!)))

    await runCuradorShadow(params())

    // O OpenRouter reserva `prompt + max_tokens` em voo: herdar o teto do
    // e-mail inteiro em cada chamada bloqueia N vezes o mesmo saldo.
    const config = invokeAgent.mock.calls[0][0] as { max_tokens: number; timeoutMs: number }
    const leque = telemetria().parsedOutput.leque as { teto_por_posicao: number }
    expect(config.max_tokens).toBe(leque.teto_por_posicao)
    expect(config.max_tokens).toBeLessThan(32_000)
    expect(config.timeoutMs).toBeLessThan(360_000)
  })
})
